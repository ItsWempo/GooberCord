// Messages routes (Phase 1, Task 5 + Task 6): channel history with a bare-id
// cursor, the idempotent send (JSON and the multipart send-with-image
// variant), the author-only edit, and the three-tier delete with its
// attachment cleanup. The word filter and its site_settings store are the
// vendored forum primitives; the image intake comes from api/media.mjs; the
// http helpers, session gates, and cursors come from api/core. This module
// owns dispatch, request-shape validation, and the authorization — which
// always rides INSIDE the SQL: the channel access check is one
// membership-exists SELECT, the edit is an author-guarded UPDATE, and the
// delete is a single guarded DELETE whose WHERE carries the author, the
// server-moderator, and the platform-staff tiers together (with the
// attachment cleanup carrying that same guard). A failed write is diagnosed
// only after the fact.
//
// The send primitive `sendMessageToChannel` is also Task 8's DO contract:
// the Durable Object calls it with no HTTP route in between, so channel
// access is resolved by the CALLER there and the primitive owns everything
// downstream of it (validation + filter + idempotent insert + channel
// last_message_* bump in one batch, plus — when called with a prepared
// attachment — the attachment's intake INSERT and chunks in that same batch).
import { requireSignedInRead, requireUser } from "./core/auth.mjs";
import { nowSeconds } from "./core/crypto.mjs";
import { HttpError, json, rateLimit, readJson, requiredText } from "./core/http.mjs";
import { GC_MESSAGE_MAX } from "../constants.mjs";
import { applyWordFilter } from "./filter.mjs";
import { ensureFilterWords, filterWords } from "./filterstore.mjs";
import { messageAttachmentStatements, prepareAttachmentBytes, readMultipartWithImage } from "./media.mjs";

// History page bounds: the bare-id cursor is the forum's replies convention
// (`[1-9][0-9]{0,14}`, inline at the call site), and a page is at most 100
// rows with 50 as the default.
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

// The forum MASKS stored bodies (posts, chat). GooberCord messages run the
// same masking pass but REJECT instead of storing masked text: a body that
// does not survive the filter unchanged is refused with this 400 copy. With
// an effective EMPTY list (the forum's disabled filter, today's production
// state) the pass is a strict no-op and nothing is ever rejected here.
export const FILTERED_MESSAGE_ERROR = "That message isn't allowed.";

// Extends HttpError so the worker's apiError mapping answers it with the 400
// body directly, while Task 8's DO can catch the class specifically.
export class FilterError extends HttpError {
  constructor() {
    super(400, FILTERED_MESSAGE_ERROR);
    this.name = "FilterError";
  }
}

// One SQL for both membership tiers: server text/voice channels via
// gc_server_members, dm/group conversations via gc_conversation_members. No
// row → 404 (never 403: a non-member must not learn that the channel exists).
const CHANNEL_ACCESS_SQL =
  "SELECT c.id, c.server_id, c.kind FROM gc_channels c WHERE c.id = ? AND (" +
    "(c.server_id IS NOT NULL AND EXISTS (SELECT 1 FROM gc_server_members m " +
      "WHERE m.server_id = c.server_id AND m.user_id = ?)) OR " +
    "(c.server_id IS NULL AND EXISTS (SELECT 1 FROM gc_conversation_members cm " +
      "WHERE cm.channel_id = c.id AND cm.user_id = ?))" +
  ") LIMIT 1";

const MESSAGE_SELECT =
  "SELECT m.id, m.author_id, u.username AS author_name, m.body, m.client_message_id, " +
    "m.source, m.created_at, m.edited_at " +
  "FROM gc_messages m JOIN users u ON u.id = m.author_id";

// Both last_message_* values are derived from the messages table itself, so
// an idempotent replay (whose DO NOTHING insert changed nothing but left
// last_insert_rowid() pointing elsewhere) can never move the channel cursor
// backward or stale — the re-derivation is the statement's own guard.
const CHANNEL_LAST_MESSAGE_UPDATE_SQL =
  "UPDATE gc_channels SET " +
    "last_message_id = (SELECT MAX(id) FROM gc_messages WHERE channel_id = ?), " +
    "last_message_at = (SELECT created_at FROM gc_messages WHERE channel_id = ? " +
      "ORDER BY id DESC LIMIT 1) " +
  "WHERE id = ?";

const MESSAGE_INSERT_SQL =
  "INSERT INTO gc_messages (channel_id, author_id, body, client_message_id, created_at) " +
    "VALUES (?, ?, ?, ?, ?) ON CONFLICT(channel_id, author_id, client_message_id) DO NOTHING";

const MESSAGE_EDIT_SQL =
  "UPDATE gc_messages SET body = ?, edited_at = ? WHERE id = ? AND author_id = ?";

// The three-tier delete guard: author, or server owner/moderator for a server
// channel, or platform staff (the staff tier is a bound JS-side flag derived
// from the session's public role — never request data). Zero changes → 404.
const MESSAGE_DELETE_SQL =
  "DELETE FROM gc_messages WHERE id = ? AND (" +
    "author_id = ? " +
    "OR EXISTS (SELECT 1 FROM gc_channels c " +
      "JOIN gc_server_members sm ON sm.server_id = c.server_id " +
      "WHERE c.id = gc_messages.channel_id AND sm.user_id = ? " +
      "AND sm.role IN ('owner','moderator')) " +
    "OR ? = 1" +
  ")";

// Exported for api/ws.mjs (Task 8): the WebSocket upgrade route must run the
// IDENTICAL read gate, and sharing the one function is the drift guard.
export async function channelForUser(env, channelId, userId) {
  return env.GOOBER_DB.prepare(CHANNEL_ACCESS_SQL)
    .bind(Number(channelId), userId, userId).first();
}

// Read-time gate (Task 6): approved attachments are visible to everyone, a
// still-pending one ONLY to its uploader — one predicate, carried by both the
// single-message and the grouped page lookups.
const ATTACHMENT_GATE_SQL = "(status = 'approved' OR uploader_id = ?)";

async function loadAttachmentIds(env, messageId, viewerId) {
  const result = await env.GOOBER_DB.prepare(
    "SELECT id, message_id FROM gc_attachments " +
      "WHERE " + ATTACHMENT_GATE_SQL + " AND message_id = ? ORDER BY id",
  ).bind(viewerId, messageId).all();
  return (result.results || []).map((row) => Number(row.id));
}

function publicMessage(row, attachmentIds) {
  return {
    id: Number(row.id),
    authorId: Number(row.author_id),
    authorName: row.author_name,
    body: row.body,
    editedAt:
      row.edited_at === null || row.edited_at === undefined
        ? null
        : new Date(Number(row.edited_at) * 1000).toISOString(),
    source: row.source ?? null,
    attachmentIds,
  };
}

// Validation + filter gate shared by the send and the edit. The forum's
// masking pass decides: a body that would mask is refused (FilterError), a
// body that survives unchanged is stored verbatim.
async function filterMessageBody(env, value) {
  const text = requiredText(value, "message body", GC_MESSAGE_MAX);
  // The message module may be reached without the worker's per-request
  // priming (the DO path), so the cache is checked here too — after the
  // first populate it is a TTL-guarded no-op.
  await ensureFilterWords(env);
  const filtered = applyWordFilter(text, filterWords(env));
  if (filtered !== text) throw new FilterError();
  return text;
}

// The shared send primitive (REST POST, JSON or multipart + Task 8's DO):
// validation, the word filter, the idempotent insert, the channel last_* bump,
// and the follow-up triple SELECT are ONE atomic batch; the resolved row is
// what both callers return. With `attachment` prepared (Task 6's multipart
// send), the attachment's metadata INSERT and its chunk INSERTs ride BETWEEN
// the last_* bump and the reselect in that same batch — media.mjs owns their
// SQL, so the idempotency/bump logic is never duplicated by the multipart
// branch. Returns { message, created } — `created` distinguishes a fresh
// insert from an idempotent replay of the same (channel, author,
// client_message_id) triple.
export async function sendMessageToChannel(
  env,
  user,
  channelId,
  body,
  clientMessageId = null,
  preparedAttachment = null,
) {
  const text = await filterMessageBody(env, body);

  // The client id is the schema's idempotency key (UNIQUE(channel_id,
  // author_id, client_message_id)); NULL keys stay NULL so posts without one
  // never collide (SQLite treats NULLs as distinct in unique indexes).
  if (
    clientMessageId !== null &&
    (typeof clientMessageId !== "string" ||
      clientMessageId.length < 8 ||
      clientMessageId.length > 64)
  ) {
    throw new HttpError(400, "Client message id must be between 8 and 64 characters.");
  }

  const authorId = Number(user.id);
  const now = nowSeconds();
  const statements = [
    env.GOOBER_DB.prepare(MESSAGE_INSERT_SQL)
      .bind(channelId, authorId, text, clientMessageId, now),
    env.GOOBER_DB.prepare(CHANNEL_LAST_MESSAGE_UPDATE_SQL)
      .bind(channelId, channelId, channelId),
  ];
  if (preparedAttachment) {
    statements.push(
      ...messageAttachmentStatements(env, authorId, channelId, clientMessageId, preparedAttachment, now),
    );
  }
  const reselect = env.GOOBER_DB.prepare(
    MESSAGE_SELECT +
      " WHERE m.channel_id = ? AND m.author_id = ? AND " +
      (clientMessageId === null ? "m.client_message_id IS NULL" : "m.client_message_id = ?") +
      // ORDER BY id DESC: with a NULL client id the (channel, author) pair can
      // match older rows from earlier cid-less sends — the reselect must echo
      // the row THIS batch just inserted, never the oldest one below it.
      " ORDER BY m.id DESC LIMIT 1",
  ).bind(...(clientMessageId === null
    ? [channelId, authorId]
    : [channelId, authorId, clientMessageId]));
  // The reselect is ALWAYS the batch's last statement, so the resolved row is
  // the last result either way.
  statements.push(reselect);

  const results = await env.GOOBER_DB.batch(statements);

  const created = Number(results[0]?.meta?.changes) === 1;
  const row = results[results.length - 1]?.results?.[0];
  if (!row) {
    throw new HttpError(500, "The message could not be saved. Please try again.");
  }

  const attachmentIds = await loadAttachmentIds(env, Number(row.id), authorId);
  return { message: publicMessage(row, attachmentIds), created };
}

async function handleListMessagesRoute(request, env, url, channelId) {
  const session = await requireSignedInRead(request, env);
  const userId = Number(session.user.id);

  const afterRaw = url.searchParams.get("after");
  let after = null;
  if (afterRaw !== null && afterRaw !== "") {
    // Bare-id cursor: [1-9][0-9]{0,14} — no leading zeros, bounded width,
    // validated inline per the forum convention.
    if (!/^[1-9][0-9]{0,14}$/.test(afterRaw)) {
      throw new HttpError(400, "That message cursor is invalid.");
    }
    after = Number(afterRaw);
  }

  const limitRaw = url.searchParams.get("limit");
  let limit = DEFAULT_PAGE_LIMIT;
  if (limitRaw !== null && limitRaw !== "") {
    if (!/^[0-9]{1,4}$/.test(limitRaw) || Number(limitRaw) < 1 || Number(limitRaw) > MAX_PAGE_LIMIT) {
      throw new HttpError(400, "That message limit is invalid.");
    }
    limit = Number(limitRaw);
  }

  const channel = await channelForUser(env, channelId, userId);
  if (!channel) throw new HttpError(404, "This channel does not exist or you cannot view it.");

  // Backward keyset walk: the newest rows without a cursor, the strictly
  // older ones with one — always id DESC, nextAfter the page's oldest id.
  const page = (await env.GOOBER_DB.prepare(
    MESSAGE_SELECT +
      " WHERE m.channel_id = ?" +
      (after === null ? "" : " AND m.id < ?") +
      " ORDER BY m.id DESC LIMIT " + limit,
  ).bind(...(after === null ? [channelId] : [channelId, after])).all()).results || [];

  // Attachments ride one grouped read with the visibility gate: approved
  // rows for everyone, pending rows only for THIS viewer.
  const messageIds = page.map((row) => Number(row.id));
  const attachmentIdsByMessage = new Map();
  if (messageIds.length) {
    const result = await env.GOOBER_DB.prepare(
      "SELECT id, message_id FROM gc_attachments " +
        "WHERE " + ATTACHMENT_GATE_SQL + " AND message_id IN (" +
        messageIds.map(() => "?").join(",") + ") ORDER BY id",
    ).bind(userId, ...messageIds).all();
    for (const row of result.results || []) {
      const list = attachmentIdsByMessage.get(Number(row.message_id)) || [];
      list.push(Number(row.id));
      attachmentIdsByMessage.set(Number(row.message_id), list);
    }
  }

  return json({
    messages: page.map((row) =>
      publicMessage(row, attachmentIdsByMessage.get(Number(row.id)) || []),
    ),
    nextAfter: page.length ? Number(page[page.length - 1].id) : null,
  });
}

async function handleSendMessageRoute(request, env, channelId) {
  const session = await requireUser(request, env);
  await rateLimit(request, env, "message", "user:" + session.user.id);

  // The multipart branch is the ONLY send variant that differs; the JSON
  // variant below keeps the exact body/response contract it has always had.
  const contentType = (request.headers.get("Content-Type") || "").toLowerCase();
  if (contentType.startsWith("multipart/form-data")) {
    return handleSendMessageWithImageRoute(request, env, channelId, session);
  }

  const body = await readJson(request);

  const userId = Number(session.user.id);
  const channel = await channelForUser(env, channelId, userId);
  if (!channel) throw new HttpError(404, "This channel does not exist or you cannot view it.");

  const { message, created } = await sendMessageToChannel(
    env,
    session.user,
    channelId,
    body.body,
    body.clientMessageId === undefined ? null : body.clientMessageId,
  );
  return json({ message }, created ? 201 : 200);
}

// Task 6's send-with-image variant: the same message pipeline, with up to one
// image intake attached INSIDE the send's batch. The image reads the 'image'
// file field and rides the same prepareAttachmentBytes intake (size cap, sniff,
// sanitize) as the standalone upload — a body field is still required.
async function handleSendMessageWithImageRoute(request, env, channelId, session) {
  const { fields, files } = await readMultipartWithImage(request);
  if (files.length > 1) throw new HttpError(400, "Attach at most one image.");

  const userId = Number(session.user.id);
  const channel = await channelForUser(env, channelId, userId);
  if (!channel) throw new HttpError(404, "This channel does not exist or you cannot view it.");

  const preparedAttachment = files.length === 1 ? prepareAttachmentBytes(files[0]) : null;
  const bodyValue = typeof fields.body === "string" ? fields.body : undefined;
  const clientMessageId =
    fields.clientMessageId === undefined || fields.clientMessageId === ""
      ? null
      : fields.clientMessageId;

  const { message, created } = await sendMessageToChannel(
    env,
    session.user,
    channelId,
    bodyValue,
    clientMessageId,
    preparedAttachment,
  );
  return json({ message }, created ? 201 : 200);
}

async function handleEditMessageRoute(request, env, messageId) {
  const session = await requireUser(request, env);
  const body = await readJson(request);
  const text = await filterMessageBody(env, body.body);
  const userId = Number(session.user.id);

  const result = await env.GOOBER_DB.prepare(MESSAGE_EDIT_SQL)
    .bind(text, nowSeconds(), messageId, userId).run();
  if (Number(result.meta?.changes) !== 1) throw new HttpError(404, "Message not found.");

  const row = await env.GOOBER_DB.prepare(MESSAGE_SELECT + " WHERE m.id = ? LIMIT 1")
    .bind(messageId).first();
  if (!row) throw new HttpError(404, "Message not found.");
  return json({ message: publicMessage(row, await loadAttachmentIds(env, Number(row.id), Number(session.user.id))) });
}

// The attachment cleanup's three-tier guard mirrors MESSAGE_DELETE_SQL's own
// tiers (author OR channel moderator OR platform-staff flag), so a doomed
// delete can never strip a message's attachments: an unauthorized viewer's
// batch matches zero rows in all three statements, and the authorized one
// removes chunks → attachments → message (the gc_attachments FK on
// gc_messages carries no ON DELETE action, which is why the message row dies
// LAST in this batch). The two guard bodies are structurally identical — the
// gc_attachments side is spelled with `a.` inside the chunk-delete's aliased
// subselect and by table name in the flat DELETE.
const ATTACHMENT_MODERATOR_TIER_SQL =
  "OR EXISTS (SELECT 1 FROM gc_channels c JOIN gc_server_members sm " +
    "ON sm.server_id = c.server_id " +
    "WHERE c.id = (SELECT m2.channel_id FROM gc_messages m2 WHERE m2.id = ?) " +
    "AND sm.user_id = ? AND sm.role IN ('owner','moderator')) ";

const MESSAGE_ATTACHMENT_CHUNKS_DELETE_SQL =
  "DELETE FROM gc_attachment_chunks WHERE attachment_id IN (" +
    "SELECT a.id FROM gc_attachments a WHERE a.message_id = ? AND (" +
      "EXISTS (SELECT 1 FROM gc_messages m WHERE m.id = a.message_id AND m.author_id = ?) " +
      ATTACHMENT_MODERATOR_TIER_SQL +
      "OR ? = 1))";

const MESSAGE_ATTACHMENTS_DELETE_SQL =
  "DELETE FROM gc_attachments WHERE message_id = ? AND (" +
    "EXISTS (SELECT 1 FROM gc_messages m WHERE m.id = gc_attachments.message_id AND m.author_id = ?) " +
    ATTACHMENT_MODERATOR_TIER_SQL +
    "OR ? = 1)";

async function handleDeleteMessageRoute(request, env, messageId) {
  const session = await requireUser(request, env);
  const userId = Number(session.user.id);
  // Platform staff ('owner'/'admin' at the public tier) carry the flag into
  // the guard; server moderation stays a pure SQL membership EXISTS.
  const staff = session.user.role === "owner" || session.user.role === "admin" ? 1 : 0;

  // ONE batch: attachment cleanup + the guarded message DELETE, all-or-
  // nothing. Each of the first two statements carries the SAME tier guard as
  // the message DELETE itself, so the 404 path (changes 0) also deleted
  // nothing.
  const results = await env.GOOBER_DB.batch([
    env.GOOBER_DB.prepare(MESSAGE_ATTACHMENT_CHUNKS_DELETE_SQL)
      .bind(messageId, userId, messageId, userId, staff),
    env.GOOBER_DB.prepare(MESSAGE_ATTACHMENTS_DELETE_SQL)
      .bind(messageId, userId, messageId, userId, staff),
    env.GOOBER_DB.prepare(MESSAGE_DELETE_SQL)
      .bind(messageId, userId, userId, staff),
  ]);
  if (Number(results[2]?.meta?.changes) !== 1) throw new HttpError(404, "Message not found.");

  return json({ ok: true });
}

export async function handleMessageRoutes(request, env, url, path, method, ctx) {
  // ctx (the worker's execution context) completes the dispatch loop's
  // handler signature; these routes schedule no background work today.
  void ctx;

  const channelsMatch = (method === "GET" || method === "POST")
    ? path.match(/^\/api\/channels\/([1-9][0-9]{0,14})\/messages$/)
    : null;
  if (channelsMatch) {
    const channelId = Number(channelsMatch[1]);
    return method === "GET"
      ? handleListMessagesRoute(request, env, url, channelId)
      : handleSendMessageRoute(request, env, channelId);
  }

  const messageMatch = (method === "PATCH" || method === "DELETE")
    ? path.match(/^\/api\/messages\/([1-9][0-9]{0,14})$/)
    : null;
  if (messageMatch) {
    return method === "PATCH"
      ? handleEditMessageRoute(request, env, Number(messageMatch[1]))
      : handleDeleteMessageRoute(request, env, Number(messageMatch[1]));
  }

  return undefined;
}

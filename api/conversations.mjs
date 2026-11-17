// Conversations routes (Phase 1, Task 7): DMs and group chats as server-less
// gc_channels rows (kind 'dm'/'group' with server_id NULL — the schema's CHECK
// pins that pairing) whose membership lives in gc_conversation_members. This
// is the plan's realization of the spec's gc_conversations: the spec's
// "conversation" IS a channel here, so messaging a conversation already rides
// Task 5's channel message routes (CHANNEL_ACCESS_SQL's server_id IS NULL arm)
// and sendMessageToChannel verbatim — this module only owns find-or-create,
// the list, and the leave.
//
// Authorization follows the module-wide rule: the guards ride INSIDE the SQL.
// The leave is a member-guarded DELETE whose WHERE carries the group-kind
// precondition, and the empty-channel delete is NOT-EXISTS-guarded in the same
// batch. Names are never stored: a DM's name is the other member's username
// and a group's is the other members joined — both computed at read time.
import { requireSignedInRead, requireUser } from "./core/auth.mjs";
import { nowSeconds } from "./core/crypto.mjs";
import { HttpError, json, readJson } from "./core/http.mjs";
import { plusActiveExpr, publicIsPlus } from "./plus.mjs";

// The group cap counts the INVITES, not the roster: 1 id opens a DM, 2–8
// invite a group (self rides along, so the roster is at most 9).
const MAX_GROUP_INVITES = 8;
// Matches the route-id conventions (bare ids, bounded width).
const MAX_ID = 1e15;

// The canonical pair lookup: a dm-kind channel where BOTH members sit on the
// member rows and the roster is exactly two. Symmetric in both ids, so no
// canonical ordering is needed.
const DM_FIND_SQL =
  "SELECT c.id FROM gc_channels c " +
  "JOIN gc_conversation_members sm ON sm.channel_id = c.id AND sm.user_id = ? " +
  "JOIN gc_conversation_members om ON om.channel_id = c.id AND om.user_id = ? " +
  "WHERE c.kind = 'dm' " +
  "AND (SELECT COUNT(*) FROM gc_conversation_members fm WHERE fm.channel_id = c.id) = 2 " +
  "LIMIT 1";

// Either direction of the forum's read-only blocks pair refuses the request.
// Phase-3 social adds the gc_blocks tier to the SAME read (one UNION, four
// bind groups in the same selfId-then-targets order): a social block refuses
// a new conversation exactly like the forum blocks row always has.
function blocksReadSql(ids) {
  const marks = ids.map(() => "?").join(",");
  const pair = (table, extra = "") =>
    "SELECT 1 FROM " + table +
    " WHERE (blocker_id = ? AND blocked_id IN (" + marks + ")) " +
    "OR (blocked_id = ? AND blocker_id IN (" + marks + "))" + extra;
  // The gc_blocks arm carries the HARD tier only: an 'ignored' row is the
  // member's own cosmetic pref and must never gate a conversation they can
  // still open or answer normally (the filed soft tier).
  return pair("blocks") + " UNION ALL " + pair("gc_blocks", " AND kind = 'blocked'") +
    " LIMIT 1";
}

// The phase-3 DM gate: thread creation to a non-friend pair is refused when
// the recipient has requests closed (the filed Everyone vs OFF reading —
// GC's everyone-can-DM default stands otherwise). One read resolves both the
// COALESCE'd prefs row (absent row = everyone, so no backfill touches users)
// and the canonical friendship pair. The existing blocks read above has
// already refused the blocked pair by the time this runs.
const DM_REQUEST_GATE_SQL =
  "SELECT COALESCE((SELECT accept_requests FROM gc_social_prefs WHERE user_id = ?), 1) AS accept_requests, " +
    "EXISTS (SELECT 1 FROM gc_friends WHERE (user_a_id = ? AND user_b_id = ?) " +
      "OR (user_a_id = ? AND user_b_id = ?)) AS friends";

// The caller's dm/group channels, with the unread count derived from THEIR
// member row's cursor (gm.id > last_read_message_id) right in the SQL.
const CONVERSATIONS_LIST_SQL =
  "SELECT c.id, c.kind, c.last_message_id, c.last_message_at, m.last_read_message_id, " +
    "(SELECT COUNT(*) FROM gc_messages gm WHERE gm.channel_id = c.id " +
      "AND gm.id > m.last_read_message_id) AS unread " +
  "FROM gc_channels c JOIN gc_conversation_members m ON m.channel_id = c.id " +
  "WHERE m.user_id = ? AND c.kind IN ('dm','group') " +
  "ORDER BY c.last_message_id DESC, c.id DESC";

// The rosters and previews for exactly the listed channels — one IN-list read
// each, never a per-channel query (an empty list short-circuits to zero rows).
// The roster carries the plusActiveExpr badge: `?` sits in the SELECT list,
// so its `now` bind precedes the IN-list marks (callers bind nowSeconds()
// FIRST, in textual order).
const ROSTER_SQL =
  "SELECT m.channel_id, m.user_id AS member_id, u.username, " + plusActiveExpr("u.id") + " " +
  "FROM gc_conversation_members m JOIN users u ON u.id = m.user_id " +
  "WHERE m.channel_id IN (PLACEHOLDERS) ORDER BY m.channel_id, m.user_id";

const LAST_MESSAGE_SQL =
  "SELECT c.id AS channel_id, m.body, m.created_at, u.username AS author_name " +
  "FROM gc_messages m JOIN gc_channels c ON c.last_message_id = m.id " +
  "JOIN users u ON u.id = m.author_id " +
  "WHERE c.id IN (PLACEHOLDERS)";

// Leave is group-only: the member DELETE's WHERE carries the group-kind
// precondition so a dm channel answers 404 through the same statement.
const LEAVE_MEMBERS_DELETE_SQL =
  "DELETE FROM gc_conversation_members WHERE channel_id = ? AND user_id = ? " +
  "AND EXISTS (SELECT 1 FROM gc_channels c WHERE c.id = ? AND c.kind = 'group')";

// After the leaving member row: the channel dies only with the LAST member.
const LEAVE_CHANNEL_DELETE_SQL =
  "DELETE FROM gc_channels WHERE id = ? AND kind = 'group' AND NOT EXISTS " +
    "(SELECT 1 FROM gc_conversation_members cm WHERE cm.channel_id = ?)";

function conversationName(kind, members, selfId) {
  const others = members
    .filter((member) => member.userId !== selfId)
    .map((member) => member.username);
  return kind === "dm" ? (others[0] ?? null) : others.join(", ");
}

async function handleCreateConversationRoute(request, env) {
  const session = await requireUser(request, env);
  const body = await readJson(request);
  const raw = body.userIds;

  if (!Array.isArray(raw)) throw new HttpError(400, "Send the member ids as an array.");

  const selfId = Number(session.user.id);
  const ids = [];
  for (const value of raw) {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1 || id >= MAX_ID) {
      throw new HttpError(400, "Member ids must be positive user ids.");
    }
    if (id === selfId) throw new HttpError(400, "You are already a member of the conversation.");
    if (!ids.includes(id)) ids.push(id);
  }

  if (ids.length === 0) {
    throw new HttpError(400, "A conversation needs at least one other member.");
  }
  if (ids.length > MAX_GROUP_INVITES) {
    throw new HttpError(400, "A group chat can have at most 8 other members.");
  }
  const kind = ids.length === 1 ? "dm" : "group";

  // Every invited id must resolve from the users table — one read (carrying
  // the plusActiveExpr badge for the member shapes below; the `?` sits in the
  // SELECT list, so its `now` bind precedes the IN-list marks), and the
  // refusal happens BEFORE any blocks read or write.
  const rows = (await env.GOOBER_DB.prepare(
    "SELECT id, username, " + plusActiveExpr("id") +
      " FROM users WHERE id IN (" + ids.concat([selfId]).map(() => "?").join(",") + ")",
  ).bind(nowSeconds(), selfId, ...ids).all()).results || [];
  const usernameById = new Map(rows.map((row) => [Number(row.id), row.username]));
  const plusById = new Map(rows.map((row) => [Number(row.id), publicIsPlus(row)]));
  if (ids.some((id) => !usernameById.has(id))) {
    throw new HttpError(400, "One of those members does not exist.");
  }

  // Blocks (read-only use of the forum table plus the social tier): a
  // blocker-blocked pair with any requested member refuses — as DM or group
  // alike.
  const blockedRow = await env.GOOBER_DB.prepare(blocksReadSql(ids))
    .bind(selfId, ...ids, selfId, ...ids, selfId, ...ids, selfId, ...ids).first();
  if (blockedRow) {
    throw new HttpError(403, "You can't start a conversation with that member.");
  }

  // The filed DM gate (phase-3 social): direct thread creation to a non-friend
  // is refused only while the recipient keeps requests closed; with requests
  // open (the GC default) the cold DM stands. A missing prefs row is the
  // open default, so the absent-row read answers null and the create proceeds.
  if (kind === "dm") {
    const [otherId] = ids;
    const gate = await env.GOOBER_DB.prepare(DM_REQUEST_GATE_SQL)
      .bind(selfId, otherId, otherId, otherId, otherId).first();
    if (gate && Number(gate.accept_requests) === 0 && Number(gate.friends) !== 1) {
      throw new HttpError(403, "That member only accepts messages from friends.");
    }
  }

  const members = [
    { userId: selfId, username: session.user.username, isPlus: Boolean(plusById.get(selfId)) },
    ...ids.map((id) => ({ userId: id, username: usernameById.get(id), isPlus: Boolean(plusById.get(id)) })),
  ];

  // DM find-or-create: reuse the existing pair channel, answer 200 with it.
  if (kind === "dm") {
    const found = await env.GOOBER_DB.prepare(DM_FIND_SQL).bind(selfId, ids[0]).first();
    if (found) {
      return json({ conversation: { id: Number(found.id), name: usernameById.get(ids[0]), kind, members } }, 200);
    }
  }
  // Groups ALWAYS create new: no lookup, straight to the batch.

  const now = nowSeconds();
  // The channel INSERT runs FIRST, as its own statement, so every member
  // statement can bind the channel's LITERAL id. Deriving it inside the batch
  // with last_insert_rowid() is wrong once more than one member rides along:
  // each member INSERT completes and becomes the connection's last insert, so
  // members 2..N bind to the PREVIOUS member row's rowid (real-SQLite repro:
  // channel id 6 produced member rows (6,7),(3,9),(4,10)) — on D1 the member
  // FKs turn that into failed (or silent) corruption.
  const channelResult = await env.GOOBER_DB.prepare(
    "INSERT INTO gc_channels (server_id, name, kind, position, created_at) " +
      "VALUES (NULL, ?, ?, 0, ?)",
  ).bind(kind, kind, now).run();
  if (Number(channelResult?.meta?.changes) !== 1) {
    // Unreachable short of a constraint regression (server_id NULL + the
    // dm/group CHECK are pre-shaped); surfaced instead of a half-built row.
    throw new HttpError(500, "The conversation could not be created. Please try again.");
  }
  const channelId = Number(channelResult.meta.last_row_id);

  // ALL member inserts ride ONE batch, each bound to the literal channel id.
  const memberResults = await env.GOOBER_DB.batch(
    members.map((member) =>
      env.GOOBER_DB.prepare(
        "INSERT INTO gc_conversation_members (channel_id, user_id, last_read_message_id) " +
          "VALUES (?, ?, 0)",
      ).bind(channelId, member.userId),
    ),
  );
  if (memberResults.some((result) => Number(result?.meta?.changes) !== 1)) {
    throw new HttpError(500, "The conversation could not be created. Please try again.");
  }

  return json(
    { conversation: { id: channelId, name: conversationName(kind, members, selfId), kind, members } },
    201,
  );
}

async function handleListConversationsRoute(request, env) {
  const session = await requireSignedInRead(request, env);
  const selfId = Number(session.user.id);

  const channels = (await env.GOOBER_DB.prepare(CONVERSATIONS_LIST_SQL)
    .bind(selfId).all()).results || [];

  const channelIds = channels.map((row) => Number(row.id));
  if (channelIds.length === 0) return json({ conversations: [] });

  const marks = channelIds.map(() => "?").join(",");
  const rosters = (await env.GOOBER_DB.prepare(
    ROSTER_SQL.replace("PLACEHOLDERS", marks),
  ).bind(nowSeconds(), ...channelIds).all()).results || [];
  const previews = (await env.GOOBER_DB.prepare(
    LAST_MESSAGE_SQL.replace("PLACEHOLDERS", marks),
  ).bind(...channelIds).all()).results || [];

  const membersByChannel = new Map();
  for (const row of rosters) {
    const channelId = Number(row.channel_id);
    const list = membersByChannel.get(channelId) || [];
    list.push({ userId: Number(row.member_id), username: row.username, isPlus: publicIsPlus(row) });
    membersByChannel.set(channelId, list);
  }

  const lastByChannel = new Map();
  for (const row of previews) {
    lastByChannel.set(Number(row.channel_id), {
      body: row.body,
      createdAt: new Date(Number(row.created_at) * 1000).toISOString(),
      authorName: row.author_name,
    });
  }

  return json({
    conversations: channels.map((row) => {
      const channelId = Number(row.id);
      const members = membersByChannel.get(channelId) || [];
      return {
        id: channelId,
        name: conversationName(row.kind, members, selfId),
        kind: row.kind,
        members,
        lastMessage: lastByChannel.get(channelId) ?? null,
        unread: Number(row.unread || 0),
      };
    }),
  });
}

async function handleLeaveConversationRoute(request, env, conversationId) {
  const session = await requireUser(request, env);
  const selfId = Number(session.user.id);

  // The member row delete runs FIRST and its result GATES the channel delete:
  // zero changes means "not a member, not a group, or no such channel" — all
  // answer the outsider shape, 404 (never 403) — and NOTHING else may run.
  // (A single batch cannot express that: an unconditional second statement
  // would fire for an outsider too, and against a memberless group channel its
  // NOT-EXISTS arm passes, destroying the channel while the caller is told
  // 404.) The channel delete itself stays NOT-EXISTS-guarded so it removes the
  // channel only when the departing caller truly was the LAST member.
  const memberResult = await env.GOOBER_DB.prepare(LEAVE_MEMBERS_DELETE_SQL)
    .bind(conversationId, selfId, conversationId).run();
  if (Number(memberResult?.meta?.changes) !== 1) {
    throw new HttpError(404, "This conversation does not exist or you cannot view it.");
  }
  await env.GOOBER_DB.prepare(LEAVE_CHANNEL_DELETE_SQL).bind(conversationId, conversationId).run();

  return json({ ok: true });
}

export async function handleConversationRoutes(request, env, url, path, method, ctx) {
  // ctx (the worker's execution context) completes the dispatch loop's
  // handler signature; these routes schedule no background work today.
  void url;
  void ctx;

  if (path === "/api/conversations" && method === "POST") {
    return handleCreateConversationRoute(request, env);
  }
  if (path === "/api/conversations" && method === "GET") {
    return handleListConversationsRoute(request, env);
  }

  const match = method === "DELETE"
    ? path.match(/^\/api\/conversations\/([1-9][0-9]{0,14})$/)
    : null;
  if (match) {
    return handleLeaveConversationRoute(request, env, Number(match[1]));
  }

  return undefined;
}

// Server custom emoji + stickers (parity bundle, Nov 17 2026, migration
// 0020): CRUD exactly like the server-icon lane — the picture IS a
// gc_attachments row (same standalone intake, same pending moderation, same
// serving gate), the write authorization rides INSIDE the statements (owner
// tier OR the gc_roles MANAGE_EMOJI bit), and the inventory cap rides the
// create statement itself, so a burst of parallel creates can never
// overshoot 50 per server.
//
// THE WIRE TOKENS: a message body references an emoji as <e:name:id> and a
// sticker as <s:name:id> (GC's bracket form of Discord's :name:id). The id
// never changes even across a rename, so old messages keep rendering. The
// send-time rules live with the other message gates (api/messages.mjs): a
// token renders only when its id resolves (unknown ids are plain text), and
// a token pointing at a DIFFERENT server than the channel's own is a
// Goober+ perk (external emoji) — refused before anything is stored, and
// inside a DM/group channel EVERY resolved token is external.
//
// The read path hands rows out as { id, serverId, name, url, createdAt };
// loadServerExpressions is the message-list side table (one read per table,
// the channel's server), so the client resolves tokens locally.
import { requireSignedInRead, requireUser } from "./core/auth.mjs";
import { nowSeconds } from "./core/crypto.mjs";
import { HttpError, json, rateLimit, readJson } from "./core/http.mjs";
import {
  GC_EMOJI_MAX_PER_SERVER,
  GC_EMOJI_NAME_MAX,
  GC_EMOJI_NAME_MIN,
  GC_EMOJI_NAME_PATTERN,
  GC_STICKER_MAX_PER_SERVER,
} from "../constants.mjs";
import { SERVER_PERMISSIONS } from "./permissions.mjs";
import { plusPerkActive } from "./plus.mjs";
// The create intake IS the attachment intake (magic bytes, structural
// sanitizer, 64k chunks, pending moderation) reused end to end — no second
// storage gate can ever drift away from the message one.
import { createAttachment } from "./media.mjs";
// The manage-guard fragments mirror the channel-delete lane's shapes
// (servers.mjs) — kept local rather than imported so the bundle's commit can
// stay atomic while that module is mid-flight; a guard change must be
// re-mirrored here (the parity tests pin BOTH copies' behavior).
const MERGED_PERMS_SELECT =
  "(SELECT COALESCE(SUM(ar.permissions), 0) FROM gc_member_roles gmr " +
    "JOIN gc_roles ar ON ar.id = gmr.role_id " +
    "WHERE gmr.server_id = ? AND gmr.user_id = ?)";

const OWNER_EXISTS_SQL =
  "EXISTS (SELECT 1 FROM gc_server_members om " +
    "WHERE om.server_id = ? AND om.user_id = ? AND om.role = 'owner')";

// The token scanners. Both id parts are strict integers ([1-9][0-9]*) — a
// malformed token is never an expression, it is TEXT and renders as text.
export const EMOJI_TOKEN_PATTERN = /<e:([A-Za-z0-9_]{2,16}):([1-9][0-9]*)>/g;
export const STICKER_TOKEN_PATTERN = /<s:([A-Za-z0-9_]{2,16}):([1-9][0-9]*)>/g;

// The token BUILDERS (id-stable across renames — callers pass the row's id,
// never name-dependent state).
export function emojiToken(name, id) {
  return "<e:" + String(name) + ":" + Number(id) + ">";
}

export function stickerToken(name, id) {
  return "<s:" + String(name) + ":" + Number(id) + ">";
}

function attachmentUrl(attachmentId) {
  return "/api/attachments/" + Number(attachmentId);
}

// Every expression reference a body carries, both kinds, one pass. Duplicates
// are the CALLER's problem at render time; the gate de-duplicates its reads.
export function referencedExpressionIds(text) {
  const emojiIds = [];
  const stickerIds = [];
  for (const match of String(text || "").matchAll(EMOJI_TOKEN_PATTERN)) {
    emojiIds.push(Number(match[2]));
  }
  for (const match of String(text || "").matchAll(STICKER_TOKEN_PATTERN)) {
    stickerIds.push(Number(match[2]));
  }
  return { emojiIds, stickerIds };
}

// The send-time external-emoji gate (the owner's plus-at-SEND ruling). One
// read per kind over the referenced ids, then:
//   - unknown ids are ignored (not expressions — text);
//   - ids on the channel's own server are free for every member;
//   - everything else — another server inside a server channel, or ANY
//     resolved token inside a DM/group channel (no channel server at all) —
//     needs an ACTIVE plus term (the strict perk predicate; a grace-window
//     member rides the free tier only).
export async function enforceExpressionTokenAccess(env, senderId, channelServerId, text) {
  const { emojiIds, stickerIds } = referencedExpressionIds(text);
  if (emojiIds.length === 0 && stickerIds.length === 0) return;

  const isExternal = [];
  for (const [ids, table] of [[emojiIds, "gc_emoji"], [stickerIds, "gc_stickers"]]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) continue;
    const { results } = await env.GOOBER_DB.prepare(
      "SELECT id, server_id FROM " + table + " WHERE id IN (" +
        unique.map(() => "?").join(",") + ")",
    ).bind(...unique).all();
    for (const row of results || []) {
      const rowServerId = Number(row.server_id);
      if (channelServerId === null || !Number.isInteger(channelServerId) ||
          rowServerId !== channelServerId) {
        isExternal.push(Number(row.id));
      }
    }
  }
  if (isExternal.length === 0) return;

  if (await plusPerkActive(env, senderId, nowSeconds())) return;
  throw new HttpError(403, "Using another server's emoji is a Goober+ perk.");
}

export function expressionPayloadRow(row) {
  return {
    id: Number(row.id),
    serverId: Number(row.server_id),
    name: row.name,
    url: attachmentUrl(row.attachment_id),
    createdAt: row.created_at === null || row.created_at === undefined
      ? null
      : new Date(Number(row.created_at) * 1000).toISOString(),
  };
}

// One read per table, each capped at its own inventory limit — the
// message-list side table (server channels only, a DM passes no serverId).
export async function loadServerExpressions(env, serverId) {
  const emojis = [];
  const stickers = [];
  const tables = [
    ["gc_emoji", emojis, GC_EMOJI_MAX_PER_SERVER],
    ["gc_stickers", stickers, GC_STICKER_MAX_PER_SERVER],
  ];
  for (const [table, into, cap] of tables) {
    const { results } = await env.GOOBER_DB.prepare(
      "SELECT id, server_id, name, attachment_id, created_at FROM " + table +
        " WHERE server_id = ? ORDER BY name, id LIMIT " + cap,
    ).bind(Number(serverId)).all();
    for (const row of results || []) into.push(expressionPayloadRow(row));
  }
  return { emojis, stickers };
}

// --- CRUD ---------------------------------------------------------------------
//
// The two kinds are ONE parameterized shape (the twin tables differ only in
// table name, cap, token letter, and route word), so every statement below
// is written once against `kind` — the drift guard the twin-table ruling
// wanted by construction.
const KIND = {
  emoji: {
    table: "gc_emoji",
    cap: GC_EMOJI_MAX_PER_SERVER,
    word: "emoji",
    routes: "emojis",
  },
  sticker: {
    table: "gc_stickers",
    cap: GC_STICKER_MAX_PER_SERVER,
    word: "sticker",
    routes: "stickers",
  },
};

// The SAME authority fragment every write carries — string-tier owner OR the
// MANAGE_EMOJI bit (binds follow the fragment order OWNER(server, actor)
// MERGED(server, actor) bit bit).
function manageGuard(serverId, actorId) {
  const bit = SERVER_PERMISSIONS.MANAGE_EMOJI;
  return {
    sql: "(" + OWNER_EXISTS_SQL + " OR ((" + MERGED_PERMS_SELECT + ") & ?) = ?)",
    params: [serverId, actorId, serverId, actorId, bit, bit],
  };
}

const EXPRESSION_NAME_ERROR =
  "Use a " + GC_EMOJI_NAME_MIN + "-" + GC_EMOJI_NAME_MAX +
  " character name of letters, numbers and underscores.";

function validExpressionName(value) {
  if (typeof value !== "string" || !GC_EMOJI_NAME_PATTERN.test(value)) {
    throw new HttpError(400, EXPRESSION_NAME_ERROR);
  }
  return value;
}

function validExpressionId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1 || id >= 1_000_000_000_000) {
    throw new HttpError(400, "That id is invalid.");
  }
  return id;
}

// The read-tier membership gate (no membership → the shared 404, never an
// existence oracle).
async function memberGate(env, serverId, userId) {
  const exists = await env.GOOBER_DB.prepare(
    "SELECT 1 AS member FROM gc_server_members WHERE server_id = ? AND user_id = ? LIMIT 1",
  ).bind(serverId, userId).first();
  if (!exists) throw new HttpError(404, "That server does not exist or you are not in it.");
}

// The write-tier authority read, the channel-delete lane's exact two-step:
// string tiers first, then the merged role mask for everyone else.
async function expressionAuthority(env, serverId, actorId) {
  const membership = await env.GOOBER_DB.prepare(
    "SELECT role FROM gc_server_members WHERE server_id = ? AND user_id = ? LIMIT 1",
  ).bind(serverId, actorId).first();
  if (!membership) return { isMember: false, authoritative: false };
  let authoritative =
    membership.role === "owner" || membership.role === "moderator";
  if (!authoritative) {
    const perms = await env.GOOBER_DB.prepare(
      "SELECT (" + MERGED_PERMS_SELECT + ") AS permissions " +
        "FROM gc_server_members m WHERE m.server_id = ? AND m.user_id = ? LIMIT 1",
    ).bind(serverId, actorId, serverId, actorId).first();
    authoritative = ((Number(perms?.permissions) || 0) &
      SERVER_PERMISSIONS.MANAGE_EMOJI) === SERVER_PERMISSIONS.MANAGE_EMOJI;
  }
  return { isMember: true, authoritative };
}

async function handleListExpressionsRoute(request, env, serverId, kind) {
  const session = await requireSignedInRead(request, env);
  await memberGate(env, Number(serverId), Number(session.user.id));
  const { emojis, stickers } = await loadServerExpressions(env, Number(serverId));
  return json(kind === "emoji" ? { emojis } : { stickers });
}

// --- create -------------------------------------------------------------------
//
// The manage guard, the CALLER'S-OWN-attachment rule (the server-icon rule —
// someone else's pending upload can never be referenced) and the inventory
// cap all ride the SAME SELECT-arm INSERT, so an unauthorized, mismatched or
// over-cap create is a zero-changes statement, never a partial row. A name
// collision is the UNIQUE violation the statement throws (never a silent
// skip), answered 409.
const EXPRESSION_INSERT_SQL = (table) =>
  "INSERT INTO " + table + " (server_id, name, attachment_id, created_by, created_at) " +
    "SELECT ?, ?, ?, ?, ? " +
    "WHERE (" + OWNER_EXISTS_SQL + " OR ((" + MERGED_PERMS_SELECT + ") & ?) = ?) " +
    "AND EXISTS (SELECT 1 FROM gc_attachments a WHERE a.id = ? AND a.uploader_id = ?)";

async function handleCreateExpressionRoute(request, env, serverId, kind) {
  const session = await requireUser(request, env);
  await rateLimit(request, env, "write", "emoji:" + session.user.id);
  const actorId = Number(session.user.id);
  const contentType = (request.headers.get("Content-Type") || "").toLowerCase();

  let attachmentId = null;
  let name = null;
  if (contentType.startsWith("multipart/form-data")) {
    await rateLimit(request, env, "upload", "user:" + actorId);
    const { fields, files } = await readMultipartWithImage(request);
    name = validExpressionName(fields.name);
    if (files.length > 1) throw new HttpError(400, "Attach exactly one image.");
    if (files.length === 0) {
      throw new HttpError(400, "Attach the image for this " + KIND[kind].word + ".");
    }
    // The standalone intake (5 MiB, magic bytes, pending moderation — emoji
    // and sticker images render inline, they are never huge sends).
    const created = await createAttachment(env, actorId, files[0]);
    attachmentId = Number(created.id);
  } else {
    const body = await readJson(request);
    name = validExpressionName(body.name);
    attachmentId = Number(body.attachmentId);
    if (!Number.isInteger(attachmentId) || attachmentId < 1) {
      throw new HttpError(400, "Reference one of your own uploaded images.");
    }
  }

  // The multipart branch's upload already ran its limiter; the JSON branch's
  // write limiter is the rateLimit above.
  const result = await env.GOOBER_DB.prepare(
    EXPRESSION_INSERT_SQL(KIND[kind].table) +
      " AND (SELECT COUNT(*) FROM " + KIND[kind].table + " WHERE server_id = ?) < " +
      KIND[kind].cap,
  ).bind(
    Number(serverId), name, attachmentId, actorId, nowSeconds(),
    Number(serverId), actorId, SERVER_PERMISSIONS.MANAGE_EMOJI,
    SERVER_PERMISSIONS.MANAGE_EMOJI,
    attachmentId, actorId,
    Number(serverId),
  ).run().catch((error) => {
    if (/UNIQUE|SQLITE_CONSTRAINT/i.test(String(error))) {
      throw new HttpError(409, "That " + KIND[kind].word + " name is already taken in this server.");
    }
    throw error;
  });

  if (Number(result?.meta?.changes) !== 1) {
    // Zero changes — classify by the failing arm, in arm order. ONE read for
    // the cap + the caller-own question, the authority read reuses the
    // channel-delete two-step.
    const state = await env.GOOBER_DB.prepare(
      "SELECT EXISTS (SELECT 1 FROM gc_attachments a WHERE a.id = ? AND a.uploader_id = ?) AS ownAttachment, " +
        "(SELECT COUNT(*) FROM " + KIND[kind].table + " WHERE server_id = ?) AS count",
    ).bind(attachmentId, actorId, Number(serverId)).first();
    const { isMember, authoritative } = await expressionAuthority(env, Number(serverId), actorId);
    if (!isMember) throw new HttpError(404, "That server does not exist or you are not in it.");
    if (!authoritative) throw new HttpError(403, "You do not have permission to do that.");
    if (Number(state?.count) >= KIND[kind].cap) {
      throw new HttpError(400, "This server already has " + KIND[kind].cap + " " + KIND[kind].word + ".");
    }
    throw new HttpError(400, "Reference one of your own uploaded images.");
  }

  // The created row re-read (INSERT..SELECT cannot chain last_row_id into a
  // token — one indexed lookup answers both the id and the payload's shape).
  const row = await env.GOOBER_DB.prepare(
    "SELECT id, server_id, name, attachment_id, created_at FROM " + KIND[kind].table +
      " WHERE server_id = ? AND name = ? ORDER BY id DESC LIMIT 1",
  ).bind(Number(serverId), name).first();
  if (!row) {
    throw new HttpError(500, "The " + KIND[kind].word + " could not be saved. Please try again.");
  }
  return json({ [kind]: expressionPayloadRow(row) }, 201);
}

// --- rename -------------------------------------------------------------------

async function handleRenameExpressionRoute(request, env, serverId, expressionId, kind) {
  const session = await requireUser(request, env);
  await rateLimit(request, env, "write", "emoji:" + session.user.id);
  const body = await readJson(request);
  const name = validExpressionName(body.name);
  const expressionIdNum = validExpressionId(expressionId);
  const actorId = Number(session.user.id);
  const guard = manageGuard(Number(serverId), actorId);

  let result;
  try {
    result = await env.GOOBER_DB.prepare(
      "UPDATE " + KIND[kind].table + " SET name = ? WHERE id = ? AND server_id = ? AND " + guard.sql,
    ).bind(name, expressionIdNum, Number(serverId), ...guard.params).run();
  } catch (error) {
    if (/UNIQUE|SQLITE_CONSTRAINT/i.test(String(error))) {
      throw new HttpError(409, "That " + KIND[kind].word + " name is already taken in this server.");
    }
    throw error;
  }
  if (Number(result?.meta?.changes) !== 1) {
    // SAME diagnostics discipline as the channel family: with authority the
    // row is unknown (404); without it the shared 403 never probes existence.
    const { isMember, authoritative } = await expressionAuthority(env, Number(serverId), actorId);
    if (!isMember) throw new HttpError(404, "That server does not exist or you are not in it.");
    if (authoritative) throw new HttpError(404, "That " + KIND[kind].word + " does not exist.");
    throw new HttpError(403, "You do not have permission to do that.");
  }

  const row = await env.GOOBER_DB.prepare(
    "SELECT id, server_id, name, attachment_id, created_at FROM " + KIND[kind].table +
      " WHERE id = ? LIMIT 1",
  ).bind(expressionIdNum).first();
  return json({ [kind]: expressionPayloadRow(row) });
}

// --- delete -------------------------------------------------------------------
//
// The three-statement batch in the channel-delete ordering (chunks →
// expression → attachment LAST, because the attachment FK is RESTRICT — the
// reference must leave first). EVERY statement carries the SAME guard, so an
// unauthorized caller strips nothing even in a pre-cleanup statement. The
// trailing attachment delete carries the protection for every OTHER
// referencer of the same image: another expression row (either table), any
// message attachment (the create intake is standalone-only, but the column
// guard is the cheap fail-safe), so a shared image can never be stripped
// out from under the remaining rows.
async function handleDeleteExpressionRoute(request, env, serverId, expressionId, kind) {
  const session = await requireUser(request, env);
  await rateLimit(request, env, "write", "emoji:" + session.user.id);
  const actorId = Number(session.user.id);
  const expressionIdNum = validExpressionId(expressionId);
  const guard = manageGuard(Number(serverId), actorId);

  const target = await env.GOOBER_DB.prepare(
    "SELECT attachment_id FROM " + KIND[kind].table +
      " WHERE id = ? AND server_id = ? LIMIT 1",
  ).bind(expressionIdNum, Number(serverId)).first();
  if (!target) {
    const { isMember, authoritative } = await expressionAuthority(env, Number(serverId), actorId);
    if (!isMember) throw new HttpError(404, "That server does not exist or you are not in it.");
    if (authoritative) throw new HttpError(404, "That " + KIND[kind].word + " does not exist.");
    throw new HttpError(403, "You do not have permission to do that.");
  }

  const results = await env.GOOBER_DB.batch([
    env.GOOBER_DB.prepare(
      "DELETE FROM gc_attachment_chunks WHERE attachment_id = ? AND " + guard.sql,
    ).bind(Number(target.attachment_id), ...guard.params),
    env.GOOBER_DB.prepare(
      "DELETE FROM " + KIND[kind].table + " WHERE id = ? AND server_id = ? AND " + guard.sql,
    ).bind(expressionIdNum, Number(serverId), ...guard.params),
    env.GOOBER_DB.prepare(
      "DELETE FROM gc_attachments WHERE id = ? AND " +
        "NOT EXISTS (SELECT 1 FROM gc_emoji WHERE attachment_id = ?) AND " +
        "NOT EXISTS (SELECT 1 FROM gc_stickers WHERE attachment_id = ?) AND " +
        "message_id IS NULL AND " + guard.sql,
    ).bind(
      Number(target.attachment_id),
      Number(target.attachment_id),
      Number(target.attachment_id),
      ...guard.params,
    ),
  ]);
  if (Number(results[1]?.meta?.changes) !== 1) {
    throw new HttpError(403, "You do not have permission to do that.");
  }
  return json({ ok: true });
}

// --- dispatch -----------------------------------------------------------------

export async function handleExpressionRoutes(request, env, url, path, method, ctx) {
  void url;
  void ctx;

  for (const [kindName, kind] of Object.entries(KIND)) {
    const listMatch = (method === "GET" || method === "POST")
      ? path.match(new RegExp("^/api/servers/([1-9][0-9]*)/" + kind.routes + "$"))
      : null;
    if (listMatch) {
      return method === "GET"
        ? handleListExpressionsRoute(request, env, Number(listMatch[1]), kindName)
        : handleCreateExpressionRoute(request, env, Number(listMatch[1]), kindName);
    }

    const itemMatch = (method === "PATCH" || method === "DELETE")
      ? path.match(new RegExp("^/api/servers/([1-9][0-9]*)/" + kind.routes + "/([1-9][0-9]*)$"))
      : null;
    if (itemMatch) {
      return method === "PATCH"
        ? handleRenameExpressionRoute(request, env, Number(itemMatch[1]), itemMatch[2], kindName)
        : handleDeleteExpressionRoute(request, env, Number(itemMatch[1]), itemMatch[2], kindName);
    }
  }
  return undefined;
}

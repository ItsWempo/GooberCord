// Servers and channels routes (Phase 1, Task 4): server creation + listing and
// the moderator-gated text/voice channel create. Sessions, CSRF/same-origin
// gates, and the http helpers are the vendored core's job; this module owns
// only dispatch, request-shape validation, and status codes.
//
// The authorization rule of the module: every write's guards ride INSIDE the
// SQL itself, never as a read-then-write check. So the server create is one
// atomic batch (server + owner membership + #general channel, the latter two
// deriving their server id from last_insert_rowid()), and the channel create
// is a single guarded INSERT ... SELECT whose WHERE carries the membership
// role precondition and the per-server channel-cap precondition. A failure
// there is classified AFTER the fact by one diagnostic membership read — it
// only picks the error message (403 vs 400) and never gates any write.
import { requireSignedInRead, requireUser } from "./core/auth.mjs";
import { nowSeconds, randomToken } from "./core/crypto.mjs";
import { HttpError, json, readJson, requiredText } from "./core/http.mjs";
import { MAX_CHANNELS_PER_SERVER } from "../constants.mjs";

// gc_servers/gc_channels CHECK(length(trim(name)) BETWEEN 1 AND 100); the
// route-side limit mirrors it so oversized names 400 instead of 500-ing on the
// constraint.
const SERVER_NAME_MAX = 100;
const CHANNEL_NAME_MAX = 100;

async function handleCreateServerRoute(request, env) {
  const session = await requireUser(request, env);
  const body = await readJson(request);
  const name = requiredText(body.name, "server name", SERVER_NAME_MAX);
  const userId = Number(session.user.id);
  const now = nowSeconds();

  // One transaction: the server row, the owner's membership row, and the
  // #general text channel. The membership/channel statements pull their
  // server_id from last_insert_rowid() so nothing is round-tripped through
  // the client or read back between writes.
  const results = await env.GOOBER_DB.batch([
    env.GOOBER_DB.prepare(
      "INSERT INTO gc_servers (name, owner_user_id, created_at) VALUES (?, ?, ?)",
    ).bind(name, userId, now),
    env.GOOBER_DB.prepare(
      "INSERT INTO gc_server_members (server_id, user_id, role, joined_at) " +
        "SELECT last_insert_rowid(), ?, ?, ?",
    ).bind(userId, "owner", now),
    env.GOOBER_DB.prepare(
      "INSERT INTO gc_channels (server_id, name, kind, position, created_at) " +
        "SELECT last_insert_rowid(), 'general', 'text', 0, ?",
    ).bind(now),
  ]);

  if (Number(results[0]?.meta?.changes) !== 1) {
    // Unreachable short of a constraint regression (name is pre-shaped, the
    // session user exists); surfaced instead of returning a half-built server.
    throw new HttpError(500, "The server could not be created. Please try again.");
  }

  const serverId = Number(results[0].meta.last_row_id);
  const channel = await env.GOOBER_DB.prepare(
    "SELECT id, name, kind, position FROM gc_channels " +
      "WHERE server_id = ? AND name = 'general' LIMIT 1",
  ).bind(serverId).first();

  return json(
    {
      server: { id: serverId, name },
      channels: channel
        ? [{
            id: Number(channel.id),
            name: channel.name,
            kind: channel.kind,
            position: Number(channel.position),
          }]
        : [],
    },
    201,
  );
}

// One query: memberships for the caller joined to their servers and the
// servers' text/voice channels. The join's server_id IS NOT NULL excludes
// DM/group conversation channels (they have none), and the ORDER BY pins the
// per-server (position, id) channel order.
async function handleListServersRoute(request, env) {
  const session = await requireSignedInRead(request, env);
  const { results } = await env.GOOBER_DB.prepare(
    "SELECT s.id AS server_id, s.name AS server_name, s.is_public AS server_is_public, m.role, " +
      "c.id AS channel_id, c.name AS channel_name, " +
      "c.kind AS channel_kind, c.position AS channel_position " +
      "FROM gc_server_members m " +
      "JOIN gc_servers s ON s.id = m.server_id " +
      "LEFT JOIN gc_channels c ON c.server_id = s.id AND c.server_id IS NOT NULL " +
      "WHERE m.user_id = ? " +
      "ORDER BY s.id, c.position, c.id",
  ).bind(Number(session.user.id)).all();

  const servers = [];
  const byId = new Map();

  for (const row of results) {
    let server = byId.get(row.server_id);

    if (!server) {
      // isPublic mirrors the migration's 0/1 flag (0004); a pre-0004 row shape
      // (undefined) degrades to false, never to a crash.
      server = {
        id: Number(row.server_id),
        name: row.server_name,
        isPublic: Number(row.server_is_public) === 1,
        role: row.role,
        channels: [],
      };
      byId.set(row.server_id, server);
      servers.push(server);
    }

    if (row.channel_id !== null && row.channel_id !== undefined) {
      server.channels.push({
        id: Number(row.channel_id),
        name: row.channel_name,
        kind: row.channel_kind,
        position: Number(row.channel_position),
      });
    }
  }

  return json({ servers });
}

// The whole authorization + cap check in one statement. Zero changes means
// either "not a server moderator/owner" or "the server is at the channel cap"
// — only then is one diagnostic read made, purely to pick the 403 vs the 400.
const CAP_CHANNEL_INSERT_SQL =
  "INSERT INTO gc_channels (server_id, name, kind, position, created_at) " +
    "SELECT ?, ?, ?, " +
    "(SELECT COALESCE(MAX(position), -1) + 1 FROM gc_channels WHERE server_id = ?), ? " +
    "WHERE EXISTS (" +
      "SELECT 1 FROM gc_server_members WHERE server_id = ? AND user_id = ? " +
      "AND role IN ('owner','moderator')" +
    ") AND (SELECT COUNT(*) FROM gc_channels WHERE server_id = ?) <= " +
    (MAX_CHANNELS_PER_SERVER - 1);

async function handleCreateChannelRoute(request, env, serverId) {
  const session = await requireUser(request, env);
  const body = await readJson(request);

  if (body.kind !== "text" && body.kind !== "voice") {
    throw new HttpError(400, "Channel kind must be either text or voice.");
  }

  const name = requiredText(body.name, "channel name", CHANNEL_NAME_MAX);
  const userId = Number(session.user.id);
  const now = nowSeconds();

  const result = await env.GOOBER_DB.prepare(CAP_CHANNEL_INSERT_SQL)
    .bind(serverId, name, body.kind, serverId, now, serverId, userId, serverId)
    .run();

  if (Number(result.meta?.changes) !== 1) {
    // Diagnostic only: authority already rode the guarded INSERT. A moderator
    // sees the cap message, everyone else — including non-members, so no
    // server-existence oracle — sees the permission message.
    const membership = await env.GOOBER_DB.prepare(
      "SELECT role FROM gc_server_members WHERE server_id = ? AND user_id = ? LIMIT 1",
    ).bind(serverId, userId).first();

    if (membership && (membership.role === "owner" || membership.role === "moderator")) {
      throw new HttpError(400, "That server has reached its channel limit.");
    }

    throw new HttpError(403, "You do not have permission to do that.");
  }

  const channelId = Number(result.meta.last_row_id);
  const channel = await env.GOOBER_DB.prepare(
    "SELECT id, name, kind, position FROM gc_channels WHERE id = ? AND server_id = ? LIMIT 1",
  ).bind(channelId, serverId).first();

  return json({
    channel: {
      id: channelId,
      name: channel.name,
      kind: channel.kind,
      position: Number(channel.position),
    },
  }, 201);
}

// --- discovery + invites ---------------------------------------------------------
// Every write below keeps the module's rule: the authorization predicate rides
// INSIDE the SQL, and a changes=0 result is classified afterwards by a single
// diagnostic read that only picks an error message — it never gates a write.

// randomToken(6) is exactly 8 base64url chars (48 bits -> 8 x 6-bit chars, no
// padding to strip), so an invite link is always "#/join/<8 chars>".
function newInviteCode() {
  return randomToken(6);
}

async function handleCreateInviteRoute(request, env, serverId) {
  const session = await requireUser(request, env);
  const userId = Number(session.user.id);
  const now = nowSeconds();

  // The owner rider inside the INSERT ... SELECT: a join against a foreign
  // server changes nothing, and the (rare) 8-char code collision is the only
  // reason to retry — same statement, fresh code.
  const INVITE_INSERT_SQL =
    "INSERT INTO gc_invites (code, server_id, created_by, created_at) " +
      "SELECT ?, ?, ?, ? WHERE EXISTS (" +
        "SELECT 1 FROM gc_servers WHERE id = ? AND owner_user_id = ?" +
      ")";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = newInviteCode();
    let result;
    try {
      result = await env.GOOBER_DB.prepare(INVITE_INSERT_SQL)
        .bind(code, serverId, userId, now, serverId, userId)
        .run();
    } catch (error) {
      const message = String(error?.message || "");
      if (!attemptMatchesUniqueViolation(message)) throw error;
      continue; // code collision (the PK): a fresh code, same statement
    }

    if (Number(result.meta?.changes) !== 1) {
      // Diagnostic only. A non-owner sees the permission message; an owner
      // whose row matched nothing means the server itself is gone (404).
      const membership = await env.GOOBER_DB.prepare(
        "SELECT role FROM gc_server_members WHERE server_id = ? AND user_id = ? LIMIT 1",
      ).bind(serverId, userId).first();

      if (membership && membership.role === "owner") {
        throw new HttpError(404, "That server does not exist.");
      }

      throw new HttpError(403, "You do not have permission to do that.");
    }

    return json({ code }, 201);
  }

  // Three successive PK collisions: astronomically unlikely, surfaced rather
  // than looped.
  throw new HttpError(500, "The invite could not be created. Please try again.");
}

function attemptMatchesUniqueViolation(message) {
  // D1 surfaces SQLite's PRIMARY KEY violation as a UNIQUE constraint error.
  return message.includes("UNIQUE") && message.includes("gc_invites.code");
}

// An invite join is NOT gated on is_public: private servers live off invites.
// One read (invite row) then at most one membership write plus one uses
// counter tick; an invalid code 404s before any write happens.
const INVITE_JOIN_SELECT_SQL =
  "SELECT server_id FROM gc_invites WHERE code = ? LIMIT 1";
const INVITE_JOIN_INSERT_SQL =
  "INSERT OR IGNORE INTO gc_server_members (server_id, user_id, role, joined_at) " +
    "VALUES (?, ?, 'member', ?)";
const INVITE_USES_BUMP_SQL = "UPDATE gc_invites SET uses = uses + 1 WHERE code = ?";

async function handleInviteJoinRoute(request, env, code) {
  const session = await requireUser(request, env);
  const userId = Number(session.user.id);
  const now = nowSeconds();

  const invite = await env.GOOBER_DB.prepare(INVITE_JOIN_SELECT_SQL)
    .bind(code).first();

  if (!invite) {
    // 404 with zero writes: a wrong code never touches membership or uses.
    throw new HttpError(404, "That invite is no longer valid.");
  }

  const serverId = Number(invite.server_id);
  // INSERT OR IGNORE: an already-member re-join is idempotent — joined:false
  // and the uses counter does NOT move (only a fresh join counts).
  const join = await env.GOOBER_DB.prepare(INVITE_JOIN_INSERT_SQL)
    .bind(serverId, userId, now).run();
  const joined = Number(join.meta?.changes) === 1;

  if (joined) {
    await env.GOOBER_DB.prepare(INVITE_USES_BUMP_SQL).bind(code).run();
  }

  return json({ joined, serverId });
}

// The discovery grid: public servers with a member count, already-member
// servers excluded SERVER-SIDE via NOT EXISTS (the roster never round-trips
// through the client), capped at 50.
const DISCOVER_SELECT_SQL =
  "SELECT s.id AS server_id, s.name AS server_name, " +
    "(SELECT COUNT(*) FROM gc_server_members m WHERE m.server_id = s.id) AS member_count " +
  "FROM gc_servers s " +
  "WHERE s.is_public = 1 AND NOT EXISTS (" +
    "SELECT 1 FROM gc_server_members me WHERE me.server_id = s.id AND me.user_id = ?" +
  ") ORDER BY s.id LIMIT 50";

async function handleDiscoverRoute(request, env) {
  const session = await requireSignedInRead(request, env);
  const { results } = await env.GOOBER_DB.prepare(DISCOVER_SELECT_SQL)
    .bind(Number(session.user.id)).all();

  return json({
    servers: (results || []).map((row) => ({
      id: Number(row.server_id),
      name: row.server_name,
      memberCount: Number(row.member_count),
    })),
  });
}

// The is_public = 1 precondition rides INSIDE the INSERT ... SELECT, so a
// stale client (grid re-rendered after a flip to private) still cannot join.
const DISCOVER_JOIN_INSERT_SQL =
  "INSERT INTO gc_server_members (server_id, user_id, role, joined_at) " +
    "SELECT ?, ?, 'member', ? WHERE EXISTS (" +
      "SELECT 1 FROM gc_servers WHERE id = ? AND is_public = 1" +
    ")";

async function handleDiscoverJoinRoute(request, env, serverId) {
  const session = await requireUser(request, env);
  const userId = Number(session.user.id);
  const now = nowSeconds();

  const join = await env.GOOBER_DB.prepare(DISCOVER_JOIN_INSERT_SQL)
    .bind(serverId, userId, now, serverId).run();

  if (Number(join.meta?.changes) !== 1) {
    // Diagnostic only: the guard rode the INSERT. Already a member (the private
    // flip happened under them) is the idempotent joined:false; for anyone
    // else the guarded SELECT matched no public row — 404, no oracle between.
    const membership = await env.GOOBER_DB.prepare(
      "SELECT 1 AS member FROM gc_server_members WHERE server_id = ? AND user_id = ? LIMIT 1",
    ).bind(serverId, userId).first();

    if (membership) {
      return json({ joined: false });
    }

    throw new HttpError(404, "That server is not open for discovery.");
  }

  return json({ joined: true, serverId });
}

// PATCH /api/servers/:id. One clearly-marked region per field, stacked onto
// the SET clause — a parallel server-settings field appends its own region
// below without touching this one. The owner rider sits inside the UPDATE's
// WHERE, exactly like the invite/channel guards.
async function handleUpdateServerRoute(request, env, serverId) {
  const session = await requireUser(request, env);
  const body = await readJson(request);
  const setColumns = [];
  const setValues = [];

  // --- region: is_public (discovery visibility, owner-only) -------------------
  if (Object.hasOwn(body, "is_public")) {
    if (body.is_public !== true && body.is_public !== false) {
      throw new HttpError(400, "is_public must be true or false.");
    }
    setColumns.push("is_public = ?");
    setValues.push(body.is_public ? 1 : 0);
  }
  // --- region: is_public ends -------------------------------------------------

  if (setColumns.length === 0) {
    throw new HttpError(400, "Nothing to update.");
  }

  const result = await env.GOOBER_DB.prepare(
    "UPDATE gc_servers SET " + setColumns.join(", ") + " WHERE id = ? AND owner_user_id = ?",
  ).bind(...setValues, serverId, Number(session.user.id)).run();

  if (Number(result.meta?.changes) !== 1) {
    // Diagnostic only: authority rode the WHERE owner_user_id = ?. An owner
    // whose UPDATE matched nothing means the server itself is gone (404);
    // everyone else gets the permission message — no existence oracle.
    const membership = await env.GOOBER_DB.prepare(
      "SELECT role FROM gc_server_members WHERE server_id = ? AND user_id = ? LIMIT 1",
    ).bind(serverId, Number(session.user.id)).first();

    if (membership && membership.role === "owner") {
      throw new HttpError(404, "That server does not exist.");
    }

    throw new HttpError(403, "You do not have permission to do that.");
  }

  return json({ server: { id: Number(serverId), isPublic: body.is_public } });
}

export async function handleServerRoutes(request, env, url, path, method, ctx) {
  // ctx (the worker's execution context) completes the dispatch loop's handler
  // signature; these routes schedule no background work today.
  void url;
  void ctx;

  if (path === "/api/servers" && method === "POST") {
    return handleCreateServerRoute(request, env);
  }
  if (path === "/api/servers" && method === "GET") {
    return handleListServersRoute(request, env);
  }

  const channelsMatch = method === "POST"
    ? path.match(/^\/api\/servers\/(0|[1-9][0-9]*)\/channels$/)
    : null;
  if (channelsMatch) {
    return handleCreateChannelRoute(request, env, Number(channelsMatch[1]));
  }

  // --- discovery + invites dispatch -------------------------------------------
  const inviteCreateMatch = method === "POST"
    ? path.match(/^\/api\/servers\/(0|[1-9][0-9]*)\/invites$/)
    : null;
  if (inviteCreateMatch) {
    return handleCreateInviteRoute(request, env, Number(inviteCreateMatch[1]));
  }

  const inviteJoinMatch = method === "POST"
    ? path.match(/^\/api\/invites\/([A-Za-z0-9_-]{1,64})\/join$/)
    : null;
  if (inviteJoinMatch) {
    return handleInviteJoinRoute(request, env, inviteJoinMatch[1]);
  }

  if (path === "/api/discover" && method === "GET") {
    return handleDiscoverRoute(request, env);
  }

  const discoverJoinMatch = method === "POST"
    ? path.match(/^\/api\/discover\/(0|[1-9][0-9]*)\/join$/)
    : null;
  if (discoverJoinMatch) {
    return handleDiscoverJoinRoute(request, env, Number(discoverJoinMatch[1]));
  }

  const serverPatchMatch = method === "PATCH"
    ? path.match(/^\/api\/servers\/(0|[1-9][0-9]*)$/)
    : null;
  if (serverPatchMatch) {
    return handleUpdateServerRoute(request, env, Number(serverPatchMatch[1]));
  }

  return undefined;
}

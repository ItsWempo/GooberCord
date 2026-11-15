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
import { nowSeconds } from "./core/crypto.mjs";
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
    "SELECT s.id AS server_id, s.name AS server_name, m.role, " +
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
      server = {
        id: Number(row.server_id),
        name: row.server_name,
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

  return undefined;
}

// Servers and channels routes (Phase 1, Task 4): server creation + listing and
// the moderator-gated text/voice channel create. Sessions, CSRF/same-origin
// gates, and the http helpers are the vendored core's job; this module owns
// only dispatch, request-shape validation, and status codes.
//
// The authorization rule of the module: every write's guards ride INSIDE the
// SQL itself, never as a read-then-write check. So the server create is one
// atomic batch (server + owner membership + #general channel, the latter two
// deriving their server id from last_insert_rowid()), the channel create
// is a single guarded INSERT ... SELECT whose WHERE carries the membership
// role precondition and the per-server channel-cap precondition, and the
// server PATCH is a single guarded UPDATE whose WHERE carries both the
// ownership precondition and the icon-owner precondition. A channel-create
// failure is classified AFTER the fact by one diagnostic membership read — it
// only picks the error message (403 vs 400) and never gates any write; the
// PATCH, by contrast, has no failure classes to pick between (an owner that
// hits a 403 asked for an icon it does not own, and that answer deliberately
// leaks nothing about either the server or the attachment).
import { requireSignedInRead, requireUser } from "./core/auth.mjs";
import { nowSeconds } from "./core/crypto.mjs";
import { HttpError, json, rateLimit, readJson, requiredText } from "./core/http.mjs";
import { MAX_CHANNELS_PER_SERVER } from "../constants.mjs";
// Server icons reuse the media module's intake end to end: the standalone
// upload (magic bytes, structural sanitizer, 64k chunks, pending moderation)
// and the same multipart reader — no new storage SQL, no second gate to have
// drifted away from the attachment one.
import { createAttachment, readMultipartWithImage } from "./media.mjs";

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

// Icon URLs ride the shared serving gate: /api/attachments/:id serves an
// approved row to anyone, a pending row only to its uploader (server icons
// upload pending), and anything else 404s. So the list hands every referenced
// media id out as a plain URL and visibility stays the media module's job.
function attachmentUrl(mediaId) {
  return mediaId === null || mediaId === undefined ? null : "/api/attachments/" + Number(mediaId);
}

// One query: memberships for the caller joined to their servers and the
// servers' text/voice channels. The join's server_id IS NOT NULL excludes
// DM/group conversation channels (they have none), and the ORDER BY pins the
// per-server (position, id) channel order.
async function handleListServersRoute(request, env) {
  const session = await requireSignedInRead(request, env);
  const { results } = await env.GOOBER_DB.prepare(
    "SELECT s.id AS server_id, s.name AS server_name, s.icon_media_id AS server_icon_media_id, " +
      "m.role, " +
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
        iconUrl: attachmentUrl(row.server_icon_media_id),
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

// --- PATCH /api/servers/:id (server settings: name + icon) -----------------------
//
// Owner-only, and the ownership never leaves the UPDATE's WHERE — a caller
// that is not the owner (or a caller pointing the icon at an attachment they
// do not own) fails the SAME statement with zero changes, answered by one
// shared 403 that never probes the server's existence. The icon reference is
// guarded inside that same WHERE: icon_media_id may only resolve to one of
// the CALLER'S OWN gc_attachments rows, so a pending attachment that the
// serving gate would refuse to another session can never be smuggled into
// the server's icon slot.
//
// Body shape: application/json { name?, iconMediaId? } (iconMediaId null
// clears the icon) or multipart/form-data { name?, image } — the image part
// runs the media module's exact standalone intake (createAttachment), so the
// icon row is stored pending moderation and chunked like every attachment.
async function handleUpdateServerRoute(request, env, serverId) {
  const session = await requireUser(request, env);
  const userId = Number(session.user.id);
  const contentType = (request.headers.get("Content-Type") || "").toLowerCase();

  // --- PATCH: intake -----------------------------------------------------------
  // Each PATCH field owns ONE clearly-marked block, and the blocks below only
  // ever set their own flag — merge-friendly by construction, so a parallel
  // worker can stack another field (a flag, a second column, ...) by adding
  // one more block without re-touching the intake or the UPDATE assembly.
  const nameField = { present: false, value: null };
  const iconField = { present: false, value: null };

  if (contentType.startsWith("multipart/form-data")) {
    // Uploads ride the same limiter as the standalone attachment intake, then
    // the SAME multipart reader (the `image` file part is enforced there). An
    // owner-only route: the guard rides the UPDATE below either way.
    await rateLimit(request, env, "upload", "user:" + userId);
    const { fields, files } = await readMultipartWithImage(request);

    // [PATCH field block: name] — same validation as create (multipart text
    // field), run at collection time so an invalid name 400s before the intake
    // ever stores anything.
    if (fields.name !== undefined) {
      nameField.present = true;
      nameField.value = requiredText(fields.name, "server name", SERVER_NAME_MAX);
    }

    // [PATCH field block: icon] — an uploaded image is stored through
    // createAttachment (magic bytes, sanitizer, 64k chunks, status='pending'),
    // and only the returned media id moves into the server's icon_media_id
    // column. Exactly one image per PATCH, like the standalone intake.
    if (files.length > 1) {
      throw new HttpError(400, "Attach exactly one image.");
    }
    if (files.length > 0) {
      const attachment = await createAttachment(env, userId, files[0]);
      iconField.present = true;
      iconField.value = attachment.id;
    }
  } else {
    const body = await readJson(request);

    // [PATCH field block: name] — same validation as create, at collection
    // time (before anything can be written below).
    if (body.name !== undefined) {
      nameField.present = true;
      nameField.value = requiredText(body.name, "server name", SERVER_NAME_MAX);
    }

    // [PATCH field block: icon] — iconMediaId is an attachment id (or null to
    // clear); anything else is a 400 before any statement runs.
    if (body.iconMediaId !== undefined) {
      const mediaId = body.iconMediaId;
      if (mediaId !== null && (!Number.isInteger(mediaId) || mediaId < 1)) {
        throw new HttpError(400, "iconMediaId must be an attachment id or null.");
      }
      iconField.present = true;
      iconField.value = mediaId;
    }
  }

  if (!nameField.present && !iconField.present) {
    throw new HttpError(400, "Nothing to change. Send a new name and/or a new icon.");
  }

  // --- PATCH: one guarded UPDATE ----------------------------------------------
  // The SET fragments assemble per present field; the WHERE always carries
  // id + owner_user_id, and a present icon adds its own-attachment EXISTS
  // guard to the same statement. No read-then-write gates anywhere.
  const setClauses = [];
  const setBinds = [];
  let iconGuardBinds = [];

  if (nameField.present) {
    // Already validated at collection time, exactly like create (the server
    // name CHECK constraint mirrors it).
    setClauses.push("name = ?");
    setBinds.push(nameField.value);
  }

  if (iconField.present) {
    setClauses.push("icon_media_id = ?");
    setBinds.push(iconField.value);
    if (iconField.value !== null) {
      // The icon slot may only take an attachment the CALLER uploaded. The
      // guard rides the UPDATE, so a stranger's (or merely guessed) id can
      // never land — zero changes, one shared 403, no existence oracle.
      iconGuardBinds = [iconField.value, userId];
    }
  }

  const result = await env.GOOBER_DB.prepare(
    "UPDATE gc_servers SET " + setClauses.join(", ") +
      " WHERE id = ? AND owner_user_id = ?" +
      (iconField.present && iconField.value !== null
        ? " AND EXISTS (SELECT 1 FROM gc_attachments WHERE id = ? AND uploader_id = ?)"
        : ""),
  ).bind(...setBinds, serverId, userId, ...iconGuardBinds).run();

  if (Number(result.meta?.changes) !== 1) {
    // Zero changes: not the owner, an unknown server, or an icon id that is
    // not the caller's own attachment — all the same 403, none of them
    // confirmed by any follow-up read (nothing else is queried).
    throw new HttpError(403, "You do not have permission to do that.");
  }

  // Read back the merged row (owner-guarded, so the response is only ever the
  // caller's own server state).
  const row = await env.GOOBER_DB.prepare(
    "SELECT id, name, icon_media_id FROM gc_servers WHERE id = ? AND owner_user_id = ? LIMIT 1",
  ).bind(serverId, userId).first();
  if (!row) {
    // Unreachable short of a concurrent ownership change: never echo a state
    // the UPDATE did not just write.
    throw new HttpError(403, "You do not have permission to do that.");
  }

  return json(
    {
      server: {
        id: Number(row.id),
        name: row.name,
        iconUrl: attachmentUrl(row.icon_media_id),
      },
    },
    200,
  );
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

  const serverPatchMatch = (method === "PATCH")
    ? path.match(/^\/api\/servers\/(0|[1-9][0-9]*)$/)
    : null;
  if (serverPatchMatch) {
    return handleUpdateServerRoute(request, env, Number(serverPatchMatch[1]));
  }

  const channelsMatch = method === "POST"
    ? path.match(/^\/api\/servers\/(0|[1-9][0-9]*)\/channels$/)
    : null;
  if (channelsMatch) {
    return handleCreateChannelRoute(request, env, Number(channelsMatch[1]));
  }

  return undefined;
}

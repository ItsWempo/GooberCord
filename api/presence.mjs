// PresenceHub Durable Object + presence REST (Phase 1, Task 9). The hub is
// ONE DO at the pinned name "hub": an in-memory Map of userId → presence that
// every ChatRoom and the REST routes talk to through stub fetches carrying the
// pinned text frames ({"type":"connect"|"heartbeat"|"leave"|"list"}). There is
// deliberately no WebSocket on the hub and no D1 write from it — the map lives
// in DO memory for the lifetime of a busy hub (Workers Free is fine with that:
// an empty hub hibernates at zero cost) and the persisted custom status lives
// in gc_member_status, which the hub re-reads on each heartbeat so a PATCH
// survives hub eviction without the hub needing a write path.
//
// Hibernation-native by construction: presence traffic never wakes any room
// pair (the hub owns presence, the rooms own fan-out), and the auto-response
// pair pinned at construction means WS pings on the hub's sockets, if ever
// added later, are answered at the edge without waking the instance.
import { json, HttpError } from "./core/http.mjs";
import { requireSignedInRead, requireUser } from "./core/auth.mjs";
import { nowSeconds } from "./core/crypto.mjs";

let workerd = null;
try {
  workerd = await import("cloudflare:workers");
} catch {
  /* node --test: no workerd builtins — the class runs on its own base */
}

class DurableObjectBase {}

// The single hub identity every relay and route shares.
export const PRESENCE_HUB_NAME = "hub";

// The status overlay the REST route persists; the hub re-reads it per
// heartbeat, so an eviction between write and heartbeat never wedges status.
const STATUS_MAX_CHARS = 128;

export class PresenceHub extends (workerd?.DurableObject ?? DurableObjectBase) {
  constructor(state, env) {
    super(state, env);
    // workerd's DurableObject base assigns neither field; the explicit
    // assignment keeps the class identical under `node --test`, where the
    // guarded import fell back to an inert base.
    this.state = state;
    this.env = env;
    // userId → {username, lastSeen, statusText, statusUntil, channelLabel}
    this.presence = new Map();
    if (typeof state?.setWebSocketAutoResponse === "function") {
      try {
        state.setWebSocketAutoResponse(
          workerd?.WebSocketRequestResponsePair
            ? new workerd.WebSocketRequestResponsePair("ping", "pong")
            : { ping: "ping", pong: "pong" },
        );
      } catch {
        /* a stale runtime without the pair class must not block boot */
      }
    }
  }

  // One stub-fetch entry point for every presence frame (ChatRoom's connect/
  // leave/heartbeat relays and the REST list). The reply is always the pinned
  // presence envelope; a bad frame is a plain 400, never a throw.
  async fetch(request) {
    let frame = null;
    try {
      frame = JSON.parse(await request.text());
    } catch {
      frame = null;
    }
    const type = frame && typeof frame === "object" && !Array.isArray(frame) ? frame.type : null;

    if (type === "connect" || type === "heartbeat") {
      if (Number.isInteger(frame.userId)) {
        if (type === "heartbeat") await this.overlayStatus(frame.userId, frame.username);
        else this.upsert(frame.userId, frame.username);
      }
      return json(this.snapshot());
    }

    if (type === "leave") {
      if (Number.isInteger(frame.userId)) this.presence.delete(frame.userId);
      return json(this.snapshot());
    }

    if (type === "list") {
      return json(this.snapshot());
    }

    return json({ error: "Unknown presence frame." }, 400);
  }

  // Upsert (connect): refresh identity + lastSeen, never clobber an existing
  // status overlay; channelLabel stays until phase 2 voice membership fills it.
  upsert(userId, username) {
    const existing = this.presence.get(userId);
    this.presence.set(userId, {
      username: typeof username === "string" && username.length > 0 ? username : existing?.username,
      lastSeen: nowSeconds(),
      statusText: existing?.statusText ?? null,
      statusUntil: existing?.statusUntil ?? null,
      channelLabel: existing?.channelLabel ?? null,
    });
  }

  // gc_member_status is the persisted truth for the custom status; the hub
  // re-reads and overlays it on every heartbeat, so a PATCH survives an
  // eviction between the write and the next beat. A read failure keeps
  // whatever the map already had.
  async overlayStatus(userId, username) {
    // Upsert first so a user's first-ever heartbeat is a full identity + beat.
    this.upsert(userId, username);
    const db = this.env?.GOOBER_DB;
    if (!db) return;
    try {
      const row = await db
        .prepare("SELECT status_text, status_until FROM gc_member_status WHERE user_id = ?")
        .bind(userId)
        .first();
      const entry = this.presence.get(userId);
      if (!row || !entry) return;
      entry.statusText = row.status_text ?? null;
      entry.statusUntil = row.status_until ?? null;
    } catch {
      /* best-effort overlay — the roster stays truthful even without D1 */
    }
  }

  // The pinned presence envelope: online[] in userId order, and a status whose
  // statusUntil has already passed is hidden (nulls) rather than stale.
  snapshot() {
    const now = nowSeconds();
    const online = [];
    for (const userId of [...this.presence.keys()].sort((a, b) => a - b)) {
      const entry = this.presence.get(userId);
      const stale =
        entry.statusUntil !== null && entry.statusUntil !== undefined && entry.statusUntil < now;
      online.push({
        userId,
        username: entry.username,
        statusText: stale ? null : entry.statusText,
        statusUntil: stale ? null : entry.statusUntil,
      });
    }
    return { type: "presence", online };
  }
}

// REST side: GET /api/presence (server-side hub roundtrip) and
// PATCH /api/me/status (persisted custom status). Registered in worker.mjs's
// API_HANDLERS like every other topic module.
export async function handlePresenceRoutes(request, env, url, path, method, ctx) {
  void ctx;
  void url;

  if (method === "GET" && path === "/api/presence") {
    await requireSignedInRead(request, env);
    if (!env.PRESENCE) throw new HttpError(503, "Presence is not available right now.");
    return json({ online: await hubOnline(env, { type: "list" }) });
  }

  if (method === "PATCH" && path === "/api/me/status") {
    const session = await requireUser(request, env);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new HttpError(400, "That status is invalid.");
    }

    let statusText = body.statusText ?? null;
    if (statusText !== null && typeof statusText === "string" && statusText.trim().length === 0) {
      statusText = null;
    }
    if (statusText !== null && typeof statusText !== "string") {
      throw new HttpError(400, "That status is invalid.");
    }
    if (statusText !== null && statusText.length > STATUS_MAX_CHARS) {
      throw new HttpError(400, "Custom status must be 128 characters or fewer.");
    }

    let statusUntil = body.statusUntil ?? null;
    if (statusUntil !== null && (!Number.isInteger(statusUntil) || statusUntil <= 0)) {
      throw new HttpError(400, "That status expiry is invalid.");
    }

    await env.GOOBER_DB.prepare(
      "INSERT INTO gc_member_status (user_id, status_text, status_until, updated_at) " +
        "VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(user_id) DO UPDATE " +
        "SET status_text = excluded.status_text, status_until = excluded.status_until, " +
        "updated_at = excluded.updated_at",
    ).bind(Number(session.user.id), statusText, statusUntil, nowSeconds()).run();

    return json({ status: { statusText, statusUntil } });
  }

  return undefined;
}

async function hubOnline(env, frame) {
  const stub = env.PRESENCE.get(env.PRESENCE.idFromName(PRESENCE_HUB_NAME));
  const response = await stub.fetch(
    new Request("https://presence.internal/hub", {
      method: "POST",
      body: JSON.stringify(frame),
    }),
  );
  const payload = await response.json().catch(() => ({ online: [] }));
  return Array.isArray(payload?.online) ? payload.online : [];
}

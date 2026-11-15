// WebSocket upgrade route (Phase 1, Task 8): GET /api/ws?channel=<id>.
// Read-only GET, so the session gate is Task 5's `requireSignedInRead` (cookie,
// no CSRF) and the channel access check is the SAME single-SQL read gate as
// the message history route — one membership-look EXISTS, no row → 404 (never
// 403: a non-member must not learn the channel exists). The validated identity
// rides query params to the DO (`userId`/`username`/`channelKind`), which tags
// each accepted socket with them; the browser never chooses them.
//
// The DO is addressed by the pinned name `channel:<channelId>` so every socket
// to one channel lands in one ChatRoom instance; with hibernation the
// connections persist across the DO's eviction.
import { requireSignedInRead } from "./core/auth.mjs";
import { HttpError } from "./core/http.mjs";
import { channelForUser } from "./messages.mjs";

const CHANNEL_ID_TEST = /^[1-9][0-9]{0,14}$/;

export async function handleWsRoutes(request, env, url, path, method, ctx) {
  // ctx completes the dispatch loop's handler signature; this route schedules
  // no background work.
  void ctx;

  if (method !== "GET" || path !== "/api/ws") return undefined;

  const channelParam = url.searchParams.get("channel");
  if (channelParam === null || !CHANNEL_ID_TEST.test(channelParam)) {
    throw new HttpError(400, "That channel is invalid.");
  }

  const session = await requireSignedInRead(request, env);
  const user = session.user;
  const channelId = Number(channelParam);

  // Task 5's read gate — identical SQL, so the two callers can never drift.
  const channel = await channelForUser(env, channelId, Number(user.id));
  if (!channel) throw new HttpError(404, "This channel does not exist or you cannot view it.");

  if (!env.ROOMS) throw new HttpError(503, "Chat is not available right now.");

  const identity = new URL(request.url);
  identity.searchParams.set("userId", String(user.id));
  identity.searchParams.set("username", String(user.username ?? ""));
  identity.searchParams.set("channelKind", channel.kind == null ? "text" : String(channel.kind));

  const stub = env.ROOMS.get(env.ROOMS.idFromName("channel:" + channelId));
  // Forward the upgrade headers verbatim — the DO answers with the 101 + pair.
  return stub.fetch(new Request(identity.toString(), { headers: request.headers }));
}

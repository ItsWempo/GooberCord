// Wempo Accounts handshake (the SSO redeem): accounts mints a one-time
// 32-byte-hex ticket at the end of its OWN same-origin login flow and sends
// the browser back as <GooberCord origin>/?wt=<code>; the browser's SPA boot
// posts it here, GC swaps it for the member through the SERVICE-BINDING lane,
// and mints GC's OWN session with the existing machinery. The accounts worker
// never writes GC's tables — the redeeming side (this worker) always re-reads
// the member from the shared users table and calls the session mint the
// password login uses, so the SSO member ends up with precisely the cookie,
// CSRF token, and public shapes login answers.
//
// Lane and trust: the call rides the ACCOUNTS_WORKER service binding to
// https://sso.internal/api/sso/redeem (the relay.mjs precedent — an internet
// fetch from GC to a sibling workers.dev script 404s at the edge and never
// enters the target worker), carrying the shared RELAY_TOKEN secret as
// X-Relay-Token. The token is read only as env.X and is never printed or
// logged. Every degraded path — an unconfigured RELAY_TOKEN, a missing or
// unfetchable binding, a non-2xx from accounts (its 401/410 refusals
// included), or an unparseable body — collapses to null, and null becomes
// the ONE shared 401 below. No response text, ticket, or token is echoed.
import {
  activeBanRow,
  publicUser,
  userAccentColorTagline,
  userByUsernameKey,
} from "./accounts.mjs";
import { assertNetworkNotBanned, assertSameOrigin, createSession } from "./core/auth.mjs";
import { HttpError, json, rateLimit, readJson } from "./core/http.mjs";

// accounts' return-origin allowlist carries this worker's production origin
// (its /api/sso/ticket redirect); the absolute URL is only a dev fallback —
// the redeem itself rides the binding at this internal origin.
const ACCOUNTS_ORIGIN = "https://accounts.itswempo.workers.dev";
const ACCOUNTS_INTERNAL_ORIGIN = "https://sso.internal";
const ACCOUNTS_REDEEM_PATH = "/api/sso/redeem";
const ACCOUNTS_TIMEOUT_MS = 10_000;

// The ticket is one 32-byte value in hex — 64 hex chars, no more, no less.
const TICKET_PATTERN = /^[0-9a-fA-F]{64}$/;

// The one shared answer for every accounts-side refusal (expired, already
// redeemed, unconfigured relay, unreachable worker, malformed member): the
// member simply signs in again. Never leak WHICH failure it was.
const EXPIRED_COPY = "That sign-in link has expired. Sign in again.";

async function redeemTicket(env, code) {
  if (!env.RELAY_TOKEN || typeof env.RELAY_TOKEN !== "string") {
    throw new HttpError(503, "Wempo Accounts sign-in is not configured. Set the shared RELAY_TOKEN on GooberCord.");
  }

  let response;
  try {
    // Header validation and Request construction can throw for malformed
    // secret values; classify that as unavailable configuration, not as an
    // expired one-time ticket.
    const request = new Request(ACCOUNTS_INTERNAL_ORIGIN + ACCOUNTS_REDEEM_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Relay-Token": env.RELAY_TOKEN,
      },
      body: JSON.stringify({ code }),
    });
    const binding = env.ACCOUNTS_WORKER;
    if (binding && typeof binding.fetch === "function") {
      // Production: direct worker-to-worker invocation, no edge routing.
      response = await binding.fetch(request, {
        signal: AbortSignal.timeout(ACCOUNTS_TIMEOUT_MS),
      });
    } else {
      // Dev without the binding: plain internet fetch to accounts 404s at
      // the edge (sibling script), which degrades exactly like every other
      // degraded path here — the shared 401.
      response = await fetch(ACCOUNTS_ORIGIN + ACCOUNTS_REDEEM_PATH, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Relay-Token": env.RELAY_TOKEN,
        },
        body: JSON.stringify({ code }),
        signal: AbortSignal.timeout(ACCOUNTS_TIMEOUT_MS),
      });
    }
  } catch {
    return null; // accounts unreachable — one shared refusal below
  }

  if (!response.ok) return null;

  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function handleSsoRedeemRoute(request, env) {
  // The same login-class gates, in the login route's order: network bans
  // first (no ticket work for a banned network), then same-origin, then
  // GC's own login limiter (binding GC_LOGIN_RATE_LIMITER).
  await assertNetworkNotBanned(request, env);
  assertSameOrigin(request);
  await rateLimit(request, env, "login");

  const body = await readJson(request);
  const wt = typeof body.wt === "string" ? body.wt.trim() : "";
  if (!TICKET_PATTERN.test(wt)) {
    throw new HttpError(400, "This sign-in link is malformed. Open it again from Wempo Accounts.");
  }
  const redeemed = await redeemTicket(env, wt.toLowerCase());
  const userId = Number(redeemed?.userId);
  const username = typeof redeemed?.username === "string" ? redeemed.username : "";
  let user = null;
  if (
    Number.isSafeInteger(userId) && userId >= 1 &&
    username && username.length <= 24 &&
    (user = await userByUsernameKey(env, username.toLowerCase())) &&
    Number(user.id) === userId
  ) {
    // The member row IS the truth (the shared table GC never lets accounts
    // write); the redeem payload only had to name a consistent member.
    // GC's own mint, the login route's tail verbatim: the ban screen read,
    // the requireUnbanned insert, then the same Set-Cookie + shapes.
    const bannedMessage = "This account is currently banned.";
    const activeBan = await activeBanRow(env, user.id);
    if (activeBan) {
      throw new HttpError(403, bannedMessage, {}, {
        error: bannedMessage,
        banned: true,
        reason: activeBan.reason,
        expiresAt: activeBan.expires_at === null || activeBan.expires_at === undefined
          ? null
          : Number(activeBan.expires_at),
      });
    }
    const session = await createSession(request, env, Number(user.id), null, true);
    if (!session) throw new HttpError(403, bannedMessage);
    // The /api/me user shape (the login projection + the two perks fields —
    // the exact composition handleMeRoute answers), so the client lands with
    // the same payload a fresh /api/me read would return.
    const perks = await env.GOOBER_DB.prepare(
      "SELECT accent_color, tagline FROM users WHERE id = ? LIMIT 1",
    ).bind(Number(user.id)).first();
    return json(
      { user: { ...publicUser(user), ...userAccentColorTagline(perks) }, csrfToken: session.csrfToken },
      200,
      { "Set-Cookie": session.setCookie },
    );
  }
  // Every accounts-side refusal and every inconsistent payload is this one
  // 401, with no hint of which leg refused.
  throw new HttpError(401, EXPIRED_COPY);
}

export async function handleSsoRoutes(request, env, url, path, method, ctx) {
  // ctx (the worker's execution context) completes the dispatch loop's
  // handler signature; this route schedules no background work.
  void url;
  void ctx;
  if (path === "/api/auth/sso/redeem" && method === "POST") {
    return handleSsoRedeemRoute(request, env);
  }
  return undefined;
}

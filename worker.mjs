// Route composition and the Worker entrypoint. All handler logic lives under
// api/; worker.mjs re-exports the functions that tests import. workerd
// validates every Worker export as a function or ExportedHandler, so besides
// the default fetch only `export { ... } from` re-exports appear here.
import { handleAccountRoutes } from "./api/accounts.mjs";
import { handleServerRoutes } from "./api/servers.mjs";
import { handleRulesRoutes } from "./api/rules.mjs";
import { handleMessageRoutes } from "./api/messages.mjs";
import { handleConversationRoutes } from "./api/conversations.mjs";
import { handleMediaRoutes } from "./api/media.mjs";
import { handleWsRoutes } from "./api/ws.mjs";
import { handlePresenceRoutes } from "./api/presence.mjs";
import { ensureFilterWords } from "./api/filterstore.mjs";
import { HttpError, json, rateLimit, securityHeaders } from "./api/core/http.mjs";

export { createSession } from "./api/core/auth.mjs";
export {
  hashPassword,
  isValidPassword,
  isValidPasswordPepper,
  isValidSetupSecret,
  verifyPassword,
} from "./api/core/passwords.mjs";
export {
  createAvatarVersion,
  imageResponse,
  sanitizeImage,
  sniffImageMime,
  blobToUint8Array,
} from "./api/core/images.mjs";
export { requireTurnstile, rateLimit } from "./api/core/http.mjs";
// Placeholder DO classes (Phase 1 Task 8/9 replace them): re-exported here so
// workerd sees them as the worker's exports and the ROOMS/PRESENCE bindings
// in wrangler.toml resolve.
export { ChatRoom } from "./api/rooms.mjs";
export { PresenceHub } from "./api/presence.mjs";

function secureResponse(response) {
  const headers = securityHeaders(response.headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Conditional gets (If-None-Match / If-Modified-Since) are dropped before the
// asset pipeline sees them — but only for DOCUMENT requests: ASSETS.fetch
// answers them with a bare 304 that bypasses stampedAssetResponse entirely, so
// the browser would keep its pre-stamp HTML (pre-security-header everything)
// until the etag changed. Only HTML documents get stamped, so only document
// requests need the force-200 trade; every other asset (JS/CSS/images) keeps
// its correct 304 revalidation path instead of a full 200 per visit.
const CONDITIONAL_HEADERS = ["If-None-Match", "If-Modified-Since"];
const DOCUMENT_SECFETCH_DESTS = new Set(["document", "iframe", "frame"]);
function isDocumentRequest(request) {
  const dest = request.headers.get("Sec-Fetch-Dest");
  if (dest) return DOCUMENT_SECFETCH_DESTS.has(dest.toLowerCase());
  // Fallback without sec-fetch-dest (older agents, wrangler dev): an
  // extension-less path (SPA routes, "/") or .html is a document.
  const path = new URL(request.url).pathname;
  if (/\.html?$/i.test(path)) return true;
  const last = path.split("/").pop();
  return last === "" || !last.includes(".");
}
function unconditional(request) {
  if (!isDocumentRequest(request)) return request;
  const headers = new Headers(request.headers);
  for (const name of CONDITIONAL_HEADERS) headers.delete(name);
  return new Request(request, { headers });
}

function apiError(error) {
  if (error instanceof HttpError) {
    return json(error.payload || { error: error.message }, error.status, error.headers);
  }
  console.error("Forum request failed:", error);
  return json({ error: "Something went wrong. Please try again." }, 500);
}

// Stale-build stamp (v4.3.1): every HTML document the worker serves carries
// the build it came with (VERSION@COMMIT_SHA) as a <meta> tag. The client
// compares that stamp against the live /api/version — an SPA tab keeps the
// JS it was served with across deploys, and old JS talking to the newer
// backend is where the "page doesn't update after an action" class of
// misbehavior comes from; a mismatch offers the reload instead.
async function stampedAssetResponse(assetResponse, env) {
  const build = env.VERSION ? [env.VERSION, env.COMMIT_SHA].filter(Boolean).join("@") : "";
  const type = assetResponse.headers.get("Content-Type") || "";
  if (!build || !type.includes("text/html")) return assetResponse;
  const html = await assetResponse.text();
  // The served bytes change length, so the original Content-Length must go —
  // a stale length would truncate the stamped document. HTML also revalidates
  // by ETag, which only tracks the asset bytes: a deploy that bumps VERSION
  // without touching index.html would otherwise keep answering 304s with the
  // browser's OLD stamp. The shell is one small file — no-store keeps every
  // document load freshly stamped.
  const headers = new Headers(assetResponse.headers);
  headers.delete("Content-Length");
  headers.delete("ETag");
  // The byte length changed, so a validator for the old body no longer
  // describes these bytes — a retained Last-Modified would advertise a lie.
  headers.delete("Last-Modified");
  headers.set("Cache-Control", "no-store");
  const stamp = `<meta name="app-build" content="${escapeHtmlAttribute(build)}">`;
  return new Response(html.includes("</head>") ? html.replace("</head>", stamp + "</head>") : html, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers,
  });
}
function escapeHtmlAttribute(value) {
  return String(value).replace(/[&"<>']/g, (char) => ({
    "&": "&amp;",
    '"': "&quot;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
  })[char]);
}
// ctx carries waitUntil (v3.1): background work rides it where a route needs
// one; the response returns without waiting. Callers without a ctx (tests)
// simply never schedule background checks.
// The API handler chain (Phase 1). Each handler receives the loop's shared
// dispatch context and answers only the paths it owns; `undefined` falls
// through to the next handler or the 404 below.
const API_HANDLERS = [
  handleAccountRoutes,
  handleServerRoutes,
  handleRulesRoutes,
  handleMessageRoutes,
  handleConversationRoutes,
  handleMediaRoutes,
  handleWsRoutes,
  handlePresenceRoutes,
];
async function routeApi(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  if (!env.GOOBER_DB) throw new HttpError(503, "The GooberCord database is not configured.");

  // Word-filter priming (mirrors the forum's routeApi): the effective list is
  // the shared site_settings row (read-only) with the FILTERED_WORDS secret as
  // the fallback, held in a TTL cache the handler modules read through
  // filterWords(env). A failed read keeps the secret as the source.
  await ensureFilterWords(env);

  await rateLimit(request, env, method === "GET" || method === "HEAD" ? "read" : "write");

  for (const handler of API_HANDLERS) {
    const response = await handler(request, env, url, path, method, ctx);
    if (response) return response;
  }

  if (path.startsWith("/api/")) throw new HttpError(404, "That API endpoint does not exist.");
  throw new HttpError(404, "Not found.");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await routeApi(request, env, ctx);
      } catch (error) {
        return apiError(error);
      }
    }
    if (!env.ASSETS) return json({ error: "Static assets are not configured." }, 503);
    try {
      return secureResponse(await stampedAssetResponse(await env.ASSETS.fetch(unconditional(request)), env));
    } catch (error) {
      console.error("Static asset request failed:", error);
      return json({ error: "The requested page could not be loaded." }, 500);
    }
  },
};

// GIF search (parity bundle, Nov 17 2026): the Tenor-backed picker route.
//
// OWNER-SUPPLIED SECRET ONLY: the key rides env.TENOR_API_KEY and is NEVER
// hardcoded, echoed, logged, or committed — a request without the configured
// secret answers the shared 503 copy (the feature is simply not configured
// yet), and no code path below sees more than the one key variable. The
// upstream response is mapped down to the three fields the picker renders
// (id, description, url) — Tenor's own payload shape stays theirs.
import { requireSignedInRead } from "./core/auth.mjs";
import { HttpError, json } from "./core/http.mjs";

const TENOR_SEARCH_URL = "https://g.tenor.com/v2/search";
export const GIF_SEARCH_CONFIGURED_ERROR = "GIF search is not configured yet.";
export const GIF_SEARCH_UNAVAILABLE_ERROR = "GIF search is unavailable right now.";

// The picker's page: 12 by default, 24 at most (the client paginates by
// cursor; GC clamps the page size only). The medium content filter is the
// route's own default — the picker is a shared surface, so Tenor's explicit
// mature-off tier is what a search hands back before GC's own rules ever see
// a rendered sticker-sized GIF in a message.
const GIF_DEFAULT_LIMIT = 12;
const GIF_MAX_LIMIT = 24;

function publicGif(result) {
  const media = result.media_formats || {};
  return {
    id: typeof result.id === "string" ? result.id : null,
    description:
      typeof result.content_description === "string" ? result.content_description : null,
    url: typeof media.gif === "object" && media.gif !== null ? media.gif.url : null,
    previewUrl:
      typeof media.tinygif === "object" && media.tinygif !== null ? media.tinygif.url : null,
  };
}

export async function handleGifRoutes(request, env, url, path, method, ctx) {
  void ctx;

  if (path === "/api/gifs/search" && method === "GET") {
    // The key question runs FIRST: an unconfigured environment answers the
    // 503 before any caller-specific work (and never touches the network).
    const apiKey = env.TENOR_API_KEY;
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      throw new HttpError(503, GIF_SEARCH_CONFIGURED_ERROR);
    }

    await requireSignedInRead(request, env);
    const query = (url.searchParams.get("q") || "").trim();
    if (query.length < 1 || query.length > 64) {
      throw new HttpError(400, "Search for something between 1 and 64 characters.");
    }
    const limitRaw = url.searchParams.get("limit");
    let limit = GIF_DEFAULT_LIMIT;
    if (limitRaw !== null && limitRaw !== "") {
      if (!/^[0-9]{1,2}$/.test(limitRaw) || Number(limitRaw) < 1 || Number(limitRaw) > GIF_MAX_LIMIT) {
        throw new HttpError(400, "That page size is invalid.");
      }
      limit = Number(limitRaw);
    }
    // Position cursor: Tenor's own continuation token, passed through
    // opaquely (bounded, never interpreted).
    const positionRaw = url.searchParams.get("position");
    const position =
      typeof positionRaw === "string" && positionRaw.length > 0 && positionRaw.length <= 64
        ? positionRaw
        : undefined;

    const searchParams = new URLSearchParams({
      q: query,
      key: apiKey,
      limit: String(limit),
      media_filter: "gif,tinygif,webp,tinywebp",
      contentfilter: "medium",
      client_key: "goobercord",
    });
    if (position !== undefined) searchParams.set("pos", position);

    let payload;
    try {
      const response = await fetch(TENOR_SEARCH_URL + "?" + searchParams.toString(), {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("tenor status " + response.status);
      payload = await response.json();
    } catch {
      // Upstream failure — the shared unavailable copy, never the key, never
      // the upstream error body.
      throw new HttpError(502, GIF_SEARCH_UNAVAILABLE_ERROR);
    }

    return json({
      gifs: (Array.isArray(payload?.results) ? payload.results : []).map(publicGif),
      position: typeof payload?.next === "string" ? payload.next : null,
    });
  }
  return undefined;
}

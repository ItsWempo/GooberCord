// Filter store (GooberCord port of the forum's api/filterstore.mjs): the
// effective word-filter list lives in the SHARED site_settings table (key
// "filtered_words", edited by the forum's admin desk) and the FILTERED_WORDS
// secret is only the fallback until the first desk save writes the row — the
// D1 value, even an emptied one, is then the single source of truth.
//
// GooberCord's scoping contract allows forum tables to be READ but never
// written, so this port keeps only the store's read half: no admin routes, no
// save — the desk stays the forum's, and a forum-side filter change takes
// effect here without a GooberCord deploy. The pure matcher remains
// api/filter.mjs (verbatim); the topics call `filterWords(env)` where they
// used to read env.FILTERED_WORDS, and the worker awaits ensureFilterWords
// once per API request just like the forum's routeApi does.

const FILTER_KEY = "filtered_words";
// Same short isolates-level TTL as the forum: the list is shared read state,
// not per-request state.
const CACHE_TTL_MS = 30_000;

// Isolate-level cache: { loaded, raw, at }. The three states matter: before
// any successful read the secret wins; after a read (row present, even an
// empty one) the D1 value wins.
const cache = { loaded: false, raw: "", at: 0 };

export async function ensureFilterWords(env) {
  if (cache.loaded && Date.now() - cache.at < CACHE_TTL_MS) return;
  try {
    const row = await env.GOOBER_DB.prepare(
      "SELECT value, updated_at FROM site_settings WHERE key = ? LIMIT 1",
    ).bind(FILTER_KEY).first();
    if (row) {
      cache.raw = String(row.value ?? "");
      cache.loaded = true;
      cache.at = Date.now();
    }
  } catch {
    /* no site_settings yet: keep the secret as the source */
  }
}

// The effective list: the desk's D1 row once it exists, otherwise the secret.
export function filterWords(env) {
  return cache.loaded ? cache.raw : (env.FILTERED_WORDS ?? "");
}

// Test-only seam: the cache above is isolate-global by design (shared state
// that must survive between routes), so tests reset it to keep the
// row-loaded/secret fallback branches reachable from one process.
export function _resetFilterWordsCacheForTests() {
  cache.loaded = false;
  cache.raw = "";
  cache.at = 0;
}

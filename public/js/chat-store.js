
// Pure state reducers for the chat app (no DOM) — the unit-tested surface of
// Task 11/12's frontend. Task 12's markdown module is NOT part of this
// (plain-text rendering only in phase 1); these pins cover what this code
// actually computes: message list ordering/dedupe, history cursor paging,
// unread counts, typing-set expiry, and hash-route parsing.

// Sort key: message id (server-assigned, monotonic per channel).
export function compareMessages(a, b) {
  return Number(a.id) - Number(b.id);
}

// mergeMessages(current, incoming) -> { messages, changed }.
// Dedupes by id (a WS msg frame can echo a REST send, and a resumed page can
// overlap); keeps the result sorted ascending by id. Pure, no mutation.
export function mergeMessages(current, incoming) {
  const list = Array.isArray(current) ? current : [];
  const additions = Array.isArray(incoming) ? incoming : [];
  const byId = new Map();

  for (const message of list) {
    if (message && message.id !== undefined) byId.set(Number(message.id), message);
  }

  for (const message of additions) {
    if (message && message.id !== undefined) {
      const id = Number(message.id);
      const existing = byId.get(id);
      // An edit can arrive out-of-band; the newer shape wins for a same-id
      // pair only when it differs (keeps object identity stable otherwise).
      byId.set(id, existing && !shallowDifferent(existing, message) ? existing : message);
    }
  }

  const messages = [...byId.values()].sort(compareMessages);
  return { messages, changed: messages.length !== list.length || additions.length > 0 };
}

function shallowDifferent(a, b) {
  return a.body !== b.body ||
    a.editedAt !== b.editedAt ||
    JSON.stringify(a.attachmentIds || []) !== JSON.stringify(b.attachmentIds || []);
}

// The history cursor: GET messages?after=<id> pages are DESC pages keyed by
// the page's OLDEST id (nextAfter is the page's last/oldest row in the
// server's response — the bare-id cursor). This returns the id the NEXT
// "load older" request should send, or null when the page is exhausted.
export function nextHistoryCursor(page) {
  const rows = Array.isArray(page?.messages) ? page.messages : [];
  if (rows.length === 0) return null;
  return rows.reduce((oldest, row) => Math.min(oldest, Number(row.id)), Number(Infinity));
}

// unreadCount(lastReadId, messages): messages strictly newer than the read
// cursor, capped for badge display (cap 99+). Pure.
export function unreadCount(lastReadId, messages, cap = 99) {
  const read = Number(lastReadId || 0);
  const count = (Array.isArray(messages) ? messages : [])
    .filter((message) => Number(message.id) > read)
    .length;
  return count > cap ? cap : count;
}

// Typing indicator state: addTyping sets a 6s expiry per userId; expireTyping
// prunes stale entries against `now`. Pure.
export const TYPING_TTL_MS = 6000;

export function addTyping(map, userId, now, ttl = TYPING_TTL_MS) {
  const next = new Map(map instanceof Map ? map : []);
  next.set(Number(userId), Number(now) + ttl);
  return next;
}

export function expireTyping(map, now) {
  const nowMs = Number(now);
  const next = new Map(map instanceof Map ? map : []);
  for (const [userId, until] of next) {
    if (until <= nowMs) next.delete(userId);
  }
  return next;
}

// Hash-route parsing (router.js consumes this). Pure. Routes:
//   "#/login"                        -> { name: "login" }
//   "#/"                             -> { name: "app", serverId: null, channelId: null }
//   "#/s/<serverId>"                 -> { name: "app", serverId, channelId: null }
//   "#/s/<serverId>/c/<channelId>"   -> { name: "app", serverId, channelId }
//   "#/c/<channelId>"                -> { name: "app", serverId: null, channelId } (DM/group)
//   "#/review"                       -> { name: "review" } (staff desk)
// Unknown hashes fall back to { name: "app", serverId: null, channelId: null }.
export function parseHash(hash) {
  const text = String(hash || "");
  const bare = text.startsWith("#") ? text.slice(1) : text;

  if (bare === "/login" || bare === "login") return { name: "login" };
  if (bare === "/review" || bare === "review") return { name: "review" };

  if (bare === "/" || bare === "") {
    return { name: "app", serverId: null, channelId: null };
  }

  const serverChannel = bare.match(/^\/s\/(0|[1-9][0-9]{0,14})\/c\/(0|[1-9][0-9]{0,14})$/);
  if (serverChannel) {
    return {
      name: "app",
      serverId: Number(serverChannel[1]),
      channelId: Number(serverChannel[2]),
    };
  }

  const server = bare.match(/^\/s\/(0|[1-9][0-9]{0,14})$/);
  if (server) {
    return { name: "app", serverId: Number(server[1]), channelId: null };
  }

  const bareChannel = bare.match(/^\/c\/(0|[1-9][0-9]{0,14})$/);
  if (bareChannel) {
    return { name: "app", serverId: null, channelId: Number(bareChannel[1]) };
  }

  return { name: "app", serverId: null, channelId: null };
}

// The inverse: the canonical hash for an app target. Pure.
export function hashFor(target) {
  if (target?.name === "login") return "#/login";
  if (target?.name === "review") return "#/review";

  if (typeof target?.channelId === "number") {
    return typeof target?.serverId === "number"
      ? `#/s/${target.serverId}/c/${target.channelId}`
      : `#/c/${target.channelId}`;
  }

  if (typeof target?.serverId === "number") return `#/s/${target.serverId}`;

  return "#/";
}

// Copyright 2026 YourLocalGoober
//
// This file is part of GooberCord.
//
// GooberCord is free software: you can redistribute it and/or modify it
// under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the
// GNU Affero General Public License along with this program.  If not,
// see <https://www.gnu.org/licenses/>


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
//   "#/login"                        -> { name: "login" } (§4b: the route is a silent redirect — a signed-out open goes to Wempo Accounts; signed-in, #/login lands in the app shell)
//   "#/"                             -> { name: "app", serverId: null, channelId: null }
//   "#/s/<serverId>"                 -> { name: "app", serverId, channelId: null }
//   "#/s/<serverId>/c/<channelId>"   -> { name: "app", serverId, channelId }
//   "#/c/<channelId>"                -> { name: "app", serverId: null, channelId } (DM/group)
//   "#/review"                       -> { name: "review" } (staff desk)
//   "#/discover"                     -> { name: "discover" }
//   "#/join/<CODE>"                  -> { name: "join", code } (invite links)
// Unknown hashes (incl. malformed join codes) fall back to
// { name: "app", serverId: null, channelId: null } — the app shell.
export function parseHash(hash) {
  const text = String(hash || "");
  const bare = text.startsWith("#") ? text.slice(1) : text;

  if (bare === "/login" || bare === "login") return { name: "login" };
  if (bare === "/review" || bare === "review") return { name: "review" };
  if (bare === "/discover" || bare === "discover") return { name: "discover" };
  if (bare === "/shop" || bare === "shop") return { name: "shop" };

  // Invite code: URL-safe base64url only. Anything else (trailing garbage,
  // "$", "/", too short/long) is a malformed link and falls back to the shell.
  const join = bare.match(/^\/join\/([A-Za-z0-9_-]{4,64})$/);
  if (join) return { name: "join", code: join[1] };

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

// The inverse: the canonical hash for an app target. Pure. (No "login" arm:
// the door-swap deleted the route; parseHash still reads a stale "#/login"
// hash gracefully, but nothing ever GENERATES one — a login target has no
// canonical hash to return.)
export function hashFor(target) {
  if (target?.name === "review") return "#/review";
  if (target?.name === "discover") return "#/discover";
  if (target?.name === "shop") return "#/shop";
  if (target?.name === "join") {
    return typeof target?.code === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(target.code)
      ? "#/join/" + target.code
      : "#/";
  }

  if (typeof target?.channelId === "number") {
    return typeof target?.serverId === "number"
      ? `#/s/${target.serverId}/c/${target.channelId}`
      : `#/c/${target.channelId}`;
  }

  if (typeof target?.serverId === "number") return `#/s/${target.serverId}`;

  return "#/";
}

// --- stashed invite (signed-out "#/join/CODE" flow) ---------------------------
// A signed-out invite click cannot join yet: the code is stashed in
// sessionStorage with a 10-minute TTL while the boot bounces to Wempo
// Accounts, and once the member returns signed in, boot takes the stash
// back out and restores the join route (state.js), which auto-joins. The
// helpers are storage-shaped but side-effect-local to `win` (injectable for
// tests: any object with a sessionStorage works).
const PENDING_INVITE_KEY = "goober-pending-invite";
export const PENDING_INVITE_TTL_MS = 10 * 60 * 1000;

function validInviteCode(code) {
  return typeof code === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(code);
}

export function stashPendingInvite(win, code, now = Date.now()) {
  if (!validInviteCode(code)) return;
  try {
    win.sessionStorage.setItem(
      PENDING_INVITE_KEY,
      JSON.stringify({ code, at: Number(now) }),
    );
  } catch {
    // Storage can be full or disabled; losing the stash only means the
    // auto-join is skipped after the accounts round-trip, nothing worse.
  }
}

// Reads, validates the TTL, and ALWAYS clears the entry — a stash is consumed
// once, expired or not. Returns the code or null.
export function takePendingInvite(win, now = Date.now()) {
  let code = null;
  try {
    const raw = win.sessionStorage.getItem(PENDING_INVITE_KEY);
    if (raw !== null) win.sessionStorage.removeItem(PENDING_INVITE_KEY);
    if (raw) {
      const entry = JSON.parse(raw);
      if (
        validInviteCode(entry?.code) &&
        Number(entry?.at) > 0 &&
        Number(now) - Number(entry.at) <= PENDING_INVITE_TTL_MS
      ) {
        code = entry.code;
      }
    }
  } catch {
    // Malformed/parses-as-nothing entries behave as an empty stash.
  }
  return code;
}

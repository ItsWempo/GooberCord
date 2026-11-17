// Tiny CSP-safe DOM factory: every element is created via createElement and
// user-provided TEXT rides textContent only — never innerHTML (the forum's
// escaping discipline; user data must never reach a markup parser).
//
// Framework migration phase 1: el() now DELEGATES to the vendored frontload
// kit's factory (public/js/vendor/dom.mjs, parity-pinned byte-identical to
// Project Designer's frontload/dom.mjs). GooberCord's own copy of the loop
// is gone; this keeps the entrenched single-import call shape every route
// module already uses. The kit's own useDocument()/el pair lands here as a
// plain re-export: in the browser the kit resolves the global document at
// import time (modules always load after document exists), and a popup/
// offscreen context can pin its own document through useDocument — no GC
// call site changes either way. One deliberate delta rides the kit: it
// deep-flattens children (flat(Infinity)) where GC's original flattened one
// level — a strictly wider contract (fragments of fragments become nodes
// instead of being stringified) that fixes a real upstream bug; no GC call
// site depended on nested arrays stringifying.
export { el } from "./vendor/dom.mjs";

// Formats a seconds epoch (or ISO string) as a clock time today, or a date
// otherwise. Pure string logic; tested in tests/frontend-core.test.mjs.
export function formatTimestamp(value, now = new Date()) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const sameDay = date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (sameDay) return "Today at " + time;

  return date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) +
    " " + time;
}

// Initials for server buttons / avatars: the first letters of up to two
// words. Pure function; tested in tests/frontend-core.test.mjs.
export function initials(name) {
  const words = String(name || "")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "?";

  return words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join("");
}

// Strict accent gate for Goober+ (free cosmetics): ONLY a lowercase
// #rgb/#rrggbb hex string passes, and every inline read — a message row's
// left border, an author name's color, a swatch's fill — takes its value
// through this one function, so an inline style can never carry anything
// else (no url(), no gradient strings, no uppercase surprises). Returns the
// verbatim value when valid, null otherwise.
const ACCENT_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/;

export function validAccent(value) {
  return typeof value === "string" && ACCENT_PATTERN.test(value) ? value : null;
}

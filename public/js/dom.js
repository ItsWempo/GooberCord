// Tiny CSP-safe DOM factory: every element is created via createElement and
// user-provided TEXT rides textContent only — never innerHTML (the forum's
// escaping discipline; user data must never reach a markup parser).

export function el(tagName, props = {}, ...children) {
  const element = document.createElement(tagName);

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;

    if (key === "class") {
      element.className = String(value);
      continue;
    }

    if (key === "text") {
      element.textContent = String(value);
      continue;
    }

    if (key === "dataset") {
      for (const [dk, dv] of Object.entries(value)) {
        if (dv !== undefined && dv !== null) element.dataset[dk] = String(dv);
      }
      continue;
    }

    if (key.startsWith("on") && typeof value === "function") {
      element.addEventListener(key.slice(2).toLowerCase(), value);
      continue;
    }

    if (key === "value") {
      element.value = String(value);
      continue;
    }

    element.setAttribute(key, String(value));
  }

  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue;
    element.append(child);
  }

  return element;
}

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

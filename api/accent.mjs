// Goober+ perks accent validator (free-for-everyone cosmetics, $0).
//
// users.profile_accent is deliberately NOT reused for this feature: the
// forum defines it as a whitelisted palette KEY (one of its fixed preset
// names) — the shared D1 keeps the forum's rendering contract, so GooberCord
// adds its own accent_color column (migration 0005) and never stores hex in
// profile_accent. Everything that touches the wire or a comment's markup
// with these values reads them back through the SAME validator so an inline
// style can never carry anything but strict lowercase #rgb/#rrggbb hex.
export const ACCENT_HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/;

export function isStrictHexAccent(value) {
  return typeof value === "string" && ACCENT_HEX_PATTERN.test(value);
}

// The public shape's accent: strict hex passes through verbatim (REST history
// and the WS/DO fan-out both expose it only then), everything else is absent.
export function publicAccent(value) {
  return isStrictHexAccent(value) ? value : null;
}

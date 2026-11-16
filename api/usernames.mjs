// The username shape rule, shared: mirrors the forum's api/core/shapers.mjs
// isValidUsername character for character (shapers.mjs was deliberately not
// vendored — this one function is everything GC needs from it, and more than
// one module reads it now, so it stops being accounts.mjs's private copy).
export function isValidUsername(value) {
  return typeof value === "string" && /^[A-Za-z0-9_]{3,24}$/.test(value);
}

// Applied before styles.css paints (same-origin script, allowed by the
// vendored CSP's script-src 'self'). Reads BOTH appearance keys of the
// GC storage family — theme (light/dark, with the forum's legacy
// "forum-theme" as a read-only fallback) and skin ("goober-skin") — and
// sets the matching data attributes so the first paint is already themed.
// Skin default ruling (2026-11-17, the owner's mock night): the approved
// gc-shell/shop mocks are the DISCORD skin ("discord skin fidelity"), so
// the absent value now carries "discord" — a stored "brand" still wins
// for anyone who deliberately kept the warm papers.
var storedTheme = null;
try {
  storedTheme = localStorage.getItem("goober-theme") || localStorage.getItem("forum-theme");
} catch {
  // Storage can be blocked; CSS prefers-color-scheme remains the fallback.
}
var storedSkin = null;
try {
  storedSkin = localStorage.getItem("goober-skin");
} catch {
  // Ditto — the default (discord) skin applies.
}
if (storedTheme === "dark" || storedTheme === "light") {
  document.documentElement.dataset.theme = storedTheme;
}
document.documentElement.dataset.skin = storedSkin === "brand" ? "brand" : "discord";

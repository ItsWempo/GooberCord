// Applied before styles.css paints (same-origin script, allowed by the
// vendored CSP's script-src 'self'). Reads BOTH appearance keys of the
// GC storage family — theme (light/dark, with the forum's legacy
// "forum-theme" as a read-only fallback) and skin ("goober-skin": the warm
// brand look is the default; "discord" opts into the Discord-dark skin) —
// and sets the matching data attributes so the first paint is already themed.
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
  // Ditto — the default (brand) skin applies.
}
if (storedTheme === "dark" || storedTheme === "light") {
  document.documentElement.dataset.theme = storedTheme;
}
if (storedSkin === "discord" || storedSkin === "brand") {
  document.documentElement.dataset.skin = storedSkin;
}

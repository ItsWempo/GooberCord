// Ported from the forum's public/js/theme-preload.js — the storage key is
// GooberCord's own ("goober-theme"). Applied before styles.css paints; this
// same-origin script is allowed by the vendored CSP's script-src 'self'.
let storedTheme = null;
try {
  storedTheme = localStorage.getItem("forum-theme");
} catch {
  // Storage can be blocked; CSS prefers-color-scheme remains the fallback.
}
if (storedTheme === "dark" || storedTheme === "light") {
  document.documentElement.dataset.theme = storedTheme;
}

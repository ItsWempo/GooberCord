

// Ported from the forum's public/js/theme-preload.js — the storage key is
// GooberCord's own ("goober-theme"). Applied before styles.css paints; this
// same-origin script is allowed by the vendored CSP's script-src 'self'.
let storedTheme = null;

try {
  storedTheme = localStorage.getItem("goober-theme");
} catch {
  // Storage can be blocked; CSS prefers-color-scheme remains the fallback.
}

const root = document.documentElement;

if (root && (storedTheme === "dark" || storedTheme === "light")) {
  root.dataset.theme = storedTheme;
}

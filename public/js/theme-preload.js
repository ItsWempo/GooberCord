// Applied before styles.css paints (same-origin script, allowed by the CSP's
// script-src 'self'). Rewritten from zero for the new client: reads the GC
// skin key ("goober-theme", with the forum's legacy "forum-theme" as a
// read-only fallback) and puts data-theme on the document element so the
// first paint is already skinned. Storage can be blocked in private windows
// or hardened browsers, so every read is guarded and the absence simply
// leaves the skin to the stylesheet's dark default.
var storedTheme = null;
try {
  storedTheme = localStorage.getItem("goober-theme") || localStorage.getItem("forum-theme");
} catch (error) {
  storedTheme = null;
}
if (storedTheme === "dark" || storedTheme === "light") {
  document.documentElement.dataset.theme = storedTheme;
}

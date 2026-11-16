// Ported from the forum's public/js/theme.js (Task 11 carry list); the UI-redo
// restructure adds the SECOND appearance dimension — the skin:
//   theme = "light" | "dark"   (existing; honors the OS when unchosen)
//   skin  = "brand" | "discord" (the warm GooberCord look is the default; the
//           Discord-dark-inspired skin is a pure token re-weight applied by the
//           appended [data-skin="discord"] block in styles.css — no component
//           CSS is rewritten, the whole app re-skins by re-tokening).
// Both ride localStorage under GC's own key family ("goober-theme" /
// "goober-skin"); theme-preload.js reads them BEFORE styles.css paints. The
// forum's "forum-theme" key stays a legacy READ so an account that chose a
// theme on the forum keeps it — writes go to GooberCord's key only.
import { createIcon } from "./icons.js";

export const THEME_STORAGE_KEY = "goober-theme";
export const LEGACY_THEME_STORAGE_KEY = "forum-theme";
export const SKIN_STORAGE_KEY = "goober-skin";

export const SKINS = ["brand", "discord"];

export function resolveTheme(preference, prefersDark) {
  if (preference === "dark" || preference === "light") return preference;
  return prefersDark ? "dark" : "light";
}

// resolveSkin: anything that is not exactly "discord" falls back to the warm
// brand skin — an unknown/absent value must never unskin the default look.
export function resolveSkin(value) {
  return value === "discord" ? "discord" : "brand";
}

function readPreference(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    // Storage can be unavailable (privacy modes); fall back to the defaults.
    return null;
  }
}

// Storage is injectable for tests; an omitted value falls back to the real
// localStorage (theme-preload's sibling module path).
function storageOf(storage) {
  if (storage && typeof storage.getItem === "function") return storage;
  return globalThis.localStorage;
}

// Theme (light/dark) preference: GooberCord's key beats the forum's legacy
// key, and a stored value neither side wrote keeps the OS preference.
export function readThemePreference(storage) {
  storage = storageOf(storage);
  const own = readPreference(storage, THEME_STORAGE_KEY);
  if (own === "dark" || own === "light") return own;
  const legacy = readPreference(storage, LEGACY_THEME_STORAGE_KEY);
  if (legacy === "dark" || legacy === "light") return legacy;
  return null;
}

export function readSkinPreference(storage) {
  storage = storageOf(storage);
  return resolveSkin(readPreference(storage, SKIN_STORAGE_KEY));
}

// Browser chrome (v4.0, skinned by the UI redo): the phone's address/status
// bar follows the EFFECTIVE skin+theme pair — "dark" in the Discord skin must
// not paint the chrome with the brand's navy. The two media-scoped
// <meta theme-color> tags in index.html carry the colors; rewriting their
// content keeps one source of truth.
const BROWSER_CHROME_COLORS = {
  brand: { light: "#f7efdc", dark: "#131b27" },
  discord: { light: "#e3e5e8", dark: "#1e1f22" },
};

export function browserChromeColor(skin, theme) {
  const byTheme = BROWSER_CHROME_COLORS[resolveSkin(skin)];
  return (byTheme && byTheme[theme]) || null;
}

export function applyChromeColor(doc, skin, theme) {
  const color = browserChromeColor(skin, theme);
  if (!color) return;
  for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) {
    meta.content = color;
  }
}

// The boot entry (state.js): applies BOTH stored decisions before first
// paint — theme first (unchanged contract: the attribute is always set so the
// media-query fallback never flips under a made choice), then the skin.
// Returns the applied pair for callers that announce it.
export function applyAppearance(doc, storage) {
  storage = storageOf(storage);
  const prefersDark =
    doc.defaultView !== null &&
    !!doc.defaultView.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = resolveTheme(readThemePreference(storage), prefersDark);
  const skin = readSkinPreference(storage);
  const root = doc.documentElement;
  root.dataset.theme = theme;
  root.dataset.skin = skin;
  applyChromeColor(doc, skin, theme);
  return { theme, skin };
}

// --- controls ---------------------------------------------------------------

function themeToggleCopy(theme) {
  return theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
}

// Makes an (existing) theme-toggle button match the CURRENT mode: icon shows
// the current mode, label announces the NEXT one (owner spec, unchanged).
export function decorateThemeToggle(doc, toggle, theme) {
  theme = theme || doc.documentElement.dataset.theme || "light";
  toggle.setAttribute("aria-label", themeToggleCopy(theme));
  toggle.title = themeToggleCopy(theme);
  toggle.replaceChildren(createIcon(doc, theme === "dark" ? "moon" : "sun"));
  return toggle;
}

// Writes a theme choice everywhere it lives: attribute, browser chrome,
// storage, and every live theme-toggle button. The Turnstile re-theme hook
// fires too (login page widgets follow the page's colors).
export function setThemeChoice(doc, storage, theme) {
  if (theme !== "dark" && theme !== "light") return;
  const root = doc.documentElement;
  root.dataset.theme = theme;
  applyChromeColor(doc, root.dataset.skin, theme);
  try {
    storageOf(storage).setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Persistence is best-effort; the choice still applies to this page.
  }
  for (const toggle of doc.querySelectorAll("#theme-toggle")) {
    decorateThemeToggle(doc, toggle, theme);
  }
  rethemeTurnstile();
}

// Binds a freshly rendered theme-toggle button (login card, user settings —
// the button nodes are re-created per render, so the wiring rides the DOM as
// it exists when this runs).
export function bindThemeToggle(doc, storage, toggle) {
  decorateThemeToggle(doc, toggle);
  toggle.addEventListener("click", () => {
    const next = doc.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setThemeChoice(doc, storage, next);
  });
  return toggle;
}

function skinToggleCopy(skin) {
  return skin === "discord" ? "Switch to GooberCord skin" : "Switch to Discord skin";
}

export function decorateSkinToggle(doc, button, skin) {
  skin = skin || doc.documentElement.dataset.skin || "brand";
  button.setAttribute("aria-label", skinToggleCopy(skin));
  button.title = skinToggleCopy(skin);
  button.replaceChildren(createIcon(doc, "palette"));
  button.setAttribute("aria-pressed", skin === "discord" ? "true" : "false");
  return button;
}

export function setSkinChoice(doc, storage, skin) {
  skin = resolveSkin(skin);
  const root = doc.documentElement;
  root.dataset.skin = skin;
  applyChromeColor(doc, skin, root.dataset.theme);
  try {
    storageOf(storage).setItem(SKIN_STORAGE_KEY, skin);
  } catch {
    // Persistence is best-effort; the choice still applies to this page.
  }
  for (const button of doc.querySelectorAll("#skin-toggle")) {
    decorateSkinToggle(doc, button, skin);
  }
}

export function bindSkinToggle(doc, storage, button) {
  decorateSkinToggle(doc, button);
  button.addEventListener("click", () => {
    const next = doc.documentElement.dataset.skin === "discord" ? "brand" : "discord";
    setSkinChoice(doc, storage, next);
  });
  return button;
}

// Corners (v2.5): "round" is the default; the account-settings checkbox
// flips the appearance pref. Same client-side persistence as the theme.
export function applyCornerPreference(doc, storage) {
  storage = storageOf(storage);
  let corners = "round";
  try {
    corners = storage.getItem("forum-corners") === "square" ? "square" : "round";
  } catch {
    corners = "round";
  }
  doc.documentElement.dataset.corners = corners;
}

// Legacy boot name (state.js calls initTheme(doc)): now applies BOTH
// appearance dimensions and wires any boot-time #skin-toggle the same way.
export function initTheme(doc, storage) {
  const { theme } = applyAppearance(doc, storage);
  const toggle = doc.querySelector("#theme-toggle");
  if (toggle) bindThemeToggle(doc, storage, toggle);
  const skinToggle = doc.querySelector("#skin-toggle");
  if (skinToggle) bindSkinToggle(doc, storage, skinToggle);
  return theme;
}

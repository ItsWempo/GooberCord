// Copyright 2026 YourLocalGoober
//
// This file is part of GooberCord.
//
// GooberCord is free software: you can redistribute it and/or modify it
// under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the
// GNU Affero General Public License along with this program.  If not,
// see <https://www.gnu.org/licenses/>

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
//
// Framework migration phase 1: the appearance ENGINE is now the vendored
// frontload kit's makeAppearance (public/js/vendor/tokens.mjs,
// parity-pinned byte-identical to Project Designer's frontload/tokens.mjs),
// configured with GC's key family, chrome palette, and skin vocabulary —
// the kit was extracted FROM this module, so the fit is exact: the reads,
// the boot apply, the chrome applicator, and the two write-choice functions
// are kit closures behind signature-exact wrappers, and every GC export
// keeps its exact signature (call sites do not change). GC keeps its OWN
// toggle-decoration surface (decorate/bind theme+skin toggles, the corner
// preference) — that is app chrome, not the token system. theme-preload.js
// stays hand-rolled on purpose: it is a classic (non-module) script that
// must paint before ANY module graph can load, so it can never import the
// kit — the kit's own header comments assume exactly this division.
import { createIcon } from "./icons.js";
import { makeAppearance, resolveSkin as kitResolveSkin } from "./vendor/tokens.mjs";

export { resolveTheme } from "./vendor/tokens.mjs";

export const THEME_STORAGE_KEY = "goober-theme";
export const LEGACY_THEME_STORAGE_KEY = "forum-theme";
export const SKIN_STORAGE_KEY = "goober-skin";

export const SKINS = ["brand", "discord"];

// The default ruling lives in ONE wrapping resolver (the kit's one-arg
// signature defaults alt=discord/default=brand, which was right until the
// owner's mock night): everything that is not exactly "brand" resolves to
// the default "discord" skin — absent, unknown, or junk included.
export const resolveSkin = (value) =>
  kitResolveSkin(value, { altSkin: "brand", defaultSkin: "discord" });

// The one appearance engine, configured for GooberCord. chromeColors feeds
// the kit's <meta theme-color> re-paint; there is no onRetheme hook — GC's
// toggle decorations are driven by the exported setters below (GC has no
// third-party widget that needs re-theme callbacks).
export const appearance = makeAppearance({
  themeKey: THEME_STORAGE_KEY,
  skinKey: SKIN_STORAGE_KEY,
  legacyThemeKeys: [LEGACY_THEME_STORAGE_KEY],
  altSkin: "brand",
  defaultSkin: "discord",
  chromeColors: {
    brand: { light: "#f7efdc", dark: "#131b27" },
    discord: { light: "#e3e5e8", dark: "#1e1f22" },
  },
});

// Browser chrome (v4.0, skinned by the UI redo): the phone's address/status
// bar follows the EFFECTIVE skin+theme pair — "dark" in the Discord skin must
// not paint the chrome with the brand's navy. GC's public pure helper over
// the same palette the kit applies through applyChromeColor.
export function browserChromeColor(skin, theme) {
  const byTheme = {
    brand: { light: "#f7efdc", dark: "#131b27" },
    discord: { light: "#e3e5e8", dark: "#1e1f22" },
  }[resolveSkin(skin)];
  return (byTheme && byTheme[theme]) || null;
}

// Signature-exact delegations: the kit's closures ARE these contracts (it
// was extracted from this very module); the wrapper is a rename.
export const readThemePreference = appearance.readThemePreference;
export const readSkinPreference = appearance.readSkinPreference;
export const applyAppearance = appearance.applyAppearance;
export const applyChromeColor = appearance.applyChromeColor;

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
// storage (the kit's setter), and every live theme-toggle button. GC's own
// decoration rides AFTER the kit's attribute+storage write, exactly like the
// pre-migration body.
export function setThemeChoice(doc, storage, theme) {
  if (theme !== "dark" && theme !== "light") return;
  appearance.setThemeChoice(doc, storage, theme);
  for (const toggle of doc.querySelectorAll("#theme-toggle")) {
    decorateThemeToggle(doc, toggle, theme);
  }
}

// Binds a freshly rendered theme-toggle button (the user panel and the
// settings dialog — the button nodes are re-created per render, so the
// wiring rides the DOM as it exists when this runs).
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
  appearance.setSkinChoice(doc, storage, skin);
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
  // The pre-migration storageOf guard, kept exact: a storage-shaped arg is
  // used as-is; anything else (absent, blocked) falls back to the global
  // store, and a still-throwing read settles on "round".
  if (!(storage && typeof storage.getItem === "function")) {
    storage = globalThis.localStorage;
  }
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

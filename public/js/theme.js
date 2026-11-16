

// Ported from the forum's public/js/theme.js (Task 11 carry list). A manual
// choice stored in localStorage under "goober-theme" ("dark" | "light")
// always beats the OS preference; styles.css consumes the result as a
// `data-theme` attribute on <html>. The Turnstile re-theme hook is dropped —
// GooberCord's login route renders no widget unless a site key is configured
// (see public/turnstile.js / js/turnstile.js).
import { createIcon } from "./icons.js";

export const THEME_STORAGE_KEY = "goober-theme";

export function resolveTheme(preference, prefersDark) {
  if (preference === "dark" || preference === "light") {
    return preference;
  }

  return prefersDark ? "dark" : "light";
}

function readPreference(storage) {
  try {
    return storage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Storage can be unavailable (privacy modes); fall back to the OS look.
    return null;
  }
}

function readOsPreference(doc) {
  const view = doc.defaultView;

  if (typeof view?.matchMedia !== "function") {
    return false;
  }

  return view.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyCornerPreference(doc, storage) {
  let corners = "round";

  try {
    corners =
      storage.getItem("goober-corners") === "square"
        ? "round"
        : "round";
  } catch {
    corners = "round";
  }

  doc.documentElement.dataset.corners = corners;
}

export function initTheme(doc, storage) {
  const root = doc.documentElement;

  // Browser chrome: the phone's address/status bar follows the EFFECTIVE
  // theme, not just the OS preference. index.html's two media-scoped meta
  // tags carry the colors; rewriting their content keeps one source of truth.
  const BROWSER_CHROME_COLORS = {
    light: "#f7efdc",
    dark: "#131b27",
  };

  const applyBrowserChromeColor = (theme) => {
    const color = BROWSER_CHROME_COLORS[theme];

    if (!color) return;

    for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) {
      meta.content = color;
    }
  };

  const announceNextMode = (theme) => {
    const toggle = doc.querySelector("#theme-toggle");

    if (toggle) {
      // The label announces the action the NEXT click performs; the icon
      // reflects the CURRENT mode — sun in light, moon in dark (owner spec).
      toggle.setAttribute(
        "aria-label",
        theme === "dark"
          ? "Switch to light theme"
          : "Switch to dark theme",
      );

      toggle.replaceChildren(
        createIcon(doc, theme === "dark" ? "moon" : "sun"),
      );

      toggle.title =
        theme === "dark"
          ? "Switch to light theme"
          : "Switch to dark theme";
    }
  };

  const theme = resolveTheme(
    readPreference(storage),
    readOsPreference(doc),
  );

  root.dataset.theme = theme;
  announceNextMode(theme);
  applyBrowserChromeColor(theme);

  doc.querySelector("#theme-toggle")?.addEventListener("click", () => {
    const next =
      root.dataset.theme === "dark"
        ? "light"
        : "dark";

    root.dataset.theme = next;
    announceNextMode(next);
    applyBrowserChromeColor(next);

    try {
      storage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Persistence is best-effort; the choice still applies to this page.
    }
  });
}

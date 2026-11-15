
// Minimal Turnstile renderer (GooberCord's own; the forum's turnstile.js is
// larger because it also re-themes the widget). The site key comes from the
// <meta name="gc-turnstile-sitekey"> content set at deploy time — with no
// key the slot stays empty and no challenge script is loaded. The vendored
// requireTurnstile (api/core/http.mjs) 403s any register/login call unless
// TURNSTILE_SECRET + TURNSTILE_HOSTNAMES + a token are ALL present, so a dev
// deployment with no keys refuses registration with the server's verbatim
// error copy (surfaced by the login route, which never blocks its submit on
// the widget when the key is absent).
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";

// Cloudflare's official always-pass dummy token. Local dev pairs it with the
// 1x0000000000000000000000000000000AA test secret in .dev.vars; the vendored
// siteverify echoes metadata.result_with_testing_key for it. A production
// deployment sets a real site key via <meta name="gc-turnstile-sitekey"> and
// the real secret — the dummy then fails siteverify, exactly as it should.
const DEV_PASS_TOKEN = "XXXX.DUMMY.PASS.TOKEN.XXXX";

function siteKey(doc) {
  const meta = doc.querySelector('meta[name="gc-turnstile-sitekey"]');
  const key = meta && typeof meta.content === "string" ? meta.content.trim() : "";

  // Local dev keeps the dummy-token flow (dev-auth testing secret in
  // .dev.vars) even with the production site key present: the real widget
  // can't mint tokens the testing secret accepts. Any dev-hosted preview
  // (127.0.0.1 / localhost / *.local) falls back to the no-widget mode.
  const hostname = (doc.defaultView && doc.defaultView.location?.hostname) || "";
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local")
  ) {
    return "";
  }

  return key;
}

export function turnstileSiteKey(doc = document) {
  return siteKey(doc);
}

// Renders the widget into `slot` when a key exists; resolves to the response
// accessor ({ get: () => token }) either way — with no key the accessor hands
// back the dev dummy token .dev.vars's test secret accepts. Never throws when
// the remote script fails to load — the server-side error copy is the honest
// UI then.
export function renderTurnstile(doc, slot, action) {
  const key = siteKey(doc);

  if (!key || !slot) {
    return {
      get: () => DEV_PASS_TOKEN,
      rendered: () => false,
    };
  }

  return new Promise((resolve) => {
    const tryRender = () => {
      if (typeof window.turnstile?.render !== "function") return false;
      try {
        window.turnstile.render(slot, {
          sitekey: key,
          action,
          theme: doc.documentElement.dataset.theme === "dark" ? "dark" : "light",
        });
      } catch {
        // Render failure leaves the slot empty; submit proceeds tokenless.
      }
      return true;
    };

    if (tryRender()) {
      resolve({
        get: () => {
          try {
            return window.turnstile?.getResponse?.() || "";
          } catch {
            return "";
          }
        },
      });
      return;
    }

    const script = doc.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.addEventListener("load", () => {
      tryRender();
      resolve({
        get: () => {
          try {
            return window.turnstile?.getResponse?.() || "";
          } catch {
            return "";
          }
        },
      });
    });
    script.addEventListener("error", () => resolve({ get: () => "" }));
    doc.head.append(script);
  });
}

// Drops any rendered widget before a route swap re-uses the slot markup.
export function resetTurnstile() {
  try {
    window.turnstile?.reset?.();
  } catch {
    // Widget lifecycle is best-effort.
  }
}

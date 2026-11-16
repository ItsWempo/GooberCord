
// The sign-in gate (Task 11). Three steps in one route:
//   1) login (username + password),
//   2) the TOTP second step when the server answers {totpRequired, challenge},
//   3) register (username + password).
// Turnstile note (the plan's manual-smoke point, documented here): the
// vendored requireTurnstile answers 403 "Human verification is required."
// unless TURNSTILE_SECRET + TURNSTILE_HOSTNAMES + a token are ALL present —
// there is no unconfigured "skip". This route always submits the form (the
// server, not the client, is the authority) and shows the server's error
// copy verbatim. Local dev pairs the no-key path with Cloudflare's official
// dummy pass token (js/turnstile.js) and the 1x...AA test secret in
// .dev.vars, so register/login succeed end-to-end; production sets a real
// site key via <meta name="gc-turnstile-sitekey"> — the widget then renders,
// and the dummy token siteverify-rejects exactly as it should.
import { api, setCsrfToken } from "../api.js";
import { el } from "../dom.js";
import { createIcon } from "../icons.js";
import { addTurnstileSlot, renderTurnstileSlots, takeTurnstileToken, refreshTurnstile } from "../turnstile.js";
import { state } from "../state.js";
import { createMascot } from "../mascot.js";

const BROWSER_CHROME_COLORS = {
  light: "#f7efdc",
  dark: "#131b27",
};

function handleAuthSuccess(win, result) {
  state.currentUser = result?.user || null;
  setCsrfToken(result?.csrfToken || "");
  win.location.hash = "#/";
}

export function renderLoginPage(doc, win) {
  const app = doc.getElementById("app");

  const screen = el("div", { class: "auth-screen" });
  const card = el("div", { class: "auth-card" });

  const toggle = el("button", {
    id: "theme-toggle",
    class: "icon-button button-quiet",
    type: "button",
  });
  const toggleRow = el("div", {
    class: "form-actions row-actions-end",
  }, toggle);

  card.append(
    el("h1", { text: "GooberCord" }),
    el("div", { class: "tagline-row" },
      createMascot(doc, { mood: "idle", size: "mini" }),
      el("p", { class: "tagline", text: "Chat for Wempo's silly projects." }),
    ),
    toggleRow,
    el("div", { id: "auth-root" }),
  );
  screen.append(card);
  app.replaceChildren(screen);

  bindThemeToggle(doc, toggle);
  renderAuthForm(doc, win, "login", null);
}

// theme.js binds #theme-toggle at boot; this route re-creates the button on
// every render, so the wiring is repeated here against the fresh DOM (the
// same storage key, icon set, and chrome-color rule — no drift).
function bindThemeToggle(doc, toggle) {
  const current = doc.documentElement.dataset.theme === "dark" ? "dark" : "light";

  const announce = (theme) => {
    toggle.replaceChildren(createIcon(doc, theme === "dark" ? "moon" : "sun"));
    toggle.setAttribute(
      "aria-label",
      theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
    );
  };

  announce(current);

  toggle.addEventListener("click", () => {
    const next = doc.documentElement.dataset.theme === "dark" ? "light" : "dark";
    doc.documentElement.dataset.theme = next;
    announce(next);

    const color = BROWSER_CHROME_COLORS[next];
    if (color) {
      for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) {
        meta.content = color;
      }
    }

    try {
      localStorage.setItem("goober-theme", next);
    } catch {
      // Persistence is best-effort; the choice still applies to this page.
    }
  });
}

function renderAuthForm(doc, win, mode, totpChallenge) {
  const root = doc.getElementById("auth-root");
  if (!root) return;

  const form = el("form", { novalidate: "" });
  const error = el("p", { class: "error-strip", role: "alert" });
  const success = el("p", { class: "success-copy", role: "status" });

  const usernameField = el("div", { class: "form-field" },
    el("label", { for: "auth-username", text: "Username" }),
    el("input", {
      id: "auth-username", name: "username", type: "text",
      autocomplete: mode === "login" ? "username" : "off",
      autocapitalize: "none", spellcheck: "false",
      maxlength: "24", required: "",
      pattern: "[A-Za-z0-9_]{3,24}",
    }),
  );

  const passwordField = el("div", { class: "form-field" },
    el("label", { for: "auth-password", text: "Password" }),
    el("input", {
      id: "auth-password", name: "password", type: "password",
      autocomplete: mode === "login" ? "current-password" : "new-password",
      minlength: "12", maxlength: "128", required: "",
    }),
    mode === "register"
      ? el("p", { class: "form-note", text: "12–128 characters." })
      : null,
  );

  const totpField = el("div", { class: "form-field" },
    el("label", { for: "auth-totp", text: "6-digit code" }),
    el("input", {
      id: "auth-totp", name: "code", type: "text",
      inputmode: "numeric", autocomplete: "one-time-code",
      maxlength: "6", pattern: "\\d{6}", required: "",
    }),
    el("p", { class: "form-note", text: "Enter the code from your authenticator app." }),
  );

  const turnstileSlot = el("div", { class: "turnstile-slot" });

  const submit = el("button", {
    class: "button button-primary",
    type: "submit",
    text: mode === "login" ? "Sign in" : mode === "totp" ? "Verify code" : "Create account",
  });

  const switchNote = el("p", { class: "auth-note" });
  const switchButton = el("button", {
    type: "button",
    text: mode === "register" ? "Sign in instead" : "Create an account",
  });
  switchButton.addEventListener("click", () =>
    renderAuthForm(doc, win, mode === "register" ? "login" : "register", null));
  switchNote.append(
    mode === "register" ? "Already have an account? " : "New here? ",
    switchButton,
  );

  if (mode === "totp") {
    form.append(totpField);
  } else {
    form.append(usernameField, passwordField);
  }

  form.append(turnstileSlot, error, submit, switchNote);

  root.replaceChildren(
    el("h2", {
      text: mode === "register"
        ? "Create your account"
        : mode === "totp"
          ? "Two-factor verification"
          : "Welcome back",
    }),
    form,
    success,
  );

  // The slots-based Turnstile module: the slot rides the form, the widget
  // renders after this route mounts, and the submit reads the token at the
  // moment it's needed (no accessor held across renders).
  addTurnstileSlot(form, "register");
  renderTurnstileSlots(root).catch(() => {
    // Render failure leaves the slot with the module's own error copy.
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    success.textContent = "";

    const data = new FormData(form);
    const username = String(data.get("username") || "").trim();
    const password = String(data.get("password") || "");

    try {
      submit.disabled = true;

      if (mode === "totp") {
        const result = await api("/api/auth/totp", {
          method: "POST",
          body: { challenge: totpChallenge, code: String(data.get("code") || "").trim() },
        });
        success.textContent = "Signed in. Opening GooberCord...";
        handleAuthSuccess(win, result);
        return;
      }

      const token = takeTurnstileToken(form);

      const result = mode === "register"
        ? await api("/api/auth/register", {
            method: "POST",
            body: { username, password, "cf-turnstile-response": token },
          })
        : await api("/api/auth/login", {
            method: "POST",
            body: { username, password, "cf-turnstile-response": token },
          });

      if (result?.totpRequired && result?.challenge) {
        renderAuthForm(doc, win, "totp", result.challenge);
        return;
      }

      handleAuthSuccess(win, result);
    } catch (caught) {
      const message = caught?.banned
        ? "This account is currently banned." +
            (caught?.reason ? " Reason: " + caught.reason : "")
        : caught?.message || "Something went wrong. Please try again.";
      error.textContent = message;
      refreshTurnstile(form);
      submit.blur();
    } finally {
      submit.disabled = false;
    }
  });
}

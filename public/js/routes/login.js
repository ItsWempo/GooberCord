
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
import { takePendingInvite } from "../chat-store.js";
import {
  SSO_TICKET_PARAM,
  clearTicketParam,
  ssoTicketFromSearch,
  wempoAccountsSignInUrl,
} from "../ui-helpers.js";
import { addTurnstileSlot, renderTurnstileSlots, takeTurnstileToken, refreshTurnstile } from "../turnstile.js";
import { state } from "../state.js";
import { createMascot } from "../mascot.js";
import { bindSkinToggle, bindThemeToggle } from "../theme.js";
import { invalidateServersCache } from "./app.js";

function handleAuthSuccess(win, result) {
  state.currentUser = result?.user || null;
  setCsrfToken(result?.csrfToken || "");

  // A stashed invite (signed-out "#/join/CODE" click with the 10-min TTL)
  // auto-joins after login; any failure falls back to the app shell.
  const pendingCode = takePendingInvite(win);
  if (pendingCode) {
    void joinPendingInvite(win, pendingCode);
    return;
  }

  win.location.hash = "#/";
}

async function joinPendingInvite(win, code) {
  try {
    const result = await api("/api/invites/" + encodeURIComponent(code) + "/join", {
      method: "POST",
    });
    if (result && Number.isSafeInteger(Number(result.serverId))) {
      invalidateServersCache();
      win.location.hash = "#/s/" + Number(result.serverId);
      return;
    }
  } catch {
    // An expired/invalid/failed invite never blocks landing in the app.
  }
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
  const skinToggle = el("button", {
    id: "skin-toggle",
    class: "icon-button button-quiet",
    type: "button",
  });
  card.append(
    el("span", { class: "auth-badge" }, toggle, skinToggle),
    el("h1", { text: "GooberCord" }),
    el("div", { class: "tagline-row" },
      createMascot(doc, { mood: "idle", size: "mid" }),
      el("p", { class: "tagline", text: "Chat for Wempo's silly projects." }),
    ),
    el("ul", { class: "auth-chips", "aria-label": "What GooberCord has" },
      el("li", { class: "chip chip-green", text: "Live chat" }),
      el("li", { class: "chip chip-yellow", text: "One Wempo Account for everything" }),
      el("li", { class: "chip chip-coral", text: "DMs & group chats" }),
    ),
    el("div", { id: "auth-root" }),
  );
  screen.append(card);
  app.replaceChildren(screen);

  // theme.js owns both wirings (the same storage keys, icon set, and
  // chrome-color rule the app shell uses — no drift); this route re-creates
  // the buttons on every render, so the fresh nodes are bound here.
  bindThemeToggle(doc, win.localStorage, toggle);
  bindSkinToggle(doc, win.localStorage, skinToggle);
  renderAuthForm(doc, win, "login", null);

  // The Wempo Accounts handoff: a return trip from accounts lands as
  // "?wt=<ticket>" alongside this '#' route. The ticket is exchanged ONCE —
  // the param is cleared before the redeem, so no re-render can re-post it —
  // and both outcomes land in the standard username/password form's own
  // error strip: success enters the app through the same post-login flow
  // the form uses, a refusal shows the shared expired-link copy inline.
  const ticket = ssoTicketFromSearch(win.location.search);
  if (ticket) {
    clearTicketParam(win);
    void redeemTicketAndEnter(doc, win, ticket);
  }
}

let ssoRedeemInFlight = false;

// While a one-time ticket redemption is pending, the login page's forms stay
// disabled — a password submit racing SSO would fire a competing auth request
// for no reason the server can use.
function setAuthFormsDisabled(doc, disabled) {
  for (const control of doc.querySelectorAll("#auth-root form button, #auth-root form input")) {
    control.disabled = disabled;
  }
}

function redeemNote(doc) {
  const error = doc.querySelector("#auth-root .error-strip");
  if (error) error.textContent = "One moment — finishing sign-in with Wempo Accounts...";
  return error;
}

async function redeemTicketAndEnter(doc, win, ticket) {
  // Redeem ONCE per page load: the code is single-use server-side, so a
  // re-render racing the in-flight request must not fire a second POST. A
  // re-rendered login form is locked too, and shows the same note.
  if (ssoRedeemInFlight) {
    setAuthFormsDisabled(doc, true);
    redeemNote(doc);
    return;
  }
  ssoRedeemInFlight = true;
  setAuthFormsDisabled(doc, true);
  const error = redeemNote(doc);
  // A hung redeem must not pin the login page forever: 15s, then the timeout
  // copy lands and the username/password form is usable again (the forum's
  // redeemAccountsSignIn timeout, the same number on purpose).
  const controller = new AbortController();
  const timeout = win.setTimeout(() => controller.abort(), 15000);
  try {
    const result = await api("/api/auth/sso/redeem", {
      method: "POST",
      body: { wt: ticket },
      signal: controller.signal,
    });
    handleAuthSuccess(win, result);
  } catch (caught) {
    if (error) {
      error.textContent = controller.signal.aborted
        ? "Wempo Accounts sign-in timed out. You can sign in with your password."
        : caught?.message
          ? String(caught.message)
          : "That sign-in link has expired. Sign in again.";
    }
  } finally {
    win.clearTimeout(timeout);
    setAuthFormsDisabled(doc, false);
    ssoRedeemInFlight = false;
  }
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

  // One code field, two families (v4.8.1): the authenticator's 6-digit code
  // or a single-use backup code — the server dispatches on shape, so the
  // field accepts both (8 chars is a backup code's exact length).
  const totpField = el("div", { class: "form-field" },
    el("label", { for: "auth-totp", text: "6-digit code or backup code" }),
    el("input", {
      id: "auth-totp", name: "code", type: "text",
      autocomplete: "one-time-code", maxlength: "8", required: "",
    }),
    el("p", {
      class: "form-note",
      text: "Enter the code from your authenticator app. Lost your authenticator? Enter a backup code.",
    }),
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
    text: mode === "register" ? "Sign in instead" : "Create a Wempo Account",
  });
  switchButton.addEventListener("click", () =>
    renderAuthForm(doc, win, mode === "register" ? "login" : "register", null));
  switchNote.append(
    mode === "register" ? "Already have a Wempo Account? " : "New here? ",
    switchButton,
  );

  if (mode === "totp") {
    form.append(totpField);
  } else {
    form.append(usernameField, passwordField);
  }

  // The Wempo Accounts front door (login mode only): one sign-in for GooberCord
  // and the forum. The handoff carries ORIGIN ONLY — accounts' return-allowlist
  // takes an exact origin, never a query string — and the standard username +
  // password form below stays untouched (fields first; the button is the add-on).
  let ssoBlock = null;
  if (mode === "login") {
    const ssoButton = el("button", {
      class: "button button-quiet auth-sso-button",
      type: "button",
      text: "Sign in with Wempo Accounts",
    });
    ssoButton.addEventListener("click", () => {
      win.location.href = wempoAccountsSignInUrl(win.location.origin);
    });
    ssoBlock = el("div", { class: "auth-sso" },
      ssoButton,
      el("p", {
        class: "form-note",
        text: "One Wempo Account for everything — username and password work here too.",
      }),
    );
  }

  form.append(turnstileSlot, error, submit, switchNote);

  root.replaceChildren(
    el("h2", {
      text: mode === "register"
        ? "Create your Wempo Account"
        : mode === "totp"
          ? "Two-factor verification"
          : "Welcome back",
    }),
    ...(ssoBlock ? [ssoBlock] : []),
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

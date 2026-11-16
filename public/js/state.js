
// Boot state (ported from the forum's state.js pattern): the property bag
// route modules share. Boot sequence: theme (theme-preload.js) -> boot():
// fetch /api/me (stores the session + csrf token) -> mount the router
// (#/ = app shell; a signed-out open redirects to Wempo Accounts) -> stale-build check against
// /api/version every 60s (the injected <meta name="app-build"> stamp is the
// served page's build; a mismatch offers the reload instead of old JS
// talking to a newer backend).
import { api, setCsrfToken } from "./api.js";
import { hashFor, parseHash, stashPendingInvite } from "./chat-store.js";
import { applyCornerPreference, initTheme } from "./theme.js";
import {
  clearTicketParam,
  ssoTicketFromSearch,
  wempoAccountsSignInUrl,
  wempoAccountsSignOutUrl,
} from "./ui-helpers.js";
import { el } from "./dom.js";

export const state = {
  router: null,
  currentUser: null,
  // The property stays writable so the router can replace the active route.
  activeRoute: Object.freeze({ name: "home" }),
  // Incremented whenever a new route render starts; asynchronous work can
  // compare its captured version to avoid updating a newer page.
  renderVersion: 0,
  renderRoute: null,
};

function applySession(result) {
  state.currentUser = result?.user || null;
  setCsrfToken(result?.csrfToken || "");
}

export function isStaff() {
  const role = state.currentUser?.role;
  return role === "owner" || role === "admin";
}

// --- stale-build check -----------------------------------------------------

const STALE_CHECK_INTERVAL_MS = 60000;

export function compareBuild(metaStamp, versionPayload) {
  // The stamp is "VERSION@COMMIT_SHA"; the API echoes {version, build}
  // verbatim. An empty side (dev without --var COMMIT_SHA) never flags.
  const stamp = String(metaStamp || "").trim();
  const version = String(versionPayload?.version || "").trim();
  const build = String(versionPayload?.build || "").trim();

  if (!stamp || !version) return { stale: false };

  if (build) return { stale: stamp !== version + "@" + build };

  // No build component (dev): compare the version part only — the stamp may
  // carry the same version with an empty tail.
  return { stale: (stamp.split("@", 1)[0] || stamp) !== version };
}

function showStaleStrip() {
  document.getElementById("stale-build-strip")?.removeAttribute("hidden");
}

function readMetaStamp(doc) {
  const meta = doc.querySelector('meta[name="app-build"]');
  return meta?.content || "";
}

async function checkBuildOnce(doc) {
  try {
    const payload = await api("/api/version");
    if (compareBuild(readMetaStamp(doc), payload).stale) showStaleStrip();
  } catch {
    // A version fetch failure is no signal; try again on the next tick.
  }
}

export function startStaleChecks(doc = document) {
  checkBuildOnce(doc);
  setInterval(() => checkBuildOnce(doc), STALE_CHECK_INTERVAL_MS);
}

// --- the redeem refusal cards -----------------------------------------------

// The §4b audit fix: a boot that stops on a failed one-time ticket redemption
// renders a card instead of redirecting. A banned redeem shows the ban (the
// 403 payload api() copies onto the error — reason + expiry); every other
// refusal shows the static can't-sign-in card with a MANUAL link back to
// Wempo Accounts (a person chooses the retry; no auto redirect ping-pongs).
function renderRedeemRefusal(doc, win, error) {
  const mount = doc.getElementById("app") || doc.body;
  mount.replaceChildren();
  const panel = el("div", { class: "panel sso-refusal" });
  if (error && error.banned === true) {
    panel.append(
      el("h2", { text: "Your account is currently banned" }),
      el("p", {
        text: typeof error.reason === "string" && error.reason
          ? error.reason
          : "No reason was provided.",
      }),
    );
    if (typeof error.expiresAt === "number" && Number.isFinite(error.expiresAt)) {
      panel.append(el("p", {
        text: "Reactivates " + new Date(error.expiresAt * 1000).toLocaleString(),
      }));
    }
  } else {
    panel.append(
      el("h2", { text: "Can't sign in right now" }),
      el("p", {
        text: "The Wempo Accounts sign-in isn't completing. Your sign-in link is single-use and may have expired or already been used.",
      }),
      el("a", {
        class: "button button-quiet",
        href: wempoAccountsSignInUrl(win.location.origin),
        text: "Try again from Wempo Accounts",
      }),
    );
  }
  mount.append(panel);
}

// --- boot -------------------------------------------------------------------

export async function boot({ doc = document, win = window } = {}) {
  applyCornerPreference(doc, win.localStorage);
  initTheme(doc, win.localStorage);

  const staleNode = el("div", {
    id: "stale-build-strip",
    class: "stale-strip",
    hidden: "",
  });
  staleNode.append(
    "A new build is available. ",
    el("button", {
      class: "button button-quiet",
      type: "button",
      text: "Reload",
      onclick: () => win.location.reload(),
    }),
  );
  doc.body.append(staleNode);

  try {
    applySession(await api("/api/me"));
  } catch {
    state.currentUser = null;
  }

  // The §4b door-swap: GooberCord has NO sign-in page. A signed-out open
  // carrying a member-site return (?wt=) redeems that ticket RIGHT HERE —
  // before the router mounts — because the redeem needs to be on GooberCord's
  // origin. The ticket is single-use server-side, so the parameter is cleared
  // UNCONDITIONALLY first — even for a signed-in open or a malformed value —
  // so a re-render, a reload, or the back button can never re-post it.
  clearTicketParam(win);
  const returnTicket = ssoTicketFromSearch(win.location.search);
  if (returnTicket && !state.currentUser) {
    try {
      const redeemed = await api("/api/auth/sso/redeem", {
        method: "POST",
        body: { wt: returnTicket },
      });
      applySession(redeemed);
    } catch (error) {
      // The refusal card (the audit's fix): NEVER an automatic redirect back
      // to Accounts. A burned ticket is fine — Accounts would issue a fresh
      // one — but the catch also swallows the degraded legs (relay down,
      // network dead, 401 for an already-spent guest session), where a
      // redirect would ping-pong this open against Accounts forever. Until
      // the Accounts landing carries its own auto-ticket gate, a refusal
      // settles into a card; the card's link to Accounts is manual, so a
      // person — not a redirect loop — chooses the retry.
      renderRedeemRefusal(doc, win, error);
      return;
    }
  }

  const mount = () => renderHash(doc, win);

  win.addEventListener("hashchange", mount);
  startStaleChecks(doc);
  mount();
}

function renderHash(doc, win) {
  const route = parseHash(win.location.hash);

  if (!state.currentUser) {
    // Signed-out invite link: stash the code (10-min TTL) BEFORE the
    // accounts bounce — the join route takes the stash back out and
    // auto-joins once the member returns signed in.
    if (route.name === "join") stashPendingInvite(win, route.code);
    // The §4b door-swap: every signed-out open goes to Wempo Accounts. The
    // ?wt handoff never reaches here — boot redeems it before mounting.
    win.location.replace(wempoAccountsSignInUrl(win.location.origin));
    return;
  }

  state.renderVersion += 1;


  if (route.name === "review") {
    import("./routes/admin.js").then((module) => module.renderReviewPage(doc, win));
    return;
  }

  if (route.name === "discover") {
    import("./routes/discover.js").then((module) => module.renderDiscoverPage(doc, win));
    return;
  }

  // Goober Coins: the blaxel shop (balance, the daily claim, the Goober+
  // bundle with renewal + gifting, the ledger).
  if (route.name === "shop") {
    import("./routes/shop.js").then((module) => module.renderShopPage(doc, win));
    return;
  }

  // Signed-in invite join runs through the discover module too (the
  // signed-out branch stashes the code before the accounts bounce).
  if (route.name === "join") {
    import("./routes/discover.js").then((module) => module.renderJoinRoute(doc, win, route));
    return;
  }

  import("./routes/app.js").then((module) => module.renderAppPage(doc, win, route));
}

export function navigate(win, target) {
  win.location.hash = hashFor(target);
}

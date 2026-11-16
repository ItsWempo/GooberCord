
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
  // origin; anything else redirects straight to Wempo Accounts (silent,
  // origin-only return). The ticket is single-use server-side: a refusal is
  // a burned ticket, and the accounts page issues a fresh one on arrival.
  const returnTicket = ssoTicketFromSearch(win.location.search);
  if (returnTicket && !state.currentUser) {
    clearTicketParam(win);
    try {
      const redeemed = await api("/api/auth/sso/redeem", {
        method: "POST",
        body: { wt: returnTicket },
      });
      applySession(redeemed);
    } catch {
      // Redeemed refusal (expired ticket / degraded relay): a burned ticket
      // can never mint a session, so redirect for a fresh one.
      win.location.replace(wempoAccountsSignInUrl(win.location.origin));
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

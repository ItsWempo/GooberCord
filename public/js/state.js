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


// Boot state (ported from the forum's state.js pattern): the property bag
// route modules share. Boot sequence: theme (theme-preload.js) -> boot():
// fetch /api/me (stores the session + csrf token) -> mount the router
// (#/ = app shell; a signed-out open redirects to Wempo Accounts) -> stale-build check against
// /api/version every 60s (the injected <meta name="app-build"> stamp is the
// served page's build; a mismatch offers the reload instead of old JS
// talking to a newer backend).
import { api, setCsrfToken } from "./api.js";
import { hashFor, parseHash, stashPendingInvite, takePendingInvite } from "./chat-store.js";
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
  // A deep-link arrival (?wt=…#/join/CODE) must survive a FAILED redeem: the
  // refusal card stops the boot before any route render, so the join route's
  // own stash hook never runs — stash the visible code up front instead, and
  // the retry boot (signed in, origin-only return) restores it below. The
  // silent-door path stashes again in renderHash; a duplicate write of the
  // same code is harmless.
  const bootRoute = parseHash(win.location.hash);
  if (!state.currentUser && bootRoute.name === "join") {
    stashPendingInvite(win, bootRoute.code);
  }
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

  // The invite stash survives the whole door round-trip (sessionStorage is
  // origin-scoped and the Accounts bounce never touches it), so an
  // authenticated boot with a pending stash restores the join route BEFORE
  // the first render: without this the stash's consumer died with login.js
  // and signed-out #/join/CODE opens were dropped after the accounts bounce.
  restorePendingInvite(win);

  const mount = () => renderHash(doc, win);

  win.addEventListener("hashchange", mount);
  startStaleChecks(doc);
  mount();
}

// The invite stash's return leg, exported so the behavior is pinnable: a
// boot that ends signed-in consumes the stash (10-min TTL, spent once) and
// routes to the join route INSTEAD of the app shell — before any mount.
// signedIn rides in as an argument (defaulting to the real state) so tests
// don't need the DOM. A refused redeem never lands here: the card path stops
// the boot, and the retry boot reaches this once it redeems (the deep-link
// stash above covers the card path itself).
export function restorePendingInvite(win, signedIn = Boolean(state.currentUser), now = Date.now()) {
  if (!signedIn) return null;
  const code = takePendingInvite(win, now);
  if (!code) return null;
  win.location.hash = hashFor({ name: "join", code });
  return code;
}

function renderHash(doc, win) {
  const route = parseHash(win.location.hash);

  if (!state.currentUser) {
    // Signed-out invite link: stash the code (10-min TTL) BEFORE the
    // accounts bounce — the stash rides sessionStorage on this origin, and
    // boot takes it back out and restores the join route once the member
    // returns signed in.
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

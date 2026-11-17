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

// The Wempo Accounts handshake, client half (the §4b door-swap): GooberCord
// has NO sign-in page — a signed-out open redirects to Wempo Accounts, which
// hands back a one-time ?wt ticket that boot redeems BEFORE the router
// mounts. The pure helpers (ticket extraction, param clearing, the accounts
// URLs) are pinned behaviorally; the boot door and the logout handoff are
// pinned as source text (node --test has no DOM).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SSO_TICKET_PARAM,
  WEMPO_ACCOUNTS_ORIGIN,
  clearTicketParam,
  ssoTicketFromSearch,
  wempoAccountsSignInUrl,
  wempoAccountsSignOutUrl,
} from "../public/js/ui-helpers.js";
import { stashPendingInvite, takePendingInvite } from "../public/js/chat-store.js";
import { restorePendingInvite } from "../public/js/state.js";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const STATE_SOURCE = readFileSync(path.join(ROOT, "public/js/state.js"), "utf8");
const APP_SOURCE = readFileSync(path.join(ROOT, "public/js/routes/app.js"), "utf8");
const API_SOURCE = readFileSync(path.join(ROOT, "public/js/api.js"), "utf8");

// --- pure helpers ----------------------------------------------------------------

test("ssoTicketFromSearch accepts exactly a 32-byte-hex ?wt value", () => {
  assert.equal(SSO_TICKET_PARAM, "wt");
  const ticket = "ab".repeat(32);
  assert.equal(ssoTicketFromSearch("?wt=" + ticket), ticket);
  // Uppercase hex is the same ticket, normalized for the redeem.
  assert.equal(ssoTicketFromSearch("?wt=" + "AB".repeat(32)), ticket);
  assert.equal(ssoTicketFromSearch("?other=1&wt=" + ticket), ticket);
  for (const bad of [
    "?wt=zz", "?wt=" + "ab".repeat(31), "?wt=" + "ab".repeat(33),
    "?wt=" + "zz".repeat(32), "?wt=abc", "?wt=", "", "?other=x", "?wt=" + ticket + "0",
  ]) {
    assert.equal(ssoTicketFromSearch(bad), "", "rejects " + JSON.stringify(bad));
  }
  // A malformed search string never throws.
  assert.equal(ssoTicketFromSearch(null), "");
});

test("clearTicketParam removes only the ticket parameter, without touching the '#' route", () => {
  const calls = [];
  const win = {
    location: { pathname: "/", search: "?wt=" + "ab".repeat(32) + "&keep=1", hash: "#/login" },
    history: { replaceState: (...args) => calls.push(args) },
  };
  assert.equal(clearTicketParam(win), true);
  assert.deepEqual(calls, [[null, "", "/?keep=1#/login"]]);
});

test("clearTicketParam leaves a ticket-free URL untouched (replaceState never runs)", () => {
  const calls = [];
  const win = {
    location: { pathname: "/", search: "?utm=1", hash: "#/login" },
    history: { replaceState: (...args) => calls.push(args) },
  };
  assert.equal(clearTicketParam(win), false);
  assert.deepEqual(calls, []);
});

test("wempoAccountsSignInUrl carries the EXACT origin — never a query string or path", () => {
  const origin = "https://goobercord.itswempo.workers.dev";
  assert.equal(
    wempoAccountsSignInUrl(origin),
    WEMPO_ACCOUNTS_ORIGIN + "/?return=" + encodeURIComponent(origin),
  );
  assert.equal(WEMPO_ACCOUNTS_ORIGIN, "https://accounts.itswempo.workers.dev");
  // The handoff URL is origin-only, built through the shared helper.
  assert.match(wempoAccountsSignInUrl("http://127.0.0.1:8794"), /\?return=http%3A%2F%2F127\.0\.0\.1%3A8794$/);
});

// The sign-out handoff: GC logout → accounts clears ITS session there and
// renders the sign-in form. NO return parameter, on purpose — with one, the
// accounts arrival would auto-issue a fresh ticket and bounce the member
// straight back signed in.
test("wempoAccountsSignOutUrl is the ?signout=1 handoff and never carries a return", () => {
  assert.equal(wempoAccountsSignOutUrl(), WEMPO_ACCOUNTS_ORIGIN + "/?signout=1");
  assert.doesNotMatch(wempoAccountsSignOutUrl(), /return=/);
});

// --- the boot door (source pins; node --test has no DOM) ---------------------------

test("the door-swap is live: no sign-in route file exists anywhere in the client", () => {
  // The route module was deleted; the only remaining #/login handling is the
  // parse-for-compatibility alias in the route parser (a signed-in stale tab
  // lands in the app shell; signed-out, the silent door takes it).
  assert.throws(
    () => readFileSync(path.join(ROOT, "public/js/routes/login.js"), "utf8"),
    /ENOENT/,
    "public/js/routes/login.js is gone",
  );
  assert.doesNotMatch(STATE_SOURCE, /routes\/login/);
  // No hash route render ever names a login page.
  assert.doesNotMatch(STATE_SOURCE, /renderLogin/);
  // The deletion took the only Turnstile consumer with login.js: the widget
  // module is gone (and theme.js's dead re-theme hook with it — that call
  // had no import left and threw a ReferenceError on every theme toggle).
  assert.throws(
    () => readFileSync(path.join(ROOT, "public/js/turnstile.js"), "utf8"),
    /ENOENT/,
    "public/js/turnstile.js is gone",
  );
  assert.doesNotMatch(readFileSync(path.join(ROOT, "public/js/theme.js"), "utf8"), /rethemeTurnstile/);
});

test("the signed-out invite stash lives through the door round-trip and auto-joins on return", () => {
  // Signed-out: the code is stashed before the accounts bounce, and the
  // bounce's silent return carries NO hash — so the return leg must restore
  // the join route from the stash (without this, the deletion of login.js
  // — the stash's consumer — silently dropped every signed-out invite).
  const restoreIndex = STATE_SOURCE.indexOf("restorePendingInvite(win);");
  const mountIndex = STATE_SOURCE.indexOf("const mount = () => renderHash");
  const redeemIndex = STATE_SOURCE.indexOf("/api/auth/sso/redeem");
  assert.ok(restoreIndex > redeemIndex && restoreIndex < mountIndex,
    "boot restores the join route from the stash AFTER the redeem, BEFORE the first render");
  // The card path keeps its deep-link too: a signed-out boot stashes a
  // VISIBLE join code BEFORE the redeem, because the refusal card stops the
  // boot before any route render — the retry boot then restores the stash.
  const deepStash = STATE_SOURCE.indexOf("stashPendingInvite(win, bootRoute.code)");
  assert.ok(deepStash > 0 && deepStash < redeemIndex,
    "a signed-out deep-link boot stashes its invite before attempting the redeem");
});

test("a stashed invite routes to the join route — not the app shell — on the signed-in boot", () => {
  // Behavior, not text: stash like the signed-out door does, then a boot
  // that ends signed-in must land on #/join/<code> BEFORE any app shell,
  // spending the stash exactly once.
  const win = {
    location: { hash: "" },
    sessionStorage: {
      store: new Map(),
      getItem(key) { return this.store.has(key) ? this.store.get(key) : null; },
      setItem(key, value) { this.store.set(key, String(value)); },
      removeItem(key) { this.store.delete(key); },
    },
  };
  stashPendingInvite(win, "Goober12", 1000);
  assert.equal(restorePendingInvite(win, true, 1000 + 5000), "Goober12");
  assert.equal(win.location.hash, "#/join/Goober12");
  // Spent once: the stash is gone (a second boot mounts the app shell).
  assert.equal(restorePendingInvite(win, true, 1000 + 5000), null);
  assert.equal(win.location.hash, "#/join/Goober12",
    "no new restore without a fresh stash");
});

test("a signed-out restore is a no-op: the stash waits for the signed-in return", () => {
  const win = {
    location: { hash: "#/c/7" },
    sessionStorage: {
      store: new Map(),
      getItem(key) { return this.store.has(key) ? this.store.get(key) : null; },
      setItem(key, value) { this.store.set(key, String(value)); },
      removeItem(key) { this.store.delete(key); },
    },
  };
  stashPendingInvite(win, "Goober12", 1000);
  assert.equal(restorePendingInvite(win, false, 1000 + 5000), null);
  assert.equal(win.location.hash, "#/c/7", "a signed-out restore never rewrites the hash");
  assert.equal(takePendingInvite(win, 1000 + 5000), "Goober12",
    "the stash survives the signed-out boot untouched");
});

test("boot redeems the ?wt ticket BEFORE the router mounts", () => {
  const bootIndex = STATE_SOURCE.indexOf("const returnTicket = ssoTicketFromSearch");
  const mountIndex = STATE_SOURCE.indexOf("const mount = () => renderHash");
  assert.ok(bootIndex > 0, "the boot redemption exists");
  assert.ok(mountIndex > bootIndex, "the router mounts only AFTER the ticket is redeemed (or bounced)");

  // The redeem is the one-time POST; the param is cleared FIRST — before the
  // ticket is even extracted, unconditionally — so the code can never be
  // re-posted by a later render, a reload, or a signed-in open.
  assert.match(STATE_SOURCE, /\/api\/auth\/sso\/redeem/);
  assert.match(STATE_SOURCE, /body: \{ wt: returnTicket \}/);
  const clearIndex = STATE_SOURCE.indexOf("clearTicketParam(win);");
  const redeemIndex = STATE_SOURCE.indexOf("/api/auth/sso/redeem");
  // clearTicketParam sits before the extraction, which sits inside the
  // signed-out guard — so the clear is UNCONDITIONAL: signed-out tabs clear
  // before redeeming, and signed-in tabs (where the redeem never fires)
  // still clear, so a spent one-time code can never sit in an address bar.
  assert.ok(clearIndex < bootIndex && clearIndex < redeemIndex,
    "clearTicketParam runs before the extraction and before the POST");
  assert.ok(STATE_SOURCE.indexOf("if (returnTicket && !state.currentUser)") > clearIndex,
    "only the redeem is gated on the signed-in check — never the clear");

  // The redeemed session lands through applySession, never a login render.
  assert.match(STATE_SOURCE, /applySession\(redeemed\)/);

  // The extraction itself sits inside the signed-in branch; the CLEAR runs
  // before it unconditionally (pinned above), so even a signed-in open or a
  // malformed ?wt can never carry a spent code in its address bar.
  assert.ok(STATE_SOURCE.indexOf("if (returnTicket && !state.currentUser)") > bootIndex,
    "the redeem is gated on a guest open");
});

test("a refused redeem settles into a card — never an automatic redirect (the audit fix)", () => {
  // The catch swallows more than burned tickets (a degraded relay, a dead
  // network); a redirect here would ping-pong the open against Accounts
  // forever until the Accounts landing carries its own auto-ticket gate.
  const catchIndex = STATE_SOURCE.indexOf("} catch (error) {", STATE_SOURCE.indexOf("/api/auth/sso/redeem"));
  const catchEnd = STATE_SOURCE.indexOf("}", STATE_SOURCE.indexOf("renderRedeemRefusal(doc, win, error);"));
  const refusalCatch = STATE_SOURCE.slice(catchIndex, catchEnd);
  assert.doesNotMatch(refusalCatch, /location\.replace|location\.assign|location\.href\s*=/,
    "no automatic navigation out of the redeem failure");
  assert.match(refusalCatch, /renderRedeemRefusal\(doc, win, error\)/);

  // The banned leg: the 403 ban payload (banned/reason/expiresAt) api() copies
  // onto the error is rendered, not eaten.
  assert.match(STATE_SOURCE, /error\.banned === true/);
  assert.match(STATE_SOURCE, /Your account is currently banned/);
  assert.match(STATE_SOURCE, /error\.reason/);
  assert.match(STATE_SOURCE, /error\.expiresAt/);

  // The non-ban leg: a static can't-sign-in card whose Accounts link is
  // MANUAL (a person retries; the boot itself never navigates).
  assert.match(STATE_SOURCE, /Can't sign in right now/);
  const cardStart = STATE_SOURCE.indexOf("function renderRedeemRefusal");
  const cardEnd = STATE_SOURCE.indexOf("// --- boot", cardStart);
  const card = STATE_SOURCE.slice(cardStart, cardEnd);
  assert.doesNotMatch(card, /location\.replace|location\.assign/,
    "the card's Accounts link is an href, not an auto redirect");
  assert.match(card, /href: wempoAccountsSignInUrl\(win\.location\.origin\)/);
});

test("every signed-out open silently redirects to Wempo Accounts", () => {
  const signedOutBranch = STATE_SOURCE.slice(
    STATE_SOURCE.indexOf("if (!state.currentUser) {"),
    STATE_SOURCE.indexOf("state.renderVersion += 1"),
  );
  assert.ok(signedOutBranch.length > 0, "the signed-out gate exists");
  assert.match(
    signedOutBranch,
    /wempoAccountsSignInUrl\(win\.location\.origin\)/,
    "the signed-out branch is the silent door",
  );
  assert.match(signedOutBranch, /return;/, "the door never falls through to the app shell");
  // A signed-out open is a redirect, not a render of any route.
  assert.doesNotMatch(signedOutBranch, /import\("\.\/routes\//);
});

test("the signed-out door still stashes an invite code before the bounce (#/join)", () => {
  const signedOutBranch = STATE_SOURCE.slice(
    STATE_SOURCE.indexOf("if (!state.currentUser) {"),
    STATE_SOURCE.indexOf("state.renderVersion += 1"),
  );
  assert.match(signedOutBranch, /stashPendingInvite\(win, route\.code\)/,
    "a signed-out invite link keeps its 10-min stash across the accounts bounce");
});

test("log out rides the sign-out handoff — both logout paths, no dead #/login landing", () => {
  // Two call sites: the rail's logout icon and the settings dialog's button.
  // EACH handler must await the logout POST before its handoff — a pin that
  // only checked for the pair of strings would pass with the POST dropped
  // from one handler and that tab's session left standing.
  const handlers = [...APP_SOURCE.matchAll(/await api\("\/api\/auth\/logout", \{ method: "POST" \}\)[\s\S]{0,400}?win\.location\.assign\(wempoAccountsSignOutUrl\(\)\)/g)];
  assert.equal(handlers.length, 2, "both logout handlers await the POST before the handoff");
  assert.equal(APP_SOURCE.match(/wempoAccountsSignOutUrl\(\)/g)?.length, 2);
  // The handlers ride the INJECTED win, not the global window (every dialog
  // here is doc/win-parameterized for tests).
  assert.doesNotMatch(APP_SOURCE, /window\.location\.assign/);
  // The handoff URL never carries a return (the accounts page would
  // auto-ticket the member straight back in through it).
  assert.doesNotMatch(APP_SOURCE, /signout[^\n]*return=|return=[^\n]*signout/);
});

test("the client api() accepts an abort signal (the redemption timeout rides it)", () => {
  assert.match(API_SOURCE, /method = "GET", body, idempotencyKey, signal/);
  assert.match(API_SOURCE, /signal,/);
});

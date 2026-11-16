// The Wempo Accounts handshake, client half: the login route's front door.
// The pure helpers (ticket extraction, param clearing, the accounts URL) are
// pinned behaviorally; the route's wiring is pinned as source text (node
// --test has no DOM): the button's origin-only return, the redeem POST, the
// param cleared BEFORE the redeem (a ticket can never be re-posted), and the
// Wempo Account copy renames.
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
} from "../public/js/ui-helpers.js";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const LOGIN_SOURCE = readFileSync(path.join(ROOT, "public/js/routes/login.js"), "utf8");

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
    WEMPO_ACCOUNTS_ORIGIN + "/login?return=" + encodeURIComponent(origin),
  );
  assert.equal(WEMPO_ACCOUNTS_ORIGIN, "https://accounts.itswempo.workers.dev");
  // An origin-looking-with-path input collapses to the origin only when the
  // CALLER passes one (the route passes win.location.origin verbatim).
  assert.match(wempoAccountsSignInUrl("http://127.0.0.1:8794"), /\?return=http%3A%2F%2F127\.0\.0\.1%3A8794$/);
});

// --- the login route's wiring (source pins; node --test has no DOM) ----------------

test("the login route wires the front door: button above the form, origin-only return, once-per-ticket redeem", () => {
  // The redeem POST exists and runs at most once per ticket (in-flight guard).
  assert.match(LOGIN_SOURCE, /api\/auth\/sso\/redeem/);
  assert.match(LOGIN_SOURCE, /ssoRedeemInFlight/);
  // The ticket param is cleared BEFORE the redeem call is made — never re-posted.
  assert.match(LOGIN_SOURCE, /clearTicketParam\(win\);\s*\n\s*void redeemTicketAndEnter/);
  // The handoff URL is built from the ORIGIN ONLY, through the shared helper.
  assert.match(LOGIN_SOURCE, /wempoAccountsSignInUrl\(win\.location\.origin\)/);
  // ...and the route never builds a return value from a location with more
  // than the origin (no query strings, no href).
  assert.doesNotMatch(LOGIN_SOURCE, /return=|location\.href\.split|location\.search.*return/);
  // The CTA is the filed button copy and sits in the login-mode branch.
  assert.match(LOGIN_SOURCE, /Sign in with Wempo Accounts/);
  // The failure path shows the shared 403-style copy inline on this route.
  assert.match(LOGIN_SOURCE, /That sign-in link has expired\. Sign in again\./);
});

// The Wempo Account copy (the login/home surfaces): an account described in
// the app's own copy is ONE Wempo Account — the product name GooberCord is
// untouched everywhere it appeared.
test("the Wempo Account copy is live, and the old 'same forum account' chip is gone", () => {
  assert.match(LOGIN_SOURCE, /One Wempo Account for everything/);
  assert.doesNotMatch(LOGIN_SOURCE, /Same forum account/);
  assert.match(LOGIN_SOURCE, /Create your Wempo Account|Create a Wempo Account/);
  assert.match(LOGIN_SOURCE, /Already have a Wempo Account\?/);
  // The product name it replaced nothing of — GooberCord stays everywhere it was.
  assert.match(LOGIN_SOURCE, /GooberCord/);
});

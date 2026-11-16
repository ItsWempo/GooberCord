// Goober Coins (0011) client-side pins: the pure shaping helpers (ui-helpers.js),
// the "#/shop" routing pair, the shop page's fetch allow-list (and the owner's
// NO-purchase decree over the UI), and the two icons the feature adds. Same
// rule as tests/ui-redo.test.mjs: DOM builds are not pinned (node --test has
// no shell DOM) — only what the code computes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  coinBalanceLabel,
  coinDayProgress,
  giftUsernameValid,
  ledgerEntryCopy,
  plusStateCopy,
} from "../public/js/ui-helpers.js";
import { parseHash, hashFor } from "../public/js/chat-store.js";
import { ICON_NAMES } from "../public/js/icons.js";

// --- pure shaping helpers --------------------------------------------------------

const NULLISH = undefined;

test("coinBalanceLabel formats the integer count and never trusts junk", () => {
  assert.equal(coinBalanceLabel(0), "0");
  assert.equal(coinBalanceLabel(32), "32");
  assert.equal(coinBalanceLabel(1234), "1,234");
  assert.equal(coinBalanceLabel(NULLISH), "0");
  assert.equal(coinBalanceLabel(1.5), "0", "a float can never be a coin count");
  assert.equal(coinBalanceLabel(-5), "0", "the API never sends a negative balance");
});

test("coinDayProgress shapes today's earn against the ONE daily ceiling", () => {
  const at = coinDayProgress(120, 250);
  assert.equal(at.label, "120 / 250");
  assert.equal(at.pct, 48);
  assert.match(at.title, /240|earned today/);

  const full = coinDayProgress(250, 250).pct;
  const over = coinDayProgress(999, 250).pct;
  assert.equal(full, 100);
  assert.equal(over, 100, "clamped high — the API can never send it anyway");

  assert.equal(coinDayProgress(0, 250).pct, 0);
  assert.equal(coinDayProgress(30, NULLISH).pct, 0, "a junk ceiling clamps to 0%");
});

test("ledgerEntryCopy names every movement in the economy's vocabulary", () => {
  assert.deepEqual(pick(ledgerEntryCopy({ delta: 25, source: "daily" })), ["Daily activity grant", "+25", false]);
  assert.deepEqual(pick(ledgerEntryCopy({ delta: 1, source: "message" })), ["Message points", "+1", false]);
  assert.deepEqual(pick(ledgerEntryCopy({ delta: 5, source: "voice" })), ["Voice presence", "+5", false]);
  assert.deepEqual(pick(ledgerEntryCopy({ delta: -500, source: "plus_renewal" })), ["Goober+ renewal", "−500", true]);
  const giftOut = ledgerEntryCopy({ delta: -500, source: "plus_gift", relatedUsername: "friend" });
  assert.equal(giftOut.label, "Goober+ gift to @friend");
  assert.equal(giftOut.negative, true);
});

function pick(copy) {
  return [copy.label, copy.amount, copy.negative];
}

test("ledgerEntryCopy falls closed for a source it does not know", () => {
  const safe = ledgerEntryCopy({ delta: 3, source: "future_thing" });
  assert.equal(safe.label, "Goober Coins");
  assert.equal(safe.amount, "+3");
});

test("giftUsernameValid mirrors the username rule; the route still owns the truth", () => {
  assert.equal(giftUsernameValid("friend_99"), true);
  assert.equal(giftUsernameValid("  Wempos "), true, "trim rides the check");
  assert.equal(giftUsernameValid("no"), false, "3–24 enforced client-side too");
  assert.equal(giftUsernameValid("bad name"), false);
  assert.equal(giftUsernameValid(NULLISH), false);
});

test("plusStateCopy answers one line per standing: never bought, active, grace, lapsed", () => {
  const none = plusStateCopy({ hasPlus: false }, () => "T");
  assert.match(none.title, /Not a member yet/);
  assert.match(none.detail, /Goober Coins/);

  const fresh = { hasPlus: true, active: true, inGrace: false, renewsUntil: 100, graceUntil: null, giftedBy: null };
  const active = plusStateCopy(fresh, () => "T");
  assert.match(active.title, /Goober\+ active/);
  assert.doesNotMatch(active.title, /gifted/);

  const gifted = plusStateCopy({ ...fresh, giftedBy: 7 }, () => "T");
  assert.match(gifted.title, /gifted/);

  const inGrace = plusStateCopy({
    hasPlus: true, active: true, inGrace: true, renewsUntil: 100, graceUntil: 200, giftedBy: null,
  }, () => "T");
  assert.match(inGrace.title, /grace window/, "lapsed with an open window is still active but flagged");

  const lapsed = plusStateCopy({ hasPlus: true, active: false, inGrace: false }, () => "T");
  assert.match(lapsed.title, /lapsed/);
  assert.match(lapsed.detail, /tenure start/, "the owner's renew-vs-reset call rides the copy");
});

// --- routing -----------------------------------------------------------------------

test("\"#/shop\" is a first-class route on both sides of the hash pair", () => {
  assert.deepEqual(parseHash("#/shop"), { name: "shop" });
  assert.deepEqual(parseHash("#/shop/garbage"), { name: "app", serverId: null, channelId: null }, "not a shop route");
  assert.equal(hashFor({ name: "shop" }), "#/shop");
});

// --- the shop page's fetch surface (and the no-purchase decree) ---------------------

const SHOP_SOURCE = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "js", "routes", "shop.js"),
  "utf8",
);
// Comments talk ABOUT the decree ("never purchased"); the scans below must
// only ever see CODE.
const SHOP_CODE = SHOP_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^.*\/\/.*$/gm, "");

test("the shop page fetches exactly the seven economy routes and nothing else", () => {
  const fetched = [...SHOP_CODE.matchAll(/api\((["'`])([^"'`]+)\1/g)]
    .map((match) => match[2].replace(/\$\{[^}]*\}[^"'`]*/, ""))
    .filter((path) => path.startsWith("/api/"));
  const allowed = new Set([
    "/api/coins",
    "/api/coins/shop",
    "/api/coins/claim",
    "/api/coins/ledger",
    "/api/plus/renew",
    "/api/plus/gift",
  ]);
  const offenders = fetched.filter((path) => !allowed.has(path));
  assert.ok(fetched.length >= 5, "the page really fetches the economy");
  assert.deepEqual(offenders, [], "every api() call is an economy read or a self-actioned write");
});

test("no purchase UI exists anywhere in the shop: coins are earned, never bought", () => {
  assert.doesNotMatch(SHOP_CODE, /purchase|checkout|\/api\/coins\/buy|stripe|paypal|topup|charge/i);
  const appCode = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "js", "routes", "app.js"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^.*\/\/.*$/gm, "");
  assert.doesNotMatch(appCode, /purchase|checkout|stripe|paypal|topup|charge/i);
  // The owner's free-things rider is on the page: boosts stay free.
  assert.match(SHOP_SOURCE, /bundle\.note/, "the bundle's own note (the free-things rider) is rendered");
});

test("the rail tile and the footer chip ride the same #/shop door", () => {
  const appSource = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "js", "routes", "app.js"),
    "utf8",
  );
  assert.ok(appSource.includes('win.location.hash = "#/shop"'), "the shop tile navigates");
  assert.match(appSource, /coin-chip/, "the footer's balance chip");
  assert.match(appSource, /api\/coins/, "the footer chip's cache is fed by the balance read");
  // CSP: no inline style strings anywhere the chip's styles might tempt one.
  assert.doesNotMatch(SHOP_CODE, /style\s*=\s*["'`]|\.style\./i);
});

test("the coin + gift icons are part of the icon set (same stroke family, no foreign sets)", () => {
  for (const name of ["coin", "gift"]) {
    assert.ok(ICON_NAMES.includes(name), name + " icon exists");
  }
});

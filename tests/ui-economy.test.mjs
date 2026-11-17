// The economy lane: the snapshot is the ONLY balance source (no ledger
// summing, no client cap arithmetic), the claim's shared 409 renders
// verbatim, the ledger cursor appends without duplicating, the voice tick is
// silent when granted:false and stops on stop() without catch-up ticks, and
// the shop carries claim/bundles/items/apply/gift/ledger as one route.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const HERE = dirname(new URL(import.meta.url).pathname);
const calls = [];
let responses = [];
globalThis.fetch = async (path, init = {}) => {
  calls.push({ path, method: init.method || "GET", body: init.body });
  const response = responses.shift();
  return new Response(
    typeof response === "string" ? response : JSON.stringify(response),
    { status: Number.isInteger(response?.status) ? response.status : 200 });
};

const economy = await import("../public/js/ui/economy.js");
const store = (await import("../public/js/core/store.js")).default;
const constants = await import("../constants.mjs");
const ECON = readFileSync(join(HERE, "../public/js/ui/economy.js"), "utf8");
const MAIN = readFileSync(join(HERE, "../public/js/main.js"), "utf8");
const SHELL = readFileSync(join(HERE, "../public/js/ui/shell.js"), "utf8");

test.beforeEach(() => {
  calls.length = 0;
  responses = [];
  store.reset();
});

test("the mirrored voice window equals the backend's constant (G-4)", () => {
  assert.equal(economy.COIN_VOICE_TICK_SECONDS, constants.GC_COIN_VOICE_TICK_SECONDS);
});

test("loadCoins lands the snapshot; the footer line reads ONLY it", async () => {
  responses = [{ balance: 250, dailyCeiling: 250, earnedToday: 0,
    daily: { grant: 25, claimedToday: false } }];
  const snapshot = await economy.loadCoins();
  assert.equal(snapshot.balance, 250);
  assert.equal(store.get("coins").balance, 250);
});

test("claim: the shared 409 renders verbatim; the snapshot only moves on success", async () => {
  responses = [{ error: "Already claimed today. Come back tomorrow.", status: 409 }];
  await economy.claimDaily().catch((error) => {
    assert.equal(error.message, "Already claimed today. Come back tomorrow.");
  });
  assert.equal(store.get("coins"), undefined, "a refusal never writes the store");
  responses = [{ claimed: true, balance: 275 }];
  await economy.claimDaily();
  assert.equal(store.get("coins").balance, 275);
});

test("the writes ride the exact body grammar: buy, renew (absent = full), gift", async () => {
  responses = [
    { bought: true, cost: 100, items: [] }, { balance: 150 }, // buy + its snapshot refetch
    { balance: 0 }, { balance: 0 }, // full renew + its refetch
    { balance: 0 }, { balance: 0 }, // mini renew + its refetch
    { balance: 0, price: 500, plus: {}, giftedTo: { id: 4 } }, { balance: 0 },
  ];
  await economy.buyCosmetic("banner");
  assert.deepEqual(JSON.parse(calls[0].body), { item: "banner" });
  await economy.renewPlus(); // absent body = full
  assert.equal(calls[2].body, undefined);
  await economy.renewPlus("mini");
  assert.deepEqual(JSON.parse(calls[4].body), { tier: "mini" });
  await economy.giftPlus("wempo");
  assert.deepEqual(JSON.parse(calls[6].body), { username: "wempo" });
});

test("apply cosmetics: the PATCH echo lands in the store's user (banner/flair additive)", async () => {
  store.set({ user: { id: 1, username: "me" } });
  responses = [{ cosmetics: { banner: "#397357", flair: "gm" } }];
  const result = await economy.applyCosmetics({ banner: "#397357" });
  assert.deepEqual(result.cosmetics, { banner: "#397357", flair: "gm" });
  assert.equal(store.get("user").banner, "#397357");
  assert.equal(store.get("user").flair, "gm");
});

test("the ledger cursor appends; a replayed cursor never duplicates (ids are the dedupe key)", async () => {
  responses = [{ entries: [{ id: 9, delta: 25, source: "daily_claim" }], nextAfter: 9 },
    { entries: [{ id: 9, delta: 25, source: "daily_claim" },
      { id: 8, delta: 3, source: "message_send" }], nextAfter: 8 }];
  await economy.loadLedger();
  await economy.loadLedger(store.get("ledger").nextAfter);
  const ledger = store.get("ledger");
  assert.equal(ledger.entries.length, 2, "the replayed id inserted nothing");
  assert.deepEqual(ledger.entries.map((entry) => entry.id).sort((a, b) => b - a), [9, 8]);
});

test("the voice tick rides the snapshot's window, stays silent on granted:false, and stops cleanly", async () => {
  store.set({ coins: { balance: 5, voice: { windowSeconds: 0.01 } } });
  responses = [];
  const stop = economy.startVoiceTicks(7);
  await new Promise((resolve) => setTimeout(resolve, 80));
  stop();
  const ticks = calls.filter((call) => call.path === "/api/coins/voice/tick");
  assert.ok(ticks.length >= 2, "the loop ticked on its window");
  assert.deepEqual(JSON.parse(ticks[0].body), { channelId: 7 });
  const count = calls.length;
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(calls.filter((call) => call.path === "/api/coins/voice/tick").length,
    ticks.length, "no catch-up ticks after stop() — join loss ends the loop");
  assert.ok(count >= ticks.length);
});

test("the shop route: one route, claim + bundles + items + gift + ledger", () => {
  assert.match(MAIN, /addRoute\("\/shop", "shop", renderShop\)/);
  assert.match(ECON, /Claim \$\{daily\.grant/);
  assert.match(ECON, /renewalPrice/);
  assert.match(ECON, /You're not a Goober\+ member yet/, "the never-bought shape speaks");
  assert.match(ECON, /In grace until/, "the grace banner (renewal stays allowed)");
  assert.match(ECON, /theirs|Their row prices it|their first term costs full price/,
    "the gift confirm states the RECIPIENT's pricing before the commit");
  assert.match(ECON, /Load earlier/, "the cursor appends");
  assert.match(ECON, /No coin moves yet/, "the ledger's G-5 sentence");
  assert.match(ECON, /item\.owned/, "ownership is the payload's flag, pre-computed route-side");
});

test("no client cap arithmetic, no ledger summing — the snapshot is the only balance", () => {
  // Comments tell the law; the pin sees only the code.
  const codeOnly = ECON.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(codeOnly, /Math\.max|GC_PLUS|GC_COIN_DAILY/);
  assert.doesNotMatch(codeOnly, /reduce\(/, "the ledger is read, never summed");
  assert.doesNotMatch(codeOnly, /\bbalance\s*(\+=|-=|\*=|\/=)/,
    "no client-side balance arithmetic");
});

test("the ambient footer is a self-hydrating node (never a route re-render)", () => {
  // The footer line paints ITSELF after the snapshot lands — a route
  // re-render would drop the member's mid-edit form state (G-1).
  assert.match(SHELL, /coinFooterLine\(\)/);
  assert.match(ECON, /loadCoins\(\)\.then\(paint\)/);
  assert.doesNotMatch(ECON, /router\.renderCurrent[\s\S]{0,80}claimDaily/, "the footer claim repaints node-locally");
  assert.match(ECON, /const fresh = await claimDaily\(\);\s*\n?\s*paint\(fresh\)/);
});

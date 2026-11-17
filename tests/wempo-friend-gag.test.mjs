// The friend-Wempo egg (owner's direct ask): trying to friend the USER
// "Wempo" visually sets the member's coins to -1,000,000,000 on the chip.
// Pins with teeth: the REAL request goes out first (the egg only rides
// after), the gag never touches the caches or the shop, and any real
// /api/coins read unwinds it. House rules: display-only, exact-username
// match, and the honest label survives every other path.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const js = (p) => readFileSync(path.join(ROOT, p), "utf8");
const GAG = js("public/js/wempo-friend-gag.js");
const APP = js("public/js/routes/app.js");

test("the match is the member WEMPO, and only them (exact-username, case-insensitive)", async () => {
  const mod = await import("../public/js/wempo-friend-gag.js");
  assert.equal(mod.isWempoUsername("wempo"), true);
  assert.equal(mod.isWempoUsername("Wempo"), true);
  assert.equal(mod.isWempoUsername("  WEMPO "), true, "trim + case-fold");
  assert.equal(mod.isWempoUsername("wempox"), false, "a longer name is someone else");
  assert.equal(mod.isWempoUsername("Wemp0"), false, "a l33t twin is someone else");
  assert.equal(mod.isWempoUsername(""), false);
  assert.equal(mod.isWempoUsername(null), false);
});

test("the chip gag: the debt shows while armed, the truth after any clear", async () => {
  const mod = await import("../public/js/wempo-friend-gag.js");
  assert.equal(mod.coinChipLabel(4242), "4,242", "the honest label rides until the egg fires");
  mod.armCoinsGag();
  assert.equal(mod.coinChipLabel(4242), "-1,000,000,000", "the gag is the owner's stated number");
  mod.clearCoinsGag();
  assert.equal(mod.coinChipLabel(4242), "4,242", "the real number returns — nothing was ever touched");
  // The honest label clamps junk and non-positives to "0"; the gag must
  // render its own string rather than squeeze through that clamping.
  assert.match(GAG, /"-1,000,000,000";/, "the debt is the module's own display string");
  assert.match(GAG, /import \{ coinBalanceLabel \} from "\.\/ui-helpers\.js";/);
  assert.match(GAG, /coinBalanceLabel\(balance\)/, "the un-gagged path is the ONE shared label fn");
});

test("the real request goes FIRST: the egg rides after the settled attempt, never instead of it", () => {
  const handler = APP.slice(
    APP.indexOf("addBox.addEventListener(\"submit\""),
    APP.indexOf("head.append(addBox, addError);"),
  );
  assert.ok(handler.length > 600, "the handler slice is real (got " + handler.length + ")");
  const attempt = handler.indexOf("await api(\"/api/friends/requests\", { method: \"POST\", body: { username } });");
  const egg = handler.indexOf("if (isWempoUsername(username)) {");
  assert.ok(attempt !== -1 && egg !== -1, "both halves exist");
  assert.ok(attempt < egg, "the genuine POST is attempted before the gag is even considered");
  assert.ok(handler.indexOf("await refreshSocial(doc, win);") < egg,
    "the real success path (refresh + toast) also rides before the egg");
  const eggBlock = handler.slice(egg);
  assert.ok(eggBlock.length < 800, "the egg block stays small (got " + eggBlock.length + ")");
  assert.match(eggBlock, /armCoinsGag\(\);/);
  assert.match(eggBlock, /rerenderUserPanel\(doc, win\);/, "the armed chip is re-rendered");
  assert.ok(eggBlock.indexOf("armCoinsGag();") < eggBlock.indexOf("rerenderUserPanel"), "arm before the rerender");
  assert.match(eggBlock, /-1,000,000,000/, "the toast says the number");
  assert.match(handler, /addError\.textContent = caught\?\./, "a failed attempt still shows the REAL error");
});

test("the unwind: any real /api/coins read clears the gag inside refreshCoins", () => {
  const coins = APP.slice(
    APP.indexOf("async function refreshCoins(doc, win) {"),
    APP.indexOf("async function refreshLoop(doc, win) {"),
  );
  assert.ok(coins.length > 200 && coins.length < 800, "the refreshCoins slice is real (got " + coins.length + ")");
  const read = coins.indexOf('api("/api/coins")');
  const clear = coins.indexOf("clearCoinsGag();");
  const render = coins.indexOf("rerenderUserPanel(doc, win);");
  assert.ok(read !== -1 && clear !== -1 && render !== -1);
  assert.ok(read < clear && clear < render, "read -> clear -> render: the next real read is the unwind");
  assert.ok(coins.indexOf("clearCoinsGag();") < coins.indexOf("} catch {"),
    "the clear lives in the try — only a LANDED read unwinds");
});

test("the chip render reads the gagged label; the API state is never written", () => {
  const chip = APP.slice(
    APP.indexOf('const coinAmount = coinChipLabel(caches.coins?.balance);'),
    APP.indexOf('const coinAmount = coinChipLabel(caches.coins?.balance);') + 400,
  );
  assert.ok(chip.length > 100, "the chip slice is real");
  // The coins cache is only ever assigned an api read or the null reset —
  // the egg never writes it. (A lookahead pin can backtrack past \s*; the
  // walk is exact.)
  for (const m of APP.matchAll(/caches\.coins\s*=/g)) {
    const rest = APP.slice(m.index + m[0].length).trimStart();
    assert.ok(
      rest.startsWith("await") || rest.startsWith("null"),
      "caches.coins is only assigned an api read (await) or the null reset — got: " + rest.slice(0, 40),
    );
  }
  assert.match(APP, /import \{ armCoinsGag, clearCoinsGag, coinChipLabel, isWempoUsername \} from "\.\.\/wempo-friend-gag\.js";/);
});

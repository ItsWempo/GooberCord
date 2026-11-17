// The Mini SKU's card (0022's client half): the shop's body.mini payload rides
// beside body.bundle and the card reads ONLY the payload numbers (the owner's
// proposed pricing is backend's word, never hardcoded). The POST carries the
// tier; the full bundle's button is untouched; the 409 mis-sale refusal
// surfaces its copy in the shared error strip.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const SHOP = readFileSync(path.join(ROOT, "public/js/routes/shop.js"), "utf8");
const COINS = readFileSync(path.join(ROOT, "api/coins.mjs"), "utf8");
const CSS = readFileSync(path.join(ROOT, "public/styles.css"), "utf8");

const MINI = SHOP.slice(
  SHOP.indexOf("function renderMiniPanel("),
  SHOP.indexOf("// --- panel: the ledger"),
);

test("the Mini card rides the payload: every number is backend's word", () => {
  // The shop read captures body.mini beside body.bundle; a pre-Mini read
  // renders no card.
  assert.match(SHOP, /mini = payload\?\.mini \|\| null;/);
  assert.match(SHOP, /\.\.\.\(mini\s*\n\s*\? \[renderMiniPanel\(snapshot\.plus, mini, reload, error, status\)\]/);
  // The card speaks the payload's numbers — no constants, no literals.
  const panel = MINI.slice(MINI.indexOf('return el("section", { class: "panel shop-mini"'));
  assert.match(panel, /text: mini\.name/);
  assert.ok(!/coins? per month/.test(panel) || /\+ mini\.graceDays \+ "-day grace"/.test(panel),
    "the grace line reads payload.graceDays");
  assert.match(panel, /text: price \+ " coins per month · renew anytime · " \+ mini\.graceDays \+ "-day grace"/);
  assert.match(MINI, /\.\.\.\(mini\.perks \|\| \[\]\)\.map\(\(perk\) => el\("li"/);
  assert.match(panel, /text: mini\.note/);
  assert.doesNotMatch(panel, /\b250\b|\b200\b/, "no hardcoded pricing — payload or nothing");
});

test("the buy POST carries the tier; the label answers to the member's own row", () => {
  assert.match(MINI, /await api\("\/api\/plus\/renew", \{ method: "POST", body: \{ tier: "mini" \} \}\);/);
  assert.match(MINI, /const price = plus\.hasPlus \? mini\.renewalPrice : mini\.price;/,
    "the member's own row picks the payload's price — the route's rule mirrored");
  assert.match(MINI, /isMini && plus\.active[\s\S]{0,120}"Renew Mini for "/,
    "an active Mini member renews; everyone else gets");
  assert.match(MINI, /class: "button button-secondary"/,
    "the Mini button shares the gift's voice, never the primary's");
  // The FULL bundle's renew button is untouched: still a bodyless POST.
  const bundle = SHOP.slice(SHOP.indexOf("function renderBundlePanel("), SHOP.indexOf("--- panel: the Mini card"));
  assert.match(bundle, /await api\("\/api\/plus\/renew", \{ method: "POST" \}\);/);
});

test("the mis-sale 409 speaks its copy through the shared error strip", () => {
  assert.match(MINI, /error\.textContent = caught\?\.message \|\| "The Mini term could not be bought\.";/);
  // The copy lives server-side (the route is the authority) and the client
  // never pre-blocks the click — the refusal surfaces after it answers.
  assert.match(COINS, /HttpError\(409, "You already have full Goober\+\."\)/);
  assert.doesNotMatch(MINI, /already have full Goober\+/, "the 409 copy is not duplicated client-side");
});

test("the Mini card rides the shop-plus panel idiom, token-only", () => {
  assert.match(CSS, /(^|\n)\.shop-mini,/);
  assert.match(CSS, /\.shop-mini h2/);
  const frame = CSS.slice(CSS.indexOf(".shop-body > :is(.shop-balance, .shop-plus, .shop-mini, .shop-ledger)"),
    CSS.indexOf("}", CSS.indexOf(".shop-body > :is(.shop-balance, .shop-plus, .shop-mini, .shop-ledger)")));
  assert.match(frame, /border: 2px solid var\(--line\);/);
  assert.match(CSS, /\.shop-mini/);
  const block = CSS.slice(CSS.indexOf(".shop-balance,\n.shop-plus,\n.shop-mini,"),
    CSS.indexOf("}", CSS.indexOf(".shop-balance,\n.shop-plus,\n.shop-mini,")));
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, "tokens only");
});

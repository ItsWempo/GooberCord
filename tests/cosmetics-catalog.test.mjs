// Nitro lane item 3 — the cosmetics catalog in the shop. The pure half (the
// flair/banner validators) pins behaviorally; the wiring (the ACTIVE gate,
// the PATCH ride, the echoed contract) rides source pins with teeth, since
// node --test has no DOM to drive the shop panels.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PLUS_FLAIR_PATTERN, cosmeticsFlair, bannerHex } from "../public/js/ui-helpers.js";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const SHOP = readFileSync(path.join(ROOT, "public/js/routes/shop.js"), "utf8");
const CSS = readFileSync(path.join(ROOT, "public/styles.css"), "utf8");

// --- the pure half ---------------------------------------------------------------

test("cosmeticsFlair is the three-way value: null clears, valid sends, invalid refuses", () => {
  assert.equal(cosmeticsFlair(""), null);
  assert.equal(cosmeticsFlair("   "), null);
  assert.equal(cosmeticsFlair("Woomy"), "Woomy");
  assert.equal(cosmeticsFlair("  Woomy  "), "Woomy", "the send value is the TRIMMED text");
  assert.equal(cosmeticsFlair("x"), undefined, "1 char is under the backend's 2");
  assert.equal(cosmeticsFlair("x".repeat(17)), undefined, "17 chars is over the 16");
  assert.equal(cosmeticsFlair("two\nlines"), undefined, "one line only");
  assert.doesNotMatch(String(PLUS_FLAIR_PATTERN), /s\b/, "the pattern never spans lines");
});

test("bannerHex expands the short hexes and refuses anything else", () => {
  assert.equal(bannerHex(""), null);
  assert.equal(bannerHex("#abc"), "#aabbcc", "3-digit forms expand to the 6-digit wire");
  assert.equal(bannerHex("#AABBCC"), "#aabbcc", "the wire is lowercase hex only");
  assert.equal(bannerHex("#397357"), "#397357");
  assert.equal(bannerHex("#39735"), undefined, "5 digits never pass");
  assert.equal(bannerHex("red"), undefined, "no names — the accent gate's rule");
  assert.equal(bannerHex(null), null);
});

// --- the wiring half --------------------------------------------------------------

test("the editor renders for ACTIVE plus only; grace reads the note instead", () => {
  const panelStart = SHOP.indexOf("function renderBundlePanel");
  const panel = SHOP.slice(panelStart, SHOP.indexOf("// --- panel: the ledger", panelStart));
  const gate = panel.indexOf("plus.active");
  const grace = panel.indexOf("Perks are off during the grace window");
  assert.ok(gate > 0, "the ACTIVE gate exists");
  const editor = panel.indexOf("renderCosmetics(doc, status, error)");
  assert.ok(editor > gate, "the editor rides inside the active branch");
  assert.ok(grace > gate, "the grace note answers only the non-active half");
  assert.match(panel, /the badge stays/, "grace copy names the badge ruling");
  // The STRICT gate is the server's (grace perks are off); the client never
  // pretends grace can write.
  assert.doesNotMatch(panel, /inGrace[\s\S]{0,200}renderCosmetics/);
});

test("the save rides PATCH /api/me/cosmetics and follows the ECHOED row", () => {
  const editorStart = SHOP.indexOf("function renderCosmetics");
  const editor = SHOP.slice(editorStart, SHOP.indexOf("function renderBundlePanel", editorStart));
  assert.match(editor, /\/api\/me\/cosmetics/, { message: "the route is the contract's" });
  assert.match(editor, /body: \{ flair, banner \}/, "both values ride one PATCH");
  // The client refuses its own junk BEFORE the request (the editor never
  // ships a refusal the server's validators already own).
  const submitStart = editor.lastIndexOf("addEventListener(\"submit\"");
  const submit = editor.slice(submitStart);
  const patchAt = submit.indexOf("/api/me/cosmetics");
  assert.ok(submit.indexOf("Flair must be 2 to 16 characters") < patchAt,
    "the flair gate answers before the PATCH");
  assert.ok(submit.indexOf("hex color") < patchAt,
    "the banner gate answers before the PATCH");
  // The contract: the response echoes the STORED row; the session shape
  // follows the server's word, never the form's.
  assert.match(submit, /me\.flair = payload\?\.cosmetics\?\.flair \?\? null/);
  assert.match(submit, /me\.banner = payload\?\.cosmetics\?\.banner \?\? null/);
});

test("the preview is the roster's name-line idiom, parser-free", () => {
  const editorStart = SHOP.indexOf("function renderCosmetics");
  const editor = SHOP.slice(editorStart, SHOP.indexOf("function renderBundlePanel", editorStart));
  assert.match(editor, /plusBadge\(doc\)/);
  assert.match(editor, /if \(me\.flair\) preview\.append\(flairChip\(doc, me\.flair\)\)/,
    "an absent flair renders NOTHING (truthiness, the payload's own shape wins)");
  assert.doesNotMatch(editor, /innerHTML|insertAdjacentHTML/,
    "a user-shaped flair can never reach a parser");
  // The banner swatch color rides CSSOM when it appears — never a style
  // attribute string (CSP style-src 'self').
  const color = editor.match(/style\./);
  if (color) assert.match(String(color[0]), /^style\.(backgroundColor|color)$/);
});

test("the editor's CSS is the shop's quiet grid, no new color family", () => {
  assert.match(CSS, /\.shop-cosmetics \{/);
  assert.match(CSS, /\.shop-cosmetics-preview \{/);
  const nameBlock = CSS.slice(CSS.indexOf(".shop-cosmetics-name {"), CSS.indexOf("}", CSS.indexOf(".shop-cosmetics-name {")));
  assert.match(nameBlock, /text-overflow:\s*ellipsis/,
    "a long display name clamps in the preview");
  const formBlock = CSS.slice(CSS.indexOf(".shop-cosmetics-form {"), CSS.indexOf("}", CSS.indexOf(".shop-cosmetics-form {")));
  assert.match(formBlock, /flex-wrap:\s*wrap/,
    "the fields wrap on a narrow dialog instead of scrolling");
  // Only token families the shop already speaks.
  const block = CSS.slice(CSS.indexOf("/* The cosmetics editor"), CSS.indexOf("/* The ledger"));
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, "no raw hex — tokens only");
});

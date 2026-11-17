// Goober+ badge + flair (Nitro lane): the member-name adornments render
// straight off the contract flags. node --test has no DOM to drive full
// renders, so the pins are source-text with ordering/truthiness teeth — plus
// the CSP guarantee, which here is structural: the adornment module must
// never touch a parser (innerHTML/insertAdjacentHTML), a flair chip is
// textContent-verbatim, and the payload flags are read with truthiness so an
// absent field renders NOTHING rather than a falsy adornment.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const MODULE = readFileSync(path.join(ROOT, "public/js/plus-ui.js"), "utf8");
const APP = readFileSync(path.join(ROOT, "public/js/routes/app.js"), "utf8");
const CSS = readFileSync(path.join(ROOT, "public/styles.css"), "utf8");

test("the adornment module is parser-free: createElement/textContent only", () => {
  assert.doesNotMatch(MODULE, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/,
    "a user-shaped flair can never reach an HTML parser");
  assert.match(MODULE, /chip\.textContent = String\(text\)/,
    "the flair chip is textContent-verbatim");
  assert.match(MODULE, /aria-label", "Goober\+ member"/,
    "the icon-only badge carries its meaning in aria/title");
  assert.match(MODULE, /createIcon\(doc, "sparkles"\)/);
});

test("the chat header renders the badge off the message's own flag — absent never renders", () => {
  const headerStart = APP.indexOf("const display = authorMember");
  const headerEnd = APP.indexOf("const body = el(\"div\", { class: \"body\" })", headerStart);
  const header = APP.slice(headerStart, headerEnd);
  // Truthiness (not `=== true`): a payload without the flag renders WITHOUT
  // the adornment — the flag's absence is simply quiet. The contract puts
  // the boolean ON the message-shaped payload (message.isPlus, REST + DO
  // fan-out alike); flair has NO message carrier, so chat names carry the
  // badge only.
  assert.match(header, /if \(message\.isPlus\) authorName\.append\(plusBadge\(doc\)\)/);
  assert.doesNotMatch(header, /authorFlair|authorIsPlus/,
    "no invented field names — the payload's own shape wins");
});

test("member rows keep rank first: shield, then badge, then flair", () => {
  const rowStart = APP.indexOf('const name = el("span", { class: "name", text: memberDisplay(member) })');
  const rowEnd = APP.indexOf(rowStart > 0 ? "\n  const canManageNicknames" : "", rowStart);
  const block = APP.slice(rowStart, rowEnd);
  const shield = block.indexOf('createIcon(doc, "shield")');
  const badge = block.indexOf("plusBadge(doc)");
  const flair = block.indexOf("flairChip(doc, member.flair)");
  assert.ok(shield > 0 && badge > shield && flair > badge,
    "the append order is shield → plus badge → flair (rank outranks a perk)");
  assert.match(block, /if \(member\.isPlus\)/);
  assert.match(block, /if \(member\.flair\)/);
});

test("the own surfaces speak the same fields: footer badge + optimistic pending-row mirror", () => {
  assert.match(APP, /if \(me\.isPlus\) \{[\s\S]{0,200}plusBadge\(doc, \{ className: "plus-badge user-plus-badge" \}\)/,
    "the footer identity renders the own badge off /api/me's isPlus");
  const pendingStart = APP.indexOf("function pendingRow");
  const pendingBlock = APP.slice(pendingStart, APP.indexOf("function ", pendingStart + 10));
  assert.match(pendingBlock, /state\.currentUser\?\.isPlus\) name\.append\(plusBadge\(doc\)\)/,
    "the optimistic row mirrors the arriving header, so the name line doesn't visibly grow a badge");
  assert.match(pendingBlock, /state\.currentUser\?\.flair/) ;
});

test("createIcon carries the stroke contract on the svg itself", () => {
  const icons = readFileSync(path.join(ROOT, "public/js/icons.js"), "utf8");
  const start = icons.indexOf("export function createIcon");
  const block = icons.slice(start, icons.indexOf("for (const d of paths)", start));
  assert.match(block, /setAttribute\("stroke", "currentColor"\)/);
  assert.match(block, /setAttribute\("fill", "none"\)/,
    "a bare inline icon can never default to a black-filled blob");
  assert.match(block, /setAttribute\("stroke-width", "2"\)/);
});

test("the stylesheet carries both adornment rules, token-driven and parser-safe paths", () => {
  const badge = CSS.indexOf(".plus-badge {");
  const flair = CSS.indexOf(".plus-flair {");
  assert.ok(badge > 0 && flair > badge, "both rules exist (badge before flair)");
  // The badge is the GOLD PILL: tokens only, so it reads gold in light, dark,
  // and the discord skin without per-theme rules. The sparkles' stroke
  // contract lives on the svg itself (icons.js's createIcon) — the badge rule
  // only sizes and inks the glyph.
  const badgeBlock = CSS.slice(badge, CSS.indexOf("}", badge));
  assert.match(badgeBlock, /background:\s*var\(--yellow\)/,
    "the pill rides the yellow token family (distinct in all three skins via tokens)");
  assert.match(badgeBlock, /border-radius:\s*999px/, "the badge is the forum's pill idiom");
  const glyph = CSS.indexOf(".plus-badge svg {");
  assert.ok(glyph > badge, "the glyph rule follows the pill");
  const glyphBlock = CSS.slice(glyph, CSS.indexOf("}", glyph));
  assert.match(glyphBlock, /color:\s*var\(--on-yellow\)/,
    "the sparkle ink is the pill's on-color, legible on the gold");
  const flairBlock = CSS.slice(flair, CSS.indexOf("}", flair));
  assert.match(flairBlock, /border-radius:\s*999px/, "the chip is the forum's small-pill idiom");
  assert.match(flairBlock, /text-overflow:\s*ellipsis/, "a long flair clamps, never blows the row out");
});

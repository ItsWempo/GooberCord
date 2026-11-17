// The channel-row base (the QA catch, reproduced on the live build: the app
// emitted .channel-item blocks whose stylesheet carried ONLY modifier rules —
// spoiler/locked/gear-reveal — so every sidebar row rendered as an unstyled
// block, the "giant tile" look, and .unread-badge had NO rule anywhere).
// Pins hold the base idiom, the badge pill, the row markup the CSS targets,
// and the lead's viewport-lock fix so the wave can't lose it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const CSS = readFileSync(path.join(ROOT, "public/styles.css"), "utf8");
const APP = readFileSync(path.join(ROOT, "public/js/routes/app.js"), "utf8");

const BASE_AT = CSS.indexOf(".channel-item {");
const MODIFIER_AT = CSS.indexOf(".channel-item.channel-spoiler");

test("the channel-item base row: flex line, quiet hover, the label rhythm", () => {
  assert.ok(BASE_AT !== -1, "the base rule exists");
  assert.ok(MODIFIER_AT > BASE_AT, "the base precedes its modifiers");
  const block = CSS.slice(BASE_AT, CSS.indexOf("}", BASE_AT));
  assert.match(block, /display: flex;/);
  assert.match(block, /alignment|align-items: center;/);
  assert.match(block, /gap: 0\.5rem;/);
  assert.match(block, /padding: 0\.3rem 0\.5rem;/);
  assert.match(block, /border-radius: 0\.4rem;/);
  assert.match(block, /color: var\(--muted\);/, "token ink — both themes inherit");
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, "no raw hex");
  const hover = CSS.slice(CSS.indexOf(".channel-item:hover {"), CSS.indexOf("}", CSS.indexOf(".channel-item:hover {")));
  assert.match(hover, /background: var\(--quiet-hover\);/, "the quiet hover idiom");
});

test("the unread chip: a coral pill riding the row's right edge", () => {
  const at = CSS.indexOf(".channel-item .unread-badge {");
  assert.ok(at !== -1, "the badge finally has a base rule");
  const block = CSS.slice(at, CSS.indexOf("}", at));
  assert.match(block, /background: var\(--coral\);/);
  assert.match(block, /border-radius: 999px;/, "the pill");
  assert.match(block, /color: white;/);
  assert.match(block, /margin-left: auto;/, "it rides the right edge");
  assert.match(block, /flex-shrink: 0;/, "it never squeezes the name");
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, "no raw hex");
  // The name truncates against the row, never the badge.
  const name = CSS.indexOf(".channel-item .name {");
  const nameBlock = CSS.slice(name, CSS.indexOf("}", name));
  assert.match(nameBlock, /text-overflow: ellipsis;/);
  assert.match(nameBlock, /white-space: nowrap;/);
});

test("the CSS and the markup name the same rows (a rename cannot orphan either)", () => {
  assert.match(APP, /class: "channel-item/);
  assert.match(APP, /class: "unread-badge", text: unreadBadge\(conversation\.unread\)/);
});

test("the viewport lock and the head spacer hold (the sidebar's user panel never clips below the fold)", () => {
  const appAt = CSS.indexOf(".gc-app {");
  const block = CSS.slice(appAt, CSS.indexOf(".gc-app.has-aside", appAt));
  assert.match(block, /grid-template-rows: minmax\(0, 1fr\);/,
    "the implicit row never auto-sizes to the tallest column");
  assert.match(CSS, /\.head-spacer \{ flex: 1 1 auto; \}/,
    "the head icon buttons keep their push to the right edge");
});

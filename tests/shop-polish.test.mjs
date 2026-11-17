// Shop panel polish (Nitro lane item 4 — the owner's worst-screen list:
// three identical cards with nothing focal, a meter that read as a divider,
// a gift input speaking a different language). CSS-only pins with teeth.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const CSS = readFileSync(path.join(ROOT, "public/styles.css"), "utf8");

function blockOf(selector) {
  const start = CSS.indexOf(selector);
  if (start < 0) return "";
  return CSS.slice(start, CSS.indexOf("}", start));
}

test("the boards de-chrome: the offset shadow never nests inside the page panel", () => {
  const boards = CSS.slice(CSS.indexOf("/* The shop polish"), CSS.indexOf("/* The cosmetics editor"));
  assert.match(boards, /\.shop-body > :is\(\.shop-balance, \.shop-plus, \.shop-ledger\) \{/,
    "one shared rule de-chromes the three boards");
  assert.match(boards, /box-shadow:\s*none/,
    "the 3px offset shadow (the .panel chrome) dies inside the page panel");
  assert.match(boards, /\.shop-body > \.shop-balance \{[\s\S]*?border-color:\s*var\(--green\)/,
    "the balance is THE number — the hero treatment answers the focal-point wrong");
});
test("the meter is a real track and the gift input speaks the field language", () => {
  const track = blockOf(".shop-progress {");
  assert.match(track, /border:\s*2px solid var\(--line\)/,
    "a bordered track — the bare fill read as a divider on the claim button");
  assert.match(track, /background:\s*var\(--paper\)/);
  const gift = blockOf(".shop-gift .shop-gift-input {");
  assert.match(gift, /border:\s*2px solid var\(--field-line\)/,
    "the gift input matches the shared field look (border, radius, tokens)");
  assert.match(gift, /border-radius:\s*0\.4rem 0\.7rem 0\.45rem 0\.65rem/);
  // The grouping rule gives a sub-heading its own copy.
  const group = blockOf(".shop-plus h3 {");
  assert.match(group, /margin:\s*0\.8rem 0 0\.35rem;/);
  // Tokens only — the polish never invents a color.
  const polish = CSS.slice(CSS.indexOf("/* The shop polish"), CSS.indexOf("/* The cosmetics editor"));
  assert.doesNotMatch(polish, /#[0-9a-fA-F]{3,8}\b/, "no raw hex in the polish block");
});

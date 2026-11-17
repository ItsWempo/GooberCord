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

// The button-language tripwires. The owner's complaint ("LOOK AT BUTTONS.
// THEY ARENT WEMPOS FORUM STYLE") came from GC-tail drift while the shared
// .button system stayed byte-identical to the forum's fork — so the pins
// work from both directions: the shared system must stay a byte-clone of
// the forum's, and the GC-only surfaces must keep the corrections the
// audit made (no resting focus ring on a selected pick, no off-grid icon
// glyphs, hover-revealed controls visible to coarse pointers, and the
// borderless ghost-toggle skin (the old .auth-badge) never returning).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const stylesheet = path.join(here, "..", "public", "styles.css");
// The forum repo is the sibling working copy checked out next to this one —
// the same dependency the vendored-kit parity tests lean on.
const forumStylesheet = path.join(
  path.dirname(path.dirname(here)), "wempos-forum", "public", "styles.css",
);

// firstRuleBlock(css, selector): the bytes of the FIRST line-anchored rule whose
// selector starts with exactly `selector` — comment-free enough because
// both stylesheets name rules identically where the pin cares. Line-anchored
// so compound selectors (" .button {") can't shadow the base rule.
function firstRuleBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp("^" + escaped, "m").exec(css);
  if (!match) return null;
  const open = css.indexOf("{", match.index);
  const close = css.indexOf("}", open);
  return css.slice(match.index, close + 1);
}

test("the shared .button system is still a byte-clone of the forum's", async () => {
  const gc = await readFile(stylesheet, "utf8");
  const forum = await readFile(forumStylesheet, "utf8");
  for (const selector of [".button {", ".button:disabled {", ".icon-button {"]) {
    const gcBlock = firstRuleBlock(gc, selector);
    const forumBlock = firstRuleBlock(forum, selector);
    assert.ok(gcBlock, `GC keeps a ${selector} rule`);
    assert.ok(forumBlock, `forum keeps a ${selector} rule`);
    assert.equal(gcBlock, forumBlock, `${selector} must stay identical in both stylesheets`);
  }
});

test("a selected appearance-pick speaks the forum's aria-pressed idiom, never a resting focus ring", async () => {
  const css = await readFile(stylesheet, "utf8");
  const rule = firstRuleBlock(css, '.appearance-pick[aria-pressed="true"]');
  assert.ok(rule, "the selected-pick rule exists");
  // The forum's poll-vote vocabulary: green border + deep-green ink. The
  // base .button border is already --ink, so WITHOUT a visible differentiator
  // the picked pick would read identical to unpicked — green IS the cue.
  assert.match(rule, /border-color:\s*var\(--green\)/);
  assert.match(rule, /color:\s*var\(--green-dark\)/);
  // --focus outlines mean "keyboard focus" in both apps; as a resting
  // selected marker it read as a stuck focus ring (the audit's finding).
  assert.doesNotMatch(rule, /outline/);
});

test("hover-revealed row controls stay visible to coarse pointers (no-hover touch)", async () => {
  const css = await readFile(stylesheet, "utf8");
  // The member-row kick is opacity:0 until the row is hovered — on phones
  // and tablets there is no hover, so the media clause must reveal them.
  const clause = css.indexOf("@media (hover: none)");
  assert.ok(clause >= 0, "the (hover: none) clause exists");
  const end = css.indexOf("}", css.indexOf(".member-row .icon-button", clause));
  const block = css.slice(clause, end);
  assert.match(block, /\.member-row \.icon-button\s*\{[^}]*opacity:\s*1/s);
});

test("icon-button glyphs inherit the shared 1.2rem grid — the forum grid, no per-surface shrink", async () => {
  const css = await readFile(stylesheet, "utf8");
  // The audit's off-grid drift: a 0.95rem glyph swimming in a 2.5rem box.
  assert.equal(
    css.indexOf(".member-row .icon-button svg"),
    -1,
    "the member-row glyph-shrink override is gone (inherits .icon-button's 1.2rem)",
  );
});

test("the borderless ghost-toggle skin (.auth-badge) never comes back", async () => {
  const css = await readFile(stylesheet, "utf8");
  // Comments tell the deletion's story (they name the badge); the pin sees
  // only selectors — a stray comment mention is not a resurrection.
  const selectorsOnly = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(
    selectorsOnly,
    /\.auth-badge/,
    "the §4b-orphaned badge is deleted, not just unused",
  );
  // Its treatment — stripping the chrome off an icon-button — is the
  // anti-forum pattern this file once carried; no rule may do it again.
  const strip = firstRuleBlock(css.replace(/\/\*[\s\S]*?\*\//g, ""), ".auth-badge .icon-button") || "";
  assert.doesNotMatch(strip || "", /border:\s*0/);
});

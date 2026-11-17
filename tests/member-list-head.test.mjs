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

// The member-list head (the aside-clip wave): the roster header row was
// written without any geometry of its own — the label rode the .sidebar-label
// margins and the mod-desk gear landed FLUSH at the aside's edge (no right
// inset, no flex room for the label). This file pins the head-spacer idiom's
// geometry folded into the row itself: the row owns the inset, the label
// gets the room (with the sidebar-head h2's ellipsis discipline), and the
// gear keeps its width through any count.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const CSS = readFileSync(path.join(ROOT, "public/styles.css"), "utf8");
const APP = readFileSync(path.join(ROOT, "public/js/routes/app.js"), "utf8");

const HEAD_AT = CSS.indexOf(".member-list-head {");
const LABEL_AT = CSS.indexOf(".member-list-head .sidebar-label {");
const ICON_AT = CSS.indexOf(".member-list-head .icon-button");

test("the head row owns the aside inset: label left, gear inset, not flush", () => {
  assert.ok(HEAD_AT !== -1, "the head row rule exists");
  const block = CSS.slice(HEAD_AT, CSS.indexOf("}", HEAD_AT));
  assert.match(block, /display: flex;/);
  assert.match(block, /align-items: center;/);
  assert.match(block, /margin: 0\.35rem 0\.55rem 0\.25rem;/,
    "every other aside row's inset, both edges");
  assert.match(block, /gap: 0\.4rem;/);
});

test("the label gets the room: flex grow, min-width 0, the ellipsis discipline", () => {
  assert.ok(LABEL_AT > HEAD_AT, "the label rides the row block");
  const block = CSS.slice(LABEL_AT, CSS.indexOf("}", LABEL_AT));
  assert.match(block, /flex: 1 1 auto;/, "the head-spacer idiom, folded in");
  assert.match(block, /min-width: 0;/);
  assert.match(block, /margin: 0;/, "the base label's margins step aside");
  assert.match(block, /text-align: left;/);
  assert.match(block, /text-overflow: ellipsis;/, "a long count truncates, never breaks the row");
  assert.match(block, /white-space: nowrap;/);
});

test("the gear keeps its width through any count", () => {
  assert.ok(ICON_AT !== -1);
  const block = CSS.slice(ICON_AT, CSS.indexOf("}", ICON_AT));
  assert.match(block, /flex-shrink: 0;/);
  assert.match(block, /opacity: 1;/, "the desk door stays visible on the head");
});

test("the CSS targets the markup the app emits (rename cannot orphan)", () => {
  const at = APP.indexOf('class: "member-list-head"');
  assert.ok(at !== -1, "the head row div exists");
  assert.match(APP, /class: "sidebar-label"/);
  assert.match(APP, /className: "icon-button button-quiet member-desk"/);
  // The gear only ever mounts inside the label row.
  const labelRow = APP.slice(at - 20, at + 60);
  assert.match(labelRow, /el\("div", \{ class: "member-list-head" \}\)/);
});

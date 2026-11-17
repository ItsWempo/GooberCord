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

// Wave item 2 — the group-DM management panel (rename/icon/add/remove).
// node --test has no DOM to drive the dialog, so the pins are source-text
// with teeth: route methods, guard placements, the echoed-row contract, and
// the entry-point gates.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const APP = readFileSync(path.join(ROOT, "public/js/routes/app.js"), "utf8");
const CSS = readFileSync(path.join(ROOT, "public/styles.css"), "utf8");

function fnSlice(name, nextName) {
  const start = APP.indexOf("function " + name);
  const end = APP.indexOf("function " + nextName, start);
  return APP.slice(start, end);
}

test("the panel rides the single read: roster shapes re-read after every act", () => {
  const panel = fnSlice("openGroupManageDialog", "openIgnoredInVoiceDialog");
  assert.match(panel, /\/api\/conversations\/" \+ conversation\.id, \{ method: "GET" \}/,
    "the panel opens on the single read");
  const reads = (panel.match(/void reread|await reread\(\)/g) || []);
  assert.ok(reads.length >= 4, "every act (save/add/remove/open) re-reads the panel");
  assert.match(panel, /"aria-live": "polite"/,
    "the roster announces its changes to a screen reader");
});

test("the save rides the group PATCH: multipart for an upload, JSON for a rename", () => {
  const panel = fnSlice("openGroupManageDialog", "openIgnoredInVoiceDialog");
  const saveStart = panel.indexOf('text: "Save"');
  const save = panel.slice(saveStart);
  // The multipart act carries the name alongside the file (one act, both
  // fields); the JSON act is a bare rename.
  assert.match(save, /form\.append\("name", name\)/);
  assert.match(save, /form\.append\("image", file/);
  assert.match(save, /body: \{ name \}/);
  // An empty group name never reaches the wire.
  const gateAt = save.indexOf("The group needs a name.");
  const patchAt = save.indexOf("/api/conversations/");
  assert.ok(gateAt >= 0 && gateAt < patchAt, "the name gate answers before the PATCH");
  // After a save the sidebar list dies and re-reads (a renamed list row
  // cannot ride a stale cache), and the chat title follows the fresh row.
  assert.match(save, /refreshSidebar\(\)/);
  assert.match(save, /reread\(\)/);
});

test("the icon clears ride name + iconMediaId:null — the server's own shape", () => {
  const panel = fnSlice("openGroupManageDialog", "openIgnoredInVoiceDialog");
  const remove = panel.slice(panel.indexOf('text: "Remove icon"'),
    panel.indexOf("const cancel", panel.indexOf('text: "Remove icon"')));
  assert.match(remove, /iconMediaId: null/,
    "the clear carries the server's required name alongside it");
  assert.match(remove, /clearing rides the same PATCH/,
    "the copy tells the user why a blank name refuses");
  // The trigger hides once the icon is gone (and for iconless groups never
  // renders as an offer).
  assert.match(remove, /removeIcon\.hidden = true/);
  assert.match(panel, /\(conversation\.iconUrl \? \{\} : \{ hidden: "" \}\)/);
  // An uploaded icon may only resolve to the caller's OWN attachment — the
  // picker's file, never a URL paste.
  assert.doesNotMatch(panel, /iconMediaId: \s*(?!\bnull\b)[^,}]/,
    "no client path sends a hand-typed media id");
});

test("members ride the subresource; add reads the presence list, remove answers nothing to self", () => {
  const panel = fnSlice("openGroupManageDialog", "openIgnoredInVoiceDialog");
  assert.match(panel, /\/members\/" \+ Number\(member\.userId\)/, { message: "the remove rides the member row's id" });
  assert.match(panel, /method: "DELETE"/);
  assert.match(panel, /members", \{\s*\n?\s*method: "POST",\s*\n\s*body: \{ userId: Number\(addSelect\.value\) \}/);
  // The self seat keeps its (you) label and no remove door.
  assert.match(panel, /Number\(member\.userId\) === selfId/);
  assert.match(panel, /\(you\)/);
  // The add list filters the roster + self out of the presence universe.
  assert.match(panel, /inGroup\.has\(Number\(entry\.userId\)\) \|\| Number\(entry\.userId\) === selfId/);
  // Plus adornments ride the roster rows (the roster carries isPlus).
  assert.match(panel, /if \(member\.isPlus\) row\.append\(plusBadge\(doc\)\)/);
});

test("the entry points: a hidden head gear that answers a group, the row's menu + gear", () => {
  const headStart = APP.indexOf("The group-DM manage door (wave item 2)");
  const headEnd = APP.indexOf("const scroll = el(\"div\"", headStart);
  const head = APP.slice(headStart, headEnd);
  assert.match(head, /groupGear\.hidden = true/,
    "the gear starts hidden (a dm answers no management surface)");
  assert.match(head, /convo\?\.kind === "group"/);
  // The context read unhides it only for a group.
  const loadStart = APP.indexOf("async function loadChannel");
  const load = APP.slice(loadStart, loadStart + 6000);
  assert.match(load, /gear\.hidden = context\.channel\.kind !== "group"/);
  assert.match(load, /gear\.hidden = true,|\{ text: "Loading…", id: "channel-title" \}/)
    ;
  const row = fnSlice("conversationRow", "unreadBadge");
  assert.match(row, /row\.addEventListener\("contextmenu"/);
  assert.match(row, /event\.stopPropagation\(\)/,
    "the row gear never double-fires the row's own click");
  assert.match(row, /if \(conversation\.iconUrl\)/,
    "a named icon rides the row; the glyph is the default");
});

test("the panel's CSS rides existing idioms — a round icon slot, no new color family", () => {
  assert.match(CSS, /\.channel-item \.conversation-icon \{/);
  const iconBlock = CSS.slice(CSS.indexOf(".channel-item .conversation-icon {"),
    CSS.indexOf("}", CSS.indexOf(".channel-item .conversation-icon {")));
  assert.match(iconBlock, /border-radius:\s*999px/,
    "the icon keeps the rail's round slot");
  assert.match(CSS, /\.channel-item \.group-settings \{ margin-left: auto; opacity: 0; \}/,
    "the row gear hides until hover, the channel-settings idiom");
  const manage = CSS.slice(CSS.indexOf("/* Group-DM management"), CSS.length);
  assert.doesNotMatch(manage, /#[0-9a-fA-F]{3,8}\b/, "no raw hex — tokens only");
});

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

// Wave item 1 — channel context menu: rename + delete-with-confirm in the
// channel settings dialog. node --test has no DOM to drive the dialogs, so
// the pins are source-text with teeth (ordering, route methods, idiom chrome).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const APP = readFileSync(path.join(ROOT, "public/js/routes/app.js"), "utf8");

function dialogSlice(name, nextName) {
  const start = APP.indexOf("function " + name);
  const end = APP.indexOf("function " + nextName, start);
  return APP.slice(start, end);
}

test("the settings dialog grows the name field that rides the PATCH", () => {
  const dialog = dialogSlice("openChannelSettingsDialog", "deleteChannelConfirmDialog");
  assert.match(dialog, /id: "channel-name"/, "the rename input exists");
  assert.match(dialog, /maxlength: "100"/,
    "the same cap the create field carries (the server's rule)");
  const saveStart = dialog.lastIndexOf("addEventListener(\"submit\"");
  const save = dialog.slice(saveStart);
  // The name goes on the wire BEFORE the phase-3 fields, and the cache
  // follows so the sidebar agrees without a refetch round-trip.
  assert.match(save, /name: String\(nameInput\.value \|\| ""\)\.trim\(\)/);
  const wireName = save.indexOf("name: String(nameInput");
  const spoiler = save.indexOf("is_spoiler");
  assert.ok(wireName >= 0 && wireName < spoiler, "the name rides the same PATCH body");
  assert.match(save, /channel\.name = String\(nameInput\.value \|\| ""\)\.trim\(\)/);
});

test("the delete is its own confirm: danger chrome, honest copy, never inline", () => {
  const confirm = dialogSlice("deleteChannelConfirmDialog", "loadOverwriteEditor");
  assert.match(confirm, /method: "DELETE"/, "the confirm rides the channel DELETE");
  assert.match(confirm, /class: "button button-danger"/,
    "the destructive confirm keeps the shared danger chrome");
  assert.doesNotMatch(confirm, /button-primary/, "never the positive green");
  assert.match(confirm, /Nothing comes back/,
    "the text-channel copy is honest about permanence");
  assert.match(confirm, /The voice roster disperses/,
    "the voice half gets its own copy, not a borrowed one");
  // After success: the settings dialog leaves first, then a current-channel
  // viewer is moved off the dead hash BEFORE the refresh walk.
  const onclick = confirm.slice(confirm.indexOf("text: \"Delete\""));
  const onDone = onclick.indexOf("onDone()");
  const close = onclick.indexOf("dialog.close()");
  assert.ok(close >= 0 && onDone > close, "the confirm closes before handing back");
  assert.match(onclick, /parseHash\(win\.location\.hash\)\.channelId === Number\(channel\.id\)/);
  assert.match(onclick, /refreshServersAndRerender/);
});

test("the settings dialog's only delete door is the confirm, and the trigger closes it", () => {
  const dialog = dialogSlice("openChannelSettingsDialog", "deleteChannelConfirmDialog");
  assert.match(dialog, /text: "Delete channel…"/,
    "the trigger is a question opener, not an action");
  assert.match(dialog, /deleteChannelConfirmDialog\(doc, win, serverId, channel, \(\) => dialog\.close\(\)\)/,
    "onDone closes the settings dialog on a confirmed delete");
  assert.doesNotMatch(dialog, /DELETE"/,
    "the settings form itself never carries the destructive method");
});

test("manage-channel rows reach the settings dialog from the context menu", () => {
  const rowStart = APP.indexOf("function channelRow");
  const rowEnd = APP.indexOf("function rerenderChannelList", rowStart);
  const row = APP.slice(rowStart, rowEnd);
  const gear = row.indexOf('className: "icon-button button-quiet channel-settings"');
  const menu = row.indexOf('row.addEventListener("contextmenu"');
  assert.ok(gear > 0 && menu > gear,
    "the context menu rides the same manageChannels gate as the gear");
  assert.match(row, /event\.preventDefault\(\);\s*\n\s*openChannelSettingsDialog\(doc, win, route\.serverId, channel\)/);
});

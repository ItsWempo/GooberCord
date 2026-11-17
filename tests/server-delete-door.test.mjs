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

// The server-delete door (frontend's half of the shaver c13e4e0): the server
// settings dialog grows the danger zone — a "Delete server…" trigger that
// opens a TYPED-CONFIRM dialog (the owner types the server's name before the
// danger button unlocks), then one-act DELETE /api/servers/:id, teardown by
// the backend's owner-guarded batch. House rules pinned: the destructive
// delete is its own dialog (never inline), the danger chrome carries the
// act, success lands home, and the CSP discipline never breaks.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const APP = readFileSync(path.join(ROOT, "public/js/routes/app.js"), "utf8");

// The danger-zone block sits inside openServerSettingsDialog; the dialog's
// form-submit anchor recurs across the file, so the block's end rides the
// next function AFTER the trigger anchor.
const TRIGGER = APP.slice(
  APP.indexOf("The danger zone (the shaver's door)"),
  APP.indexOf("function openRolesDialog(", APP.indexOf("The danger zone (the shaver's door)")),
);
const CONFIRM = APP.slice(
  APP.indexOf("function deleteServerConfirmDialog("),
  APP.indexOf("async function loadOverwriteEditor("),
);

test("the settings dialog carries the danger zone: the note, the trigger, the confirm call", () => {
  assert.match(TRIGGER, /Danger zone: deleting removes the server/, "the member-read warning");
  assert.match(TRIGGER, /history|all history/, "the copy names the loss");
  assert.match(TRIGGER, /class: "button button-quiet delete-server-trigger"/);
  assert.match(TRIGGER, /text: "Delete server…"/, "the ellipsis: the act opens ANOTHER dialog");
  assert.match(TRIGGER, /deleteServerConfirmDialog\(doc, win, serverId, originalName, \(\) => dialog\.close\(\)\)/,
    "the settings dialog closes only after a SUCCESSFUL delete (the onDone hook)");
  // The trigger sits INSIDE the settings dialog (the door is in the door).
  const settings = APP.slice(
    APP.indexOf("function openServerSettingsDialog("),
    APP.indexOf("function openRolesDialog("),
  );
  assert.ok(settings.includes("delete-server-trigger"), "the trigger rides the settings dialog");
  assert.doesNotMatch(TRIGGER, /\binnerHTML\b/, "CSP-safe module");
});

test("the typed-confirm guard: the danger button stays locked until the name matches", () => {
  assert.match(CONFIRM, /disabled: ""/, "the confirm arrives locked");
  // The unlock reads ONLY the typed name vs the server's, trimmed, case-insensitive.
  assert.match(CONFIRM, /String\(typedInput\.value\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(CONFIRM, /=== String\(serverName \|\| ""\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(CONFIRM, /if \(match\) confirmButton\.removeAttribute\("disabled"\);\n    else confirmButton\.setAttribute\("disabled", ""\);\n  \}\);/,
    "every keystroke re-locks: a mismatch re-disables");
  assert.match(CONFIRM, /placeholder-independent guard|autocomplete: "off"/);
});

test("the one-act delete: DELETE /api/servers/:id, home on success, the server's copy on failure", () => {
  assert.match(CONFIRM, /await api\("\/api\/servers\/" \+ serverId, \{ method: "DELETE" \}\)/);
  const success = CONFIRM.slice(
    CONFIRM.indexOf("await api("),
    CONFIRM.indexOf("} catch (caught) {"),
  );
  assert.match(success, /dialog\.close\(\);/, "the confirm dismisses");
  assert.match(success, /typeof onDone === "function"\) onDone\(\);/, "the settings dialog dies with it");
  assert.match(success, /win\.location\.hash = "#\/";/, "the deleted server has no route left");
  assert.match(success, /refreshServersAndRerender\(doc, win, parseHash\(win\.location\.hash\)\);/,
    "the rails re-read after the teardown");
  const failure = CONFIRM.slice(CONFIRM.indexOf("} catch (caught) {"), CONFIRM.lastIndexOf("});"));
  assert.match(failure, /showTransientError\(doc, caught\?\.message \|\| "The server could not be deleted\."\);/,
    "a failed delete speaks with the server's copy");
  assert.match(CONFIRM, /class: "button button-danger"/, "the danger chrome carries the act");
  assert.match(CONFIRM, /Nothing comes back/, "the confirm copy repeats the loss");
  assert.match(CONFIRM, /closeDialogOnBackdrop\(dialog\);/, "the same dialog idiom");
  assert.match(CONFIRM, /typedInput\.focus\(\);/, "the guard invites the typing");
  assert.doesNotMatch(CONFIRM, /\binnerHTML\b|\bcssText\b|setAttribute\("style"/, "CSP-safe module");
});

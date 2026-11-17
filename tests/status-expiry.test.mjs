// Wave item 5 — the custom-status expiry + the DND quick-status. The pure
// half (expiry wiring values, the DND predicate) pins behaviorally; the
// wiring half (settings save, quick-status menu, dot coloring) rides source
// pins with teeth, since node --test has no DOM to drive the dialogs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  STATUS_DND_TEXT,
  STATUS_EXPIRY_OPTIONS,
  dndActive,
  statusUntilFrom,
} from "../public/js/ui-helpers.js";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const APP = readFileSync(path.join(ROOT, "public/js/routes/app.js"), "utf8");
const CSS = readFileSync(path.join(ROOT, "public/styles.css"), "utf8");

// --- the pure half ---------------------------------------------------------------

test("the expiry menu is minute-wired pairs, null first, and the wire half maps them", () => {
  assert.deepEqual(STATUS_EXPIRY_OPTIONS[0], [null, "Until I change it"]);
  for (const [minutes, label] of STATUS_EXPIRY_OPTIONS) {
    if (minutes === null) continue;
    assert.ok(Number.isInteger(minutes) && minutes > 0, `positive minutes (${minutes})`);
    assert.equal(typeof label, "string" && label.length > 0 ? "string" : undefined, label);
  }
  assert.equal(statusUntilFrom(null, 1000), null, "no expiry is a null statusUntil");
  assert.equal(statusUntilFrom(240, 1000), 1000 + 240 * 60000, "minutes ride 60000ms");
  for (const bad of [0, -5, "4", 1.5, NaN]) {
    assert.equal(statusUntilFrom(bad, 1000), null, `junky ${bad} clears the expiry`);
  }
});

test("the DND predicate: exactly the preset text, live expiry only", () => {
  assert.equal(typeof STATUS_DND_TEXT, "string");
  assert.ok(STATUS_DND_TEXT.length > 0 && STATUS_DND_TEXT.length <= 128);
  const now = 5000;
  assert.ok(dndActive({ statusText: STATUS_DND_TEXT, statusUntil: null }, now),
    "until-I-change-it DND is active");
  assert.ok(dndActive({ statusText: STATUS_DND_TEXT, statusUntil: now + 1 }, now),
    "a future expiry is active");
  assert.equal(dndActive({ statusText: STATUS_DND_TEXT, statusUntil: now }, now), false,
    "an expiry AT now has lapsed");
  assert.equal(dndActive({ statusText: STATUS_DND_TEXT, statusUntil: now - 1 }, now), false,
    "a lapsed expiry is as good as no status");
  assert.equal(dndActive({ statusText: "out fishing", statusUntil: null }, now), false,
    "any other text is not DND, however similar");
  assert.equal(dndActive(null, now), false, "no entry, no dot");
  assert.equal(dndActive({ statusText: undefined }, now), false);
});

// --- the wiring half --------------------------------------------------------------

test("the settings save rides the expiry select through statusUntilFrom", () => {
  const dialogStart = APP.indexOf("function userSettingsDialog");
  const dialogEnd = APP.indexOf("function quickStatusDialog", dialogStart);
  const dialog = APP.slice(dialogStart, dialogEnd);
  assert.match(dialog, /STATUS_EXPIRY_OPTIONS/, "the menu renders the filed pairs");
  assert.match(dialog, /"user-status-expiry"/, "the select exists beside the status input");
  // The submit: expiry value → statusUntilFrom → the PATCH body.
  const saveStart = dialog.lastIndexOf("addEventListener(\"submit\"");
  const saveBlock = dialog.slice(saveStart);
  assert.match(saveBlock, /statusUntilFrom\(expiryMinutes, Date\.now\(\)\)/);
  assert.match(saveBlock, /^[\s\S]*body: \{ statusText: statusText \|\| null, statusUntil \}/);
});

test("the quick-status menu is one constant away from the coral dot — no parallel DND flag", () => {
  const menuStart = APP.indexOf("function quickStatusDialog");
  const menuEnd = APP.indexOf("// --- Goober+ perks", menuStart);
  const menu = APP.slice(menuStart, menuEnd);
  assert.match(menu, /apply\(STATUS_DND_TEXT, statusUntilFrom\(null, Date\.now\(\)\)\)/,
    "the DND preset rides the text the server already stores");
  assert.match(menu, /apply\(null, null\)/, "both the clear and the off-toggle null the status");
  assert.match(menu, /"aria-pressed": selfDnd \? "true" : "false"/,
    "the toggle carries the pressed idiom");
  assert.match(menu, /refreshPresenceNow\(win\)/);
  assert.match(menu, /rerenderUserPanel\(doc, win\)/);
});

test("the coral dot rides every surface that knows the status; the copy says dnd", () => {
  // Self footer: the state reader answers "dnd" ahead of the plain online.
  const selfStart = APP.indexOf("function selfPresenceState");
  const selfBlock = APP.slice(selfStart, APP.indexOf("const PRESENCE_COPY", selfStart));
  assert.match(selfBlock, /if \(dndActive\(selfEntry\)\) return "dnd";/);
  assert.match(APP, /dnd: "Do not disturb",/);
  // Presence aside + roster member rows both color the dot through dndActive.
  const presenceRowStart = APP.indexOf("function presenceRow");
  const presenceRow = APP.slice(presenceRowStart, presenceRowStart + 700);
  assert.match(presenceRow, /dndActive\(entry\) \? " presence-dot-dnd" : ""/);
  const memberStart = APP.indexOf('class: "presence-row member-row"');
  const memberBlock = APP.slice(memberStart, memberStart + 800);
  assert.match(memberBlock, /dndActive\(rosterEntry\) \? " presence-dot-dnd" : ""/);
  assert.match(CSS, /\.presence-dot-dnd \{ background: var\(--coral\); \}/);
});

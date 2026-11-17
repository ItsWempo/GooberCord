// Presence tiers (SHAVERS 5's client half) — the server persisted an
// idle/dnd tier on the same row, so the dot and the quick menu answer the
// TIER field, the text rule falls back only for rows that predate it, and
// every tier PATCH carries the key explicitly (an absent key keeps whatever
// the row already carries).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { STATUS_DND_TEXT, presenceTierClass } from "../public/js/ui-helpers.js";
import { dndActive } from "../public/js/ui-helpers.js";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const APP = readFileSync(path.join(ROOT, "public/js/routes/app.js"), "utf8");
const CSS = readFileSync(path.join(ROOT, "public/styles.css"), "utf8");

test("the tier field is authoritative: dnd persists, a NULL tier is online, idle is its own color", () => {
  // Known tiers never consult the text or the expiry.
  assert.equal(dndActive({ presenceState: "dnd", statusText: "out fishing" }), true,
    "the tier beats any text");
  assert.equal(dndActive({ presenceState: "dnd", statusText: STATUS_DND_TEXT, statusUntil: 1 }), true,
    "the tier never lapses on the expiry");
  assert.equal(dndActive({ presenceState: "idle", statusText: STATUS_DND_TEXT }), false,
    "a NULL tier is online, however DND-shaped the stored text looks");
  assert.equal(dndActive({ presenceState: null, statusText: "Do not disturb" }), false);
  // The dotted classes: gold for idle, coral for dnd, green otherwise.
  assert.equal(presenceTierClass({ presenceState: "idle" }), " presence-dot-idle");
  assert.equal(presenceTierClass({ presenceState: "dnd" }), " presence-dot-dnd");
  assert.equal(presenceTierClass({ presenceState: null }), "");
  // Pre-tier rows keep the text read inside the class helper.
  assert.equal(presenceTierClass({ statusText: STATUS_DND_TEXT }), " presence-dot-dnd");
  assert.equal(presenceTierClass({ statusText: "out fishing" }), "");
  assert.equal(presenceTierClass(null), "");
  assert.equal(dndActive(null), false);
});

test("the quick menu carries the idle pick; every tier act names its tier", () => {
  const menuStart = APP.indexOf("function quickStatusDialog");
  const menuEnd = APP.indexOf("// --- Goober+ perks", menuStart);
  const menu = APP.slice(menuStart, menuEnd);
  assert.match(menu, /quick-status-toggle quick-status-idle/,
    "the idle pick rides the same toggle family");
  assert.match(menu, /text: selfIdle \? "Idle — on" : "Idle"/);
  assert.match(menu, /selfIdle\s*\?\s*apply\(null, null, null\)/,
    "the untoggle goes back to online — the tier key rides even for a NULL");
  assert.match(menu, /"idle"/);
  assert.match(menu, /the gold dot idle/, "the note names both dot colors");
});

test("the aside, the roster, and the self state all answer the tier; idle's dot is gold", () => {
  // The aside passes the cache entry's tier through.
  assert.match(APP, /presenceRow\(doc, win, entry\.username, entry\.userId, entry\.statusText, entry\.statusUntil, entry\.presenceState\)/);
  assert.match(APP, /const dotClass = "presence-dot" \+ presenceTierClass\(entry\);/);
  assert.match(APP, /presenceTierClass\(rosterEntry\)/);
  // The self state: idle answers after dnd, before the plain online.
  const selfStart = APP.indexOf("function selfPresenceState");
  const selfBlock = APP.slice(selfStart, APP.indexOf("const PRESENCE_COPY", selfStart));
  const dndAt = selfBlock.indexOf('return "dnd";');
  const idleAt = selfBlock.indexOf('presenceState === "idle"');
  const onlineAt = selfBlock.indexOf('return selfEntry ? "online" : "offline"');
  assert.ok(dndAt > 0 && idleAt > dndAt && onlineAt > idleAt,
    "voice > dnd > idle > online ordering holds");
  assert.match(APP, /idle: "Idle",/, "the copy names the tier");
  const dot = CSS.slice(CSS.indexOf(".presence-dot-idle {"), CSS.indexOf("}", CSS.indexOf(".presence-dot-idle {")));
  assert.match(dot, /background:\s*var\(--yellow\)/,
    "idle's gold rides the yellow token family (both themes through the token)");
  // The idle pick answers in the gold family, AFTER the coral rule so the
  // specific class wins the pressed state.
  assert.ok(CSS.indexOf(".quick-status-idle[aria-pressed=\"true\"] {") >
    CSS.indexOf(".quick-status-toggle[aria-pressed=\"true\"] {"));
});

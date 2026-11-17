// The cold-boot composer race (QA's ride-along): a direct page load INTO a
// channel URL mounts the composer BEFORE the server cache fills, so the
// context resolved null and the expression chrome (emoji + GIF + soundboard)
// went absent from first paint — while an in-SPA navigation never sees it.
// The fix settles from the cache fill: the chrome rides the EXISTING box (a
// draft, an attachment preview, and every listener survive — a rebuild would
// throw the user's words away). Pins: the settle's existence + wiring in the
// cache-fill block, the idempotency marker riding the first-paint builder,
// the server-arm-only rule (a DM/group composer never gains a picker), the
// SAME gate mirrors the first-paint builder spells, and — as far as the
// node harness allows — the real settle's arms: idempotent early-return,
// the non-channel routes, and the full append ride against seeded caches.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { state } from "../public/js/state.js";
import { invalidateServersCache } from "../public/js/routes/app.js";
import { settleChannelComposerChrome } from "../public/js/routes/app.js";
import { useDocument } from "../public/js/vendor/dom.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const APP = readFileSync(path.join(ROOT, "public/js/routes/app.js"), "utf8");

test("the settle exists and rides the cache fill's re-render step", () => {
  // The fill block: the SAME block that re-renders the rail and sidebar
  // once the /api/servers read settles — the settle is its next line.
  const fill = APP.slice(APP.indexOf('if (caches.servers === null) {'),
    APP.indexOf('if (caches.servers === null) {') + 1200);
  assert.match(fill, /renderSidebar\(doc, doc\.defaultView, sidebar, current\);/);
  assert.match(fill, /settleChannelComposerChrome\(doc, win\);/,
    "the chrome settles on the exact tick the servers read fills");
  // And only there: the settle name appears exactly twice (definition + call).
  const callCount = [...APP.matchAll(/settleChannelComposerChrome\(/g)].length;
  assert.equal(callCount, 2, "one definition, one call site — no other re-entry");
});

test("the mark travels with the boxes: first paint stamps the marker, the settle reads it", () => {
  const build = APP.slice(APP.indexOf("let expressionButton = null;"),
    APP.indexOf('if (expressionButton) box.append(expressionButton);'));
  assert.match(build, /box\.dataset\.chromeReady = pickerServerId \? "1" : "0";/,
    "a server-context first paint stamps ready; a cache-miss boot stamps 0");
  const settle = APP.slice(APP.indexOf("export function settleChannelComposerChrome"),
    APP.indexOf("export function settleChannelComposerChrome") + 2400);
  assert.match(settle, /if \(!box \|\| box\.dataset\.chromeReady === "1"\) return;/,
    "the settle idles on a box that already carries its chrome");
  assert.match(settle, /box\.dataset\.chromeReady = "1";/,
    "a settled box is ready — the next refresh tick never re-appends");
});

test("the settle reads ONLY the server arm: a DM/group composer gains no picker", () => {
  const settle = APP.slice(APP.indexOf("export function settleChannelComposerChrome"),
    APP.indexOf("export function settleChannelComposerChrome") + 2400);
  assert.match(settle, /if \(!context\?\.server\) return;/,
    "a conversation context (caches.conversations) is a quiet early return");
  // And the rider order matches the first-paint builder exactly:
  // expression, then (plus) the GIF, then the soundboard.
  const emoji = settle.indexOf('iconButton(doc, "smile"');
  const gif = settle.indexOf('iconButton(doc, "image"');
  const board = settle.indexOf('iconButton(doc, "speaker"');
  assert.ok(emoji > 0 && gif > emoji && board > gif,
    "the chrome's order is fixed: emoji → GIF → soundboard");
  // The GIF rider is the same plus check the first-paint builder runs.
  assert.match(settle, /state\.currentUser\?\.isPlus/);
  // The manage gate spells the SAME two-step mirror (tier or the merged bit).
  assert.match(settle, /viewerCan\(currentRoster\(serverId\)\?\.viewer \|\| null, "MANAGE_EMOJI"\)/);
  assert.match(settle, /context\.server\.role === "moderator"/);
  // The textarea rides the EXISTING box — the settle never builds one.
  assert.match(settle, /box\.querySelector\("textarea\.composer-input"\)/);
  assert.match(settle, /box\.append\(expressionButton\)/);
  assert.match(settle, /box\.append\(soundboardButton\);/, "and it lands at the END of the box,");
  assert.match(settle, /\n  \}\n  const soundboardButton/, "after the GIF rider.");
});

test("the real settle: the early arms are quiet, the append arm is a one-time ride", async () => {
  // A permissive element stub: el()/createIcon/… all ride createElement +
  // createElementNS; every op is recorded, nothing throws.
  const stubElement = () => ({
    className: "", textContent: "", value: "", hidden: false,
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    addEventListener() {}, append() {}, prepend() {}, replaceChildren() {},
    remove() {}, closest() { return null; }, focus() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    isConnected: false, style: {},
  });
  const box = {
    record: [],
    dataset: { chromeReady: "0" },
    append: (node) => box.record.push(node),
    querySelector() {
      return box.record.textarea;
    },
  };
  box.record.textarea = stubElement();
  const doc = {
    queried: [],
    querySelector: (sel) => {
      doc.queried.push(sel);
      return sel === ".composer-box" ? box : null;
    },
    createElement: () => stubElement(),
    createElementNS: () => stubElement(),
  };
  const win = { location: { hash: "" } };

  // A box with no chrome on a hash with no channel: the settle is quiet.
  settleChannelComposerChrome(doc, win);
  assert.deepEqual(box.record.filter((entry) => entry !== box.record.textarea), [],
    "no chrome rides a non-channel route");

  // A READY box (first paint resolved the server): the settle idles even on
  // a channel route (no caches seeded — the marker answers first).
  win.location.hash = "#/s/1/c/2";
  settleChannelComposerChrome(doc, win);
  assert.deepEqual(box.record.filter((entry) => entry !== box.record.textarea), [],
    "a chrome-ready box is never settled twice");

  // The real ride: a cold-boot box (marker "0") + seeded caches via the
  // refresh path (fetch stub supplies the server WITH the channel) + the
  // hash on that channel.
  const calls = [];
  globalThis.fetch = async (path) => {
    calls.push(String(path));
    return new Response(JSON.stringify({
      servers: [{ id: 1, name: "The Server", role: "member",
        channels: [{ id: 2, name: "general", kind: "text" }] }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    invalidateServersCache();
    const rail = { ...stubElement(), isConnected: true, append: () => {} };
    const sidebar = { ...stubElement(), isConnected: true, append: () => {} };
    const seededDoc = {
      querySelector: (sel) => sel === ".gc-rail" ? rail : sel === ".gc-sidebar" ? sidebar : null,
      createElement: () => stubElement(),
      createElementNS: () => stubElement(),
    };
    useDocument(seededDoc);
    const { refreshServersAndRerender } = await import(
      "../public/js/routes/app.js");
    await refreshServersAndRerender(seededDoc, win, { serverId: 1, channelId: null });
    assert.ok(calls.some((entry) => entry.includes("/api/servers")),
      "the refresh path rode the stub read");
    box.record.length = 0;
    box.record.textarea = stubElement();
    state.currentUser = { isPlus: true };
    settleChannelComposerChrome(doc, win);
    assert.equal(box.record.length, 3,
      "the chrome rides ONCE: emoji + GIF (plus) + soundboard");
    assert.equal(box.dataset.chromeReady, "1", "and the box is marked.");
    box.record.length = 0;
    settleChannelComposerChrome(doc, win);
    assert.equal(box.record.length, 0, "the second settle is idempotent.");
    state.currentUser = null;
    invalidateServersCache();
  } finally {
    delete globalThis.fetch;
    useDocument(null);
  }
});

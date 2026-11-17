// The 0021 client half (backend's 31fd030): the composer's bound tiers by
// Goober+ — free keeps 2000, plus admits 4000 — exactly what the server's
// messageBodyMax() admits (grace rides the FREE bound, and the display
// matches). Pins with teeth: the mirror's numbers are parity-pinned to
// constants.mjs, a stale viewer reads the FREE bound, both composer sites
// (channel composer + inline edit) resolve per current viewer, and the
// composer's own flat 2000 is GONE.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const js = (p) => readFileSync(path.join(ROOT, p), "utf8");
const HELPERS = js("public/js/ui-helpers.js");
const APP = js("public/js/routes/app.js");
const CONSTANTS = js("constants.mjs");

test("the mirror's numbers are parity-pinned to constants.mjs's tier pair", async () => {
  const mod = await import("../public/js/ui-helpers.js");
  const free = Number(CONSTANTS.match(/export const GC_FREE_MESSAGE_MAX = (\d+);/)[1]);
  const plus = Number(CONSTANTS.match(/export const GC_PLUS_MESSAGE_MAX = (\d+);/)[1]);
  assert.equal(free, 2000, "the owner-blessed free bound");
  assert.equal(plus, 4000, "the owner-blessed plus bound");
  assert.equal(mod.GC_FREE_MESSAGE_MAX, free);
  assert.equal(mod.GC_PLUS_MESSAGE_MAX, plus);
});

test("messageMaxFor: the bound is THIS viewer's, and junk reads the FREE bound", async () => {
  const mod = await import("../public/js/ui-helpers.js");
  assert.equal(mod.messageMaxFor({ isPlus: true }), 4000);
  assert.equal(mod.messageMaxFor({}), 2000);
  assert.equal(mod.messageMaxFor(null), 2000, "a stale or absent viewer never reads the wide bound");
  // Grace is the server's business; the display matches it — a grace member
  // is NOT isPlus, so this fall-through is the same FREE bound.
  assert.equal(mod.messageMaxFor({ isPlus: false }), 2000);
});

test("the composer carries the per-viewer bound: maxlength, the counter, and the over-gate", () => {
  const composer = APP.slice(
    APP.indexOf("function buildComposer(doc, win, main, composerError, slowmodeSeconds = 0, pickerServerId = null) {"),
    APP.indexOf("const attachButton = iconButton(doc, \"paperclip\""),
  );
  assert.ok(composer.length > 400, "the composer slice is real (got " + composer.length + ")");
  const resolve = composer.indexOf("const messageMax = messageMaxFor(state.currentUser);");
  const maxlength = composer.indexOf('maxlength: String(messageMax)');
  const counter = composer.indexOf('"0 / " + messageMax');
  assert.ok(resolve !== -1 && resolve < maxlength, "the bound resolves once, before the textarea");
  assert.ok(counter !== -1, "the counter's own label opens at the bound");
  const setCounter = APP.slice(APP.indexOf("const setCounter = () => {"), APP.indexOf("textarea.addEventListener(\"input\""));
  assert.match(setCounter, /counter\.textContent = used \+ " \/ " \+ messageMax;/);
  assert.match(setCounter, /char-over", used >= messageMax\);/, "the over-gate rides the SAME bound");
  assert.doesNotMatch(composer, /GC_MESSAGE_MAX/, "the composer's flat 2000 is gone");
});

test("the inline editor resolves per the current viewer too; app.js carries no flat bound", () => {
  const editor = APP.slice(APP.indexOf("function editMessageInline(doc, win, message) {"), APP.indexOf('el("button", { class: "button button-primary", type: "button", text: "Save" });'));
  assert.ok(editor.length > 200 && editor.length < 2000, "the edit slice is real (got " + editor.length + ")");
  assert.match(editor, /maxlength: String\(messageMaxFor\(state\.currentUser\)\)/,
    "an edited message admits what THIS viewer may send");
  assert.doesNotMatch(APP, /const GC_MESSAGE_MAX/, "the flat client constant no longer exists");
});

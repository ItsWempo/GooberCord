// The expressions manage lane: caps live IN THE PAYLOAD (never re-derived),
// the name bounds are PER KIND (the sticker 30 is EXACT), the upload rides
// the multipart FormData arm, and the manage affordances render only where
// MANAGE_EMOJI (or the owner) says so — read-only rows otherwise.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const HERE = dirname(new URL(import.meta.url).pathname);
const calls = [];
let responses = [];
globalThis.fetch = async (path, init = {}) => {
  calls.push({ path, method: init.method || "GET", body: init.body });
  const response = responses.shift();
  return new Response(typeof response === "string" ? response : JSON.stringify(response),
    { status: response?.status ?? 200 });
};

const expressions = await import("../public/js/ui/expressions.js");
const store = (await import("../public/js/core/store.js")).default;
const constants = await import("../constants.mjs");
const EXPR = readFileSync(join(HERE, "../public/js/ui/expressions.js"), "utf8");
const MAIN = readFileSync(join(HERE, "../public/js/main.js"), "utf8");

test.beforeEach(() => {
  calls.length = 0;
  responses = [];
  store.reset();
});

test("the mirrored constants equal the backend's (G-4)", () => {
  assert.equal(expressions.UI_EMOJI_FILE_MAX, constants.GC_EMOJI_FILE_MAX);
  assert.equal(expressions.UI_STICKER_FILE_MAX, constants.GC_STICKER_FILE_MAX);
  assert.equal(expressions.UI_SOUND_FILE_MAX, constants.GC_SOUNDBOARD_SOUND_MAX_BYTES);
  assert.equal(expressions.UI_EMOJI_NAME_PATTERN.source, constants.GC_EMOJI_NAME_PATTERN.source);
  assert.equal(expressions.UI_STICKER_NAME_PATTERN.source, constants.GC_STICKER_NAME_PATTERN.source);
  assert.equal(expressions.UI_SOUND_NAME_PATTERN.source, constants.GC_SOUND_NAME_PATTERN.source);
  // The sticker 30 is EXACT — a 2–32 blanket validator would be the defect.
  assert.doesNotMatch(expressions.UI_STICKER_NAME_PATTERN.source, /32/);
});

test("the three GETs ride one envelope; the payload's caps land untouched", async () => {
  responses = [
    { emojis: [{ id: 1, serverId: 5, name: "blob", url: "/api/attachments/2", createdAt: null }],
      caps: { emoji: 50, stickers: 5, sounds: 8 } },
    { stickers: [], caps: { emoji: 50, stickers: 5, sounds: 8 } },
    { sounds: [], caps: { emoji: 50, stickers: 5, sounds: 8 } },
  ];
  const payload = await expressions.loadExpressions(5);
  assert.equal(payload.emojis.length, 1);
  assert.deepEqual(payload.caps, { emoji: 50, stickers: 5, sounds: 8 });
  assert.equal(expressions.expressionsOf(5), payload);
  assert.equal(calls[0].path, "/api/servers/5/emojis");
  assert.equal(calls[1].path, "/api/servers/5/stickers");
  assert.equal(calls[2].path, "/api/servers/5/sounds");
});

test("the caps cite the payload and are never re-derived (the ladder is the server's)", () => {
  assert.match(EXPR, /caps\[kind\.key\]/, "the count line cites the payload's caps");
  assert.match(EXPR, /the cap rides the current boost tier/);
  assert.doesNotMatch(EXPR, /Math\.max/, "no client-side ladder arithmetic (G-4)");
});

test("the manage bit is one bit, three lanes: owner OR MANAGE_EMOJI", () => {
  assert.equal(expressions.canManageExpressions(
    { viewer: { owner: true, permissions: [] } }), true);
  assert.equal(expressions.canManageExpressions(
    { viewer: { owner: false, permissions: ["MANAGE_EMOJI"] } }), true);
  assert.equal(expressions.canManageExpressions(
    { viewer: { owner: false, permissions: ["MANAGE_CHANNELS"] } }), false);
  assert.equal(expressions.canManageExpressions(null), false);
});

test("routes: the inventories page and its separate upload route (G-6)", () => {
  assert.match(MAIN, /addRoute\("\/s\/:serverId\/expressions\/new", "expression-new"/);
  assert.match(MAIN, /addRoute\("\/s\/:serverId\/expressions", "expressions"/);
  // The upload form is its own route, not a dialog — and registers FIRST,
  // before the shorter "expressions" path and the channel catch-all.
  assert.ok(MAIN.indexOf('"expression-new"') < MAIN.indexOf('"expressions", renderExpressions'));
  assert.ok(MAIN.indexOf('"expressions", renderExpressions') < MAIN.indexOf('"channel", channelPlaceholder'));
});

test("the upload arm is multipart FormData with per-kind fields (never JSON)", () => {
  assert.match(EXPR, /new FormData\(\)/);
  assert.match(EXPR, /data\.append\("name"/);
  assert.match(EXPR, /fileField: "image"/, "the emoji field");
  assert.match(EXPR, /fileField: "sound"/, "the sound field — and only for sounds");
  assert.match(EXPR, /accept: "image\/\*"/);
  assert.match(EXPR, /accept: "audio\/mpeg,audio\/ogg"/);
  assert.match(EXPR, /method: "POST", body: data/);
});

test("rename and delete: the per-kind paths, the 409 keeps the name, the delete confirms the bytes", () => {
  assert.match(EXPR, /PATCH", body: \{ name: field\.querySelector\("input"\)\.value \}/);
  assert.match(EXPR, /error\.message; \/\/ verbatim \(G-2\) — input intact/, "a 409 keeps the name");
  assert.match(EXPR, /DELETE", \{ method: "DELETE" \}\)|`\/api\/servers\/\$\{serverId\}\/\$\{kind\.key\}\/\$\{row\.id\}`, \{ method: "DELETE"/);
  assert.match(EXPR, /The upload's bytes go with the row when nothing else uses them\./,
    "the one delete confirmation states the byte consequence (G-6)");
});

test("cap reached: the create affordance disables with the server's 400 shape; rows stay ACTIVE", () => {
  assert.match(EXPR, /This server already has \$\{cap\} \$\{kind\.singular\}s\. Delete one to add another\./);
  // Comments tell the law; the pin sees only the code — no purge branch may
  // filter the rows by cap state (the items disable, never delete).
  const codeOnly = EXPR.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(codeOnly, /\blapsed\b/);
  assert.doesNotMatch(codeOnly, /\.filter\(/, "no purge branch over the rows");
  assert.match(EXPR, /rows\.map\(\(row\)/, "the rows loop maps over the FULL inventory");
});

test("empty inventory: the G-5 sentence per kind", () => {
  assert.match(EXPR, /This server hasn't added any \$/);
  assert.match(EXPR, /Add the first \$\{kind\.singular\}/);
});

test("plain members see the shared 403 string; staff without the bit see read-only rows", () => {
  assert.match(EXPR, /canManageExpressions\(payload\)/);
  assert.match(EXPR, /staffViewing\(payload\)/);
  assert.match(EXPR, /You do not have permission to do that\./);
  assert.match(EXPR, /\bmanage\b/, "the manage flag carries the control gating");
});

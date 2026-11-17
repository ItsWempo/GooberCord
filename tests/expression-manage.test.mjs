// The expression manage dialog (W-F1): the emoji/sticker PATCH/DELETE
// route families' client callers, riding the soundboard idiom. This file
// pins the grammar mirror, the image intake's pre-checks, the per-kind
// routes' word shapes, the mutation contracts, and — per the wave's rule —
// the CAP DISCIPLINE: the list payloads carry no caps field, so the client
// displays no slot numbers and invents none; the over-slot refusal stays
// the server's own 400 copy.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  GC_EMOJI_NAME_MAX,
  GC_EMOJI_NAME_MIN,
  GC_EMOJI_NAME_PATTERN,
  MAX_ATTACHMENT_BYTES,
} from "../constants.mjs";

import {
  EXPRESSION_IMAGE_MAX_BYTES,
  EXPRESSION_IMAGE_TOO_LARGE_ERROR,
  EXPRESSION_IMAGE_FORMAT_ERROR,
  EXPRESSION_NAME_MAX,
  EXPRESSION_NAME_MIN,
  EXPRESSION_NAME_PATTERN,
  EXPRESSION_NAME_ERROR,
  expressionNameValid,
  expressionImageOk,
  loadExpressionKind,
} from "../public/js/expression-manage.js";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const MODULE = readFileSync(path.join(ROOT, "public/js/expression-manage.js"), "utf8");
const APP = readFileSync(path.join(ROOT, "public/js/routes/app.js"), "utf8");
const EMOJI_API = readFileSync(path.join(ROOT, "api/emoji.mjs"), "utf8");

test("the name grammar is the emoji lane's grammar, the same mirror the soundboard spells", () => {
  assert.equal(EXPRESSION_NAME_MIN, GC_EMOJI_NAME_MIN);
  assert.equal(EXPRESSION_NAME_MAX, GC_EMOJI_NAME_MAX);
  assert.equal(EXPRESSION_NAME_PATTERN.source, GC_EMOJI_NAME_PATTERN.source);
  assert.ok(expressionNameValid("cat"));
  assert.ok(!expressionNameValid("x"));
  assert.ok(!expressionNameValid("has space"));
  assert.ok(!expressionNameValid(null));
  assert.equal(EXPRESSION_NAME_ERROR,
    "Use a " + GC_EMOJI_NAME_MIN + "-" + GC_EMOJI_NAME_MAX +
    " character name of letters, numbers and underscores.",
    "the honest pre-error is the server's own copy");
});

test("the image pre-check: the four formats, the 20 MiB cap riding the backend constant", () => {
  assert.equal(EXPRESSION_IMAGE_MAX_BYTES, MAX_ATTACHMENT_BYTES, "the intake cap, never a re-spoken number");
  assert.equal(EXPRESSION_IMAGE_TOO_LARGE_ERROR, "Images must be 20 MiB or smaller.",
    "the server's own refusal copy (tooLargeError over the same cap)");
  assert.equal(EXPRESSION_IMAGE_FORMAT_ERROR, "Only JPEG, PNG, WebP, and GIF images can be attached.");
  const bytes = new Uint8Array(16);
  assert.ok(expressionImageOk(new File([bytes], "a.png", { type: "image/png" })));
  assert.ok(expressionImageOk(new File([bytes], "a.webp", { type: "image/webp" })));
  assert.ok(expressionImageOk(new File([bytes], "a.gif", { type: "image/gif" })));
  assert.ok(expressionImageOk(new File([bytes], "a.jpg", { type: "image/jpeg" })));
  assert.ok(expressionImageOk(new File([bytes], "a.jpg")), "the type-less OS pick by extension");
  assert.ok(!expressionImageOk(new File([bytes], "a.bmp", { type: "image/bmp" })), "not an intake shape");
  assert.ok(!expressionImageOk(new File([bytes], "a.mp3", { type: "audio/mpeg" })));
  const tooBig = new File([bytes], "a.png", { type: "image/png", lastModified: 0 });
  Object.defineProperty(tooBig, "size", { value: EXPRESSION_IMAGE_MAX_BYTES + 1 });
  assert.ok(!expressionImageOk(tooBig), "one byte over refuses");
  const atcap = new File([bytes], "a.png", { type: "image/png", lastModified: 0 });
  Object.defineProperty(atcap, "size", { value: EXPRESSION_IMAGE_MAX_BYTES });
  assert.ok(expressionImageOk(atcap), "the cap's own byte is admitted");
});

test("the routes ride the KIND words, both per-kind payloads", () => {
  assert.match(MODULE, /"\/api\/servers\/" \+ Number\(serverId\) \+ "\/" \+ kind/);
  assert.match(MODULE, /payload\?\.\[kind\]/, "the row array is the payload's own, never assumed");
  const word = /emojis: "emoji", stickers: "sticker"/.test(MODULE) || MODULE.includes('emojis: "emoji"');
  assert.ok(word, "the KIND words stay the route words");
  // The create is the multipart intake: name + image, exactly the field the route reads.
  assert.match(MODULE, /data\.append\("image", picked, picked\.name \|\| "image\.png"\)/);
  assert.match(MODULE, /data\.append\("name", name\)/);
  const rename = MODULE.slice(MODULE.indexOf("export function openExpressionRenameDialog"));
  assert.match(rename, /method: "PATCH"/);
  assert.match(rename, /body: \{ name \}/);
  const remove = MODULE.slice(MODULE.indexOf("export function openExpressionDeleteDialog"));
  assert.match(remove, /method: "DELETE"/);
});

test("the cap discipline: no slot numbers displayed, none invented, the server copy surfaces", () => {
  for (const slot of [5, 15, 30, 60, 100, 150, 250]) {
    const bare = new RegExp("^\\s*" + slot + "[,;)?]|[ (]" + slot + "(?![0-9])", "m");
    assert.ok(!bare.test(MODULE), "no invented slot arithmetic: " + slot);
  }
  assert.ok(!/caps|slot/i.test(MODULE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")),
    "the module body carries no cap arithmetic");
  assert.match(MODULE, /caught\?\.message \|\| "The expression could not be saved\. Please try again\."/,
    "the server's own over-slot/409/grammar copies surface verbatim");
  // The empty copy per kind.
  assert.match(MODULE, /"This server has no emoji yet\."/);
  assert.match(MODULE, /"This server has no stickers yet\."/);
});

test("the CSP-safe DOM and the one-dialog idiom", () => {
  assert.ok(!/innerHTML/.test(MODULE));
  assert.match(MODULE, /import \{ el \} from "\.\/dom\.js";/);
  assert.match(MODULE, /import \{ api \} from "\.\/api\.js";/);
  assert.match(MODULE, /import \{ iconButton \} from "\.\/icons\.js";/);
  assert.match(MODULE, /"Manage expressions"/);
});

test("the app.js integration: the gated entry inside the picker's footer, the cache sync riding onMutated", () => {
  assert.match(APP, /import \{ openExpressionManageDialog \} from "\.\.\/expression-manage\.js";/);
  assert.match(APP, /function openExpressionPicker\(doc, win, serverId, textarea, canManage = false\)/);
  const picker = APP.slice(
    APP.indexOf('const dialog = el("dialog", { class: "gc-dialog expression-picker" })'),
    APP.indexOf("function openExpressionManageFromPicker"),
  );
  assert.match(picker, /if \(canManage\) \{/, "the door waits inside the gate");
  assert.match(picker, /class: "button button-quiet expression-manage-entry", type: "button", text: "Manage"/);
  assert.match(picker, /dialog\.close\(\);\n      openExpressionManageFromPicker\(doc, win, serverId\);/,
    "the picker closes first - the manage surface owns the interaction");
  const sync = APP.slice(APP.indexOf("function openExpressionManageFromPicker"), APP.indexOf("function openExpressionManageFromPicker") + 900);
  assert.match(sync, /rememberExpressions\(serverId, \{/, "the single cache write point answers the mutation");
  assert.match(sync, /openExpressionManageDialog\(doc, win, serverId, sync\)/, "the sync rides as onMutated");
  assert.match(MODULE, /typeof onMutated === "function"/, "the module notifies the caller after each write");
  // The composer passes the SAME gate the soundboard's manage side rides.
  assert.match(APP, /void openExpressionPicker\(doc, win, pickerServerId, textarea, canManageSounds\)/);
});

test("the grammar mirror files each carry their own copy, pinned to the same source", () => {
  const soundboard = readFileSync(path.join(ROOT, "public/js/soundboard.js"), "utf8");
  const here = MODULE.match(/EXPRESSION_NAME_PATTERN = (\/\^.*?\/);/);
  const there = soundboard.match(/SOUND_NAME_PATTERN = (\/\^.*?\/);/);
  assert.ok(here && there, "both spellings parse as regex literals");
  assert.equal(here[1], there[1], "one grammar, two module constants, identical sources");
  // And the constants file's own column binding stays in force.
  assert.ok(statSync(path.join(ROOT, "constants.mjs")).isFile());
});

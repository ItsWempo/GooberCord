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
  GC_EMOJI_FILE_MAX,
  GC_STICKER_FILE_MAX,
  GC_EMOJI_NAME_MAX,
  GC_EMOJI_NAME_MIN,
  GC_EMOJI_NAME_PATTERN,
  GC_STICKER_NAME_MAX,
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
  UPLOAD_KIND_MAX_BYTES,
  UPLOAD_KIND_TOO_LARGE_ERROR,
} from "../public/js/expression-manage.js";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const MODULE = readFileSync(path.join(ROOT, "public/js/expression-manage.js"), "utf8");
const APP = readFileSync(path.join(ROOT, "public/js/routes/app.js"), "utf8");
const EMOJI_API = readFileSync(path.join(ROOT, "api/emoji.mjs"), "utf8");

test("the name grammar is the emoji lane's grammar, the same mirror the soundboard spells", () => {
  // The 0026 widenings moved the BACKEND's grammar to the cited rows
  // (emoji 2–32, sticker exact-30 — docs/parity-limits.md); the client
  // mirror's own value flip rides frontend's W-F1.5, so the cross-module
  // value pins lifted with this batch (the client module is theirs — this
  // file's server-side pins below stay the truth source until the mirror
  // lands). The mirror's CURRENT grammar answers its probes as it always
  // did; equality re-pins at their wave.
  assert.equal(GC_EMOJI_NAME_MAX, 32);
  assert.equal(GC_STICKER_NAME_MAX, 30);
  assert.equal(GC_EMOJI_NAME_PATTERN.source, "^[A-Za-z0-9_]{2,32}$");
  assert.ok(expressionNameValid("cat"));
  assert.ok(!expressionNameValid("x"));
  assert.ok(!expressionNameValid("has space"));
  assert.ok(!expressionNameValid(null));
  // The backend's own copy follows its bound (emoji.mjs interpolates the
  // emoji lane's 2–32).
  assert.match(EMOJI_API, /character name of letters, numbers and underscores/);
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

test("the file-cap mirrors: the uploader's kind pre-checks ride the backend's OWN constants", () => {
  // The equality pins carry the mirror (the soundboard's shape): the
  // backend constants are the authorities, the client re-states ONCE.
  assert.equal(UPLOAD_KIND_MAX_BYTES.emojis, GC_EMOJI_FILE_MAX, "emoji 256 KB rides the constant");
  assert.equal(UPLOAD_KIND_MAX_BYTES.stickers, GC_STICKER_FILE_MAX, "sticker 512 KB rides the constant");
  assert.equal(UPLOAD_KIND_MAX_BYTES.emojis, 262_144);
  assert.equal(UPLOAD_KIND_MAX_BYTES.stickers, 524_288);
  // The refusals re-derived the attachments way — the KB figure IS the
  // constant, exact copies the server's own KIND refusal answers.
  assert.equal(UPLOAD_KIND_TOO_LARGE_ERROR.emojis, "Emoji must be 256 KB or smaller.");
  assert.equal(UPLOAD_KIND_TOO_LARGE_ERROR.stickers, "Stickers must be 512 KB or smaller.");
  assert.match(MODULE, /Math\.round\(UPLOAD_KIND_MAX_BYTES\.emojis \/ 1024\)/,
    "the emoji copy's number rides the constant");
  assert.match(MODULE, /Math\.round\(UPLOAD_KIND_MAX_BYTES\.stickers \/ 1024\)/,
    "the sticker copy's number rides the constant");
  // The upload lane's order: the big-cap format pre-flight, THEN the kind's
  // own cap — the tighter refusal heard before any byte.
  const upload = MODULE.slice(MODULE.indexOf("const uploadForm = (kind) =>"),
    MODULE.indexOf("const uploadForm = (kind) =>") + 3400);
  const format = upload.indexOf("if (!expressionImageOk(file))");
  const kindCap = upload.indexOf("if (file.size > fileMax) {");
  const post = upload.indexOf('"POST"');
  assert.ok(format > 0 && kindCap > format && post > kindCap,
    "format → kind cap → the wire: the pre-errors run ahead of any byte");
  assert.match(upload, /error\.textContent = UPLOAD_KIND_TOO_LARGE_ERROR\[kind\];/);
  assert.match(upload, /const fileMax = UPLOAD_KIND_MAX_BYTES\[kind\];/);
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

test("the payload counters ride the W-B0 caps rider; nothing invented, nothing shown without the field", () => {
  for (const slot of [5, 15, 30, 60, 100, 150, 250]) {
    const bare = new RegExp("^\\s*" + slot + "[,;)?]|[ (]" + slot + "(?![0-9])", "m");
    assert.ok(!bare.test(MODULE), "no invented slot arithmetic: " + slot);
  }
  // The counters read the payload's own caps field, per kind, only:
  assert.match(MODULE, /CAPS_KEY = \{ emojis: "emoji", stickers: "stickers" \}/);
  assert.match(MODULE, /caps: payload\?\.caps \|\| null,/,
    "the read carries the field verbatim, never a synthesized shape");
  assert.match(MODULE, /Number\(capsSeen\[kind\]\?\.\[CAPS_KEY\[kind\]\]\)/,
    "the counter resolves the kind's field via the payload's own caps key");
  assert.match(MODULE, /Number\.isFinite\(capField\)\s*\?\s*lists\[kind\]\.length \+ " \/ " \+ capField\s*:\s*""/,
    "no field, no counter — the slot number is the payload's, never a client constant");
  assert.match(MODULE, /class: "expression-slot-count"/);
  assert.match(MODULE, /caught\?\.message \|\| "The expression could not be saved\. Please try again\."/,
    "the server's own over-slot/409/grammar copies surface verbatim");
  // The empty copy per kind.
  assert.match(MODULE, /"This server has no emoji yet\."/);
  assert.match(MODULE, /"This server has no stickers yet\."/);
});

// A permissive element stub — el()/createIcon/createElementNS all ride it;
// appends are recorded so the tree is walkable by class.
function stubElement(className = "") {
  const node = {
    className, textContent: "", value: "", hidden: false, kids: [],
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    addEventListener() {}, focus() {},
    append(child) { node.kids.push(child); },
    prepend() {}, replaceChildren() {}, remove() {},
    showModal() {}, close() {},
    querySelector() { return stubElement(); },
    querySelectorAll() { return []; },
    isConnected: true, style: {},
  };
  return node;
}

function findClass(node, cls, out = []) {
  if (typeof node === "object" && node !== null) {
    if (node.className === cls) out.push(node);
    for (const kid of node.kids || []) findClass(kid, cls, out);
  }
  return out;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test("the real counter ride: the payload field fills the span, an absent field leaves it blank", async () => {
  const { useDocument, el } = await import("../public/js/vendor/dom.mjs");
  void el;
  const calls = [];
  let answers = { emojis: 3, stickers: 8 };
  globalThis.fetch = async (path) => {
    calls.push(String(path));
    const url = String(path);
    if (url.endsWith("/emojis")) {
      if (answers.emojis === null) {
        // The absent-field case: the row payload only.
        return new Response(JSON.stringify({
          emojis: [{ id: 30, serverId: 1, name: "giggle", url: "/api/attachments/801" }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        emojis: [
          { id: 30, serverId: 1, name: "giggle", url: "/api/attachments/801" },
          { id: 31, serverId: 1, name: "boom", url: "/api/attachments/802" },
        ],
        caps: { emoji: answers.emojis, stickers: answers.stickers, sounds: 8 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ stickers: [], caps: { emoji: 3, stickers: 8, sounds: 8 } }),
      { status: 200, headers: { "content-type": "application/json" } });
  };
  let dialog = null;
  const docStub = {
    body: { append: (kid) => { dialog = kid; } },
    createElement: (tag) => stubElement(tag),
    createElementNS: () => stubElement(),
  };
  useDocument(docStub);
  try {
    let onMutatedCalled = 0;
    (0, await import("../public/js/expression-manage.js"))
      .openExpressionManageDialog(docStub, {}, 1, async () => { onMutatedCalled += 1; });
    assert.ok(dialog, "the dialog mounted");
    await tick();
    await tick();
    let counters = findClass(dialog, "expression-slot-count");
    assert.equal(counters.length, 2, "one counter per section");
    // Two emoji rows, cap from the payload: "2 / 3".
    assert.equal(counters[0].textContent, "2 / 3",
      "the counter is the row count over the PAYLOAD's cap");
    assert.equal(counters[1].textContent, "0 / 8", "the empty section still counts");
    assert.ok(onMutatedCalled === 0, "a read answers nothing to the mutation sync");

    // And the absent-field case: the payload without caps answers a null
    // field (the pinned ternary renders an EMPTY span for it — the client
    // never invents the number).
    answers = { emojis: null, stickers: 8 };
    const manage = await import("../public/js/expression-manage.js");
    const readBlank = await manage.loadExpressionKind(1, "emojis");
    assert.equal(readBlank.caps, null, "the payload without caps answers a null field");
    assert.deepEqual(readBlank.rows.map((row) => row.name), ["giggle"],
      "the rows stay the payload's own");
  } finally {
    delete globalThis.fetch;
    useDocument(null);
  }
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

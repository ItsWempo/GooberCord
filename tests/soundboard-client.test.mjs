// The soundboard's client half (0023's wave): the board dialog, the
// click-to-play one-at-a-time rule, and the management side riding the
// emoji editor's right. This file pins the name grammar against the
// backend's own constants, the intake's hones pre-checks, the player
// discipline on a stubbed Audio, the multipart contract, and the app.js
// gating (the button membership-only, the manage gate the tier/bit mirror).
// NOTE the live 0aa85d9 contract: EVERY server has the board — the base
// slots are 8 (Discord-real) and the blessings 24/36/48 ride the resolver —
// so the client carries NO boost-refusal state and no slot arithmetic.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  GC_EMOJI_NAME_MAX,
  GC_EMOJI_NAME_MIN,
  GC_EMOJI_NAME_PATTERN,
  GC_SOUNDBOARD_MAX_PER_SERVER,
  GC_SOUNDBOARD_SOUND_MAX_BYTES,
} from "../constants.mjs";

import {
  SOUND_MAX_BYTES,
  SOUND_NAME_MAX,
  SOUND_NAME_MIN,
  SOUND_NAME_PATTERN,
  SOUND_NAME_ERROR,
  SOUND_TOO_LARGE_ERROR,
  SOUND_FORMAT_ERROR,
  SOUND_PLAY_ERROR,
  soundNameValid,
  soundFileOk,
  createSoundForm,
  playSound,
  currentSoundUrl,
  stopPlayingSound,
  loadSounds,
} from "../public/js/soundboard.js";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const MODULE = readFileSync(path.join(ROOT, "public/js/soundboard.js"), "utf8");
const APP = readFileSync(path.join(ROOT, "public/js/routes/app.js"), "utf8");

test("the name grammar is the emoji lane's grammar, spelled once by the backend", () => {
  assert.equal(SOUND_NAME_MIN, GC_EMOJI_NAME_MIN);
  assert.equal(SOUND_NAME_MAX, GC_EMOJI_NAME_MAX);
  assert.equal(SOUND_NAME_PATTERN.source, GC_EMOJI_NAME_PATTERN.source,
    "the same pattern source — a mirror, not a re-spelling");
  for (const good of ["cat", "ab", "1_6C", "a".repeat(16)]) {
    assert.ok(soundNameValid(good), "admits " + good);
    assert.ok(GC_EMOJI_NAME_PATTERN.test(good), "and so does the backend check");
  }
  for (const bad of ["x", "a".repeat(17), "has space", "has-dash", "has.dot", "日本語", ""]) {
    assert.ok(!soundNameValid(bad), "refuses " + JSON.stringify(bad));
    assert.ok(!GC_EMOJI_NAME_PATTERN.test(bad), "and so does the backend check");
  }
  for (const junk of [null, undefined, 42]) {
    assert.ok(!soundNameValid(junk), "non-strings refuse — the backend's own typeof check is theirs");
  }
  assert.equal(SOUND_NAME_ERROR,
    "Use a " + GC_EMOJI_NAME_MIN + "-" + GC_EMOJI_NAME_MAX +
    " character name of letters, numbers and underscores.",
    "the honest pre-error is the server's own copy");
});

test("the intake pre-check: 512 KiB bytes, MP3 and OGG only, the copies verbatim", () => {
  assert.equal(SOUND_MAX_BYTES, GC_SOUNDBOARD_SOUND_MAX_BYTES, "the cap rides the backend constant");
  assert.equal(SOUND_MAX_BYTES, 524_288);
  assert.equal(SOUND_TOO_LARGE_ERROR, "Sounds must be 512 KB or smaller.");
  assert.equal(SOUND_FORMAT_ERROR, "Only MP3 and OGG sounds are accepted.");
  const bytes = new Uint8Array(16).fill(1);
  const file = (name, type, size = 16) => new File([bytes.slice(0, Math.max(1, size % 17))], name,
    size > 0 ? { type } : { type, lastModified: 0 });
  assert.ok(soundFileOk(new File([bytes], "beat.mp3", { type: "audio/mpeg" })), "mpeg by type");
  assert.ok(soundFileOk(new File([bytes], "beat.ogg", { type: "audio/ogg" })), "ogg by type");
  assert.ok(soundFileOk(new File([bytes], "beat.mp3", { type: "" })), "the type-less OS pick by extension");
  assert.ok(soundFileOk(new File([bytes], "beat.OGA", { type: "" })), "the oga twin, case-free");
  assert.ok(!soundFileOk(new File([bytes], "beat.wav", { type: "audio/wav" })),
    "the sniff's readable formats are NOT intake shapes");
  const big = new File([new Uint8Array(1024)], "beat.mp3", { type: "audio/mpeg", lastModified: 0 });
  Object.defineProperty(big, "size", { value: SOUND_MAX_BYTES + 1 });
  assert.ok(!soundFileOk(big), "one byte over the cap refuses");
  const cap = new File([new Uint8Array(1024)], "beat.mp3", { type: "audio/mpeg", lastModified: 0 });
  Object.defineProperty(cap, "size", { value: SOUND_MAX_BYTES });
  assert.ok(soundFileOk(cap), "the cap's own byte is admitted");
});

test("the multipart contract: the sound field rides the file, the name rides beside it", () => {
  const file = new File([new Uint8Array(8)], "beat.mp3", { type: "audio/mpeg" });
  const form = createSoundForm({ name: "beat" }, file);
  assert.ok(form instanceof FormData);
  assert.equal(form.get("name"), "beat");
  const carried = form.get("sound");
  assert.ok(carried instanceof File, "the sound field carries a file");
  assert.equal(carried.name, "beat.mp3", "the same bytes under the same name");
});

// A stubbed Audio: play/pause recorded, addEventListener a record too, ended events manual.
function fakeWindow() {
  const events = [];
  class FakeAudio {
    constructor(url) {
      this.url = url;
      this.paused = true;
      FakeAudio.created.push(this);
    }
    addEventListener(name) {
      FakeAudio.events.push(["listen", this.url, name]);
    }
    play() {
      this.paused = false;
      FakeAudio.events.push(["play", this.url]);
    }
    pause() {
      this.paused = true;
      FakeAudio.events.push(["pause", this.url]);
    }
  }
  FakeAudio.created = [];
  FakeAudio.events = events;
  return { Audio: FakeAudio };
}

test("the one-player rule: another click stops the playing tile, the same click toggles off", () => {
  const win = fakeWindow();
  stopPlayingSound();
  assert.equal(currentSoundUrl(), null, "a fresh page has no player");

  assert.equal(playSound(win, "/api/attachments/1"), "on");
  assert.equal(currentSoundUrl(), "/api/attachments/1");
  const first = win.Audio.created[0];
  assert.ok(!first.paused, "it plays — never auto (the click made it)");

  assert.equal(playSound(win, "/api/attachments/2"), "on");
  assert.ok(win.Audio.events.some((entry) => entry[0] === "pause" && entry[1] === "/api/attachments/1"),
    "the previous tile stops with the new click — one at a time");
  assert.equal(currentSoundUrl(), "/api/attachments/2");

  assert.equal(playSound(win, "/api/attachments/2"), "off");
  assert.equal(currentSoundUrl(), null, "the same click is the toggle-off");
});

test("the read rides the payload's own shape: GET the board, rows as the payload carries", () => {
  assert.match(MODULE, /"\/api\/servers\/" \+ Number\(serverId\) \+ "\/sounds"/);
  assert.match(MODULE, /rows: Array\.isArray\(payload\?\.sounds\) \? payload\.sounds : \[\],/,
    "the array is the payload's, never assumed");
  // The caps rider (W-B0): the counter reads the payload's own field.
  assert.match(MODULE, /caps: payload\?\.caps \|\| null,/);
  assert.match(MODULE, /class: "soundboard-slot-count"/);
  assert.match(MODULE,
    /const capField = Number\(capsPayload\?\.sounds\);\s*\n\s*counter\.textContent = Number\.isFinite\(capField\)\s*\n\s*\? rows\.length \+ " \/ " \+ capField\s*\n\s*: "";/,
    "no field, no counter — the slot number is the payload's, never a client constant");
});

test("the dialog: manage side gated, mutations rerender, copies surface verbatim", () => {
  assert.match(MODULE, /export function openSoundboardDialog\(doc, win, serverId, canManageSounds = false\)/);
  assert.match(MODULE, /if \(canManageSounds\) \{/, "pen and trash wait inside the gate");
  const rename = MODULE.slice(MODULE.indexOf("export function openRenameDialog"));
  assert.match(rename, /method: "PATCH"/);
  assert.match(rename, /body: \{ name \}/);
  const remove = MODULE.slice(MODULE.indexOf("export function openDeleteDialog"));
  assert.match(remove, /method: "DELETE"/);
  assert.match(MODULE, /caught\?\.message \|\| "The sound could not be saved\. Please try again\."/);
  assert.match(MODULE, /click a sound to play it — one at a time\./i, "the play note says the rule");
  // CSP-safe DOM + the stop on close.
  assert.ok(!/innerHTML/.test(MODULE));
  assert.match(MODULE, /stopPlayingSound\(\);\n    dialog\.remove\(\);/);
});

test("the live contract: every server has the board, slots riding the resolver — the client carries NO boost state", () => {
  // GC_SOUNDBOARD_MAX_PER_SERVER's base is 8, EVERY server's board reads
  // (membership-only); the over-slot refusal belongs to the server's
  // create copy, never a client key.
  assert.equal(GC_SOUNDBOARD_MAX_PER_SERVER, 8);
  assert.ok(!/needs boosts|This server has \d/.test(MODULE),
    "the client carries no slot arithmetic and no boost-refusal copy");
});

test("the composer integration: membership-only button, the manage gate the mirror", () => {
  assert.match(APP, /import \{ openSoundboardDialog \} from "\.\.\/soundboard\.js";/);
  const cluster = APP.slice(
    APP.indexOf("let soundboardButton = null;"),
    APP.indexOf("if (soundboardButton) box.append(soundboardButton);") + 50,
  );
  assert.match(cluster, /if \(pickerServerId\) \{/, "every member reads the board");
  assert.match(cluster, /= iconButton\(doc, "speaker", \{[\s\S]*?ariaLabel: "Open the soundboard"/);
  assert.match(cluster, /void openSoundboardDialog\(doc, win, pickerServerId, canManageSounds\)/);
  // The gate: the same two-step mirror (tier OR the merged bit), DM composes false.
  const gate = APP.slice(
    APP.indexOf("// The soundboard's manage gate (0023)"),
    APP.indexOf("const composerSlowmode ="),
  );
  assert.match(gate, /viewerCan\(composerViewer, "MANAGE_EMOJI"\)/);
  assert.match(gate, /composerContext\.server\.role === "owner"/);
  assert.match(gate, /composerContext\.server\.role === "moderator"/);
  assert.match(gate, /!composerContext\.server\.role/,
    "the admit-if-unknown arm: an unloaded roster never warns falsely");
  assert.match(gate, /the server's 403 stays the authority/,
    "the gate admits; the server's refusal on action is the real verdict");
  // Every manage action's catch surfaces the server's own copy into a
  // role=alert strip — the 403 is heard, never silently swallowed.
  assert.match(MODULE, /role: "alert"/);
  assert.match(MODULE, /caught\?\.message \|\| "The sound could not be saved\. Please try again\."/);
  assert.match(gate, /: false;/, "no server, no board");
  assert.match(APP, /canMentionEveryone = true, canManageSounds = false\)/, "the 8th param rides the signature");
});

test("a refused play is never a silent unhandled rejection: the tile speaks", async () => {
  // A stubbed Audio whose play() rejects (the pending/moderated row's
  // bytes serve 403/404, never audio).
  const win = {
    Audio: class {
      play() { return Promise.reject(new Error("403")); }
      pause() {}
      addEventListener() {}
    },
  };
  stopPlayingSound();
  let reported = 0;
  assert.equal(playSound(win, "/api/attachments/1", () => { reported += 1; }), "on",
    "the click is accepted before the bytes answer");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(reported, 1, "the refusal reports exactly once through onPlayError");
  assert.equal(currentSoundUrl(), null, "the one-player state clears with the refusal");
  stopPlayingSound();

  // A stale catch can never clear a NEWER player's tile: another sound's
  // play started after the refused one keeps its state.
  const winLate = {
    Audio: class {
      constructor(url) { this.url = url; }
      play() {
        return new Promise((resolve) => setTimeout(resolve, 10));
      }
      pause() {}
      addEventListener() {}
    },
  };
  playSound(winLate, "/api/attachments/1");
  playSound(winLate, "/api/attachments/2");
  assert.equal(currentSoundUrl(), "/api/attachments/2",
    "the late player holds the one-player state");
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(currentSoundUrl(), "/api/attachments/2",
    "the refused earlier catch never clears the later tile");
  stopPlayingSound();
});

test("the tile-side error state: the class rides the row, the copy rides the strip, the dead dataset is gone", async () => {
  const soundboard = MODULE;
  assert.ok(!soundboard.includes("soundUrl: String(sound.url"),
    "the dead dataset soundUrl never reappears — the click closure carries the url");
  assert.match(soundboard, /playSound\(win, String\(sound\.url\), \(\) => \{/,
    "the row's play passes the error callback");
  assert.match(soundboard, /classList\.add\("sound-play-error"\)/);
  assert.match(soundboard, /error\.textContent = SOUND_PLAY_ERROR/);
  assert.equal(SOUND_PLAY_ERROR, "That sound could not be played.");
  // The refusal state clears with a new try, beside the one-player loop.
  assert.match(soundboard,
    /querySelectorAll\(\s*"\.sound-row\.sound-playing, \.sound-row\.sound-play-error"\s*\)/);
  // CSS: the tile-side state rides tokens (both skins merge --error-soft).
  const css = readFileSync(path.join(ROOT, "public/styles.css"), "utf8");
  assert.match(css, /\.sound-row\.sound-play-error \{ background: var\(--error-soft\); \}/);
});

// A permissive element stub (the counter ride needs a walkable tree, the
// way the vendored el() builds them).
function stubElement(tagName = "") {
  return {
    tagName, className: "", textContent: "", value: "", hidden: false, kids: [],
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    addEventListener() {},
    append(child) { this.kids.push(child); },
    prepend() {}, replaceChildren() {}, remove() {},
    showModal() {}, close() {},
    querySelector() { return stubElement(); },
    querySelectorAll() { return []; },
    isConnected: true, style: {},
  };
}

const findClass = (node, cls, out = []) => {
  if (typeof node === "object" && node !== null) {
    if (node.className === cls) out.push(node);
    for (const kid of node.kids || []) findClass(kid, cls, out);
  }
  return out;
};

test("the board's counter ride: the payload's caps field fills it, an absent field leaves it blank", async () => {
  const { useDocument } = await import("../public/js/vendor/dom.mjs");
  let dialog = null;
  const docStub = {
    body: { append: (kid) => { dialog = kid; } },
    createElement: (tag) => stubElement(tag),
    createElementNS: () => stubElement(),
  };
  const sounds = [
    { id: 10, serverId: 1, name: "boop", url: "/api/attachments/701" },
    { id: 11, serverId: 1, name: "yay", url: "/api/attachments/702" },
    { id: 12, serverId: 1, name: "womp", url: "/api/attachments/703" },
  ];
  globalThis.fetch = async () => new Response(JSON.stringify({
    sounds,
    caps: { emoji: 50, stickers: 15, sounds: 24 },
  }), { status: 200, headers: { "content-type": "application/json" } });
  useDocument(docStub);
  try {
    const { openSoundboardDialog, loadSounds } = await import("../public/js/soundboard.js");
    openSoundboardDialog(docStub, { Audio: class {} }, 1, false);
    assert.ok(dialog, "the dialog mounted");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const counter = findClass(dialog, "soundboard-slot-count").pop();
    assert.ok(counter, "the board carries its slot counter");
    assert.equal(counter.textContent, "3 / 24",
      "the row count over the PAYLOAD's own sounds cap");
    // And the read itself is the payload: rows + the caps field verbatim.
    const read = await loadSounds(1);
    assert.equal(read.rows.length, 3);
    assert.deepEqual(read.caps, { emoji: 50, stickers: 15, sounds: 24 });
  } finally {
    delete globalThis.fetch;
    useDocument(null);
  }
});

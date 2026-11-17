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
  assert.match(MODULE, /payload\?\.sounds/, "the array is the payload's, never assumed");
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
  assert.match(gate, /: false;/, "no server, no board");
  assert.match(APP, /canMentionEveryone = true, canManageSounds = false\)/, "the 8th param rides the signature");
});

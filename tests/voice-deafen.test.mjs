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

// The deafen gate (the parked B4 item): voice.js gains the incoming-audio
// gate under the headphones toggle — deafen = mic mute PLUS playback
// suppression, and undeafen lands the mic where you left it. node --test
// has no AudioContext/WebCodecs to drive createVoiceSession's join path,
// so the pins are source-text with the same bite the parity pins use: exact
// ordering and guard clauses, never just "the word exists".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const VOICE = readFileSync(path.join(ROOT, "public/js/voice.js"), "utf8");
const APP = readFileSync(path.join(ROOT, "public/js/routes/app.js"), "utf8");

test("the incoming-audio gate sits BEFORE scheduling — a deafened session drops packets", () => {
  const start = VOICE.indexOf("const schedulePlayback");
  const gate = VOICE.indexOf("|| deafened", start);
  const schedule = VOICE.indexOf("context.createBuffer", start);
  assert.ok(start > 0, "schedulePlayback exists");
  assert.ok(gate > start && gate < schedule,
    "the deafened check guards the whole schedule body, ahead of every scheduling call");
  // The gate shares the drop path: the audioData MUST still be closed.
  const guardEnd = VOICE.indexOf("return;", VOICE.indexOf("audioData.close()", gate));
  const guard = VOICE.slice(gate, guardEnd);
  assert.match(guard, /audioData\.close/, "suppressed packets close, never leak");
});

test("deafen rides the mute contract — forced mute in, restored mute out, once per toggle", () => {
  const start = VOICE.indexOf("setDeafened(next) {");
  const block = VOICE.slice(start, VOICE.indexOf("get channelId()", start));
  assert.match(block, /mutedBeforeDeafen = muted;/, "the pre-deafen mic state is kept");
  assert.match(block, /if \(!muted\) this\.setMuted\(true\)/,
    "deafening forces the mic mute (and the voice_mute frame with it) only when needed");
  assert.match(block, /if \(!mutedBeforeDeafen && this\.muted\) this\.setMuted\(false\)/,
    "undeafen unmutes only what the deafen itself muted");
  // Re-deafening while already deafened is a no-op (no duplicate voice_mute).
  assert.match(block, /if \(deafened === want\) return;/);
});

test("the leave path resets the deafen state with the mute", () => {
  const start = VOICE.indexOf("function leave(silent) {");
  assert.ok(start > 0, "leave() exists");
  const leaveBlock = VOICE.slice(start, VOICE.indexOf("if (!silent) onRoster", start));
  assert.match(leaveBlock, /deafened = false;/);
  assert.match(leaveBlock, /mutedBeforeDeafen = false;/);
  // The reset sits WITH the mute reset, after teardownAudio.
  const muteReset = leaveBlock.indexOf("muted = false;");
  const teardown = leaveBlock.indexOf("teardownAudio();");
  assert.ok(teardown !== -1 && muteReset > teardown,
    "the deafen reset rides the post-teardown state clear");
});

test("the mic state key reports deafened ahead of muted", () => {
  const start = VOICE.indexOf("function micStateKey() {");
  const block = VOICE.slice(start, VOICE.indexOf("}", VOICE.indexOf('"live"', start)));
  const deafenedAt = block.indexOf("? \"deafened\"");
  const mutedAt = block.indexOf("? \"muted\"");
  assert.ok(deafenedAt > 0, "the deafened state key exists");
  assert.ok(deafenedAt < mutedAt, "deafened wins over muted (it implies it)");
});

test("both surfaces wire the headphones toggle to that one session state", () => {
  // The footer's control row and the voice pane's actions row share ONE
  // session — each renders its own button, both drive setDeafened.
  const wired = [...APP.matchAll(/voiceSession\?\.setDeafened\(!voiceSession\.deafened\)/g)];
  assert.equal(wired.length, 2, "footer + voice pane deafen toggles both exist");
  assert.match(APP, /user-deafen/);
  assert.match(APP, /voice-deafen/);
  assert.doesNotMatch(APP, /Deafen is a KNOWN GAP/,
    "the parked-gap comment is gone — the gap is closed");
  // The status copy speaks the deafened state.
  assert.match(APP, /case "deafened":/);
});

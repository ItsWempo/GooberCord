// Phase 2 voice: Opus-over-WebSocket relay in the room's own ChatRoom DO, plus
// the PresenceHub voice markers. Same fake conventions as rooms-relay.test.mjs
// (fake ctx + fake sockets; a fake env.PRESENCE records every stub frame the
// DO forwards). The wire format pinned here must match the client codec the
// voice pane relies on (public/js/voice.js) — decodeVoiceFrame/encodeVoiceFrame
// round-trip it on both ends.
import test from "node:test";
import assert from "node:assert/strict";

import { ChatRoom } from "../api/rooms.mjs";
import { PresenceHub } from "../api/presence.mjs";
import { decodeVoiceFrame, encodeVoiceFrame, rmsLevel, speakingUserIds } from "../public/js/voice.js";
import {
  GC_VOICE_FRAME_VERSION,
  GC_VOICE_MAX_PARTICIPANTS,
} from "../constants.mjs";

const VOICE_CHANNEL_ID = 11;

// --- fake DO context (+ sockets), as in rooms-relay.test.mjs --------------------
function fakeCtx() {
  const accepted = [];
  return {
    accepted,
    acceptWebSocket(ws) {
      accepted.push(ws);
    },
    getWebSockets() {
      return accepted.slice();
    },
    webSocketClosed(ws) {
      const index = accepted.indexOf(ws);
      if (index >= 0) accepted.splice(index, 1);
    },
  };
}

function fakeServerSocket() {
  return {
    sent: [],
    send(frame) {
      this.sent.push(frame);
    },
    serializeAttachment(value) {
      this.attachment = value;
    },
    deserializeAttachment() {
      if (this.attachment === undefined) throw new Error("No socket attachment.");
      return this.attachment;
    },
    close() {
      this.closed = true;
    },
  };
}

// env.PRESENCE records every stub frame; the snapshot reply is irrelevant to
// the relay (forwardToPresence only reads it in the heartbeat path).
function fakePresence() {
  const frames = [];
  return {
    frames,
    idFromName(name) {
      return { name };
    },
    get() {
      return {
        fetch: async (request) => {
          frames.push(JSON.parse(await request.text()));
          return { ok: true, json: async () => ({ type: "presence", online: [] }) };
        },
      };
    },
  };
}

function makeRoom(env = {}) {
  const ctx = fakeCtx();
  return { room: new ChatRoom(ctx, env), ctx, env };
}

async function connect(room, ctx, { userId, username, channelKind = "voice" }) {
  const request = new Request(
    `https://chat.internal/api/ws?channel=${VOICE_CHANNEL_ID}&userId=${userId}` +
      `&username=${encodeURIComponent(username)}&channelKind=${channelKind}`,
    { headers: { Upgrade: "websocket" } },
  );
  const response = await room.fetch(request);
  assert.equal(response.status, 101);
  const socket = ctx.accepted[ctx.accepted.length - 1];
  socket.meta = { userId, username, channelKind, channelId: VOICE_CHANNEL_ID };
  return socket;
}

function sentFrames(socket) {
  return socket.sent
    .filter((frame) => typeof frame === "string")
    .map((frame) => JSON.parse(frame));
}

function sentBinaries(socket) {
  return socket.sent
    .filter((frame) => typeof frame !== "string")
    .map((frame) => new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength));
}

function clearFrames(socket) {
  socket.sent.length = 0;
}

// The DO forwards a "connect" hub frame AND a text "roster" broadcast for
// every socket upgrade (phase 1 behavior, untouched by voice) — tests below
// pin the voice-specific traffic only.
function voiceFrames(presence) {
  return presence.frames.filter((frame) => frame.type === "voice" || frame.type === "voice_leave");
}

function opusPacket(marker) {
  return new Uint8Array([0x01, marker, marker + 1, marker + 2]);
}

async function joinVoice(room, socket) {
  await room.webSocketMessage(socket, JSON.stringify({ type: "voice_join" }));
}

// --- ChatRoom: voice control frames --------------------------------------------

test("voice_join on a voice channel joins, broadcasts the roster to everyone, and forwards the hub marker", async () => {
  const presence = fakePresence();
  const { room, ctx } = makeRoom({ PRESENCE: presence });
  const alice = await connect(room, ctx, { userId: 1, username: "alice" });
  const bob = await connect(room, ctx, { userId: 2, username: "bob" });
  clearFrames(alice);
  clearFrames(bob);

  await joinVoice(room, alice);

  // Everyone gets the roster (the joiner included — it learns who to expect).
  const roster = { type: "voice_roster", participants: [{ userId: 1, username: "alice", muted: false }] };
  assert.deepEqual(sentFrames(alice), [roster]);
  assert.deepEqual(sentFrames(bob), [roster]);
  // The hub marker names the channel, so the sidebar can list participants.
  assert.deepEqual(voiceFrames(presence), [
    { type: "voice", userId: 1, username: "alice", channelId: VOICE_CHANNEL_ID },
  ]);
  // The voice flag persists in the attachment (hibernation-safe by contract).
  const attachment = JSON.parse(alice.deserializeAttachment());
  assert.equal(attachment.voice, true);
  assert.equal(attachment.voiceMuted, false);
});

test("voice_join on a text or DM socket is refused with voice_text_only and leaves the hub alone", async () => {
  const presence = fakePresence();
  const { room, ctx } = makeRoom({ PRESENCE: presence });
  const alice = await connect(room, ctx, { userId: 1, username: "alice", channelKind: "text" });
  clearFrames(alice);

  await joinVoice(room, alice);

  assert.deepEqual(sentFrames(alice), [{ type: "error", code: "voice_text_only" }]);
  assert.deepEqual(voiceFrames(presence), []);
  assert.equal(JSON.parse(alice.deserializeAttachment()).voice, false);
});

test("binary voice frames are tagged with the sender and relayed to voice-joined peers only", async () => {
  const presence = fakePresence();
  const { room, ctx } = makeRoom({ PRESENCE: presence });
  const alice = await connect(room, ctx, { userId: 1, username: "alice" });
  const bob = await connect(room, ctx, { userId: 2, username: "bob" });
  const carol = await connect(room, ctx, { userId: 3, username: "carol", channelKind: "text" });
  await joinVoice(room, alice);
  clearFrames(alice);
  await joinVoice(room, bob);
  clearFrames(alice);
  clearFrames(bob);
  clearFrames(carol);

  room.webSocketMessage(alice, opusPacket(0x40));

  // The sender never hears itself; the non-voice socket hears nothing.
  assert.deepEqual(sentBinaries(alice), []);
  assert.deepEqual(sentBinaries(carol), []);
  // Bob's copy carries Alice's userId as the BE u32 downlink header.
  const relayed = sentBinaries(bob);
  assert.equal(relayed.length, 1);
  assert.deepEqual([...relayed[0]], [
    GC_VOICE_FRAME_VERSION, 0, 0, 0, 1, 0x40, 0x41, 0x42,
  ]);
  // And it decodes on the client's own terms — the codec is a shared contract.
  const decoded = decodeVoiceFrame(relayed[0]);
  assert.deepEqual(decoded, { senderId: 1, packet: opusPacket(0x40).subarray(1) });
  assert.deepEqual(voiceFrames(presence), [
    { type: "voice", userId: 1, username: "alice", channelId: VOICE_CHANNEL_ID },
    { type: "voice", userId: 2, username: "bob", channelId: VOICE_CHANNEL_ID },
  ]);
});

test("binary from a voice KIND channel but a non-joined socket keeps the phase 1 reservation", async () => {
  const { room, ctx } = makeRoom({});
  const alice = await connect(room, ctx, { userId: 1, username: "alice" }); // not joined

  await room.webSocketMessage(alice, opusPacket(0x10));

  assert.deepEqual(sentFrames(alice).at(-1), { type: "error", code: "binary_unsupported" });
});

test("binary on a text channel stays binary_unsupported (the phase 1 pin intact)", async () => {
  const { room, ctx } = makeRoom({});
  const alice = await connect(room, ctx, { userId: 1, username: "alice", channelKind: "text" });

  await room.webSocketMessage(alice, opusPacket(0x10));

  assert.deepEqual(sentFrames(alice).at(-1), { type: "error", code: "binary_unsupported" });
});

test("malformed binary frames get bad_frame and the socket stays connected", async () => {
  const { room, ctx } = makeRoom({});
  const alice = await connect(room, ctx, { userId: 1, username: "alice" });
  await joinVoice(room, alice);
  clearFrames(alice);

  // Wrong version byte.
  await room.webSocketMessage(alice, new Uint8Array([0x07, 9, 9]));
  // Too short to carry a sender tag after the downlink rewrite… but too
  // short for the UPLINK too: a 1-byte payload-less frame.
  await room.webSocketMessage(alice, new Uint8Array([GC_VOICE_FRAME_VERSION]));
  // Oversized: the ceiling exists so one peer can't make the DO fan out
  // arbitrarily large frames.
  await room.webSocketMessage(alice, new Uint8Array(4096 + 16));

  assert.deepEqual(sentFrames(alice), [
    { type: "error", code: "bad_frame" },
    { type: "error", code: "bad_frame" },
    { type: "error", code: "bad_frame" },
  ]);
});

test("voice_mute broadcasts the muted flag; voice_leave releases the seat and clears the marker", async () => {
  const presence = fakePresence();
  const { room, ctx } = makeRoom({ PRESENCE: presence });
  const alice = await connect(room, ctx, { userId: 1, username: "alice" });
  const bob = await connect(room, ctx, { userId: 2, username: "bob" });
  await joinVoice(room, alice);
  await joinVoice(room, bob);
  clearFrames(alice);
  clearFrames(bob);

  await room.webSocketMessage(alice, JSON.stringify({ type: "voice_mute", muted: true }));
  const mutedRoster = {
    type: "voice_roster",
    participants: [
      { userId: 1, username: "alice", muted: true },
      { userId: 2, username: "bob", muted: false },
    ],
  };
  assert.deepEqual(sentFrames(alice), [mutedRoster]);
  assert.deepEqual(sentFrames(bob), [mutedRoster]);

  // A non-boolean mute (and a mute from a non-participant) is a bad frame.
  await room.webSocketMessage(bob, JSON.stringify({ type: "voice_mute", muted: "yes" }));
  assert.deepEqual(sentFrames(bob).at(-1), { type: "error", code: "bad_frame" });

  clearFrames(alice);
  await room.webSocketMessage(alice, JSON.stringify({ type: "voice_leave" }));
  assert.deepEqual(sentFrames(alice), [{
    type: "voice_roster",
    participants: [{ userId: 2, username: "bob", muted: false }],
  }]);
  assert.deepEqual(presence.frames.at(-1), { type: "voice_leave", userId: 1 });

  // A lone voice_leave from a never-joined socket is a silent no-op.
  const dave = await connect(room, ctx, { userId: 4, username: "dave" });
  clearFrames(dave);
  await room.webSocketMessage(dave, JSON.stringify({ type: "voice_leave" }));
  assert.deepEqual(sentFrames(dave), []);
});

test("the free-plan participant cap refuses the 7th joiner with voice_full", async () => {
  const { room, ctx } = makeRoom({ PRESENCE: fakePresence() });
  const sockets = [];
  for (let index = 1; index <= GC_VOICE_MAX_PARTICIPANTS; index++) {
    const socket = await connect(room, ctx, { userId: index, username: "u" + index });
    await joinVoice(room, socket);
    sockets.push(socket);
  }

  const seventh = await connect(room, ctx, { userId: 99, username: "late" });
  clearFrames(seventh);
  await joinVoice(room, seventh);

  assert.deepEqual(sentFrames(seventh), [{ type: "error", code: "voice_full" }]);
  // And it never appears in anyone's roster — the seats are full.
  assert.deepEqual(room.voiceRoster().length, GC_VOICE_MAX_PARTICIPANTS);
  assert.ok(!room.voiceRoster().some((entry) => entry.userId === 99));
});

test("re-joining after leaving reuses the seat and a second voice_join is idempotent", async () => {
  const { room, ctx } = makeRoom({ PRESENCE: fakePresence() });
  const alice = await connect(room, ctx, { userId: 1, username: "alice" });
  await joinVoice(room, alice);
  await joinVoice(room, alice); // duplicate join: no cap error, one roster member
  assert.deepEqual(room.voiceRoster(), [{ userId: 1, username: "alice", muted: false }]);

  await room.webSocketMessage(alice, JSON.stringify({ type: "voice_leave" }));
  assert.deepEqual(room.voiceRoster(), []);
  await joinVoice(room, alice);
  assert.deepEqual(room.voiceRoster(), [{ userId: 1, username: "alice", muted: false }]);
});

test("a dropped voice socket releases its seat: remaining peers get the roster, the hub clears", async () => {
  const presence = fakePresence();
  const { room, ctx } = makeRoom({ PRESENCE: presence });
  const alice = await connect(room, ctx, { userId: 1, username: "alice" });
  const bob = await connect(room, ctx, { userId: 2, username: "bob" });
  await joinVoice(room, alice);
  await joinVoice(room, bob);
  clearFrames(alice);

  ctx.webSocketClosed(bob);
  await room.webSocketClose(bob);

  // The close handler emits the voice roster (for the peers) and the hub
  // marker clear, then the ordinary text roster — pin the voice parts.
  const rosters = sentFrames(alice).filter((frame) => frame.type === "voice_roster");
  assert.deepEqual(rosters.at(-1), {
    type: "voice_roster",
    participants: [{ userId: 1, username: "alice", muted: false }],
  });
  assert.ok(voiceFrames(presence).some((frame) => frame.type === "voice_leave" && frame.userId === 2));
});

// --- PresenceHub voice markers ---------------------------------------------------

async function hubFrame(hub, payload) {
  const response = await hub.fetch(
    new Request("https://presence.internal/hub", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  );
  return response.json();
}

test("the hub marks and clears a voice channel without touching presence itself", async () => {
  const hub = new PresenceHub({ setWebSocketAutoResponse() {} }, {});

  await hubFrame(hub, { type: "heartbeat", userId: 1, username: "alice" });
  const marked = await hubFrame(hub, { type: "voice", userId: 1, username: "alice", channelId: 11 });
  assert.deepEqual(marked.online, [{
    userId: 1,
    username: "alice",
    statusText: null,
    statusUntil: null,
    voiceChannel: 11,
  }]);

  // A malformed channelId marks presence but with no channel (defensive: the
  // DO always sends an integer, but the REST surface keeps its types honest).
  await hubFrame(hub, { type: "voice", userId: 1, username: "alice", channelId: NaN });
  const nanMarked = await hubFrame(hub, { type: "list" });
  assert.equal(nanMarked.online[0].voiceChannel, null);

  // voice_leave clears ONLY the marker — Alice stays online.
  const cleared = await hubFrame(hub, { type: "voice_leave", userId: 1 });
  assert.deepEqual(cleared.online, [{
    userId: 1,
    username: "alice",
    statusText: null,
    statusUntil: null,
    voiceChannel: null,
  }]);
});

test("a voice join for someone the hub has never seen upserts them with the marker", async () => {
  const hub = new PresenceHub({ setWebSocketAutoResponse() {} }, {});
  const marked = await hubFrame(hub, { type: "voice", userId: 5, username: "carol", channelId: 11 });
  assert.deepEqual(marked.online, [{
    userId: 5,
    username: "carol",
    statusText: null,
    statusUntil: null,
    voiceChannel: 11,
  }]);
});

// --- the shared client codec (public/js/voice.js) --------------------------------

test("the client uplink encoder and downlink decoder round-trip the pinned wire format", () => {
  assert.equal(GC_VOICE_FRAME_VERSION, 1);

  const frame = encodeVoiceFrame(new Uint8Array([0x41, 0x42]));
  assert.deepEqual([...new Uint8Array(frame)], [1, 0x41, 0x42]);

  // A receiver refuses other versions, missing sender tags, or non-integer ids.
  assert.equal(decodeVoiceFrame(new Uint8Array([1, 2, 3])), null);
  assert.equal(decodeVoiceFrame(new Uint8Array([2, 0, 0, 0, 1, 9])), null);
  assert.equal(decodeVoiceFrame(new Uint8Array([1, 0, 0, 0, 0, 9])), null);
  assert.deepEqual(
    decodeVoiceFrame(new Uint8Array([1, 0, 0, 0, 9, 7])),
    { senderId: 9, packet: new Uint8Array([7]) },
  );
});

test("VAD helpers: rms gates and the speaking window resolve recency, not volume", () => {
  assert.equal(rmsLevel(new Float32Array([0, 0])), 0);
  assert.ok(rmsLevel(new Float32Array([0.5, -0.5])) > 0.4);

  const last = new Map([[1, 1150], [2, 1000], [3, 500]]);
  assert.deepEqual(speakingUserIds(last, 1200), [1, 2]);
  assert.deepEqual(speakingUserIds(last, 1200, 1000), [1, 2, 3]);
});

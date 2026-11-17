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


// Voice (Phase 2) — Opus-over-WebSocket, exactly the owner's plan. The DO
// (ChatRoom in api/rooms.mjs) is the only server in the middle: it checks a
// one-byte header, tags each frame with the sender's userId, and fans the
// frame out to the room's other voice-joined sockets. No WebRTC, no media
// proxying, no SFU — nothing here can cost anything beyond the chat WS
// already in use (free-plan limits live in constants.mjs and the UI copy).
//
// Frame formats (one WS binary message per 20ms Opus packet):
//   uplink   (browser → DO):    0x01 || opusPacket
//   downlink (DO → browser):    0x01 || senderUserId BE u32 || opusPacket
//
// Send path: getUserMedia → AudioContext → ScriptProcessor taps 20ms of PCM →
// WebCodecs AudioEncoder (Opus) → one binary frame per packet. Chrome-family
// browsers have the encoder; where they don't, the copy says so plainly and
// the join still works as listen-only.
// Receive path: WebCodecs AudioDecoder (Opus) per peer → AudioContext
// scheduling with a tiny (~40ms) catch-up buffer. Speaking indicators come
// from frame arrival recency (the client only transmits while its mic level
// passes the VAD gate), so nobody's browser plays a guessing game.
import { createChannelSocket } from "./ws.js";

// Header/version byte — must match GC_VOICE_FRAME_VERSION (constants.mjs).
const FRAME_VERSION = 1;
const DOWNLINK_HEADER_BYTES = 5; // version + BE userId
// One Opus packet tops out at 1275 bytes; the DO relays at most 2 KiB, so an
// oversized encode result is dropped client-side instead of rejected later.
const MAX_PACKET_BYTES = 2047;
// Send only while speaking (VAD), with hysteresis so soft speech doesn't
// stutter the gate open and shut; idle mics then stream NOTHING, which keeps
// the DO fan-out proportional to conversation, not to connection time.
const VAD_START_RMS = 0.04;
const VAD_STOP_RMS = 0.028;
const VAD_FLOOR_RMS = 0.0025; // below this the mic is considered (near-)silent
const FRAME_MS = 20;
const HEARTBEAT_MS = 60000;
// A peer counts as "speaking" for this long after a frame arrives.
const SPEAKING_WINDOW_MS = 350;
const SPEAKING_POLL_MS = 250;
// Playback pacing: start ~40ms behind live; dump the buffer if it balloons.
const PLAYBACK_DELAY_S = 0.04;
const PLAYBACK_MAX_BACKLOG_S = 0.4;

// Plain-language copy shared with the pane (no guilt, just what happens).
export const VOICE_COPY = {
  PERMISSION:
    "Microphone access was declined. You're still in the room and can hear everyone — if you change your mind, allow the mic in your browser's site settings and press Join again.",
  ENCODE_UNSUPPORTED:
    "This browser can't send voice (it has no Opus encoder). You'll join and hear everyone else fine.",
  DECODE_UNSUPPORTED:
    "This browser can't play voice (no Opus decoder), so a voice channel would be silent. Try Chrome, Edge, or another Chromium browser.",
  LIMIT: "Up to 6 people share a voice channel (that keeps the free-plan relay comfortable).",
  DENIED: "Voice ended because the microphone stream stopped.",
};

// --- pure frame codecs (unit-testable without WebCodecs) ----------------------

export function encodeVoiceFrame(packetBytes) {
  const bytes = packetBytes instanceof Uint8Array
    ? packetBytes
    : new Uint8Array(packetBytes);
  const frame = new ArrayBuffer(1 + bytes.byteLength);
  const view = new Uint8Array(frame);
  view[0] = FRAME_VERSION;
  view.set(bytes, 1);
  return frame;
}

// Returns { senderId, packet } or null for anything the DO should never have
// relayed (wrong version byte, missing sender tag, empty/oversized payload).
export function decodeVoiceFrame(buffer) {
  const bytes = buffer instanceof ArrayBuffer
    ? new Uint8Array(buffer)
    : ArrayBuffer.isView(buffer)
      ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      : null;
  if (!bytes || bytes.length <= DOWNLINK_HEADER_BYTES) return null;
  if (bytes[0] !== FRAME_VERSION) return null;
  const senderId = (bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4];
  if (!Number.isInteger(senderId) || senderId <= 0) return null;
  return { senderId, packet: bytes.subarray(DOWNLINK_HEADER_BYTES) };
}

// VAD helper: block RMS of one PCM buffer — pure math so tests can pin it.
export function rmsLevel(samples) {
  if (!samples || samples.length === 0) return 0;
  let total = 0;
  for (const sample of samples) total += sample * sample;
  return Math.sqrt(total / samples.length);
}

// Speaking set from arrival recency: userIds with a frame inside the window.
export function speakingUserIds(lastFrameMs, now, window = SPEAKING_WINDOW_MS) {
  const speaking = [];
  for (const [userId, at] of lastFrameMs) {
    if (now - Number(at) <= window) speaking.push(Number(userId));
  }
  return speaking;
}

// --- capability probes (async: WebCodecs support is a promise) ----------------

async function encoderSupported(win) {
  const Encoder = win.AudioEncoder;
  const probe = { codec: "opus", sampleRate: 48000, numberOfChannels: 1, bitrate: 32000 };
  if (typeof Encoder !== "function" || typeof Encoder.isConfigSupported !== "function") {
    return false;
  }
  try {
    const result = await Encoder.isConfigSupported(probe);
    if (!result?.supported) {
      return await Encoder.isConfigSupported({ ...probe, sampleRate: 44100 })
        .then((fallback) => Boolean(fallback?.supported)).catch(() => false);
    }
    return true;
  } catch {
    return false;
  }
}

async function decoderSupported(win) {
  const Decoder = win.AudioDecoder;
  if (typeof Decoder !== "function" || typeof Decoder.isConfigSupported !== "function") return false;
  try {
    const result = await Decoder.isConfigSupported({
      codec: "opus", sampleRate: 48000, numberOfChannels: 1,
    });
    return Boolean(result?.supported);
  } catch {
    return false;
  }
}

// --- the session ---------------------------------------------------------------

export function createVoiceSession({
  channelId,
  selfId = NaN, // this browser's own userId — own-voice exclusion + self dot
  win = globalThis.window || globalThis,
  onRoster = () => {},
  onSpeaking = () => {},
  onStatus = () => {},
  onError = () => {},
} = {}) {
  // Roster + transient state. userId → {userId, username, muted, lastFrameMs}
  const participants = new Map();
  const decoders = new Map(); // userId → AudioDecoder
  const nextSoundAt = new Map(); // userId → scheduled AudioContext time
  let socket = null;
  let context = null; // one AudioContext hosts mic tap AND playback
  let micStream = null;
  let micSource = null;
  let analyser = null;
  let tapProcessor = null;
  let tapSink = null;
  let encoder = null;
  let nextPacketTs = 0; // encode input timestamps (µs, monotonic)
  let heartbeat = 0;
  let speakingTimer = 0;
  let active = false;
  let leaving = false;
  let transmitWanted = false;
  let transmitSet = false;
  let muted = false;
  // Deafen: mic mute AND the incoming-audio gate in one toggle (the parked
  // B4 gap). A deafened session drops every playback packet before it
  // schedules; undeafen lands the mic exactly where it was before.
  let deafened = false;
  let mutedBeforeDeafen = false;
  let speakingLocally = false;
  selfId = Number.isInteger(Number(selfId)) ? Number(selfId) : NaN;
  let lastFrameMs = participants; // alias: speaking set reads the same map

  const destroyDecoder = (decoder) => {
    try {
      decoder.close();
    } catch {
      /* already closed */
    }
  };

  const teardownAudio = () => {
    if (tapProcessor) tapProcessor.onaudioprocess = null;
    for (const node of [micSource, analyser, tapProcessor, tapSink]) {
      try {
        node?.disconnect();
      } catch {
        /* not connected */
      }
    }
    micSource = null;
    analyser = null;
    tapProcessor = null;
    tapSink = null;
    try {
      encoder?.close();
    } catch {
      /* already closed */
    }
    encoder = null;
    for (const decoder of decoders.values()) destroyDecoder(decoder);
    decoders.clear();
    nextSoundAt.clear();
    try {
      context?.close();
    } catch {
      /* already closed */
    }
    context = null;
    if (micStream) {
      for (const track of micStream.getTracks()) track.stop();
      micStream = null;
      // The DENIED copy is for a mic that died MID-session; a voluntary leave
      // already told the user it ended.
      if (!leaving) onError(VOICE_COPY.DENIED);
    }
  };

  const schedulePlayback = (userId, audioData) => {
    if (!context || leaving || deafened) {
      try {
        audioData.close();
      } catch {
        /* already closed */
      }
      return;
    }
    try {
      const samples = new Float32Array(audioData.numberOfFrames);
      audioData.copyTo(samples, { format: "f32", planeIndex: 0 });
      audioData.close();

      const buffer = context.createBuffer(1, samples.length, audioData.sampleRate);
      buffer.copyToChannel(samples, 0);
      const source = context.createBufferSource();
      source.buffer = buffer;

      const now = context.currentTime;
      const previous = nextSoundAt.get(userId) || 0;
      // Start small (40ms catch-up) and jump straight to "now + delay" when a
      // peer falls behind badly — never wait out a growing buffer.
      let at = Math.max(now + PLAYBACK_DELAY_S, previous);
      if (at > now + PLAYBACK_MAX_BACKLOG_S) at = now + PLAYBACK_DELAY_S;
      source.connect(context.destination);
      source.start(at);
      nextSoundAt.set(userId, at + samples.length / audioData.sampleRate);
    } catch {
      // One bad packet never kills the whole downlink.
      try {
        audioData.close();
      } catch {
        /* already closed */
      }
    }
  };

  const ensureDecoder = (userId) => {
    const existing = decoders.get(userId);
    if (existing) return existing;
    const Decoder = win.AudioDecoder;
    if (typeof Decoder !== "function") return null;
    let decoder = null;
    try {
      decoder = new Decoder({
        output: (audioData) => schedulePlayback(userId, audioData),
        error: () => {
          decoders.delete(userId);
        },
      });
      decoder.configure({ codec: "opus", sampleRate: 48000, numberOfChannels: 1 });
    } catch {
      return null;
    }
    decoders.set(userId, decoder);
    return decoder;
  };

  const onDownlink = (buffer) => {
    if (!active) return;
    const parsed = decodeVoiceFrame(buffer);
    if (!parsed) return;
    const now = Date.now();
    if (!participants.has(parsed.senderId)) {
      // Audio from a peer whose roster frame raced the packet: make room, the
      // next voice_roster names them.
      participants.set(parsed.senderId, {
        userId: parsed.senderId,
        username: "Someone",
        muted: false,
        lastFrameMs: now,
      });
    }
    lastFrameMs.set(parsed.senderId, now);

    const decoder = ensureDecoder(parsed.senderId);
    if (!decoder) return;
    try {
      const chunk = new win.EncodedAudioChunk({
        type: "key",
        timestamp: now * 1000,
        data: parsed.packet,
      });
      decoder.decode(chunk);
    } catch {
      // Undecodable packet: drop it, the stream self-synchronizes at Opus.
    }
  };

  const onTextFrame = (frame) => {
    if (!frame || typeof frame !== "object") return;
    if (frame.type === "voice_roster") {
      const list = Array.isArray(frame.participants) ? frame.participants : [];
      const seen = new Set();
      for (const entry of list) {
        const userId = Number(entry?.userId);
        if (!Number.isInteger(userId) || userId <= 0) continue;
        seen.add(userId);
        const existing = participants.get(userId);
        participants.set(userId, {
          userId,
          username: entry?.username || existing?.username || "Someone",
          muted: Boolean(entry?.muted),
          lastFrameMs: existing?.lastFrameMs || 0,
        });
      }
      for (const userId of [...participants.keys()]) {
        if (!seen.has(userId)) participants.delete(userId); // left the room
      }
      onRoster([...participants.values()]);
      return;
    }
    if (frame.type === "error") {
      if (frame.code === "voice_full") {
        onError("That voice channel is full (6 at a time on the free plan). You weren't connected.");
        void leave(true);
      } else {
        onError("Voice signaling was rejected (" + (frame.code || "unknown") + ").");
      }
    }
  };

  const onSocketStatus = (status) => {
    if (status === "open") {
      // (Re)join on every healthy connection: a reconnect lands on a fresh
      // DO socket whose voice flags are false, so the join frame re-rides.
      if (joined()) socket.send({ type: "voice_join" });
      onStatus(micStateKey(), "open");
    } else if (status === "closed" || status === "reconnecting") {
      // The socket's backoff owns the retry — surface it as one state.
      onStatus(micStateKey(), "reconnecting");
    }
  };

  // joined() reads whether connection was ever voice-joined; the socket owns
  // reconnects, so a dropped frame just rides the next one.
  function joined() {
    return active && !leaving;
  }

  function micStateKey() {
    return !transmitSet
      ? "connecting" // permission/codec probes still running after connect
      : deafened
        ? "deafened"
        : muted
          ? "muted"
          : speakingLocally
            ? "speaking"
            : "live";
  }

  const pollSpeaking = () => {
    const now = Date.now();
    const ids = speakingUserIds(lastFrameMs, now);
    if (
      Number.isInteger(selfId) &&
      speakingLocally &&
      !muted &&
      !ids.includes(selfId)
    ) {
      ids.push(selfId);
    }
    // A mute or an idle mic means "not speaking" even mid-gate-flap.
    onSpeaking(ids);
  };

  const feedEncoder = (pcm) => {
    if (!encoder) return;
    const buffer = new Float32Array(pcm); // copy — the tap reuses its buffer
    let audioData = null;
    try {
      audioData = new win.AudioData({
        format: "f32",
        sampleRate: context.sampleRate,
        numberOfFrames: buffer.length,
        numberOfChannels: 1,
        timestamp: nextPacketTs,
        data: buffer,
      });
      nextPacketTs += (buffer.length * 1e6) / context.sampleRate;
      encoder.encode(audioData);
    } catch {
      // An encode hiccup costs one 20ms frame, nothing more.
    } finally {
      try {
        audioData?.close();
      } catch {
        /* already closed */
      }
    }
  };

  const startMic = async (stream) => {
    micStream = stream;
    const samplesPerFrame = Math.round((context.sampleRate * FRAME_MS) / 1000);
    let carry = new Float32Array(0);

    micSource = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    tapProcessor = context.createScriptProcessor(2048, 1, 1);
    tapSink = context.createGain();
    tapSink.gain.value = 0; // the tap needs a destination edge, but silence

    const levelBuffer = new Float32Array(analyser.fftSize);
    micSource.connect(analyser);
    analyser.connect(tapProcessor);
    tapProcessor.connect(tapSink);
    tapSink.connect(context.destination);

    tapProcessor.onaudioprocess = (event) => {
      if (!micStream || leaving) return;
      const track = micStream.getAudioTracks()[0];
      if (!track || track.readyState !== "live") return;

      const input = event.inputBuffer.getChannelData(0);
      analyser.getFloatTimeDomainData(levelBuffer);
      const level = rmsLevel(levelBuffer);
      // Near-silence forces the gate shut regardless of hysteresis (mics that
      // sit at exactly 0 float between "quiet" and "quieter").
      speakingLocally = level < VAD_FLOOR_RMS
        ? false
        : level > (speakingLocally ? VAD_STOP_RMS : VAD_START_RMS);

      if (muted || !speakingLocally) return;

      const merged = new Float32Array(carry.length + input.length);
      merged.set(carry, 0);
      merged.set(input, carry.length);
      let offset = 0;
      while (offset + samplesPerFrame <= merged.length) {
        feedEncoder(merged.subarray(offset, offset + samplesPerFrame));
        offset += samplesPerFrame;
      }
      carry = merged.slice(offset);
    };
  };

  const setupTransmit = async () => {
    if (transmitSet) return;
    transmitSet = true;

    if (!(await decoderSupported(win))) {
      onError(VOICE_COPY.DECODE_UNSUPPORTED);
      void leave(true);
      return;
    }

    const canEncode = await encoderSupported(win);
    if (canEncode) {
      try {
        micStream = await win.navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        micStream = null;
        onError(VOICE_COPY.PERMISSION);
      }
    } else {
      onError(VOICE_COPY.ENCODE_UNSUPPORTED);
    }

    try {
      context = new win.AudioContext({ sampleRate: 48000 });
      await context.resume().catch(() => {});
    } catch {
      context = null;
      onError("Audio playback could not start in this browser.");
      void leave(true);
      return;
    }

    if (micStream) {
      const Encoder = win.AudioEncoder;
      try {
        encoder = new Encoder({
          output: (chunk) => {
            try {
              const bytes = new Uint8Array(chunk.byteLength);
              chunk.copyTo(bytes);
              if (bytes.byteLength > 0 && bytes.byteLength <= MAX_PACKET_BYTES) {
                socket?.send(encodeVoiceFrame(bytes));
              }
            } catch {
              // Copy/step errors cost one frame, never the connection.
            }
          },
          error: () => {
            onError(VOICE_COPY.ENCODE_UNSUPPORTED);
          },
        }, {
          codec: "opus",
          sampleRate: context.sampleRate,
          numberOfChannels: 1,
          bitrate: 32000,
        });
        await startMic(micStream);
        onStatus("live", "open");
        return;
      } catch {
        encoder = null;
        onError(VOICE_COPY.ENCODE_UNSUPPORTED);
      }
    }

    onStatus("listening", "open");
  };

  const join = () => {
    if (active) return;
    active = true;
    leaving = false;
    onStatus("connecting", "start");

    socket = createChannelSocket({
      channelId,
      window: win,
      onMessage: onTextFrame,
      onBinary: onDownlink,
      onStatus: onSocketStatus,
    });

    void setupTransmit();

    heartbeat = win.setInterval(() => {
      socket?.send({ type: "heartbeat" });
    }, HEARTBEAT_MS);
    speakingTimer = win.setInterval(pollSpeaking, SPEAKING_POLL_MS);
  };

  function leave(silent) {
    if (!active) return;
    leaving = true;
    active = false;

    try {
      socket?.send({ type: "voice_leave" });
    } catch {
      /* best effort */
    }
    socket?.close();
    socket = null;

    if (heartbeat) win.clearInterval(heartbeat);
    if (speakingTimer) win.clearInterval(speakingTimer);
    heartbeat = 0;
    speakingTimer = 0;

    teardownAudio();
    participants.clear();
    nextSoundAt.clear();
    speakingLocally = false;
    muted = false;
    deafened = false;
    mutedBeforeDeafen = false;

    if (!silent) onRoster([]);
    onStatus("left", "close");
  }

  return {
    join,
    leave: () => leave(false),
    setMuted(next) {
      muted = Boolean(next);
      try {
        socket?.send({ type: "voice_mute", muted });
      } catch {
        /* the roster repair lands on the next roster frame */
      }
      onStatus(micStateKey(), "mute");
    },
    // Deafen = the mic mute PLUS the incoming-audio gate: Discord's grammar.
    // The pre-deafen mute is kept, so undeafen lands the mic where you left
    // it instead of unmute-by-surprise.
    setDeafened(next) {
      const want = Boolean(next);
      if (deafened === want) return;
      if (want) {
        mutedBeforeDeafen = muted;
        deafened = true;
        if (!muted) this.setMuted(true);
      } else {
        deafened = false;
        if (!mutedBeforeDeafen && this.muted) this.setMuted(false);
      }
      onStatus(micStateKey(), "deafen");
    },
    get channelId() {
      return channelId;
    },
    get active() {
      return active;
    },
    get muted() {
      return muted;
    },
    get deafened() {
      return deafened;
    },
    get participants() {
      return [...participants.values()];
    },
  };
}

// ChatRoom Durable Object (Phase 1, Task 8): per-channel WebSocket fan-out,
// reached through GET /api/ws (api/ws.mjs) and addressed by the pinned DO id
// `channel:<channelId>`. It owns ONLY the relay: message persistence rides
// Task 5's `sendMessageToChannel` primitive (validation, word filter,
// idempotent insert, last_* bump all live there — the DO never duplicates
// them), and everything a socket sends is one of the pinned client frames.
//
// Envelope (pinned in the plan; phase 2 voice extends, never breaks it —
// NON-voice binary frames are still reserved and answered with
// binary_unsupported):
//   client→server: {"type":"msg","clientMessageId":...,"body":...},
//                  {"type":"typing"}, {"type":"ping","t":...},
//                  {"type":"voice_join"|"voice_leave"},
//                  {"type":"voice_mute","muted":bool},
//                  [binary] 0x01 || opusPacket (voice channels, voice-joined
//                  sockets only)
//   server→client: {"type":"msg","message":{...}} (Task 5 shape), {"type":
//                  "broadcast","kind":"typing","userId":...}, {"type":
//                  "roster","members":[{userId,username}]}, {"type":"error",
//                  "code":...}, {"type":"voice_roster","participants":[
//                  {userId,username,muted}]},
//                  [binary] 0x01 || senderUserId(BE u32) || opusPacket
//
// Voice (Phase 2) rides THIS same channel WebSocket — the owner's plan is
// Opus-over-WebSocket fanned out by the per-room DO, not WebRTC. There is no
// media proxying and no audio codec work server-side: the DO only checks the
// one version byte and the frame ceiling, prepends the sender's userId, and
// relays to the room's voice-joined sockets. Limits live in constants.mjs
// (GC_VOICE_MAX_PARTICIPANTS etc.) and are mirrored in the UI copy.
//
// The unit contract (tests/rooms-relay.test.mjs) drives the class with a fake
// ctx/env and fake sockets, so every touch of the workerd-only builtins
// (DurableObject, WebSocketPair) is guarded: with workerd absent the class
// still instantiates and the same event methods run over the fake sockets.
// In the deployed worker the guard is a plain successful dynamic import.
//
// The DO is written for hibernation: sockets are accepted with
// acceptWebSocket and per-socket identity rides serializeAttachment, so the
// per-connection fan-out state survives eviction as attachments + the
// ctx.getWebSockets() enumeration — no in-memory Map to lose on hibernate.
import { sendMessageToChannel as sendMessageToChannelPrimitive } from "./messages.mjs";
import { HttpError, json } from "./core/http.mjs";
import {
  GC_VOICE_FRAME_VERSION,
  GC_VOICE_MAX_FRAME_BYTES,
  GC_VOICE_MAX_PARTICIPANTS,
} from "../constants.mjs";

let workerd = null;
try {
  workerd = await import("cloudflare:workers");
} catch {
  /* node --test: no workerd builtins — the class runs over fake sockets */
}

// Bundler/runtime ordering can leave the guarded import unresolved at module
// evaluation in wrangler dev (the DO then upgrades over fake sockets and
// acceptWebSocket 500s). Re-attempt it at the first real use — tests keep
// their fake-socket path when the specifier is genuinely absent.
async function ensureWorkerd() {
  if (!workerd) {
    try {
      workerd = await import("cloudflare:workers");
    } catch {
      /* keep the fake-socket path */
    }
  }
  return workerd;
}

class DurableObjectBase {}

function fakeServerSocket() {
  const socket = {
    sent: [],
    send(frame) {
      this.sent.push(frame);
    },
    serializeAttachment(value) {
      this.attachment = value;
    },
    deserializeAttachment() {
      if (this.attachment === undefined) {
        throw new Error("No socket attachment.");
      }
      return this.attachment;
    },
    close() {
      this.closed = true;
    },
  };
  return socket;
}

function upgradeResponse(client) {
  if (workerd) return new Response(null, { status: 101, webSocket: client });
  // node --test: undici's Response cannot represent a 101, so the fallback
  // hands the unit tests the same 101-shaped result without a runtime 1xx.
  return { status: 101, webSocket: client };
}

function upgradePair() {
  // WebSocketPair is a workerd runtime GLOBAL — the guarded module import can
  // stay unresolved under wrangler dev's DO bundling, so the global is the
  // authoritative fallback; only node --test lands on the fake socket.
  const PairCtor =
    (workerd && workerd.WebSocketPair) || globalThis.WebSocketPair || null;

  if (PairCtor) {
    const pair = new PairCtor();
    return { client: pair[0], server: pair[1] };
  }
  return { client: fakeServerSocket(), server: fakeServerSocket() };
}

export class ChatRoom extends (workerd?.DurableObject ?? DurableObjectBase) {
  constructor(state, env) {
    super(state, env);
    // workerd's DurableObject base assigns neither field; the explicit
    // assignment keeps the class identical under `node --test`, where the
    // guarded import fell back to an inert base.
    this.ctx = state;
    this.env = env;
  }

  async fetch(request) {
    // Retry the guarded import before building a pair (see ensureWorkerd).
    await ensureWorkerd();
    if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
      return json({ error: "A WebSocket upgrade is required." }, 426);
    }
    const url = new URL(request.url);
    const userId = Number(url.searchParams.get("userId"));
    const username = url.searchParams.get("username");
    const channelKind = url.searchParams.get("channelKind");
    const channelId = Number(url.searchParams.get("channel"));
    if (!Number.isInteger(userId) || userId <= 0 || username === null || !Number.isInteger(channelId)) {
      return json({ error: "Chat connection is not authorized." }, 403);
    }
    const { client, server } = upgradePair();
    this.ctx.acceptWebSocket(server);
    // voice/voiceMuted persist WITH the attachment, so the voice state below
    // survives DO hibernation exactly like the identity it hangs off.
    server.serializeAttachment(JSON.stringify({
      userId, username, channelKind, channelId, voice: false, voiceMuted: false,
    }));
    this.forwardToPresence({ type: "connect", userId, username });
    this.broadcastRoster();
    return upgradeResponse(client);
  }

  metaFor(socket) {
    try {
      const meta = JSON.parse(socket.deserializeAttachment());
      if (meta && Number.isInteger(meta.userId)) return meta;
    } catch {
      /* no attachment / unreadable — treat as unknown */
    }
    return null;
  }

  roster() {
    const members = [];
    const seen = new Set();
    for (const socket of this.ctx.getWebSockets()) {
      const meta = this.metaFor(socket);
      if (meta && !seen.has(meta.userId)) {
        seen.add(meta.userId);
        members.push({ userId: meta.userId, username: meta.username });
      }
    }
    return members;
  }

  sendFrame(socket, payload) {
    try {
      socket.send(JSON.stringify(payload));
    } catch (error) {
      // A socket that died mid-relay must not take the fan-out down; the
      // close handler cleans up its roster entry.
      void error;
    }
  }

  // The fan-out: every OTHER socket, never the sender (a user's own second
  // tab does receive, since the exclusion is per-socket).
  broadcastJson(origin, payload) {
    const frame = JSON.stringify(payload);
    // Exclude by ATTACHED IDENTITY, not object identity: under hibernation the
    // socket arguments are re-materialized per event, so `socket === origin`
    // can miss and a sender gets its own relay back.
    const originMeta = this.metaFor(origin);
    for (const socket of this.ctx.getWebSockets()) {
      const meta = this.metaFor(socket);
      if (
        originMeta &&
        meta &&
        meta.userId === originMeta.userId &&
        meta.channelId === originMeta.channelId
      ) {
        continue;
      }
      try {
        socket.send(frame);
      } catch (error) {
        // A socket that died mid-relay must not take the fan-out down; the
        // close handler cleans up its roster entry.
        void error;
      }
    }
  }

  // Presence relay plumbing (Task 9): one hub DO at the pinned name "hub",
  // spoken to through the stub-fetch frames api/presence.mjs pins. Joins/
  // leaves/heartbeats forward to the hub; the hub never reaches back into a
  // room, so presence traffic can never wake a room pair. A missing binding
  // or a failing hub must never take the chat relay down — every failure is
  // swallowed here, not in the callers.
  forwardToPresence(frame) {
    const presence = this.env?.PRESENCE;
    if (!presence) return null;
    return presence.get(presence.idFromName("hub")).fetch(
      new Request("https://presence.internal/hub", {
        method: "POST",
        body: JSON.stringify(frame),
      }),
    ).catch((error) => {
      void error;
      return null;
    });
  }

  broadcastRoster() {
    const frame = JSON.stringify({ type: "roster", members: this.roster() });
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(frame);
      } catch (error) {
        void error;
      }
    }
  }

  // --- voice (Phase 2): Opus-over-WebSocket relay in the room's own DO ------

  // Voice participants = sockets of this room whose attachment carries
  // voice: true. Distinct by userId (a user's second socket never duplicates).
  voiceRoster() {
    const participants = [];
    const seen = new Set();
    for (const socket of this.ctx.getWebSockets()) {
      const meta = this.metaFor(socket);
      if (meta && meta.voice && Number.isInteger(meta.userId) && !seen.has(meta.userId)) {
        seen.add(meta.userId);
        participants.push({
          userId: meta.userId,
          username: meta.username,
          muted: Boolean(meta.voiceMuted),
        });
      }
    }
    return participants;
  }

  // Sent to EVERY socket in the room (the sender included): the joiner needs
  // the roster to know which peers to expect audio from.
  broadcastVoiceRoster() {
    const frame = JSON.stringify({ type: "voice_roster", participants: this.voiceRoster() });
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(frame);
      } catch (error) {
        void error;
      }
    }
  }

  // Re-persist one socket's attachment with mutated voice flags. Hibernation
  // safe: the attachment is the same storage the identity rides.
  storeVoiceFlags(socket, meta, voice, voiceMuted) {
    try {
      socket.serializeAttachment(JSON.stringify({
        userId: meta.userId,
        username: meta.username,
        channelKind: meta.channelKind,
        channelId: meta.channelId,
        voice,
        voiceMuted,
      }));
    } catch (error) {
      // A socket that can no longer be tagged simply drops out of the roster.
      void error;
    }
  }

  async handleVoiceFrame(socket, meta, type, frame) {
    // Voice is a voice-channel feature; text/DM sockets stay text-only (and a
    // text channel's binary frames keep the phase 1 binary_unsupported pin).
    if (meta.channelKind !== "voice") {
      this.sendFrame(socket, { type: "error", code: "voice_text_only" });
      return;
    }

    if (type === "voice_join") {
      const others = this.voiceRoster().filter((entry) => entry.userId !== meta.userId);
      // Free-plan cap (constants.mjs): a full room refuses new participants
      // instead of letting the relay fan-out grow without bound.
      if (!meta.voice && others.length >= GC_VOICE_MAX_PARTICIPANTS) {
        this.sendFrame(socket, { type: "error", code: "voice_full" });
        return;
      }
      this.storeVoiceFlags(socket, meta, true, false);
      await this.forwardToPresence({
        type: "voice",
        userId: meta.userId,
        username: meta.username,
        channelId: meta.channelId,
      });
      this.broadcastVoiceRoster();
      return;
    }

    if (type === "voice_mute") {
      if (!meta.voice || typeof frame.muted !== "boolean") {
        this.sendFrame(socket, { type: "error", code: "bad_frame" });
        return;
      }
      this.storeVoiceFlags(socket, meta, true, frame.muted);
      this.broadcastVoiceRoster();
      return;
    }

    if (type === "voice_leave") {
      if (meta.voice) {
        this.storeVoiceFlags(socket, meta, false, false);
        await this.forwardToPresence({ type: "voice_leave", userId: meta.userId });
        this.broadcastVoiceRoster();
      }
      return;
    }
  }

  // The one hot path: an Opus packet in, tagged + relayed out. Header:
  //   client→DO: [0x01][opus packet]
  //   DO→peers:  [0x01][sender userId BE u32][opus packet]
  // No persistence, no re-encoding, only voice-joined sockets receive, and a
  // user never hears their own stream back (same-userId exclusion). A socket
  // that can't take a frame is skipped — the close handler cleans it up.
  relayVoiceFrame(socket, meta, message) {
    if (meta.channelKind !== "voice" || !meta.voice) {
      // Non-voice channels (and non-voice sockets on voice channels) keep the
      // phase 1 reservation — binary is never relayed as chat content.
      this.sendFrame(socket, { type: "error", code: "binary_unsupported" });
      return;
    }

    const bytes = message instanceof ArrayBuffer
      ? new Uint8Array(message)
      : ArrayBuffer.isView(message)
        ? new Uint8Array(message.buffer, message.byteOffset, message.byteLength)
        : null;

    if (
      bytes === null ||
      bytes.length < 2 ||
      bytes.length > GC_VOICE_MAX_FRAME_BYTES + 1 ||
      bytes[0] !== GC_VOICE_FRAME_VERSION
    ) {
      this.sendFrame(socket, { type: "error", code: "bad_frame" });
      return;
    }

    const packet = new Uint8Array(1 + 4 + (bytes.length - 1));
    packet[0] = GC_VOICE_FRAME_VERSION;
    packet[1] = (meta.userId >>> 24) & 0xff;
    packet[2] = (meta.userId >>> 16) & 0xff;
    packet[3] = (meta.userId >>> 8) & 0xff;
    packet[4] = meta.userId & 0xff;
    packet.set(bytes.subarray(1), 5);

    for (const peer of this.ctx.getWebSockets()) {
      const peerMeta = this.metaFor(peer);
      if (!peerMeta || !peerMeta.voice || peerMeta.userId === meta.userId) continue;
      try {
        peer.send(packet);
      } catch (error) {
        void error;
      }
    }
  }

  // The message primitive the DO persists through (Task 5 owns validation,
  // filter, idempotency, last_* bump). Env-hooked so the unit tests can pin
  // the call without a workerd runtime; the module import is the production
  // path and the hook is absent there.
  sendMessage(user, channelId, body, clientMessageId) {
    const send = typeof this.env.__sendMessageToChannel === "function"
      ? this.env.__sendMessageToChannel
      : sendMessageToChannelPrimitive;
    return send(this.env, user, channelId, body, clientMessageId);
  }

  async webSocketMessage(socket, message) {
    const meta = this.metaFor(socket);
    if (meta === null) return;

    // Binary is voice (phase 2) and voice only — one Opus packet per frame,
    // relayed by this DO. Non-voice channels and non-voice sockets still get
    // the phase 1 reservation reply.
    if (typeof message !== "string") {
      this.relayVoiceFrame(socket, meta, message);
      return;
    }

    let frame;
    try {
      frame = JSON.parse(message);
    } catch (error) {
      void error;
      this.sendFrame(socket, { type: "error", code: "bad_frame" });
      return;
    }
    const type = frame && typeof frame === "object" && !Array.isArray(frame) ? frame.type : null;

    if (type === "voice_join" || type === "voice_leave" || type === "voice_mute") {
      await this.handleVoiceFrame(socket, meta, type, frame);
      return;
    }

    if (type === "msg") {
      try {
        const { message: row } = await this.sendMessage(
          { id: meta.userId, username: meta.username },
          meta.channelId,
          frame.body,
          frame.clientMessageId === undefined ? null : frame.clientMessageId,
        );
        this.broadcastJson(socket, { type: "msg", message: row });
      } catch (error) {
        this.sendFrame(socket, {
          type: "error",
          code: "send_failed",
          // HttpError copies (validation, the filter — FilterError extends
          // HttpError) are safe to echo; a non-HTTP failure gets the
          // generic copy instead.
          message: error instanceof HttpError ? error.message : "The message could not be sent.",
        });
      }
      return;
    }

    if (type === "typing") {
      // No persistence; broadcast to the others only (the sender throttles
      // client-side).
      this.broadcastJson(socket, { type: "broadcast", kind: "typing", userId: meta.userId });
      return;
    }

    if (type === "ping") {
      this.sendFrame(socket, { type: "pong", t: "t" in frame ? frame.t : null });
      return;
    }

    if (type === "heartbeat") {
      // Client-driven presence (one frame every 60s): relay the identity to
      // the hub, and its pinned presence envelope rides back to the sender
      // only. A dead or missing hub answers nothing — the socket stays
      // connected either way, and nothing fans out to the room.
      const hub = await this.forwardToPresence({
        type: "heartbeat",
        userId: meta.userId,
        username: meta.username,
      });
      const payload = hub && hub.ok ? await hub.json().catch(() => null) : null;
      if (payload && Array.isArray(payload.online)) {
        this.sendFrame(socket, { type: "presence", online: payload.online });
      }
      return;
    }

    this.sendFrame(socket, { type: "error", code: "bad_frame" });
  }

  async webSocketClose(socket) {
    // Leave: everyone still connected gets the updated roster. The closing
    // socket needs none — workerd has already dropped it from getWebSockets()
    // by the time this handler runs. Presence follows with a leave frame so
    // the hub drops the user even when no other socket ever heartbeat.
    void socket;
    const meta = this.metaFor(socket);
    if (meta && Number.isInteger(meta.userId)) {
      await this.forwardToPresence({ type: "leave", userId: meta.userId });
      if (meta.voice) {
        // A dropped voice socket (tab close, network cut) releases its seat
        // AND clears the hub's voice-channel marker, so the sidebar stops
        // listing someone who isn't speaking.
        await this.forwardToPresence({ type: "voice_leave", userId: meta.userId });
        this.broadcastVoiceRoster();
      }
    }
    this.broadcastRoster();
  }

  webSocketError(socket, error) {
    // A broken frame connection drops rather than poisons the room.
    void socket;
    void error;
  }
}

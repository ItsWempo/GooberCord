
// One shared WebSocket per open channel (Task 8 envelope frames, verbatim):
// client -> server   {"type":"msg","clientMessageId","body"} | {"type":"typing"} | {"type":"ping"}
//                    | phase 2 voice: {"type":"voice_join"|"voice_leave"}, {"type":"voice_mute","muted"},
//                      [binary] 0x01 || opusPacket
// server -> client   {"type":"msg","message":...} | {"type":"broadcast","kind":"typing","userId":...}
//                    | {"type":"roster","members":[...]} | {"type":"error","code":...} | {"type":"pong","t"}
//                    | {"type":"voice_roster","participants":[...]} | [binary] 0x01 || senderId(BE u32) || opusPacket
// Reconnect uses jittered backoff; on reconnect the app re-GETs messages
// after the last seen id (the Resume rule — no server replay in phase 1).
// A {"type":"error","code":"send_failed"} frame is handled deliberately
// (Task 8 review note): surfaced non-destructively to the composer's error
// strip — the optimistic draft stays in the box, nothing crashes.
// Binary frames (phase 2 voice) skip the JSON pipe entirely and ride the
// optional onBinary hook — createVoiceSession owns them.

const MAX_BACKOFF_MS = 30000;

export function nextBackoffMs(attempt, random = Math.random) {
  const base = Math.min(1000 * 2 ** Math.max(0, attempt), MAX_BACKOFF_MS);
  const jitter = base / 2 + Math.floor(random() * (base / 2));
  return Math.min(jitter + 250, MAX_BACKOFF_MS);
}

export function wsUrlFor(origin, channelId) {
  const url = new URL("/api/ws", origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.search = "?channel=" + encodeURIComponent(channelId);
  return url.toString();
}

export function createChannelSocket({
  channelId,
  onMessage,
  onBinary,
  onStatus,
  resumeAfter,
  window: globalWindow = globalThis.window || globalThis,
} = {}) {
  let socket = null;
  let attempt = 0;
  let closedByUs = false;
  let reconnectTimer = 0;
  let pingTimer = 0;
  let lastSeenId = Number(resumeAfter || 0);

  const clearTimers = () => {
    if (reconnectTimer) {
      globalWindow.clearTimeout(reconnectTimer);
      reconnectTimer = 0;
    }
    if (pingTimer) {
      globalWindow.clearInterval(pingTimer);
      pingTimer = 0;
    }
  };

  const scheduleReconnect = () => {
    if (closedByUs || reconnectTimer) return;
    const delay = nextBackoffMs(attempt);
    attempt += 1;
    onStatus?.("reconnecting", attempt);
    reconnectTimer = globalWindow.setTimeout(connect, delay);
  };

  const connect = () => {
    clearTimers();

    if (closedByUs) return;

    try {
      socket = new globalWindow.WebSocket(
        wsUrlFor(globalWindow.location.origin, channelId),
      );
    } catch {
      scheduleReconnect();
      return;
    }

    socket.addEventListener("open", () => {
      attempt = 0;
      onStatus?.("open");
      // Keepalive: ping every 45s so idle tabs survive proxy timeouts; the
      // DO answers {"type":"pong","t"}.
      pingTimer = globalWindow.setInterval(() => {
        send({ type: "ping", t: Date.now() });
      }, 45000);
    });

    socket.addEventListener("message", (event) => {
      // Voice (phase 2) rides binary frames — never JSON, never the composer.
      if (typeof event.data !== "string") {
        if (event.data instanceof ArrayBuffer || ArrayBuffer.isView(event.data)) {
          onBinary?.(event.data);
        }
        return; // Anything else binary-shaped is ignored defensively.
      }

      let frame;
      try {
        frame = JSON.parse(String(event.data));
      } catch {
        return; // Never expected from the server; ignore defensively.
      }

      if (frame?.type === "msg" && frame.message) {
        lastSeenId = Math.max(lastSeenId, Number(frame.message.id) || 0);
      }

      onMessage?.(frame);
    });

    socket.addEventListener("close", () => {
      if (pingTimer) {
        globalWindow.clearInterval(pingTimer);
        pingTimer = 0;
      }
      onStatus?.("closed");
      scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      try {
        socket?.close();
      } catch {
        // Already toast.
      }
    });
  };

  const send = (value) => {
    if (socket && socket.readyState === 1) {
      try {
        // ArrayBuffer = one voice frame (phase 2); everything else is JSON.
        socket.send(value instanceof ArrayBuffer ? value : JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  };

  const close = () => {
    closedByUs = true;
    clearTimers();
    try {
      socket?.close();
    } catch {
      // Closing an early socket is fine.
    }
    socket = null;
    onStatus?.("closed");
  };

  connect();

  return {
    send,
    close,
    get lastSeenId() {
      return lastSeenId;
    },
  };
}

// Typing throttle (Task 12): at most one {"type":"typing"} frame per 3s —
// computed statelessly so it is unit-testable.
export const TYPING_THROTTLE_MS = 3000;

export function shouldSendTyping(lastSentMs, nowMs, throttle = TYPING_THROTTLE_MS) {
  return !lastSentMs || nowMs - Number(lastSentMs) >= throttle;
}

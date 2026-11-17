// The read markers (the W-F2b wave): the conversation view's acks. The
// backend (0026): POST /api/conversations/:id/read { messageId } advances
// the CALLER'S OWN last_read_message_id — self-only, forward-only, onto a
// message the thread holds (the marker is the sender's own business).
// Server channels don't ride THIS route: the channel-messages tail GET
// auto-advances server-side, so the client reads-in integration is
// CONVERSATIONS ONLY (DMs and group chats).
//
// The dedupe: fire-once per message id, in a session Set — a view renders
// its latest message once per key, so the route never sees a repeat. A
// refusal is quiet: the render never blocks on a marker, and the Set keeps
// the key so the session cannot storm the route with the same one.
import { api } from "./api.js";

const acked = new Set();

// markConversationRead(conversationId, messageId): the ack ride. Returns
// "sent" | "dup" — the caller's render cares about neither, the tests do.
export function markConversationRead(conversationId, messageId) {
  const channel = Number(conversationId);
  const position = Number(messageId);
  if (!Number.isInteger(channel) || channel < 1
    || !Number.isInteger(position) || position < 1) return "dup";
  const key = channel + ":" + position;
  if (acked.has(key)) return "dup";
  acked.add(key);
  void api("/api/conversations/" + channel + "/read", {
    method: "POST",
    body: { messageId: position },
  }).catch(() => {
    // Quiet by contract: a refused marker skips this key for the rest of
    // the session (the next page read's own GET advances server channels;
    // a conversations pill clears on the next refresh loop's read).
  });
  return "sent";
}

// ackedReadKeys(): the Set's keys for the pins/tests — never mutated here.
export function ackedReadKeys() {
  return [...acked.keys()];
}

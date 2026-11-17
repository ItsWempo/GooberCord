-- 0028 — the mentions wave (W-B2): the persisted per-mention inbox. A
-- message body STORES plain text — the @username tokens resolve at send
-- (matchRosterMentions' rules live in api/mentions.mjs) and every resolved
-- member gets ONE row per message (repeated tokens dedupe onto the same
-- row), so the GET /api/mentions inbox is a plain indexed read and read-
-- through deletion is one own-row DELETE.
--
-- Both FKs CASCADE: a deleted message carries its mention rows (Discord's
-- mentions of dead messages stop resolving), and a deleted account carries
-- both halves (their sends AND their inbox rows). No synthetic id: the old
-- mentions endpoint's {id} was the message id, and GC's DELETE .../:id
-- deletes the caller's own row for that message verbatim (user_id rides the
-- WHERE — nobody deletes someone else's mention).
CREATE TABLE gc_mentions (
  message_id INTEGER NOT NULL REFERENCES gc_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(message_id, user_id)
);
CREATE INDEX idx_gc_mentions_user ON gc_mentions(user_id, message_id);

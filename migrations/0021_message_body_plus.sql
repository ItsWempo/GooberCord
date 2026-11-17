-- 0021: the message body bound, raised for Goober+ — "Goober+ lets u send
-- larger messages." The owner rule's shape (proposal, owner confirms via the
-- lead): free keeps 2000; plus admits 4000 (Nitro's shape). The DB bound is
-- the widest admission (4000); the tier split lives at SEND/EDIT admission
-- (constants pair GC_FREE_MESSAGE_MAX = 2000 / GC_PLUS_MESSAGE_MAX = 4000,
-- read through plusPerkActive) — the CHECK is the floor of safety, not the
-- tier policy. Existing rows are unaffected: nothing in the stream exceeds
-- 2000 today (the old CHECK admitted at most that).
--
-- Shape discipline (pinned by tests/migration-scoping-0021.test.mjs):
-- gc_messages is a REFERENCED table — gc_attachments.message_id (0001),
-- the 0010 filter audit's message_id, gc_message_reactions.message_id
-- (0009), and the 0013 nitro tables all store FK clauses naming it. The
-- 0013→0014 incident's shape (RENAME the parent, DROP it) rewrites every
-- child's stored FK to the renamed shell and then removes that name — the
-- child inserts then die with "no such table" on an FK-enforcing engine
-- (D1, verified 2026-11-17). This file rebuilds the safe way instead:
-- create a NEW table with the raised bound, copy every row, DROP the
-- original (a DROP rewrites nothing — the child clauses still name
-- "gc_messages"), then RENAME the copy over that exact name, so the
-- final state resolves every child's REFERENCES gc_messages to the
-- rebuilt table, and the children are never rewritten at all. If a
-- runner enforces FKs mid-migration, the child-populated DROP fails
-- loudly and the ledger refuses the apply — nothing half-applies either
-- way.
--
-- Same contract as every sibling migration: the shared wempo-forum-data D1,
-- every object gc_-prefixed and independent of the later migrations —
-- applies cleanly right after 0020 (its only precondition) as well as at
-- the end of the sequence.

CREATE TABLE gc_messages_rebuild (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES gc_channels(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The single delta from 0001: the bound raised to the widest admission
  -- (the plus tier's). Free rides 2000 through the route's per-tier
  -- admission, never inside this CHECK.
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
  client_message_id TEXT NULL CHECK(length(client_message_id) BETWEEN 8 AND 64),
  source TEXT NULL CHECK(source IN ('forum-chat','forum-dm') OR source IS NULL),
  created_at INTEGER NOT NULL,
  edited_at INTEGER NULL,
  UNIQUE(channel_id, author_id, client_message_id)
);

-- The copy: ids INSERT explicitly (id IS the rowid — reactions and the
-- attachment rows' message_id links stay exact), so nothing is renumbered;
-- sqlite_sequence follows the highest inserted id automatically.
INSERT INTO gc_messages_rebuild
  (id, channel_id, author_id, body, client_message_id, source, created_at, edited_at)
SELECT id, channel_id, author_id, body, client_message_id, source, created_at, edited_at
FROM gc_messages;

DROP TABLE gc_messages;

ALTER TABLE gc_messages_rebuild RENAME TO gc_messages;

-- Dropped with the table (0001's and 0008's); recreated verbatim.
CREATE INDEX idx_gc_messages_channel ON gc_messages(channel_id, id);
CREATE INDEX idx_gc_messages_author_channel ON gc_messages(author_id, channel_id);

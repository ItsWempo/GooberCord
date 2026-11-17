-- 0018_chat_import.sql — one-time DM import from the forum's shared tables.
--
-- Owner ruling (Nov 16, 2026): DMs ONLY. The site-wide forum chat history
-- stays in the forum's chat_messages untouched (readable by nobody in GC,
-- deletable later at the owner's leisure); no 'Forum chat (import)' group is
-- built. So this file reads dm_threads/dm_messages and writes gc_* alone;
-- chat_messages appears in NO statement here.
--
-- Channel identity: dm_threads.user_a < user_b (forum CHECK) and the pair is
-- UNIQUE, so each thread maps to exactly one dm channel. The channel id lives
-- in a dedicated band (thread id + 1,000,000,000) and gc_chat_import_map is
-- the keyed ledger — set-based SQL cannot do per-row last_insert_rowid(), so
-- the map table is how later statements find their channels. Import order:
--   1. map ledger (empty, gc_-only)
--   2. channels (name 'dm' — a dm's displayed name is the member list read
--      at request time; a stored sentinel name would surface as a custom
--      name in the conversations list)
--   3. map rows backfill by the deterministic id
--   4. two conversation members per channel
--   5. messages, source 'forum-dm', bodies/created_at preserved (forum dm
--      bodies are 1..1000, inside gc_messages' 1..2000; the sentinels ride
--      the (channel_id, author_id, client_message_id) UNIQUE key so a re-run
--      is INSERT OR IGNORE)
--   6. each channel's last_message_id/at from its imported history
--   7. both members' read cursor at the channel's last imported message
--      (0 unread — DM unread rides gc_conversation_members.last_read_)
--      [message_id; gc_read_state has no consumers in GC]
-- Idempotent end-to-end: 2 guards the map, 4/5 PK/UNIQUE + OR IGNORE, 6/7
-- rewrite deterministic values. Re-run = no-op.

CREATE TABLE IF NOT EXISTS gc_chat_import_map (
  thread_id INTEGER PRIMARY KEY REFERENCES dm_threads(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL UNIQUE
);

INSERT INTO gc_channels (id, server_id, name, kind, position, created_at, last_message_id, last_message_at)
SELECT t.id + 1000000000, NULL, 'dm', 'dm', 0, t.created_at, NULL, NULL
  FROM dm_threads t
 WHERE NOT EXISTS (SELECT 1 FROM gc_chat_import_map m WHERE m.thread_id = t.id)
   AND NOT EXISTS (SELECT 1 FROM gc_channels c WHERE c.id = t.id + 1000000000);

INSERT INTO gc_chat_import_map (thread_id, channel_id)
SELECT t.id, t.id + 1000000000
  FROM dm_threads t
 WHERE NOT EXISTS (SELECT 1 FROM gc_chat_import_map m WHERE m.thread_id = t.id)
   AND EXISTS (SELECT 1 FROM gc_channels c
                WHERE c.id = t.id + 1000000000 AND c.kind = 'dm' AND c.name = 'dm');

INSERT OR IGNORE INTO gc_conversation_members (channel_id, user_id, last_read_message_id)
SELECT m.channel_id, t.user_a, 0 FROM dm_threads t
  JOIN gc_chat_import_map m ON m.thread_id = t.id
UNION
SELECT m.channel_id, t.user_b, 0 FROM dm_threads t
  JOIN gc_chat_import_map m ON m.thread_id = t.id;

INSERT OR IGNORE INTO gc_messages (channel_id, author_id, body, client_message_id, source, created_at)
SELECT m.channel_id, msg.user_id, msg.body,
       'import-dm-' || msg.id,
       'forum-dm',
       msg.created_at
  FROM dm_messages msg
  JOIN gc_chat_import_map m ON m.thread_id = msg.thread_id;

UPDATE gc_channels SET
  last_message_id = (SELECT msg.id FROM gc_messages msg
                      WHERE msg.channel_id = gc_channels.id
                      ORDER BY msg.created_at DESC, msg.id DESC LIMIT 1),
  last_message_at = (SELECT msg.created_at FROM gc_messages msg
                      WHERE msg.channel_id = gc_channels.id
                      ORDER BY msg.created_at DESC, msg.id DESC LIMIT 1)
 WHERE id IN (SELECT channel_id FROM gc_chat_import_map);

UPDATE gc_conversation_members SET last_read_message_id = (
  SELECT msg.id FROM gc_messages msg
   WHERE msg.channel_id = gc_conversation_members.channel_id
   ORDER BY msg.created_at DESC, msg.id DESC LIMIT 1)
 WHERE channel_id IN (SELECT channel_id FROM gc_chat_import_map);

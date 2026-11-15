-- Forum-chat import (Phase 1, Task 10): copies the forum's live-chat and 1:1
-- DM history into GooberCord's gc_* tables on the SHARED wempo-forum-data D1.
--
-- Run with: npm run db:import:forum:local  (see package.json)
--
-- Contract:
--   * Forum tables (chat_messages, dm_messages, dm_threads, users) appear
--     ONLY as read sources in subqueries — this file never writes forum rows.
--   * Every insert is rerun-safe. Message rows ride the
--     (channel_id, author_id, client_message_id) UNIQUE key with the
--     'import-chat-<id>' / 'import-dm-<id>' sentinels, so a rerun is a no-op
--     through the UNIQUE constraint alone (INSERT OR IGNORE). Structural rows
--     (server, channels, members) are guarded with WHERE NOT EXISTS on
--     deterministic keys.
--   * Forum schema caps (chat bodies <= 500, dm bodies <= 1000, pinned by
--     tests/import-sql.test.mjs) can never violate gc_messages
--     CHECK(length(body) BETWEEN 1 AND 2000).

--.server ---------------------------------------------------------------------

-- One server, owned by the forum's admin (the forum allows exactly one, via
-- idx_users_single_admin), created as early as its earliest chat/DM activity.
INSERT INTO gc_servers (name, owner_user_id, created_at)
SELECT 'Wempo''s Forum',
       (SELECT id FROM users WHERE role IN ('owner','admin') ORDER BY created_at LIMIT 1),
       COALESCE(
         (SELECT MIN(created_at) FROM chat_messages),
         (SELECT MIN(created_at) FROM dm_messages),
         CAST(strftime('%s','now') AS INTEGER)
       )
WHERE NOT EXISTS (SELECT 1 FROM gc_servers WHERE name = 'Wempo''s Forum');

--.default channels -----------------------------------------------------------

-- #general (kind='text') at position 0.
INSERT INTO gc_channels (server_id, name, kind, position, created_at)
SELECT s.id, 'general', 'text', 0, s.created_at
FROM gc_servers s
WHERE s.name = 'Wempo''s Forum'
  AND NOT EXISTS (
    SELECT 1 FROM gc_channels c
    WHERE c.server_id = s.id AND c.name = 'general'
  );

-- #forum-archive (kind='text') at position 1: the chat-history home.
INSERT INTO gc_channels (server_id, name, kind, position, created_at)
SELECT s.id, 'forum-archive', 'text', 1, s.created_at
FROM gc_servers s
WHERE s.name = 'Wempo''s Forum'
  AND NOT EXISTS (
    SELECT 1 FROM gc_channels c
    WHERE c.server_id = s.id AND c.name = 'forum-archive'
  );

--.membership -----------------------------------------------------------------

-- The owning admin's member row carries the owner role.
INSERT INTO gc_server_members (server_id, user_id, role, joined_at)
SELECT s.id, s.owner_user_id, 'owner', s.created_at
FROM gc_servers s
WHERE s.name = 'Wempo''s Forum'
  AND NOT EXISTS (
    SELECT 1 FROM gc_server_members sm
    WHERE sm.server_id = s.id AND sm.user_id = s.owner_user_id
  );

-- Every forum user with chat or DM history joins as a plain member, joined at
-- their earliest imported activity.
INSERT INTO gc_server_members (server_id, user_id, role, joined_at)
SELECT s.id, h.user_id, 'member', h.first_at
FROM (
  SELECT user_id, MIN(first_seen) AS first_at
  FROM (
    SELECT user_id, created_at AS first_seen FROM chat_messages
    UNION ALL
    SELECT user_id, created_at AS first_seen FROM dm_messages
    UNION ALL
    SELECT user_a, created_at AS first_seen FROM dm_threads
    UNION ALL
    SELECT user_b, created_at AS first_seen FROM dm_threads
  )
  GROUP BY user_id
) h
JOIN gc_servers s ON s.name = 'Wempo''s Forum'
WHERE NOT EXISTS (
  SELECT 1 FROM gc_server_members sm
  WHERE sm.server_id = s.id AND sm.user_id = h.user_id
);

--.live chat -> #forum-archive ------------------------------------------------

-- All forum live-chat messages, original created_at preserved, flagged
-- source='forum-chat'. The 'import-chat-<id>' sentinel makes a rerun a no-op
-- through the UNIQUE(channel_id, author_id, client_message_id) constraint.
INSERT OR IGNORE INTO gc_messages (channel_id, author_id, body, client_message_id, source, created_at)
SELECT c.id,
       m.user_id,
       m.body,
       'import-chat-' || m.id,
       'forum-chat',
       m.created_at
FROM chat_messages m
JOIN gc_channels c
  ON c.kind = 'text'
 AND c.name = 'forum-archive'
 AND c.server_id = (SELECT id FROM gc_servers WHERE name = 'Wempo''s Forum');

--.dm threads -> dm channels ---------------------------------------------------

-- Each dm_threads row becomes a server-less (kind='dm') channel. dm_threads
-- guarantees user_a < user_b, but MIN()/MAX() keep the pair key canonical
-- regardless, so the deterministic channel name — and therefore the channel
-- id — is a pure function of the participant pair.
INSERT INTO gc_channels (server_id, name, kind, position, created_at)
SELECT NULL,
       'dm-' || MIN(t.user_a, t.user_b) || '-' || MAX(t.user_a, t.user_b),
       'dm',
       0,
       t.created_at
FROM dm_threads t
WHERE NOT EXISTS (
  SELECT 1 FROM gc_channels c
  WHERE c.kind = 'dm'
    AND c.name = 'dm-' || MIN(t.user_a, t.user_b) || '-' || MAX(t.user_a, t.user_b)
);

-- Both thread participants become conversation members of their pair channel.
INSERT OR IGNORE INTO gc_conversation_members (channel_id, user_id)
SELECT c.id, t.user_a
FROM dm_threads t
JOIN gc_channels c
  ON c.kind = 'dm' AND c.server_id IS NULL
 AND c.name = 'dm-' || t.user_a || '-' || t.user_b;

INSERT OR IGNORE INTO gc_conversation_members (channel_id, user_id)
SELECT c.id, t.user_b
FROM dm_threads t
JOIN gc_channels c
  ON c.kind = 'dm' AND c.server_id IS NULL
 AND c.name = 'dm-' || t.user_a || '-' || t.user_b;

--.dm messages -----------------------------------------------------------------

-- DM history into the pair channels, original created_at preserved, flagged
-- source='forum-dm', same sentinel-based rerun idempotency as chat.
INSERT OR IGNORE INTO gc_messages (channel_id, author_id, body, client_message_id, source, created_at)
SELECT c.id,
       m.user_id,
       m.body,
       'import-dm-' || m.id,
       'forum-dm',
       m.created_at
FROM dm_messages m
JOIN dm_threads t ON t.id = m.thread_id
JOIN gc_channels c
  ON c.kind = 'dm' AND c.server_id IS NULL
 AND c.name = 'dm-' || t.user_a || '-' || t.user_b;

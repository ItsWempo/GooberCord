-- 0026 read parity (the W-B1 wave, Nov 17 2026):
--
-- 1. gc_messages.is_pinned — the pins lane's column (Discord's pin cap 250
--    rides GC_PINS_MAX_PER_CHANNEL in code): zero-existing behavior, every
--    row rides DEFAULT 0.
-- 2. gc_read_state DROPS — zero consumers (the 0018 sweep note carried:
--    "[message_id; gc_read_state has no consumers in GC]"); the LIVE read
--    markers are gc_conversation_members.last_read_message_id (0001), and
--    the new read-marker route + the tail auto-advance write THAT.
-- 3. The name CHECK widenings, cited rows (docs/parity-limits.md):
--      gc_emoji  2..16 → 2..32  (corroborated docs.food/userdoccers; the
--        official emoji resource page is SILENT on the cap — carry the
--        nuance verbatim),
--      gc_stickers 2..16 → 2..30 EXACT (official sticker resource; NOT a
--        32 superset — a 31-char sticker name failing is parity-correct),
--      gc_sounds 2..16 → 2..32 (official soundboard resource; its CHECK
--        rides the same statement family here).
--    SQLite cannot ALTER a CHECK, so each table takes the childless
--    rename-copy dance (0014's proven shape). NO canary is needed: none of
--    the three is a referenced parent (a repo-wide REFERENCES sweep showed
--    zero children — the 0024 canary discipline answers a POPULATED
--    PARENT's drop, and these three drop nothing of anyone's). The GLOB
--    alphabet arms stay verbatim — only the length arm moves.
ALTER TABLE gc_messages ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;

DROP TABLE gc_read_state;

CREATE TABLE gc_emoji_rebuild (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 32
    AND name GLOB '[A-Za-z0-9_][A-Za-z0-9_]*'
    AND name NOT GLOB '*[^A-Za-z0-9_]*'),
  attachment_id INTEGER NOT NULL
    REFERENCES gc_attachments(id) ON DELETE RESTRICT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE(server_id, name)
);
INSERT INTO gc_emoji_rebuild SELECT id, server_id, name, attachment_id, created_by, created_at FROM gc_emoji;
DROP TABLE gc_emoji;
ALTER TABLE gc_emoji_rebuild RENAME TO gc_emoji;

CREATE TABLE gc_stickers_rebuild (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 30
    AND name GLOB '[A-Za-z0-9_][A-Za-z0-9_]*'
    AND name NOT GLOB '*[^A-Za-z0-9_]*'),
  attachment_id INTEGER NOT NULL
    REFERENCES gc_attachments(id) ON DELETE RESTRICT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE(server_id, name)
);
INSERT INTO gc_stickers_rebuild SELECT id, server_id, name, attachment_id, created_by, created_at FROM gc_stickers;
DROP TABLE gc_stickers;
ALTER TABLE gc_stickers_rebuild RENAME TO gc_stickers;

CREATE TABLE gc_sounds_rebuild (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL
    CHECK(length(name) BETWEEN 2 AND 32
      AND name GLOB '[A-Za-z0-9_][A-Za-z0-9_]*'
      AND name NOT GLOB '*[^A-Za-z0-9_]*'),
  attachment_id INTEGER NOT NULL
    REFERENCES gc_attachments(id) ON DELETE RESTRICT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE(server_id, name)
);
INSERT INTO gc_sounds_rebuild SELECT id, server_id, name, attachment_id, created_by, created_at FROM gc_sounds;
DROP TABLE gc_sounds;
ALTER TABLE gc_sounds_rebuild RENAME TO gc_sounds;

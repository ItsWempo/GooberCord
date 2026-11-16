-- 0007: phase-3 channel layers — channel categories, per-channel/per-category
-- permission overwrites, and the per-channel slowmode cooldown.
--
-- Runs against the SHARED wempo-forum-data D1 (one migration ledger), so every
-- object here is gc_-prefixed: the two new tables FK into gc_servers /
-- gc_channels / gc_roles (GooberCord-owned targets) and users(id) is read-only
-- referenced nowhere here. The two ALTERs widen GooberCord's own gc_channels.
--
-- GRACEFUL DEFAULT: a server with NO categories and NO overwrite rows behaves
-- exactly like the pre-0007 server — every existing flow is unchanged, and
-- the permission evaluator treats the empty layer set as today's implicit
-- base (VIEW/SEND implicit-allow for every member) until a deny exists.

CREATE TABLE IF NOT EXISTS gc_channel_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 32),
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Category CRUD, the sidebar render, and the overwrite walk all resolve by
-- server.
CREATE INDEX IF NOT EXISTS idx_gc_channel_categories_server ON gc_channel_categories(server_id);

-- The channel's category ride: a channel without a category keeps NULL (the
-- graceful default), and deleting a category UN-FILES its channels rather
-- than deleting them (Discord's rule: the folder goes, the channels stay).
ALTER TABLE gc_channels ADD COLUMN category_id INTEGER NULL
  REFERENCES gc_channel_categories(id) ON DELETE SET NULL;

-- Per-channel slowmode (filed menu 0 / 15m / 30m / 1h / 2h / 6h), enforced in
-- the send path as the cooldown against the author's newest message. 0 = off.
ALTER TABLE gc_channels ADD COLUMN slowmode_seconds INTEGER NOT NULL DEFAULT 0;

-- The override LAYER (channel-permissions guide): one row per
-- (channel_or_category, role). role_id NULL is GC's @everyone base layer
-- sentinel; the MEMBER-SPECIFIC tier is deliberately RESERVED and not
-- implemented in v1 (filed: roles + @everyone covers every filed use case —
-- a later member_id column would slot beside role_id).
CREATE TABLE IF NOT EXISTS gc_channel_overwrites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NULL REFERENCES gc_channels(id) ON DELETE CASCADE,
  category_id INTEGER NULL REFERENCES gc_channel_categories(id) ON DELETE CASCADE,
  role_id INTEGER NULL REFERENCES gc_roles(id) ON DELETE CASCADE,
  allow_mask INTEGER NOT NULL DEFAULT 0,
  deny_mask INTEGER NOT NULL DEFAULT 0,
  -- Exactly one layer target: a row is either a channel override or a
  -- category override, never both and never neither.
  CHECK((channel_id IS NOT NULL OR category_id IS NOT NULL)
        AND (channel_id IS NULL OR category_id IS NULL))
);

-- One row per (channel_or_category, role): the single unique key covers both
-- layer shapes because the CHECK pins exactly one of the two id columns.
-- role_id NULL sorts as the @everyone sentinel (real role ids start at 1).
CREATE UNIQUE INDEX IF NOT EXISTS idx_gc_channel_overwrites_layer ON gc_channel_overwrites(
  IFNULL(channel_id, 0), IFNULL(category_id, 0), IFNULL(role_id, 0)
);

-- The evaluator's lookup indexes (the reverse rides the FK's own index on the
-- parent tables' side; these serve deleting a channel/category and the walk's
-- per-channel read).
CREATE INDEX IF NOT EXISTS idx_gc_channel_overwrites_channel ON gc_channel_overwrites(channel_id);
CREATE INDEX IF NOT EXISTS idx_gc_channel_overwrites_category ON gc_channel_overwrites(category_id);

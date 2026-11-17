-- 0023: the server-boost LEVELS (the 2026-11-17 matrix) — the schema and
-- numbers the backend owns. The level read itself is a shared resolver over
-- gc_servers' recount-derived boosts counter (no migration needed — the
-- counter already exists); what DOES need a table is the one level-gated
-- feature with rows: the soundboard. gc_sounds is the gc_emoji/gc_stickers
-- twin (the 0020 shape verbatim): server-scoped, attachment-backed via the
-- standalone intake, RESTRICT on the attachment, the same strict name
-- CHECK, UNIQUE(server, name). The matrix's slots are 24 at level 1, 36 at
-- level 2, 48 at level 3 — the level-0 base admits NONE
-- (GC_SOUNDBOARD_MAX_PER_SERVER = 0), the sounds' own routes are the later
-- feature wave; this file carries the table the numbers key on. The other
-- level-gated features (animated icons, banners, role icons, invite
-- backgrounds, custom invite links) are FRONTEND+ASSETS waves — no
-- server-side table, the resolver carries their booleans.
--
-- Same contract as every sibling migration: the shared wempo-forum-data D1,
-- every object gc_-prefixed and independent of the later migrations —
-- applies cleanly right after 0022 (its only precondition).

CREATE TABLE gc_sounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE,
  -- The same strict name CHECK verbatim as the 0020 twin (both GLOB arms:
  -- the first requires the pair start inside the set, the NOT GLOB requires
  -- EVERY char inside the set — GLOB brackets are case-sensitive, so both
  -- cases are listed): the :s:name:id wire token's grammar, spelled once.
  name TEXT NOT NULL
    CHECK(length(name) BETWEEN 2 AND 16
      AND name GLOB '[A-Za-z0-9_][A-Za-z0-9_]*'
      AND name NOT GLOB '*[^A-Za-z0-9_]*'),
  -- The sound's picture/asset rides the standalone intake; RESTRICT because
  -- an orphaned asset row must fail loudly, the way the 0020 expressions'
  -- cleanup owns.
  attachment_id INTEGER NOT NULL REFERENCES gc_attachments(id) ON DELETE RESTRICT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE(server_id, name)
);

-- 0024: the parity law's name bounds — the parity law
-- (docs/parity-limits.md, verified 2026-11-17) reads Discord's real limits
-- directly: role names are 1–100 characters ("Role name length | 1–100"),
-- and GC's category names ride the same bound. The old 32-char CHECK rode
-- in with 0006/0007's hand-tuned numbers; this file widens BOTH name CHECKs
-- to 100. The route-side ROLE_NAME_MAX flips with it (one mirror constant).
-- Existing rows are unaffected: no stored name exceeds 32 today (the old
-- CHECK admitted at most that).
--
-- Shape discipline (pinned by tests/migration-scoping-0024.test.mjs):
-- BOTH tables are REFERENCED tables (gc_member_roles.role_id and
-- gc_channel_overwrites.role_id name gc_roles; gc_channels.category_id and
-- gc_channel_overwrites.category_id name gc_channel_categories), and BOTH
-- referencing children are ON DELETE CASCADE or SET NULL — the 0021 shape's
-- "the populated DROP fails LOUDLY" guarantee does NOT come free here,
-- because an FK-enforcing engine's implicit DELETE on DROP fires the
-- children's CASCADE/SET-NULL ACTIONS instead of refusing (verified on D1's
-- engine 2026-11-17: a populated CASCADE parent drops cleanly and silently
-- prunes every referencing child row; PRAGMA foreign_keys=OFF is ignored
-- mid-file and PRAGMA defer_foreign_keys internal-errors — the pragmas
-- cannot rescue the shape). So each rebuild is CANARY-GUARDED: a one-row
-- table REFERENCES the parent ON DELETE RESTRICT, filled only when the
-- parent holds rows (an empty SELECT inserts nothing). A runner that
-- enforces FKs then refuses the populated DROP loudly (the RESTRICT canary
-- is its only NO-ACTION child) and the ledger rolls the whole file back —
-- verified: a failed multi-statement file leaves NOTHING applied. An
-- FK-ignoring runner (or an empty parent) rebuilds cleanly; only such a
-- runner could have silently pruned, and it loses no data it cannot name —
-- the file aborts loudly instead. The rest of the shape is the 0013→0014
-- lesson (RENAME the parent, DROP it) avoided the 0021 way: create a NEW
-- table with the widened bound, copy every row (ids INSERT explicitly, so
-- children's links stay exact and sqlite_sequence follows the highest
-- inserted id), DROP the original BY ITS OWN NAME (a DROP rewrites nothing
-- — the child clauses still name the original), then RENAME the copy over
-- that exact name, so the children are never rewritten at all.
--
-- Same contract as every sibling migration: the shared wempo-forum-data D1,
-- every object gc_-prefixed and independent of the later migrations —
-- applies cleanly right after 0023 (its only precondition) as well as at
-- the end of the sequence.

CREATE TABLE gc_roles_fk_canary_0024 (
  role_id INTEGER NOT NULL REFERENCES gc_roles(id) ON DELETE RESTRICT
);
-- HAVING, not WHERE: MIN(id) over an EMPTY table still yields one NULL row,
-- and the NOT NULL canary column would refuse it — the HAVING drops that
-- aggregate row when the parent is empty, leaving the canary empty too.
INSERT INTO gc_roles_fk_canary_0024 (role_id)
  SELECT MIN(id) FROM gc_roles HAVING COUNT(*) > 0;

CREATE TABLE gc_roles_rebuild (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE,
  -- The single delta from 0006: the bound widened to the parity law's row
  -- (docs/parity-limits.md: role name length 1–100).
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
  color TEXT NULL CHECK(color IS NULL OR length(color) = 7
        AND color GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'),
  position INTEGER NOT NULL DEFAULT 0,
  permissions INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- The copy: ids INSERT explicitly (id IS the rowid — gc_member_roles and the
-- overwrite rows' role_id links stay exact), so nothing is renumbered.
INSERT INTO gc_roles_rebuild
  (id, server_id, name, color, position, permissions, created_at)
SELECT id, server_id, name, color, position, permissions, created_at
FROM gc_roles;

DROP TABLE gc_roles;

ALTER TABLE gc_roles_rebuild RENAME TO gc_roles;

-- Dropped with the table (0006's); recreated verbatim.
CREATE INDEX idx_gc_roles_server ON gc_roles(server_id);

-- The canary leaves with the rebuild (its whole job rode the parent DROP).
DROP TABLE gc_roles_fk_canary_0024;

CREATE TABLE gc_channel_categories_fk_canary_0024 (
  category_id INTEGER NOT NULL
    REFERENCES gc_channel_categories(id) ON DELETE RESTRICT
);
INSERT INTO gc_channel_categories_fk_canary_0024 (category_id)
  SELECT MIN(id) FROM gc_channel_categories HAVING COUNT(*) > 0;

CREATE TABLE gc_channel_categories_rebuild (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE,
  -- The single delta from 0007: the bound widened to ride the parity law's
  -- role-name row (GC's category names share the bound, per the wave).
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

INSERT INTO gc_channel_categories_rebuild
  (id, server_id, name, position, created_at)
SELECT id, server_id, name, position, created_at
FROM gc_channel_categories;

DROP TABLE gc_channel_categories;

ALTER TABLE gc_channel_categories_rebuild RENAME TO gc_channel_categories;

-- Dropped with the table (0007's); recreated verbatim.
CREATE INDEX idx_gc_channel_categories_server ON gc_channel_categories(server_id);

DROP TABLE gc_channel_categories_fk_canary_0024;

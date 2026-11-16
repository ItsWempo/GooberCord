-- 0005: Goober+ perks pack — free-for-every-one cosmetics (Nitro-flavored,
-- $0, no payments anywhere).
--
-- WHY A NEW accent_color COLUMN (and not the users.profile_accent the forum
-- already carries): the FORUM owns that column and defines it as a
-- whitelisted palette KEY (one of its fixed preset names, e.g. 'ember'), not
-- a color literal. GooberCord's accents are validated lowercase
-- #rgb/#rrggbb hex strings; storing GC hex in profile_accent would feed the
-- forum's renderer a value its palette-key lookup can never answer (and any
-- forum-side palette write could clobber GC's hex in return). The shared D1
-- keeps the forum's contract untouched, so GooberCord adds its OWN additive,
-- nullable column — the forum never reads it, GC never writes palette keys
-- there. Same story for tagline (≤80 chars, GC-only).
--
-- Server boosts: one boost per member per server (PRIMARY KEY), the
-- gc_servers.boosts counter is always RE-DERIVED from the boost rows (never
-- incremented in place), so an idempotent replay can never drift it.

ALTER TABLE users ADD COLUMN accent_color TEXT;
ALTER TABLE users ADD COLUMN tagline TEXT;

ALTER TABLE gc_servers ADD COLUMN boosts INTEGER NOT NULL DEFAULT 0;

CREATE TABLE gc_server_boosts (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, server_id)
);

CREATE INDEX idx_gc_server_boosts_server ON gc_server_boosts(server_id);

-- 0006: phase-3 role foundation — server roles, member-role assignments, and
-- the two phase-3 neighbors that ride the same migration (the per-server
-- nickname on the membership row, and the spoiler-channel toggle on channels).
--
-- Runs against the SHARED wempo-forum-data D1 (one migration ledger), so every
-- object here is gc_-prefixed: the two new tables are gc_servers / shared
-- users FK targets (read-only reference, same contract as 0001), and the two
-- ALTERs widen GooberCord's own gc_server_members / gc_channels.
--
-- GRACEFUL DEFAULT: a server with NO roles row behaves exactly like the
-- pre-0006 server — every existing flow is unchanged, and the plain string
-- membership tiers (owner/moderator/member) keep their today behavior until
-- a role is added.

CREATE TABLE IF NOT EXISTS gc_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 32),
  color TEXT NULL CHECK(color IS NULL OR length(color) = 7
        AND color GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'),
  position INTEGER NOT NULL DEFAULT 0,
  permissions INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Role CRUD, the roster, and the member list grouping all resolve by server.
CREATE INDEX IF NOT EXISTS idx_gc_roles_server ON gc_roles(server_id);

CREATE TABLE IF NOT EXISTS gc_member_roles (
  server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES gc_roles(id) ON DELETE CASCADE,
  PRIMARY KEY (server_id, user_id, role_id)
);

-- Assignment resolution joins gc_member_roles by server (the PK prefix covers
-- it); this index serves the reverse ride: deleting a role fans its
-- assignments out by role_id, and permission checks scan a member's roles.
CREATE INDEX IF NOT EXISTS idx_gc_member_roles_role ON gc_member_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_gc_member_roles_server_user ON gc_member_roles(server_id, user_id);

-- The per-server identity (phase-3 neighbor): display precedence is
-- nickname > username in SERVER context only — DMs/profile keep the
-- username/display rules. Self-serve ("Change Nickname" is free for every
-- member); moderation overrides ride the routes, not the schema.
ALTER TABLE gc_server_members ADD COLUMN nickname TEXT NULL
  CHECK(nickname IS NULL OR length(trim(nickname)) BETWEEN 1 AND 32);

-- Spoiler channels (phase-3 neighbor, GC-OWNED): a per-channel opt-in gate
-- whose acknowledge state lives client-side (localStorage ack is enough at GC
-- scale); the notice dialog renders from name + the caller's payload alone.
ALTER TABLE gc_channels ADD COLUMN is_spoiler INTEGER NOT NULL DEFAULT 0;

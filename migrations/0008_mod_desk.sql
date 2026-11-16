-- 0008: phase-3 mod desk — the members-page cluster (bans, timeout with its
-- three gates' columns, member prune, verification level) plus join
-- attribution.
--
-- Same contract as 0006/0007: the shared wempo-forum-data D1 (one migration
-- ledger), so every object here is gc_-prefixed and INDEPENDENT of every
-- later migration — this file applies cleanly right after 0006 as well as on
-- a database that already carries 0007. Only gc_* tables are created, and the
-- three ALTERs GooberCord's own gc_server_members / gc_servers / gc_messages
-- (users is never touched beyond the read-only FK reference on gc_server_bans
-- and gc_server_bans.created_by — a target, not a write).
--
-- File mapping (each bullet lands on one column/table):
--   Ban affordance (invalid-invite taxonomy): gc_server_bans — kick + a ban
--     flag the join routes check, so a valid invite can't re-admit them.
--   Time-out FAQ: gc_server_members.timed_out_until (NULL = not timed out).
--   Members page (join method attribution): gc_server_members.created_by_invite
--     — the invite code read off the membership row at join time.
--   Verification level (verification-levels article): gc_servers.
--     verification_level. GC compresses Discord's five-level ladder to the two
--   derivable gates (account age via users.created_at, membership age via
--   joined_at) as 0=none, 1=account older than 1 day, 2=account older than
--   7 days, 3=member older than 10 minutes, 4=account older than 7 days AND
--   member older than 10 minutes. Owner/mods bypass either gate; the ladder
--   lives in api/permissions.mjs and is enforced in one helper both callers
--   share (message send + voice join).
--   Member prune (how-to-prune guide): no new table — inactivity is DERIVED
--   from message activity, so the index below is the only migration surface.

-- Account bans (the invalid-invite taxonomy's BANNED case). One row per
-- (server, user); the join routes' guard is a NOT EXISTS against this table,
-- so a ban row exists exactly as long as the user is banned. The reason is
-- optional and capped at 280.
CREATE TABLE IF NOT EXISTS gc_server_bans (
  server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by INTEGER NULL REFERENCES users(id),
  reason TEXT NULL CHECK(reason IS NULL OR length(reason) <= 280),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (server_id, user_id)
);

-- The timeout column (the time-out FAQ): NULL is not-timed-out, a past
-- timestamp has already expired, and removal sets it back to NULL at any
-- time. Kicks leave it behind — the row itself is what leaves.
ALTER TABLE gc_server_members ADD COLUMN timed_out_until INTEGER NULL;

-- Join attribution (the members-page guide's "store the invite id on the
-- membership row at join time"): the invite code that admitted the member, or
-- NULL for the owner row and discovery joins.
ALTER TABLE gc_server_members ADD COLUMN created_by_invite TEXT NULL;

-- Server-wide verification level, one column on gc_servers (the FAQ's own
-- answer: per-channel control is the overwrites layer's job, this is a
-- server-wide switch). 0 = none (every pre-0008 server's behavior).
ALTER TABLE gc_servers ADD COLUMN verification_level INTEGER NOT NULL DEFAULT 0
  CHECK(verification_level IN (0, 1, 2, 3, 4));

-- The prune's inactivity read: one member's message rows by (author, channel)
-- across the server's channels. The reverse (channel_id -> id) already rode
-- 0001; this index is the (author, channel) direction the COUNT's NOT EXISTS
-- walks.
CREATE INDEX IF NOT EXISTS idx_gc_messages_author_channel ON gc_messages(author_id, channel_id);

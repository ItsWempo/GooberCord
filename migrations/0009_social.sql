-- 0009: phase-3 social layer — the friend graph, the two-tier block table,
-- the per-user friend-request gate, and message reactions.
--
-- Same contract as 0006/0007/0008: the shared wempo-forum-data D1 (one
-- migration ledger), so every object here is gc_-prefixed and INDEPENDENT of
-- the later orderings — the file applies cleanly right after 0006 as well as
-- on a database that already carries 0007/0008 (nothing below names a 0007 or
-- 0008 object). Only gc_* tables are created: users is touched ONLY as a
-- read / FK target (every *_id REFERENCES users(id)), exactly like every other
-- shared-ledger migration. The scoping test (tests/migration-scoping-0009.test.mjs)
-- pins the invariant.
--
-- File mapping (each filed bullet lands on one table):
--   Friend system (friends-hub guides): gc_friend_requests (pending, one row
--     per (requester, target) pair) + gc_friends in the CANONICAL PAIR form
--     (user_a_id < user_b_id, pinned by CHECK) so a friendship is one row no
--     matter which side looks it up.
--   Friend-request gating (blocking-and-privacy guide): gc_social_prefs —
--     GC's Everyone vs OFF reading of Discord's who-may-send selector.
--     accept_requests 1 = Everyone (GC's default), 0 = OFF (requests closed →
--     the "not accepting requests" copy). One row per user; absent row reads
--     as the default 1 (the API reads COALESCE, so today's accounts never
--     need a backfill row).
--   Block + Ignore (ignore guide): gc_blocks, ONE table carrying the TWO
--     tiers (kind 'blocked' | 'ignored'). BLOCK is server-authoritative (it
--     must be, or the DM send gate lies); IGNORE is purely cosmetic — the
--     kind column stores the viewer's pref so the client's own hiding logic
--     has a server-backed list, and the server changes nothing else for it.
--   Reactions (message-reactions guide): gc_message_reactions — one row per
--     (message, user, emoji) triple, the PK pair being the toggle's own key.
--     emoji stores the RENDERED emoji (or its shortname form), capped at 32
--     so the column can never carry a paste beyond a picker's pick.

-- Friend requests (friends hub's Pending tab, sent and received rows alike).
-- The target's prefs gate the sending; the accepter is always the target side.
CREATE TABLE IF NOT EXISTS gc_friend_requests (
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (requester_id, target_id)
);

-- The reverse lookup (the received list + the accept/decline routes): the PK
-- walks the requester direction, so the target direction gets its own index.
CREATE INDEX IF NOT EXISTS idx_gc_friend_requests_target
  ON gc_friend_requests (target_id);

-- The friend-request gate (blocking-and-privacy guide): one row per user,
-- accept_requests 1 = Everyone (GC's default), 0 = OFF. The API read
-- COALESCEs the row, so every account without a row keeps the open default
-- and no backfill write ever targets users.
CREATE TABLE IF NOT EXISTS gc_social_prefs (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  accept_requests INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

-- The canonical pair form: one row per friendship, always stored smallest
-- side first (CHECK) so either-direction lookups are one indexed predicate.
CREATE TABLE IF NOT EXISTS gc_friends (
  user_a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  CHECK (user_a_id < user_b_id),
  PRIMARY KEY (user_a_id, user_b_id)
);

-- The two-tier block table (one row per (blocker, blocked) pair — upgrading a
-- block to an ignore or the reverse is the API route's UPSERT, never a second
-- row). 'ignored' rows exist ONLY so the client's hiding logic has a
-- server-backed list; no server gate ever reads them.
CREATE TABLE IF NOT EXISTS gc_blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('blocked','ignored')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

-- The reverse lookup (whose lists mention you, if a future gate needs it) and
-- the roster payload's own reads.
CREATE INDEX IF NOT EXISTS idx_gc_blocks_blocked ON gc_blocks (blocked_id);

-- Reactions: toggles key on (message, user, emoji) exactly as the PK states,
-- and a message's rows die with the message (CASCADE).
CREATE TABLE IF NOT EXISTS gc_message_reactions (
  message_id INTEGER NOT NULL REFERENCES gc_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK(length(emoji) BETWEEN 1 AND 32),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);

-- 0004: server discovery + invite links.
--
-- Runs against the SHARED wempo-forum-data D1 (one migration ledger for every
-- app that touches it), so every object here stays gc_-prefixed: the ALTER
-- widens GooberCord's own gc_servers table, and the new table/indexes are
-- gc_-namespaced FK targets of gc_servers / the shared users identity rows
-- (read-only reference, same contract as 0001). Statement numbering: 0003 is
-- taken by a parallel worker.
--
-- is_public flips a server into the discovery grid (GET /api/discover reads
-- it server-side); gc_invites holds the 8-char base64url code the sidebar's
-- invite dialog mints, with the member count of joins that came through it.

ALTER TABLE gc_servers ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS gc_invites (
  code TEXT PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0
);

-- Invites resolve by code (PK hit) but cascade-deletes fan in by server;
-- the join lookups ride the server index.
CREATE INDEX IF NOT EXISTS idx_gc_invites_server ON gc_invites(server_id);

-- The discovery grid's WHERE is_public = 1 over every gc_servers row.
CREATE INDEX IF NOT EXISTS idx_gc_servers_is_public ON gc_servers(is_public);

-- 0022: the upload tiers, owner-blessed via the full tier matrix
-- (goober-plus-tier-matrix, Nov 16 2026 night): free keeps its 5 MiB
-- admission (MAX_ATTACHMENT_BYTES — the matrix's "free is 25 MB" reads the
-- CURRENT plus cap; the route's free bound has always been 5 MiB and the
-- lead's ruling keeps it), Goober+ Mini admits 50 MiB, full Goober+ admits
-- the 1 GiB ceiling this file's CHECK carries. Two pieces:
--
-- 1. gc_plus_state gains the TIER column ('mini' | 'plus', NULL for rows
--    sold before the column existed). PROPOSED SEMANTICS for the owner (via
--    the lead): an ACTIVE term (renews_until > now) with tier 'mini' rides
--    the Mini perk set; an active term with tier 'plus' — including the
--    legacy NULL rows, read-side as full Goober+ so the migration can never
--    DOWNGRADE an existing member — rides the full set; a LAPSED term is
--    every tier's OFF (grace stays OFF, the standing strict predicate).
--    Upgrades/downgrades are purchases' writes on this column; no tier row
--    ever loses its term.
-- 2. the gc_attachments size ceiling: 25 MiB → 1 GiB (SQLite cannot ALTER a
--    CHECK). gc_attachments is a REFERENCED table (chunk rows CASCADE,
--    expressions RESTRICT, server icons point by bare column), so the
--    rebuild is the safe shape the 0013→0014 incident taught and 0021
--    pinned: create the NEW table with the raised bound, copy every row
--    (ids INSERTed explicitly — rowids and every child link preserved),
--    DROP the original BY ITS OWN NAME (a DROP rewrites nothing), then
--    RENAME the copy over the exact name the children's clauses name.
--    The children are NEVER rewritten; no dangling-FK hazard. If a runner
--    enforces FKs mid-migration, the child-populated DROP fails LOUDLY and
--    the ledger refuses the apply.
--
-- The 0013 rebuild lost gc_attachments' partial pending index
-- (idx_gc_messages_pending dropped WITH its table and was never recreated);
-- this file recreates it verbatim on the rebuilt table.
--
-- Same contract as every sibling migration: the shared wempo-forum-data D1,
-- every object gc_-prefixed and independent of the later migrations —
-- applies cleanly right after 0021 (its only precondition).

ALTER TABLE gc_plus_state ADD COLUMN tier TEXT NULL
  CHECK (tier IS NULL OR tier IN ('mini', 'plus'));

CREATE TABLE gc_attachments_rebuild (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NULL REFERENCES gc_messages(id),
  uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime TEXT NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp','image/gif')),
  -- The tier ceiling (the matrix's widest admission — full Goober+); Mini's
  -- 50 MiB and free's 5 MiB ride the route's per-member cap constants, never
  -- this CHECK.
  size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 1073741824),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  width INTEGER NULL,
  height INTEGER NULL,
  created_at INTEGER NOT NULL,
  reviewed_by INTEGER NULL,
  reviewed_at INTEGER NULL
);

INSERT INTO gc_attachments_rebuild
  (id, message_id, uploader_id, mime, size_bytes, status, width, height, created_at, reviewed_by, reviewed_at)
SELECT id, message_id, uploader_id, mime, size_bytes, status, width, height, created_at, reviewed_by, reviewed_at
FROM gc_attachments;

DROP TABLE gc_attachments;

ALTER TABLE gc_attachments_rebuild RENAME TO gc_attachments;

CREATE INDEX idx_gc_messages_pending ON gc_attachments(status) WHERE status = 'pending';

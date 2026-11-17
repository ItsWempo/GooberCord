-- 0013: Goober+ Nitro perks (owner decisions, 2026-11-17 — the perks lane the
-- coins bundle's header reserved).
--
-- Same contract as 0011: the shared wempo-forum-data D1, every object here
-- gc_-prefixed and INDEPENDENT of every later migration — this file applies
-- cleanly right after 0002 as well. No new users columns (the forum owns the
-- shared users table's cosmetic columns; GC cosmetics live below), no new
-- payment path, no schema changes to the forum's objects.
--
-- File map (each piece lands on one blessed ruling):
--   gc_cosmetics — the member's Goober+ cosmetics row (banner, flair), GC-owned
--     (the 0005 pair — accent color + tagline — stays as shipped: FREE forever
--     for everyone; the owner's grandfather ruling, 2026-11-17). Writes are
--     plus-gated in api/accounts.mjs; reads are public (anyone sees a member's
--     cosmetics — gating a render would turn the perk into a visibility bug).
--   gc_attachments REBUILD — the plus upload tier. SQLite cannot ALTER a
--     CHECK, and gc_attachments' size CHECK hard-codes the free tier's 5 MiB,
--     so the table is rebuilt with the CHECK admitting the PLUS tier's bound
--     (constants.mjs: the DB CHECK is the ADMISSION ceiling — the route
--     enforces the per-member tier: MAX_ATTACHMENT_BYTES free,
--     GC_PLUS_ATTACHMENT_BYTES for an active Goober+ term). A rename-and-copy
--     rebuild, not a drift: child FKs (chunk rows, server icons, message
--     links) resolve by TABLE NAME, so after the old table is renamed the new
--     gc_attachments IS the one every child statement binds to — no child
--     table is touched, and a failing copy aborts before the old data is lost.

CREATE TABLE IF NOT EXISTS gc_cosmetics (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Strict lowercase #rgb/#rrggbb hex, validated by api/plus.mjs — the same
  -- discipline api/accent.mjs set for the 0005 accent (an inline style can
  -- never carry anything else).
  banner_color TEXT,
  -- Plain short text (<= 16 chars, single line): the client renders it with
  -- textContent only (the CSP guarantee is structural — see frontload/dom).
  flair_text TEXT,
  updated_at INTEGER NOT NULL
);

-- The rebuild: rename the old table out of the way, create the replacement,
-- copy every row, drop the shell. Child FKs bind by name, so the swap leaves
-- every referencing table (chunk rows, server icons) resolving to the new
-- table without a single child edit.
ALTER TABLE gc_attachments RENAME TO gc_attachments_pre_nitro;

CREATE TABLE gc_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NULL REFERENCES gc_messages(id),
  uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime TEXT NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp','image/gif')),
  -- The tier ceiling, raised for the Goober+ plus tier (25 MiB admission
  -- bound; the free tier's 5 MiB rides MAX_ATTACHMENT_BYTES at the route).
  size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 26214400),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  width INTEGER NULL,
  height INTEGER NULL,
  created_at INTEGER NOT NULL,
  reviewed_by INTEGER NULL,
  reviewed_at INTEGER NULL
);

INSERT INTO gc_attachments SELECT * FROM gc_attachments_pre_nitro;

DROP TABLE gc_attachments_pre_nitro;

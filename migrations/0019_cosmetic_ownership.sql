-- 0019: the cosmetics sink's ownership table (the economy re-rule).
--
-- The owner re-rule (2026-11-17): coins are earned by IN the community and
-- spent on COSMETICS. banner/flair equip now requires OWNERSHIP (the shop
-- spend mintS the row here; gc_cosmetics keeps being the EQUIPPED values in
-- migration 0013's shape — nothing about it changes). One row per (user,
-- item); a re-spend is refused by the spend statement's NOT EXISTS, so the
-- table only ever needs the two-tuple PK.
--
-- gc_-only scope, one CREATE, no rebuild, no FK changes: user_id is the
-- shared users identity rows as read-only FK target (same contract as 0011).

CREATE TABLE IF NOT EXISTS gc_cosmetic_ownership (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item TEXT NOT NULL CHECK (item IN ('banner', 'flair')),
  purchased_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item)
);

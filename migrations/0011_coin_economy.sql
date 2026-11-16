-- 0011: Goober Coins economy + Goober+ state (owner decisions, 2026-11-16).
--
-- Same contract as 0004/0006/0007/0008: the shared wempo-forum-data D1 (one
-- migration ledger), so every object here is gc_-prefixed and INDEPENDENT of
-- every later migration — this file applies cleanly right after 0002 as well
-- as on a database that already carries 0007/0008. Only gc_* tables are
-- created; the shared `users` rows are read-only FK targets, never writes.
-- No purchase path exists anywhere in this feature (owner decision: coins are
-- earned ONLY by activity — never purchased, never transferable, never
-- expiring — and the ledger records the earn trail as DELTA-ONLY rows, so
-- a member's balance is always SUM(deltas) and a balance column would be a
-- second, driftable copy of it).
--
-- File mapping (each table lands on one owner call):
--   gc_coin_ledger — every coin movement: a signed delta per row PLUS the
--     grant's source label. Earns land here automatically (per-message points
--     from api/messages.mjs's send primitive, voice-presence ticks from the
--     client's presence loop) or by claim (the daily activity grant,
--     POST /api/coins/claim). Spends land here exactly as one negative row
--     per Goober+ action (gc_plus_state holds no coins). Every guard that
--     mints a row — the per-source day cap, the ONE daily ceiling across all
--     sources, the sufficient-coins check — rides INSIDE the statement that
--     writes the row (api/coins.mjs), so a replayed or racing request can
--     never mint past its caps.
--   gc_plus_state — ONE bundle row per member (accent/tagline/perks stay as
--     migration 0005 left them and server boosts stay FREE): the monthly term
--     end, the grace window, the tenure start (the member's FIRST term —
--     renewals never move it), and the gifter trail (gifted_by reflects the
--     last gifter; the money trail itself is the ledger's related_user_id).

CREATE TABLE IF NOT EXISTS gc_coin_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The delta-only rule: no balance column exists anywhere, and a zero row
  -- would be a lie (SUM(deltas) is THE balance), so a row must move coins.
  delta INTEGER NOT NULL CHECK(delta <> 0),
  source TEXT NOT NULL CHECK(length(source) BETWEEN 1 AND 24),
  -- The gift trail's other half: the GIFT RECIPIENT's id on a plus_gift
  -- spend row (the gifter is user_id). SET NULL so a deleted partner never
  -- erases the spend row itself — the trail of what moved stays intact.
  related_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gc_coin_ledger_user_created
  ON gc_coin_ledger(user_id, created_at, source);

-- Goober+ term state. Active reads as: renews_until > now, OR inside the
-- grace window (grace_until is materialized lazily by api/coins.mjs on the
-- first touch after a term lapses — no cron). A lapse never resets tenure:
-- re-buying keeps tenure_started_at at the member's first term ever.
CREATE TABLE IF NOT EXISTS gc_plus_state (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  renews_until INTEGER NOT NULL,
  grace_until INTEGER NULL,
  tenure_started_at INTEGER NOT NULL,
  -- The LAST gifter on this row (a self-renewal preserves the old value); the
  -- full gift trail lives in gc_coin_ledger's plus_gift rows.
  gifted_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gc_coin_ledger_gift_trail
  ON gc_coin_ledger(related_user_id, source);

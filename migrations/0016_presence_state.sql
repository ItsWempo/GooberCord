-- 0016: presence tiers (idle / do-not-disturb) — SHAVERS 5.
--
-- The persisted truth for the status overlay is gc_member_status (the hub
-- re-reads it on every heartbeat, so a PATCH survives hub eviction), so the
-- tier rides the SAME row, the same way: one bare nullable column alongside
-- status_text/status_until. NULL is the "online" default — every pre-0016
-- row stays exactly what it was. The tier differs from the status only in
-- that it never expires: no until column, the client renders the dot until
-- the member picks online again.
-- Scope: gc_-only (gc_member_status), one statement, no rebuild, no FK work.

ALTER TABLE gc_member_status ADD COLUMN presence_state TEXT NULL
  CHECK (presence_state IS NULL OR presence_state IN ('idle','dnd'));

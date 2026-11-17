-- 0017: invite lifecycle (SHAVERS 3) — expiry, use caps, soft revoke.
--
-- Three bare nullable columns on gc_invites (0004's table; no rebuild, no FK
-- work, gc_-only scope). Every column is NULL-tolerant so every pre-0017
-- invite keeps its exact pre-0017 behavior: null expires_at = never expires,
-- null max_uses = unlimited, null revoked_at = live. The "active" predicate
-- is ONE fragment the join SELECT, the join INSERT guard, and the uses-bump's
-- WHERE all share, so a join racing an expiry or a max can never overshoot;
-- revocation is a soft tombstone (the timestamp, not a DELETE) so the invite
-- list keeps showing the history the mod desk reads.

ALTER TABLE gc_invites ADD COLUMN expires_at INTEGER NULL;
ALTER TABLE gc_invites ADD COLUMN max_uses INTEGER NULL;
ALTER TABLE gc_invites ADD COLUMN revoked_at INTEGER NULL;

-- 0015: group-channel icons (SHAVERS 2).
--
-- Group DMs carry a custom icon beside their (already stored) name. The
-- reference mirrors the server-icon column exactly: 0003 added
-- gc_servers.icon_media_id as a BARE nullable integer (the gc_servers shape
-- predates an FK; the media id moves in the route only from an intake row the
-- CALLER uploaded, so the guard lives in the UPDATE's WHERE, not the schema).
-- The image itself rides the usual attachment intake (magic bytes, sanitizer,
-- 64k chunks, moderation status) — nothing here changes the intake.

ALTER TABLE gc_channels ADD COLUMN icon_media_id INTEGER NULL;

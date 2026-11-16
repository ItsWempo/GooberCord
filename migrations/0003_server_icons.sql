-- Server icons (GooberCord): gc_servers gains a nullable pointer to an
-- already-uploaded gc_attachments row. No new storage here — the icon media
-- itself rides the existing gc_attachments/gc_attachment_chunks intake
-- (migrations 0002), which is where the moderation gate and the serving
-- permissions already live.
--
-- This migration runs against the SHARED wempo-forum-data D1; it only ever
-- ALTERs a gc_-prefixed table (pinned by tests/migration-scoping.test.mjs).
ALTER TABLE gc_servers ADD COLUMN icon_media_id INTEGER NULL;

-- 0020_emoji_stickers.sql — server custom emoji + the sticker twin (the
-- blessed parity bundle, Nov 17 2026).
--
-- gc_emoji: server-scoped custom emoji, attachment-backed like every other
-- GC image (the emoji's picture IS a gc_attachments row — server icons,
-- avatars and message uploads all ride the same intake, serving gate and
-- moderation queue). Schema mirrors the blessed proposal 0a404b62:
--   UNIQUE(server_id, name) — one namespace per server, rename-safe (the
--     row's id never changes, so wire refs stay stable across a rename);
--   attachment_id ON DELETE RESTRICT — a referenced attachment cannot be
--     deleted out from under an emoji (the CRUD's delete batch releases the
--     reference itself, chunks-first, exactly the channel-delete ordering);
--   name 2..16 over [A-Za-z0-9_] — the alphabet Discord uses, CHECK-able in
--     plain SQLite (GLOB requires every char inside the set via the NOT GLOB
--     arm; GLOB brackets are case-sensitive, so both cases are listed);
--   created_by — the uploader of record (the create guard pins
--     attachment_id to one of the CALLER'S OWN gc_attachments rows, the
--     server-icon rule).
--
-- Wire token: <e:name:id> for emoji, <s:name:id> for stickers — 4 + name +
-- digits + 1 characters, so at the 16-char name cap the token is 29 long at
-- the current AUTOINCREMENT widths, inside gc_message_reactions'
-- CHECK(length(emoji) BETWEEN 1 AND 32).
--
-- gc_stickers is the TWIN (owner: stickers ship as their own concept, not a
-- kind on gc_emoji): identical shape with its own namespace and token
-- prefix. Discarded shape: the checklist's old "stickers are just animated
-- webp emoji" mapping — the ruling keeps both tables. APNG rides the
-- existing image/png MIME (gc_attachments' CHECK never changes).

CREATE TABLE IF NOT EXISTS gc_emoji (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 16
    AND name GLOB '[A-Za-z0-9_][A-Za-z0-9_]*'
    AND name NOT GLOB '*[^A-Za-z0-9_]*'),
  attachment_id INTEGER NOT NULL
    REFERENCES gc_attachments(id) ON DELETE RESTRICT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE(server_id, name)
);

CREATE TABLE IF NOT EXISTS gc_stickers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 16
    AND name GLOB '[A-Za-z0-9_][A-Za-z0-9_]*'
    AND name NOT GLOB '*[^A-Za-z0-9_]*'),
  attachment_id INTEGER NOT NULL
    REFERENCES gc_attachments(id) ON DELETE RESTRICT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE(server_id, name)
);

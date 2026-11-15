-- GooberCord core schema (Phase 1).
--
-- IMPORTANT: this migration runs against the SHARED wempo-forum-data D1.
-- Every object created here is gc_-prefixed; forum tables are only ever
-- referenced as FK targets (users(id)), never created or altered. The
-- scoping test (tests/migration-scoping.test.mjs) pins this invariant.

--.servers -------------------------------------------------------------------

CREATE TABLE gc_servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE gc_channels (
  id INTEGER PRIMARY KEY,
  server_id INTEGER NULL REFERENCES gc_servers(id),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100) DEFAULT 'dm',
  kind TEXT NOT NULL CHECK(kind IN ('text','voice','dm','group')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_message_id INTEGER NULL,
  last_message_at INTEGER NULL,
  CHECK((kind IN ('dm','group') AND server_id IS NULL)
        OR (kind IN ('text','voice') AND server_id IS NOT NULL))
);

--.membership -----------------------------------------------------------------

CREATE TABLE gc_server_members (
  server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','moderator','member')),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY(server_id, user_id)
);

-- The owner row's role must never be demoted; ownership transfer is a
-- separate flow, not a stray UPDATE.
CREATE TRIGGER gc_server_members_owner_guard
BEFORE UPDATE ON gc_server_members
WHEN OLD.role = 'owner' AND NEW.role <> 'owner'
BEGIN
  SELECT RAISE(ABORT, 'server owner role is immutable');
END;

CREATE TABLE gc_conversation_members (
  channel_id INTEGER NOT NULL REFERENCES gc_channels(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(channel_id, user_id)
);

--.messages -------------------------------------------------------------------

CREATE TABLE gc_messages (
  id INTEGER PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES gc_channels(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
  client_message_id TEXT NULL CHECK(length(client_message_id) BETWEEN 8 AND 64),
  source TEXT NULL CHECK(source IN ('forum-chat','forum-dm') OR source IS NULL),
  created_at INTEGER NOT NULL,
  edited_at INTEGER NULL,
  UNIQUE(channel_id, author_id, client_message_id)
);

CREATE TABLE gc_read_state (
  user_id INTEGER NOT NULL,
  channel_id INTEGER NOT NULL REFERENCES gc_channels(id) ON DELETE CASCADE,
  last_read_message_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, channel_id)
);

CREATE TABLE gc_member_status (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status_text TEXT NULL CHECK(status_text IS NULL OR length(status_text) <= 128),
  status_until INTEGER NULL,
  updated_at INTEGER NOT NULL
);

--.attachments ----------------------------------------------------------------

-- Uploads are chunked (D1 row sizes) and moderated before they attach to a
-- visible message: pending until a reviewer approves, rejected otherwise.
CREATE TABLE gc_attachments (
  id INTEGER PRIMARY KEY,
  message_id INTEGER NULL REFERENCES gc_messages(id),
  uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime TEXT NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp','image/gif')),
  size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  width INTEGER NULL,
  height INTEGER NULL,
  created_at INTEGER NOT NULL,
  reviewed_by INTEGER NULL,
  reviewed_at INTEGER NULL
);

CREATE TABLE gc_attachment_chunks (
  attachment_id INTEGER NOT NULL REFERENCES gc_attachments(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  data BLOB NOT NULL CHECK(length(data) BETWEEN 1 AND 64000),
  PRIMARY KEY(attachment_id, seq)
);

--.indexes --------------------------------------------------------------------

CREATE INDEX idx_gc_channels_server ON gc_channels(server_id, position);
CREATE INDEX idx_gc_messages_channel ON gc_messages(channel_id, id);
CREATE INDEX idx_gc_messages_pending ON gc_attachments(status) WHERE status = 'pending';
CREATE INDEX idx_gc_read_state_user ON gc_read_state(user_id);
CREATE INDEX idx_gc_conv_members_user ON gc_conversation_members(user_id);

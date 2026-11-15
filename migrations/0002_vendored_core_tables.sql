-- 0002: vendored core tables (users, sessions, known_ips, banned_ips, bans, blocks, site_settings).
-- GooberCord's vendored api/core contract expects the forum schema's identity
-- surfaces, but 0001 only shipped the gc_* tables — any register/login/session
-- route 500s with 'no such table: banned_ips' until these exist. In production
-- the shared forum D1 already carries them (CREATE TABLE IF NOT EXISTS is a
-- no-op there); this migration brings local/CI databases up to the same shape.
--
-- Statement bodies replayed verbatim from the forum's migrations 0001..0041 as
-- materialized final forms (no ALTERs). The 'users_new' spellings the forum's
-- rename migrations left in sessions/bans FKs are normalized back to 'users'.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'admin')),
  bio TEXT NOT NULL DEFAULT '' CHECK (length(bio) <= 10000),
  social_youtube TEXT CHECK (social_youtube IS NULL OR length(social_youtube) <= 120),
  social_x TEXT CHECK (social_x IS NULL OR length(social_x) <= 120),
  social_reddit TEXT CHECK (social_reddit IS NULL OR length(social_reddit) <= 120),
  social_github TEXT CHECK (social_github IS NULL OR length(social_github) <= 120),
  social_discord TEXT CHECK (social_discord IS NULL OR length(social_discord) <= 120),
  social_gitlab TEXT CHECK (social_gitlab IS NULL OR length(social_gitlab) <= 120),
  social_instagram TEXT CHECK (social_instagram IS NULL OR length(social_instagram) <= 120),
  social_tiktok TEXT CHECK (social_tiktok IS NULL OR length(social_tiktok) <= 120),
  social_twitch TEXT CHECK (social_twitch IS NULL OR length(social_twitch) <= 120),
  polytoria_username TEXT CHECK (polytoria_username IS NULL OR length(polytoria_username) <= 120),
  avatar_status TEXT CHECK (avatar_status IS NULL OR avatar_status IN ('approved', 'pending', 'rejected')),
  avatar_mime TEXT CHECK (avatar_mime IS NULL OR avatar_mime IN ('image/jpeg', 'image/png', 'image/webp')),
  avatar_data BLOB CHECK (avatar_data IS NULL OR length(avatar_data) <= 1048576),
  avatar_updated_at INTEGER,
  avatar_version TEXT,
  pending_avatar_mime TEXT CHECK (pending_avatar_mime IS NULL OR pending_avatar_mime IN ('image/jpeg', 'image/png', 'image/webp')),
  pending_avatar_data BLOB CHECK (pending_avatar_data IS NULL OR length(pending_avatar_data) <= 1048576),
  pending_avatar_updated_at INTEGER,
  pending_avatar_version TEXT,
  created_at INTEGER NOT NULL, profile_accent TEXT NOT NULL DEFAULT '', banner_color TEXT NOT NULL DEFAULT '', banner_text TEXT NOT NULL DEFAULT '', flair TEXT NOT NULL DEFAULT '', approved_css TEXT NOT NULL DEFAULT '', pending_css TEXT, css_status TEXT NOT NULL DEFAULT 'none'
  CHECK (css_status IN ('none', 'pending', 'approved')), pending_css_version TEXT, totp_secret TEXT, totp_pending_secret TEXT, totp_enabled INTEGER NOT NULL DEFAULT 0,
  CHECK (
    (avatar_mime IS NULL AND avatar_data IS NULL AND avatar_updated_at IS NULL AND avatar_version IS NULL)
    OR (avatar_mime IS NOT NULL AND avatar_data IS NOT NULL AND avatar_updated_at IS NOT NULL AND avatar_version IS NOT NULL)
  ),
  CHECK (
    (pending_avatar_mime IS NULL AND pending_avatar_data IS NULL AND pending_avatar_updated_at IS NULL AND pending_avatar_version IS NULL)
    OR (pending_avatar_mime IS NOT NULL AND pending_avatar_data IS NOT NULL AND pending_avatar_updated_at IS NOT NULL AND pending_avatar_version IS NOT NULL)
  ),
  CHECK (
    CASE
      WHEN avatar_status IS NULL
        THEN avatar_mime IS NULL AND pending_avatar_mime IS NULL
      WHEN avatar_status = 'approved'
        THEN avatar_mime IS NOT NULL AND pending_avatar_mime IS NULL
      WHEN avatar_status = 'pending'
        THEN pending_avatar_mime IS NOT NULL
      ELSE -- 'rejected' is a transient handler value: both sets empty
        avatar_mime IS NULL AND pending_avatar_mime IS NULL
    END
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_single_admin ON users(role) WHERE role IN ('admin', 'moderator');

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS known_ips (
  ip_hash TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (ip_hash, user_id)
);
CREATE INDEX idx_known_ips_user ON known_ips (user_id);

CREATE TABLE IF NOT EXISTS banned_ips (
  ip_hash TEXT NOT NULL,
  ban_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (ip_hash, ban_id)
);
CREATE INDEX idx_banned_ips_ban ON banned_ips (ban_id);
CREATE INDEX idx_banned_ips_hash ON banned_ips (ip_hash);

CREATE TABLE IF NOT EXISTS bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  created_at INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at INTEGER,
  revoked_at INTEGER,
  revoked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  revocation_reason TEXT CHECK (revocation_reason IS NULL OR length(revocation_reason) <= 500)
);
CREATE INDEX idx_bans_active ON bans(user_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX idx_blocks_blocked ON blocks(blocked_id);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

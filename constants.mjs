// Non-function shared constants. Kept out of worker.mjs's exports because
// workerd validates every Worker export as a function or ExportedHandler.
// This is the shared auth-contract surface the vendored api/core modules
// (and their wempos-forum twins) both import; the parity test at
// tests/contract-parity.test.mjs pins the vendored core to the forum's.

// Password hashing work factor. Keep aligned with the password verification
// implementation and benchmark when changing this value. Shared with the
// forum: password rows in the one production D1 database are only verifiable
// while both apps use the same pepper and the same iteration count.
export const PBKDF2_ITERATIONS = 100000;

export const SESSION_INSERT_IF_UNBANNED_SQL =
  "INSERT INTO sessions (token_hash, user_id, csrf_token, created_at, expires_at) " +
    "SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (" +
    "SELECT 1 FROM bans WHERE user_id = ? AND revoked_at IS NULL " +
    "AND (expires_at IS NULL OR expires_at > ?))";

// Rate limiting scopes. The GooberCord bindings (wrangler.toml) are named
// GC_*_RATE_LIMITER and are separate from the forum's limiters, so a forum
// spike can never throttle GooberCord traffic (and vice versa) despite the
// shared D1 database.
export const RATE_LIMIT_BINDINGS = Object.freeze({
  read: "GC_READ_RATE_LIMITER",
  write: "GC_WRITE_RATE_LIMITER",
  guest: "GC_GUEST_RATE_LIMITER",
  register: "GC_REGISTER_RATE_LIMITER",
  login: "GC_LOGIN_RATE_LIMITER",
  message: "GC_MESSAGE_RATE_LIMITER",
  upload: "GC_UPLOAD_RATE_LIMITER",
  password: "GC_PASSWORD_RATE_LIMITER",
  totp: "GC_TOTP_RATE_LIMITER",
});

// Server channel cap (Phase 1 Task 4): the guarded channel INSERT's
// COUNT(*) <= MAX_CHANNELS_PER_SERVER - 1 precondition enforces this per gc_
// server (the #general channel counts toward it).
export const MAX_CHANNELS_PER_SERVER = 8;

// Chat message hard ceiling (Phase 1 Task 8): one message body, bounded.
export const GC_MESSAGE_MAX = 2000;

// Attachment upload chunking: each D1 blob chunk stays under the 100KB D1
// row budget (Phase 1 Task 8/9).
export const ATTACHMENT_CHUNK_BYTES = 64000;

export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

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

// Image attachment cap (Phase 1 Task 6): the schema CHECKs size_bytes at 5
// MiB, but the JS intake refuses one byte more FIRST — a rejection that
// happens before any sniffing, sanitizing, or chunk insert can run. The
// request ceiling adds multipart envelope slack on top of the file cap.
export const MAX_ATTACHMENT_BYTES = 5_242_880;
export const MAX_ATTACHMENT_REQUEST_BYTES = MAX_ATTACHMENT_BYTES + 512 * 1024;

export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Voice (Phase 2): one WS binary frame per 20ms Opus packet, fanned out by the
// channel's own ChatRoom Durable Object (api/rooms.mjs). No WebRTC mesh, no
// SFU, no media proxying — the DO just relays small binary frames, which the
// FREE plan's hibernating DOs handle without any paid feature. These are the
// hard limits that keep it that way, mirrored in the voice pane's UI copy:
export const GC_VOICE_FRAME_VERSION = 1;
// Per channel. Talkers are capped by this participant cap too: the client only
// feeds Opus frames while its mic level is above the VAD threshold, so voices
// never exceed participants, and a 6-participant fan-out relays at most ~1,500
// 60-byte frames/sec DO-side — comfortable on the free plan.
export const GC_VOICE_MAX_PARTICIPANTS = 6;
// One Opus packet tops out at 1275 bytes (full-band 20ms at max bitrate); the
// ceiling has slack for header growth but still bounds a single frame a peer
// can make the DO relay to every other participant.
export const GC_VOICE_MAX_FRAME_BYTES = 2048;

// The server rules gate (0012): one owner-set text + per-member acceptance.
// The owner's rules document is bounded like the forum's own rules page copy
// (20 KiB); the shared 403's stable message rides the gate's payload so the
// client and the DO frames can echo it verbatim.
export const GC_RULES_MAX = 20_000;
export const RULES_GATE_MESSAGE = "You must accept this server's rules before doing that.";

// Goober Coins (owner decisions, 2026-11-16). Earned ONLY by activity, never
// purchased, never transferable, never expiring; the balance is SUM(gc_coin_
// ledger.delta) — no balance column exists. All four numbers below feed
// guards that ride INSIDE the ledger INSERTs themselves (api/coins.mjs), so
// the caps hold under races and replays, not just under polite clients.
//
// The daily ceiling is the hard farm cap ACROSS all grant sources: earned
// today (positive deltas only — spends never refund a ceiling) is checked
// against it by every minting statement.
export const GC_COIN_DAILY_CEILING = 250;
// The daily activity grant, claimed ONCE per UTC day on the shop page
// (POST /api/coins/claim — one consistent way; message/voice grants stay
// automatic because those are earned points, not the daily grant).
export const GC_COIN_DAILY_GRANT = 25;
// Per-message earned points: +1 per POSTED message, capped within its own
// source (GC_COIN_MESSAGE_DAILY_CAP messages' worth) AND the ceiling.
export const GC_COIN_MESSAGE_GRANT = 1;
export const GC_COIN_MESSAGE_DAILY_CAP = 100;
// Voice-presence time grants: the client posts one tick per presence window
// WHILE its voice session is connected; each verified tick grants this much.
// A spoofed tick stream is harmless — the source cap plus the ceiling bound
// it exactly like honest time does.
export const GC_COIN_VOICE_GRANT = 5;
export const GC_COIN_VOICE_TICK_SECONDS = 600;
export const GC_COIN_VOICE_DAILY_CAP = 150;

// Goober+ (owner decisions: ONE bundle, MONTHLY renewal, a grace window,
// boosts stay free, GIFT Goober+ in). The price buys gc_plus_state term
// extensions; the coin spend itself is gc_coin_ledger's negative row.
export const GC_PLUS_BUNDLE_NAME = "Goober+";
export const GC_PLUS_PRICE = 500;
export const GC_PLUS_TERM_DAYS = 30;
export const GC_PLUS_GRACE_DAYS = 7;

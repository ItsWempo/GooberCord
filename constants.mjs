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

// Message body bounds (0021, owner-blessed via the tier matrix): one message
// body, tiered at ADMISSION — free keeps 2000, Goober+ admits 4000 (Nitro's
// shape). The DB CHECK floors the widest bound; the route applies the tier.
export const GC_FREE_MESSAGE_MAX = 2000;
export const GC_PLUS_MESSAGE_MAX = 4000;

// Back-compat alias: the widest admission bound, what the DB CHECK carries.
export const GC_MESSAGE_MAX = GC_PLUS_MESSAGE_MAX;

// Attachment upload chunking: each D1 blob chunk stays under the 100KB D1
// row budget (Phase 1 Task 8/9).
export const ATTACHMENT_CHUNK_BYTES = 64000;

// Image attachment cap (Phase 1 Task 6): the schema CHECKs size_bytes at 5
// MiB, but the JS intake refuses one byte more FIRST — a rejection that
// happens before any sniffing, sanitizing, or chunk insert can run. The
// request ceiling adds multipart envelope slack on top of the file cap.
export const MAX_ATTACHMENT_BYTES = 5_242_880;
export const MAX_ATTACHMENT_REQUEST_BYTES = MAX_ATTACHMENT_BYTES + 512 * 1024;

// Goober+ perk tier (the 2026-11-17 Nitro-perks lane; each value blessed,
// then AMENDED by the economy re-rule the same day): integer tier values, not
// a runtime multiplier — the coin ledger's deltas are INTEGER rows
// (CHECK(delta <> 0)), so the tier reads as per-path values. The re-rule
// RETIRES the claim's tier (25 flat for everyone) and re-bases the message
// rate (2 free / 3 plus); voice (5/8) and the daily ceiling (250/500) stand
// as ever. The mint statements take the tier's values as binds
// (api/coins.mjs); a free member's values are the GC_COIN_* constants.
export const GC_PLUS_MESSAGE_GRANT = 3;
export const GC_PLUS_VOICE_GRANT = 8;
export const GC_PLUS_DAILY_CEILING = 500;

// The ECONOMY RE-RULE (owner, 2026-11-17): coins are earned by being IN the
// community and spent on COSMETICS — the claim tiering is retired (25 flat
// for everyone; GC_PLUS_DAILY_GRANT is gone). The remaining plus earns are
// these integer per-path values beside the free constants of the same block.
//
// The forum-post ROLLUP: a LAZY mint (the member's next coins touch mints one
// rollup row per UTC day for that user) counting the day's PUBLIC posts of
// GC_ROLLUP_MIN_BODY+ chars, at the tiered rate, capped at this many posts.
export const GC_ROLLUP_GRANT = 3;
export const GC_PLUS_ROLLUP_GRANT = 5;
export const GC_ROLLUP_DAILY_CAP = 5;
export const GC_ROLLUP_MIN_BODY = 40;
// The SERVER-CREATE mint: the community-builder's grant (50 free / 75 plus),
// capped at this many mints per UTC day (not coins — mint EVENTS).
export const GC_SERVER_GRANT = 50;
export const GC_PLUS_SERVER_GRANT = 75;
export const GC_SERVER_MINT_DAILY_CAP = 2;

// The SINK (coins' one purpose now): the cosmetics prices. GC_PLUS_SINK_
// DISCOUNT_PERCENT is enforced ROUTE-SIDE (api/coins.mjs) — the shop payload
// exposes BOTH prices and the spend statement carries the caller's own tier.
// The pack is PLUS-ONLY at its flat 250 (no discount: buying the pack is
// itself the plus-lane item). Accent + tagline stay FREE (owner call).
export const GC_COSMETIC_PACK_PRICE = 250;
export const GC_COSMETIC_BANNER_PRICE = 100;
export const GC_COSMETIC_FLAIR_PRICE = 100;
export const GC_PLUS_SINK_DISCOUNT_PERCENT = 50;
// The plus ATTACHMENT tier: the admission bound the rebuilt
// gc_attachments CHECK carries (migration 0013 — SQLite cannot ALTER a
// CHECK); the free tier's 5 MiB stands as MAX_ATTACHMENT_BYTES, and the
// route enforces the per-member tier from these constants. Dated supersession
// (2026-11-17): this is the first bundle rider to move an upload cap — the
// release-notes line "never moves your upload cap" is retired by THIS owner
// ruling, not quietly drifted past.
export const GC_PLUS_ATTACHMENT_BYTES = 26_214_400;
export const GC_PLUS_ATTACHMENT_REQUEST_BYTES = GC_PLUS_ATTACHMENT_BYTES + 512 * 1024;

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
export const GC_COIN_MESSAGE_GRANT = 2;
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
// The owner's pricing amendment: a member's FIRST term costs the full price,
// every later term (self-renewal OR a gift to someone who already has a row)
// is the renewal price.
export const GC_PLUS_PRICE = 500;
export const GC_PLUS_RENEWAL_PRICE = 400;
export const GC_PLUS_TERM_DAYS = 30;
export const GC_PLUS_GRACE_DAYS = 7;

// Custom emoji + stickers (parity bundle, Nov 17 2026). The 50-per-server
// inventory is Discord's own cap (the checklist's intake line) and rides the
// create statements themselves, so a burst of parallel creates can never
// overshoot it. The upload always RODE the attachment intake: magic bytes,
// sanitizer, 64k chunks, pending moderation — an emoji is just another
// referenced image (APNG's animated form rides image/png untouched).
export const GC_EMOJI_MAX_PER_SERVER = 50;
export const GC_STICKER_MAX_PER_SERVER = 50;
// Wire tokens: <e:name:id> / <s:name:id>. At the 16-char name cap and an
// 8-digit id the token is 29 characters — inside gc_message_reactions'
// CHECK(length(emoji) BETWEEN 1 AND 32).
export const GC_EMOJI_NAME_MIN = 2;
export const GC_EMOJI_NAME_MAX = 16;
export const GC_EMOJI_NAME_PATTERN = /^[A-Za-z0-9_]{2,16}$/;

// Super reactions (the plus-gated tier on the existing reaction stack): the
// set of unicode emoji that mark a reaction as "super". A non-plus member's
// ADD is refused at the reaction route; the SET itself is plain data (a
// client shows its sparkle styling keyed on it, never on a tier list).
export const GC_PLUS_REACTIONS = Object.freeze([
  "✨", "💫", "🌟", "🎆", "🎇", "🌈", "🪄", "🩷",
]);

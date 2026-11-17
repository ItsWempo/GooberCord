// Goober Coins routes + the Goober+ term state (owner decisions, 2026-11-16).
//
// COINS ARE EARNED ONLY BY ACTIVITY: never purchased, never transferable,
// never expiring, account-tied. There is deliberately NO purchase route —
// tests/coins-module.test.mjs pins that no pay/purchase/checkout path exists
// anywhere in the dispatch. The balance is always SUM(gc_coin_ledger.delta);
// no balance column exists anywhere.
//
// Every mint rides INSIDE the SQL (house pattern): the per-source day cap,
// the ONE daily ceiling across all grant sources, and the spend's
// sufficient-coins check are WHERE arms of the INSERT that writes the row, so
// a replayed or racing request can never mint past its caps. A failed mint is
// only classified afterwards (changes = 0 → the same no-coins-today copy).
//
// Routes (all user-owned reads, self-actioned writes; nothing here mints for
// anyone but the session member, and the gift route is the one guarded
// exception — it spends the GIFTING member's coins on a CHOSEN member's term):
//   GET  /api/coins          → balance, today's earned breakdown, plus state
//   GET  /api/coins/ledger   → the member's own ledger page (bare-id cursor)
//   GET  /api/coins/shop     → the blaxel shop payload (bundle + balance)
//   POST /api/coins/claim    → the daily activity grant (once per UTC day)
//   POST /api/coins/voice/tick → a voice-presence time grant (per window)
//   POST /api/plus/renew     → extend the member's own Goober+ term
//   POST /api/plus/gift      → spend coins to gift Goober+ to another member
//
// The renewal is MONTHLY from the current term (MAX(renews_until, now) + term,
// so a re-buy inside the grace window restores rather than stacks a stale
// term); grace is materialized lazily on the first touch after a lapse — no
// cron exists on the free plan. tenure_started_at NEVER moves after the first
// term (gc_plus_state's UPDATE arms leave it untouched), and boosts stay FREE
// (owner call: never monetize permissions/channels). DATED SUPERSESSION
// (2026-11-17, the Nitro-perks lane): the earlier "nothing in this bundle
// touches upload caps" ruling is retired by the owner's new ruling — an
// ACTIVE Goober+ term now mints the GC_PLUS_* tier values (the 1.5x earns:
// claim 75, message 2, voice 8, daily ceiling 500) and rides the 25 MB
// upload tier; message LENGTH and permissions remain untouched. The two
// predicates (perks = strict active term; the coins payload's display
// active = shipped grace-inclusive shape) are documented in api/plus.mjs.
import { requireSignedInRead, requireUser } from "./core/auth.mjs";
import { nowSeconds } from "./core/crypto.mjs";
import { HttpError, json, rateLimit, readJson } from "./core/http.mjs";
import {
  GC_COIN_DAILY_CEILING,
  GC_COIN_DAILY_GRANT,
  GC_COIN_MESSAGE_DAILY_CAP,
  GC_COIN_MESSAGE_GRANT,
  GC_COIN_VOICE_DAILY_CAP,
  GC_COIN_VOICE_GRANT,
  GC_COIN_VOICE_TICK_SECONDS,
  GC_PLUS_BUNDLE_NAME,
  GC_PLUS_DAILY_CEILING,
  GC_PLUS_DAILY_GRANT,
  GC_PLUS_GRACE_DAYS,
  GC_PLUS_MESSAGE_GRANT,
  GC_PLUS_PRICE,
  GC_PLUS_TERM_DAYS,
  GC_PLUS_VOICE_GRANT,
} from "../constants.mjs";
import { plusPerkActive } from "./plus.mjs";
import { isValidUsername } from "./usernames.mjs";

// UTC day floor. Every cap — the daily grant, the per-source caps, and the
// ceiling — rides this one boundary, so "today" is one thing everywhere.
function dayFloor(now) {
  return now - (now % 86400);
}

// --- the guard SQL (the economy's teeth) ------------------------------------

// Daily activity grant: the NOT EXISTS arm is the once-per-UTC-day claim, the
// SUM arm is the ceiling. Deltas bound explicitly so a rebalance is a
// constants.mjs change, never a re-read of stored math.
const CLAIM_INSERT_SQL =
  "INSERT INTO gc_coin_ledger (user_id, delta, source, created_at) " +
  "SELECT ?, ?, 'daily', ? " +
  "WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = ?) " +
  "AND NOT EXISTS (" +
    "SELECT 1 FROM gc_coin_ledger ld WHERE ld.user_id = ? AND ld.source = 'daily' " +
    "AND ld.created_at >= ?) " +
  "AND (" +
    "SELECT COALESCE(SUM(le.delta), 0) FROM gc_coin_ledger le " +
    "WHERE le.user_id = ? AND le.created_at >= ? AND le.delta > 0" +
  ") + ? <= ? LIMIT 1";

// Per-message earned points (api/messages.mjs calls this after a FRESH send —
// an idempotent replay returns created=false and never reaches the grant).
// Arm 1 is the shared ceiling, arm 2 the source's own day cap; earned sums
// filter delta > 0 so spends never refund a cap (never a farm loop).
const MESSAGE_GRANT_SQL =
  "INSERT INTO gc_coin_ledger (user_id, delta, source, created_at) " +
  "SELECT ?, ?, 'message', ? " +
  "WHERE (" +
    "SELECT COALESCE(SUM(le.delta), 0) FROM gc_coin_ledger le " +
    "WHERE le.user_id = ? AND le.created_at >= ? AND le.delta > 0" +
  ") + ? <= ? " +
  "AND (" +
    "SELECT COALESCE(SUM(le.delta), 0) FROM gc_coin_ledger le " +
    "WHERE le.user_id = ? AND le.created_at >= ? AND le.delta > 0 " +
    "AND le.source = 'message'" +
  ") + ? <= ?";

// Voice-presence time grant. The membership arm rides inside the INSERT: the
// tick's channel must be a voice channel the member belongs to (server-owned
// voice channels join gc_server_members), so a stray request to a foreign or
// text channel mints nothing.
const VOICE_GRANT_SQL =
  "INSERT INTO gc_coin_ledger (user_id, delta, source, related_user_id, created_at) " +
  "SELECT ?, ?, 'voice', NULL, ? " +
  "WHERE EXISTS (" +
    "SELECT 1 FROM gc_channels vc " +
    "JOIN gc_server_members vm ON vm.server_id = vc.server_id AND vm.user_id = ? " +
    "WHERE vc.id = ? AND vc.kind = 'voice' AND vc.server_id IS NOT NULL) " +
  "AND (" +
    "SELECT COALESCE(SUM(le.delta), 0) FROM gc_coin_ledger le " +
    "WHERE le.user_id = ? AND le.created_at >= ? AND le.delta > 0" +
  ") + ? <= ? " +
  "AND (" +
    "SELECT COALESCE(SUM(le.delta), 0) FROM gc_coin_ledger le " +
    "WHERE le.user_id = ? AND le.created_at >= ? AND le.delta > 0 " +
    "AND le.source = 'voice'" +
  ") + ? <= ?";

// The Goober+ coin spend (shared by the renewal and the gift): one negative
// row under the sufficient-coins arm — the check IS the statement, so two
// racing purchases can never both clear a one-purchase balance.
const PLUS_SPEND_SQL =
  "INSERT INTO gc_coin_ledger (user_id, delta, source, related_user_id, created_at) " +
  "SELECT ?, ?, ?, ?, ? " +
  "WHERE EXISTS (SELECT 1 FROM users rp WHERE rp.id = ?) " +
  "AND (SELECT COALESCE(SUM(le.delta), 0) FROM gc_coin_ledger le " +
    "WHERE le.user_id = ?) >= ? LIMIT 1";

// The term upsert, conditioned on the spend row THIS batch minted (the
// fingerprint arm rides the INSERT's SELECT, so a skipped spend can never
// extend a term and a granted spend always does). A same-second repeat
// purchase could satisfy the fingerprint with the earlier spend's row; a
// member cannot issue two purchases inside one second through the rate
// limiter, and both buys would be the member's own — the corner stays closed
// in practice and is pinned in the tests.
const PLUS_TERM_UPSERT_SQL =
  "INSERT INTO gc_plus_state (user_id, renews_until, grace_until, tenure_started_at, gifted_by, updated_at) " +
  "SELECT ?, MAX(?, ?) + ?, NULL, ?, ? " +
  "WHERE (" +
    "SELECT 1 FROM gc_coin_ledger le " +
    "WHERE le.user_id = ? AND le.source = ? AND le.delta = ? " +
    "AND le.created_at = ? AND le.related_user_id IS ?" +
  ") " +
  "ON CONFLICT(user_id) DO UPDATE SET " +
    "renews_until = MAX(gc_plus_state.renews_until, ?) + ?, " +
    "grace_until = NULL, " +
    "gifted_by = COALESCE(?, gc_plus_state.gifted_by), " +
    "updated_at = ?";

// Grace materialization (lazy — no cron): the first touch after a term lapses
// stamps the window. No row, no grace; an expired member's row simply waits.
const PLUS_GRACE_TOUCH_SQL =
  "UPDATE gc_plus_state SET grace_until = renews_until + ?, updated_at = ? " +
  "WHERE user_id = ? AND grace_until IS NULL AND renews_until <= ?";

// --- reads -------------------------------------------------------------------

const BALANCE_READ_SQL =
  "SELECT COALESCE(SUM(le.delta), 0) AS balance FROM gc_coin_ledger le WHERE le.user_id = ?";

const DAY_EARNED_READ_SQL =
  "SELECT " +
    "COALESCE(SUM(CASE WHEN le.delta > 0 THEN le.delta ELSE 0 END), 0) AS earned, " +
    "COALESCE(SUM(CASE WHEN le.delta > 0 AND le.source = 'daily' THEN le.delta ELSE 0 END), 0) AS daily, " +
    "COALESCE(SUM(CASE WHEN le.delta > 0 AND le.source = 'message' THEN le.delta ELSE 0 END), 0) AS message, " +
    "COALESCE(SUM(CASE WHEN le.delta > 0 AND le.source = 'voice' THEN le.delta ELSE 0 END), 0) AS voice " +
  "FROM gc_coin_ledger le WHERE le.user_id = ? AND le.created_at >= ?";

const PLUS_READ_SQL =
  "SELECT renews_until, grace_until, tenure_started_at, gifted_by " +
  "FROM gc_plus_state WHERE user_id = ? LIMIT 1";

const GIFT_TARGET_READ_SQL =
  "SELECT id, username FROM users WHERE username_key = ? LIMIT 1";

const LEDGER_PAGE_SQL =
  "SELECT le.id, le.delta, le.source, le.related_user_id, lu.username AS related_username, le.created_at " +
  "FROM gc_coin_ledger le LEFT JOIN users lu ON lu.id = le.related_user_id " +
  "WHERE le.user_id = ?";

// --- shaping -----------------------------------------------------------------

// The Goober+ bundle's public shape: ONE bundle (no per-item pricing), price
// and term/grace echo constants.mjs, and the free-things rider is the owner's
// own copy — boosts, upload caps, and message length are NOT part of the
// bundle and never will be.
function publicBundle() {
  return {
    name: GC_PLUS_BUNDLE_NAME,
    blaxel: true,
    price: GC_PLUS_PRICE,
    termDays: GC_PLUS_TERM_DAYS,
    graceDays: GC_PLUS_GRACE_DAYS,
    perks: ["Boosted daily + activity earnings", "Cosmetics: banner + flair", "Bigger upload cap", "Bigger coin ceiling"],
    // Dated supersession (2026-11-17): the old "never moves your upload cap"
    // line was retired by the owner's Nitro-perks ruling — the upload CAP
    // move is the blessed tier (constants.mjs GC_PLUS_*); permissions,
    // channels, and message length REMAIN untouched (the original owner call
    // about permissions stands).
    note: "Server boosts stay free. Goober+ never moves your permissions, channels, or message length — but it does raise your upload cap (25 MB) and earn ceiling since 2026-11-17.",
  };
}

// The plus payload: absence (never bought) is a shape, a lapsed term is
// "active: false" with the grace window the member sits in, an active term is
// "active: true". Tenure and the gifter trail always ride along.
function publicPlus(row, now) {
  if (!row) return { hasPlus: false, active: false, inGrace: false };
  const renewsUntil = Number(row.renews_until) || 0;
  const graceUntil = row.grace_until === null || row.grace_until === undefined
    ? null
    : Number(row.grace_until);
  const active = renewsUntil > now || (graceUntil !== null && graceUntil > now);
  return {
    hasPlus: true,
    active,
    inGrace: !active ? false : renewsUntil <= now && graceUntil !== null && graceUntil > now,
    renewsUntil,
    graceUntil,
    tenureStartedAt: Number(row.tenure_started_at) || 0,
    giftedBy: row.gifted_by === null || row.gifted_by === undefined
      ? null
      : Number(row.gifted_by),
  };
}

function publicLedgerEntry(row) {
  return {
    id: Number(row.id),
    delta: Number(row.delta),
    source: String(row.source || ""),
    relatedUserId: row.related_user_id === null || row.related_user_id === undefined
      ? null
      : Number(row.related_user_id),
    relatedUsername: typeof row.related_username === "string" && row.related_username.length > 0
      ? row.related_username
      : null,
    createdAt:
      typeof row.created_at === "number"
        ? new Date(row.created_at * 1000).toISOString()
        : null,
  };
}

// --- grant primitives (also the send pipeline's contract) --------------------

// The message send's grant hook. Kept tiny and failure-isolated upstream: the
// send already happened, so a grant failure must never fail it — api/messages
// mjs wraps the call itself.
export async function grantMessageCoins(env, userId, now) {
  const dayStart = dayFloor(now);
  // The perk tier rides the same statement shape: an active term mints the
  // PLUS values (blessed 2026-11-17 — the tier read is one indexed PK walk,
  // and the mint arm checks see the FINAL delta either way). Caps do NOT
  // scale with the tier — they are coin caps, so plus values simply reach
  // the same cap sooner.
  const perks = await plusPerkActive(env, userId, now);
  const per = perks ? GC_PLUS_MESSAGE_GRANT : GC_COIN_MESSAGE_GRANT;
  const ceiling = perks ? GC_PLUS_DAILY_CEILING : GC_COIN_DAILY_CEILING;
  const result = await env.GOOBER_DB
    .prepare(MESSAGE_GRANT_SQL)
    .bind(
      userId, per, now,
      userId, dayStart, per, ceiling,
      userId, dayStart, per, GC_COIN_MESSAGE_DAILY_CAP,
    )
    .run();
  return Number(result.meta?.changes) === 1;
}

// Internal: run one mint, answer "minted" (changes = 1). Shared by the claim
// and the voice tick (both respond with the standing numbers either way).
async function mint(env, sql, binds) {
  const result = await env.GOOBER_DB.prepare(sql).bind(...binds).run();
  return Number(result.meta?.changes) === 1;
}

// Internal: the standing read every coin route answers with.
async function coinsSnapshot(env, userId, now) {
  const dayStart = dayFloor(now);
  const [balanceRow, dayRow, plusRow] = await Promise.all([
    env.GOOBER_DB.prepare(BALANCE_READ_SQL).bind(userId).first(),
    env.GOOBER_DB.prepare(DAY_EARNED_READ_SQL).bind(userId, dayStart).first(),
    plusRowFor(env, userId, now),
  ]);
  // The standing numbers answer the member's OWN tier: an active term sees
  // the blessed plus values (grace days show the free values — the perk
  // predicate is strict, api/plus.mjs).
  const perks = await plusPerkActive(env, userId, now);
  return {
    balance: Number(balanceRow?.balance) || 0,
    dailyCeiling: perks ? GC_PLUS_DAILY_CEILING : GC_COIN_DAILY_CEILING,
    earnedToday: Number(dayRow?.earned) || 0,
    daily: { grant: perks ? GC_PLUS_DAILY_GRANT : GC_COIN_DAILY_GRANT, claimedToday: (Number(dayRow?.daily) || 0) > 0 },
    message: { per: perks ? GC_PLUS_MESSAGE_GRANT : GC_COIN_MESSAGE_GRANT, cap: GC_COIN_MESSAGE_DAILY_CAP, earnedToday: Number(dayRow?.message) || 0 },
    voice: {
      per: perks ? GC_PLUS_VOICE_GRANT : GC_COIN_VOICE_GRANT,
      windowSeconds: GC_COIN_VOICE_TICK_SECONDS,
      cap: GC_COIN_VOICE_DAILY_CAP,
      earnedToday: Number(dayRow?.voice) || 0,
    },
    plus: plusRow,
  };
}

// Plus reads materialize grace on the way through: one guarded UPDATE riding
// the same connection, then the read (the stamped window survives for later
// touches; the read's own shape answers for this request either way).
async function plusRowFor(env, userId, now) {
  await env.GOOBER_DB
    .prepare(PLUS_GRACE_TOUCH_SQL)
    .bind(GC_PLUS_GRACE_DAYS * 86400, now, userId, now)
    .run();
  const row = await env.GOOBER_DB.prepare(PLUS_READ_SQL).bind(userId).first();
  return publicPlus(row, now);
}

// --- routes ------------------------------------------------------------------

async function handleCoinsReadRoute(request, env) {
  const session = await requireSignedInRead(request, env);
  const userId = Number(session.user.id);
  await rateLimit(request, env, "read", "coins:" + userId);
  return json(await coinsSnapshot(env, userId, nowSeconds()));
}

async function handleCoinsShopRoute(request, env) {
  const session = await requireSignedInRead(request, env);
  const userId = Number(session.user.id);
  await rateLimit(request, env, "read", "coins:shop:" + userId);
  const snapshot = await coinsSnapshot(env, userId, nowSeconds());
  return json({ ...snapshot, bundle: publicBundle() });
}

async function handleLedgerReadRoute(request, env, url) {
  const session = await requireSignedInRead(request, env);
  const userId = Number(session.user.id);
  await rateLimit(request, env, "read", "coins:ledger:" + userId);

  // The messages route's cursor convention: the bare-id `before`, id DESC.
  const beforeRaw = url.searchParams.get("before");
  let before = null;
  if (beforeRaw !== null && beforeRaw !== "") {
    if (!/^[1-9][0-9]{0,14}$/.test(beforeRaw)) {
      throw new HttpError(400, "That ledger cursor is invalid.");
    }
    before = Number(beforeRaw);
  }
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw === null || limitRaw === ""
    ? 25
    : (/^[0-9]{1,4}$/.test(limitRaw) && Number(limitRaw) >= 1 && Number(limitRaw) <= 100
        ? Number(limitRaw)
        : null);
  if (limit === null) throw new HttpError(400, "That ledger page size is invalid.");

  let sql = LEDGER_PAGE_SQL;
  const binds = [userId];
  if (before !== null) {
    sql += " AND le.id < ?";
    binds.push(before);
  }
  sql += " ORDER BY le.id DESC LIMIT " + limit;
  const page = (await env.GOOBER_DB.prepare(sql).bind(...binds).all()).results || [];

  // nextAfter is the page's OLDEST id — the strictly-older walk.
  const nextAfter = page.length ? Number(page[page.length - 1].id) : null;
  return json({
    entries: page.map(publicLedgerEntry),
    nextAfter,
  });
}

async function handleClaimRoute(request, env) {
  const session = await requireUser(request, env);
  const userId = Number(session.user.id);
  await rateLimit(request, env, "write", "coins:daily:" + userId);

  const now = nowSeconds();
  const dayStart = dayFloor(now);
  // One statement, both guards inside: the once-per-day arm and the ceiling
  // arm. changes = 0 → the same "come back tomorrow" copy either way (no
  // oracle between the two refusals; both are "no coins for you today").
  // The perk tier (the +50 claim and the larger ceiling are active-term
  // perks; grace mints the free values — see api/plus.mjs's two predicates).
  const perks = await plusPerkActive(env, userId, now);
  const claimGrant = perks ? GC_PLUS_DAILY_GRANT : GC_COIN_DAILY_GRANT;
  const claimCeiling = perks ? GC_PLUS_DAILY_CEILING : GC_COIN_DAILY_CEILING;
  const minted = await mint(env, CLAIM_INSERT_SQL, [
    userId, claimGrant, now,
    userId,
    userId, dayStart,
    userId, dayStart,
    claimGrant, claimCeiling,
  ]);
  if (!minted) {
    throw new HttpError(409, "Already claimed today. Come back tomorrow.");
  }
  const snapshot = await coinsSnapshot(env, userId, nowSeconds());
  return json({ claimed: true, ...snapshot });
}

async function handleVoiceTickRoute(request, env) {
  const session = await requireUser(request, env);
  const userId = Number(session.user.id);
  await rateLimit(request, env, "write", "coins:voice:" + userId);

  const body = await readJson(request);
  const channelId = body.channelId;
  if (typeof channelId !== "number" || !Number.isInteger(channelId) || channelId <= 0) {
    throw new HttpError(400, "That voice channel is invalid.");
  }

  const now = nowSeconds();
  const dayStart = dayFloor(now);
  // Cap hits (and non-membership) are routine here, never errors: a tick that
  // mints nothing answers granted:false with the standing numbers. No oracle —
  // a foreign channel and a reached cap both look exactly the same.
  const perks = await plusPerkActive(env, userId, now);
  const voiceGrant = perks ? GC_PLUS_VOICE_GRANT : GC_COIN_VOICE_GRANT;
  const voiceCeiling = perks ? GC_PLUS_DAILY_CEILING : GC_COIN_DAILY_CEILING;
  const minted = await mint(env, VOICE_GRANT_SQL, [
    userId, voiceGrant, now,
    userId, channelId,
    userId, dayStart, voiceGrant, voiceCeiling,
    userId, dayStart, voiceGrant, GC_COIN_VOICE_DAILY_CAP,
  ]);
  const snapshot = await coinsSnapshot(env, userId, nowSeconds());
  return json({ granted: minted, ...snapshot });
}

async function handleRenewRoute(request, env) {
  const session = await requireUser(request, env);
  const userId = Number(session.user.id);
  await rateLimit(request, env, "write", "coins:plus:" + userId);
  return json(await purchasePlusTerm(env, userId, null));
}

// One batch for the whole purchase: the coin spend and the term upsert, with
// the upsert fingerprinted to the spend row the batch itself mints (a skipped
// spend can never extend a term). Self-purchase and GIFT share it.
async function purchasePlusTerm(env, gifterId, recipientId) {
  const now = nowSeconds();
  const source = recipientId === null ? "plus_renewal" : "plus_gift";
  const relatedUserId = recipientId === null ? null : recipientId;
  const gifterForTrail = recipientId === null ? null : gifterId;
  const term = GC_PLUS_TERM_DAYS * 86400;
  const targetId = recipientId === null ? Number(gifterId) : Number(recipientId);

  const results = await env.GOOBER_DB.batch([
    env.GOOBER_DB.prepare(PLUS_SPEND_SQL).bind(
      Number(gifterId), -GC_PLUS_PRICE, source, relatedUserId, now,
      targetId,
      Number(gifterId),
      GC_PLUS_PRICE,
    ),
    env.GOOBER_DB.prepare(PLUS_TERM_UPSERT_SQL).bind(
      // INSERT branch: user, MAX(now, now), +term, tenure start, gifted by, updated.
      targetId, now, now, term, now, gifterForTrail, now,
      // Fingerprint arm: the spend row THIS batch minted.
      Number(gifterId), source, -GC_PLUS_PRICE, now, relatedUserId,
      // UPDATE arm: MAX(standing, now) + term, gifter, updated.
      now, term, gifterForTrail, now,
    ),
  ]);

  // changes = 0 on the term upsert: the spend's guard refused (the only
  // failure mode left after validation) — the house-style after-the-fact
  // classification, one copy, no probe.
  if (Number(results[1]?.meta?.changes) !== 1) {
    throw new HttpError(400, "Not enough Goober Coins for that.");
  }
  const [balanceRow, targetPlusRow] = await Promise.all([
    env.GOOBER_DB.prepare(BALANCE_READ_SQL).bind(Number(gifterId)).first(),
    env.GOOBER_DB.prepare(PLUS_READ_SQL).bind(targetId).first(),
  ]);
  return {
    balance: Number(balanceRow?.balance) || 0,
    price: GC_PLUS_PRICE,
    plus: publicPlus(targetPlusRow, nowSeconds()),
  };
}

async function handleGiftRoute(request, env) {
  const session = await requireUser(request, env);
  const gifterId = Number(session.user.id);
  await rateLimit(request, env, "write", "coins:gift:" + gifterId);

  const body = await readJson(request);
  const username = isValidUsername(body.username) ? body.username.trim() : null;
  if (!username) {
    throw new HttpError(400, "Enter the member you want to gift Goober+.");
  }

  const target = await env.GOOBER_DB.prepare(GIFT_TARGET_READ_SQL).bind(username.toLowerCase()).first();
  if (!target) throw new HttpError(404, "No member by that name.");
  const targetId = Number(target.id);
  if (targetId === gifterId) {
    throw new HttpError(400, "Gifting Goober+ to yourself is a renewal — use the bundle's own button.");
  }

  const payload = await purchasePlusTerm(env, gifterId, targetId);
  return json({
    ...payload,
    giftedTo: { id: targetId, username: target.username },
  });
}

export async function handleCoinRoutes(request, env, url, path, method) {
  if (path === "/api/coins" && method === "GET") {
    return handleCoinsReadRoute(request, env);
  }
  if (path === "/api/coins/shop" && method === "GET") {
    return handleCoinsShopRoute(request, env);
  }
  if (path === "/api/coins/ledger" && method === "GET") {
    return handleLedgerReadRoute(request, env, url);
  }
  if (path === "/api/coins/claim" && method === "POST") {
    return handleClaimRoute(request, env);
  }
  if (path === "/api/coins/voice/tick" && method === "POST") {
    return handleVoiceTickRoute(request, env);
  }
  if (path === "/api/plus/renew" && method === "POST") {
    return handleRenewRoute(request, env);
  }
  if (path === "/api/plus/gift" && method === "POST") {
    return handleGiftRoute(request, env);
  }
  return undefined;
}

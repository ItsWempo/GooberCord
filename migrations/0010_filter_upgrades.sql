-- 0010: the filter/AutoMod upgrades — per-server filter rules (the AutoMod
-- parity follow-ups in docs/discord-parity-checklist.md: wildcard match
-- modes, regex terms, exempt roles/channels, combinable response actions,
-- the Care class, name checking) and the filter-hit alerts feed.
--
-- Same contract as 0006/0007/0008: the shared wempo-forum-data D1 (one
-- migration ledger), so every object here is gc_-prefixed and INDEPENDENT of
-- every other migration — this file applies cleanly right after 0001 as well
-- as on a database that already carries 0009. Only gc_ objects are touched,
-- all IF NOT EXISTS for the ledger's idempotent re-apply; every statement
-- here is CREATE TABLE / CREATE INDEX — no forum table is ever written.
--
-- Why a rules table at all: the global keyword list lives in site_settings
-- ("filtered_words", api/filterstore.mjs) as ONE flat string shared by every
-- server — it has no per-server, per-term, per-action surface to extend.
-- Every filed follow-up (wildcard strategies per term, regex terms, exempt
-- roles/channels per rule, response actions per rule, the Care class, name
-- checking) is per-RULE and per-SERVER, and role/channel ids are
-- server-scoped, so the rules need their own rows. The global list keeps
-- working exactly as it does today (the site-wide rule every server
-- inherits); gc_filter_rules is the per-server layer on top of it.
-- Everything else in the batch needs no new table: exemption is a predicate
-- over rows this migration does not create, the timeout action writes the
-- gc_server_members.timed_out_until column 0008 already carries, and the
-- Care class stores NOTHING (the owner decision: a care hit is the response
-- field, never a row).
--
-- File mapping (each filed bullet lands on one object):
--   Wildcards + regex + exemptions + actions (AutoMod follow-ups (1)-(4),
--     (8)): gc_filter_rules — each term carries its strategy inline
--     ("cat*" = prefix, "*cat" = suffix, "*cat*" (or any embedded star) =
--     anywhere, otherwise plain contains; "/pattern/" = a JavaScript RegExp
--     term), so the intake editor stays a plain term list like today's desk.
--   Alerts (follow-up (3), GC reshaping Discord's "alert channel" into a
--     moderation-desk feed): gc_filter_alerts, trimmed to the newest
--     FILTER_ALERT_CAP_PER_SERVER (200) rows per server by the writer, so
--     the feed can never grow unbounded.
--   Care rule (the self-harm affirmations OWNER DECISION, 2026-11-16):
--     gc_filter_rules.is_care — a hit NEVER blocks, deletes, times out, or
--     writes an alert; the send proceeds and the SEND RESPONSE carries the
--     inline careNotice on both the REST and the WS path. Zero storage, zero
--     notifications: detection reports nothing to anyone.
--   Name checking (follow-up (5)): gc_filter_rules.check_names — a
--     check_names rule's terms are evaluated against nickname changes (both
--     the self and the mod-desk rename routes); they do not screen messages.

-- One rule per server per filter behavior. terms is a JSON array (each term:
-- { text, strategy: contains|prefix|suffix|anywhere|regex }); the JSON rides
-- the row so every evaluation reads its rule in one SELECT. exempt_role_ids
-- / exempt_channel_ids are JSON arrays of server-scoped ids (empty = no
-- exemptions; the string-tier owner/moderator rows and any KICK_MEMBERS
-- holder are ALWAYS exempt structurally, in code). actions is a JSON array
-- drawn from block|alert|timeout (empty = the block default; a care rule's
-- actions are ignored — care never acts).
CREATE TABLE IF NOT EXISTS gc_filter_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 64),
  terms TEXT NOT NULL CHECK(length(terms) BETWEEN 2 AND 16384),
  exempt_role_ids TEXT NULL CHECK(exempt_role_ids IS NULL OR length(exempt_role_ids) <= 4096),
  exempt_channel_ids TEXT NULL CHECK(exempt_channel_ids IS NULL OR length(exempt_channel_ids) <= 4096),
  actions TEXT NOT NULL CHECK(actions IS NOT NULL AND length(actions) BETWEEN 2 AND 64),
  is_care INTEGER NOT NULL DEFAULT 0 CHECK(is_care IN (0, 1)),
  check_names INTEGER NOT NULL DEFAULT 0 CHECK(check_names IN (0, 1)),
  block_message TEXT NULL CHECK(block_message IS NULL OR length(block_message) <= 150),
  timeout_minutes INTEGER NULL CHECK(timeout_minutes IS NULL OR timeout_minutes IN (1, 5, 10, 60, 1440, 10080)),
  created_by INTEGER NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gc_filter_rules_server ON gc_filter_rules(server_id, id);

-- One row per block-or-alert filter hit: who (user_id), what (the rule and
-- the matched terms), where (channel, and the stored message when the
-- message was NOT blocked). A BLOCKED message is never stored anywhere, so
-- its preview rides the row (capped at 280 like every other desk reason); an
-- alert-only hit links the stored row instead. A care hit writes NOTHING here
-- (the owner decision: care reports nothing) and neither does any name hit —
-- this feed is the message-path moderation desk only.
CREATE TABLE IF NOT EXISTS gc_filter_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES gc_channels(id) ON DELETE CASCADE,
  message_id INTEGER NULL REFERENCES gc_messages(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_id INTEGER NULL,
  rule_name TEXT NULL CHECK(rule_name IS NULL OR length(rule_name) <= 64),
  matched TEXT NULL CHECK(matched IS NULL OR length(matched) <= 280),
  body TEXT NULL CHECK(body IS NULL OR length(body) <= 280),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gc_filter_alerts_server ON gc_filter_alerts(server_id, id);
CREATE INDEX IF NOT EXISTS idx_gc_filter_alerts_message ON gc_filter_alerts(message_id);

-- 0027 — the AutoMod constants rider (W-B1.5): every widening the 0010
-- CHECKs refuse. The constants moved (filterrules.mjs / permissions.mjs,
-- docs/parity-limits.md AutoMod row verified 2026-11-17), but SQLite cannot
-- ALTER a CHECK, and 0010's gc_filter_rules carries two that the widened
-- wave breaks:
--   (1) timeout_minutes IN (1,5,10,60,1440,10080) — the 28-day seat
--       (40,320 minutes) tops the parity menu and the old CHECK refuses it;
--   (2) terms length <= 16384 — the 1000-term x 60-char keyword budget
--       (JSON-encoded, worst case ~63,000 chars) overruns the old bound, so
--       a maxed rule would store-write 500. Widened to 65,536.
-- The rebuild is the childless dance (0026's discipline): no table
-- references gc_filter_rules (gc_filter_alerts.rule_id is a plain NULL
-- integer, no FK), so the drop cannot strand a foreign key — the FK-on
-- INSERT..SELECT either copies every row or the whole file rolls back
-- atomically (a successful apply proves no rule lost).
CREATE TABLE gc_filter_rules_rebuild (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 64),
  terms TEXT NOT NULL CHECK(length(terms) BETWEEN 2 AND 65536),
  exempt_role_ids TEXT NULL CHECK(exempt_role_ids IS NULL OR length(exempt_role_ids) <= 4096),
  exempt_channel_ids TEXT NULL CHECK(exempt_channel_ids IS NULL OR length(exempt_channel_ids) <= 4096),
  actions TEXT NOT NULL CHECK(actions IS NOT NULL AND length(actions) BETWEEN 2 AND 64),
  is_care INTEGER NOT NULL DEFAULT 0 CHECK(is_care IN (0, 1)),
  check_names INTEGER NOT NULL DEFAULT 0 CHECK(check_names IN (0, 1)),
  block_message TEXT NULL CHECK(block_message IS NULL OR length(block_message) <= 150),
  timeout_minutes INTEGER NULL CHECK(timeout_minutes IS NULL OR timeout_minutes IN (1, 5, 10, 60, 1440, 10080, 40320)),
  created_by INTEGER NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO gc_filter_rules_rebuild (
  id, server_id, name, terms, exempt_role_ids, exempt_channel_ids, actions,
  is_care, check_names, block_message, timeout_minutes, created_by, created_at, updated_at
) SELECT
  id, server_id, name, terms, exempt_role_ids, exempt_channel_ids, actions,
  is_care, check_names, block_message, timeout_minutes, created_by, created_at, updated_at
FROM gc_filter_rules;
DROP TABLE gc_filter_rules;
ALTER TABLE gc_filter_rules_rebuild RENAME TO gc_filter_rules;
CREATE INDEX IF NOT EXISTS idx_gc_filter_rules_server ON gc_filter_rules(server_id, id);

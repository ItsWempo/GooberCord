-- 0012: the server rules gate — one owner-set rules text plus per-member
-- acceptance.
--
-- Same contract as 0006/0007/0008: the shared wempo-forum-data D1 (one
-- migration ledger), so every object here is gc_-prefixed and INDEPENDENT of
-- every later migration — this file applies cleanly right after 0011-era
-- objects as well as on a database that carries any subset of them. Only
-- gc_* tables are touched: the two ALTERs land on GooberCord's own
-- gc_servers / gc_server_members, the forum tables are never created,
-- altered, or written. No new tables — the gate is two columns on
-- existing gc_ tables.
--
-- File mapping (each bullet lands on one column):
--   The owner's rules document (modeled on the forum's owner-editable rules
--     page, but per-server): gc_servers.rules_text. NULL = the gate is OFF —
--     every pre-0012 server (and every server whose owner has not set rules)
--     behaves exactly as before, costing no read. When set, a member must
--     ACCEPT once before the gate-protected actions (the shared
--     enforceMemberGates doors: channel send, and voice join at the WS
--     upgrade; reactions take the same door when they ship). Browsing,
--     reading history, and joining are never gated — this is Discord's
--     member screening, not a join wall.
--   Per-member acceptance: gc_server_members.rules_accepted_at (NULL = not
--     yet accepted). Set only by the accept route (any member, for
--     themselves) and the manual-verify route (owner / KICK_MEMBERS — the
--     moderator who accepted on someone's behalf). The owner and the
--     KICK_MEMBERS holders bypass the gate at check time, exactly like the
--     verification gate beside it.

-- The rules document itself. A TEXT blob bounded route-side (GC_RULES_MAX,
-- 20 KiB like the forum's rules page); NULL is the gate's OFF state.
ALTER TABLE gc_servers ADD COLUMN rules_text TEXT NULL;

-- The member's acceptance timestamp (epoch seconds). NULL until the member
-- (or an owner/KICK_MEMBERS holder on their behalf) accepts; never unset by
-- the feature — clearing the rules text turns the gate OFF, the timestamps
-- simply stop mattering.
ALTER TABLE gc_server_members ADD COLUMN rules_accepted_at INTEGER NULL;

# GooberCord Phase 1 — Conversations Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the forum's chat and DMs with GooberCord's core: accounts on shared `users`, servers with text channels, DMs/group chats, WebSocket live chat, image attachments with review, forum-chat import — text-voice-video later phases out of scope here.

**Architecture:** Cloudflare Worker in the forum's proven shape (`worker.mjs` route-dispatcher + `api/` topic modules + `api/core/` leaf modules, `node --test` over fake-D1 fakes). Live chat rides two Durable Objects: `ChatRoom` (per channel WebSocket fan-out) and `PresenceHub` (single presence hub). All GooberCord data lives in `gc_`-prefixed tables inside the shared `wempo-forum-data` D1; forum tables are read by the vendored auth core and never written by GooberCord migrations.

**Tech Stack:** Cloudflare Workers + D1 + Durable Objects (WebSocket hibernation), vanilla-JS SPA frontend, `node:test`, wrangler 4, Node ≥ 22.

**Spec:** `docs/superpowers/specs/2026-11-15-goobercord-design.md` (owner-approved). This plan implements Phase 1. Where a name below differs from the spec, that is a settled builder call, noted inline.

## Global Constraints

- Workers **Free** plan; $0 recurring; no R2, no Containers, no Realtime, no VPS.
- Vanilla JS frontend, zero frameworks, zero runtime dependencies; Node ≥ 22.
- D1 database: the **shared** `wempo-forum-data`. Binding name `GOOBER_DB`. Every GooberCord-created table/index is `gc_`-prefixed; migrations must not alter forum tables.
- Vendored core modules (`api/core/*`) may differ from the forum's only by these allow-listed tokens: `FORUM_DB`→`GOOBER_DB`, `wempo_session`→`goober_session`. The IP-hash label `"wempo-forum-ip:"`, pepper usage, PBKDF2 iterations, and every SQL statements touching `users`/`sessions`/`bans`/`banned_ips`/`known_ips` must be byte-identical to the forum's.
- CSP discipline: message content lands via `textContent` only; dynamic styling via CSSOM `style.setProperty`, never inline style strings.
- All images served by GooberCord endpoints themselves (`Cross-Origin-Resource-Policy` on the forum forbids cross-subdomain `<img>`).
- Message limit: `GC_MESSAGE_MAX = 2000` chars (imported forum bodies cap at 1000; fits).
- Attachment chunks: 64,000-byte BLOB rows (matches the forum's chunk pattern).
- Frontend files: `public/js/` mirrors the forum's layering (boot `dom.js`/`state.js`/`api.js`, `routes/` per page, shared `markdown.js`, `theme.js`, stale-build check).
- Test convention: `tests/*.test.mjs`, `node:test` + `node:assert/strict`, pure modules over a fake DB (`prepare().bind().first()/all()` with SQL-text routing — copy the `fakeDb` helper pattern from `/Users/itswempo/wempos-forum/tests/blocks-module.test.mjs:19-31`).
- Git: push to `origin/main` freely after each task's commit (standing permission); conventional feat/test prefixes like the forum.

## Review Focus

- **Script-injection via message bodies** — pasted `<img onerror>` etc. must render as text, never execute. Test pins it in Task 12 (markdown/renderer unit tests: `innerHTML` never receives raw body text).
- **Migration touching forum tables** — one bad `ALTER` on a shared table breaks the live forum. Test pins it in Task 2 (migration SQL parsed; every statement's target table must match `gc_*`).
- **Cross-channel access** — a signed-in member who isn't in a channel reads/writes nothing (404, not 403 — do not leak existence). Test pins it in Task 5 (and reuse in Task 7 for conversations).
- **Idempotent sends** — the same `clientMessageId` posted twice (flaky network retry) returns the same message, never a duplicate. Test pins it in Task 5.
- **Unapproved attachment leak** — a `pending`/`rejected` attachment is fetchable only by its uploader and platform staff; everyone else gets 404. Test pins it in Task 6.

---

### Task 1: Repo reset, vendored core, parity contract

**Files:**
- Delete: `api/*.mjs` (all 30+ forum topic modules), `api/core/{archive,blocks,images,roles,shapers,visibility}.mjs`, `public/` forum app files, `config/`, `constants.mjs` (replaced)
- Create: `api/core/{crypto,passwords,cursors,http,auth,totp,images}.mjs` (vendored), `constants.mjs`, `worker.mjs` (rebuilt skeleton), `public/index.html` (placeholder shell), `public/js/boot.js` (placeholder redirect to #/login), `tests/contract-parity.test.mjs`
- Keep as-is: `LICENSE`, `.gitignore`, `docs/`, `package.json` scripts

**Interfaces:**
- Produces: `api/core/http.mjs` exports `HttpError(status, message, headers?, payload?)`, `json(data, status?, headerObj?)`, `securityHeaders(headers?)`, `rateLimit(request, env, scope, actor?)`, `readJson(request, maxBytes?)`, `readLimitedBody(request, maximum)`, `requiredText(value, field, maximum)`, `requireMutationApplied(result)`.
- Produces: `api/core/auth.mjs` exports `readSession(request, env)`, `createSession(request, env, userId, oldTokenHash?, requireUnbanned?)`, `requireUser(request, env)`, `requireSignedInRead(request, env)`, `requireCsrf(request, env)`, `assertSameOrigin(request)`, `requireStaff(request, env, mutating?)`, `requireAdmin(request, env, mutating?)`, `assertNotBanned(env, userId)`, `assertNetworkNotBanned(request, env)`, `requestIpHash(request, env)`.
- Produces: `constants.mjs` exports `RATE_LIMIT_BINDINGS` (scopes `read, write, guest, register, login, message, upload, password, totp` → env binding names `GC_*_RATE_LIMITER`), `TURNSTILE_SITEVERIFY_URL`, `GC_MESSAGE_MAX = 2000`, `ATTACHMENT_CHUNK_BYTES = 64000`, `SESSION_INSERT_IF_UNBANNED_SQL`.
- Produces: `worker.mjs` keeps the forum's `default.fetch` glue (api dispatch loop over `API_HANDLERS`, `securityHeaders`, `stampedAssetResponse` + stale-build stamp, conditional-stripping for document requests) verbatim from the current copy — it is platform plumbing, not forum app logic.

- [ ] **Step 1: Write the failing parity test**

`tests/contract-parity.test.mjs`: reads this repo's `api/core/auth.mjs` and `/Users/itswempo/wempos-forum/api/core/auth.mjs` as text, applies the allow-listed token substitutions (`FORUM_DB`→`GOOBER_DB`, `wempo_session`→`goober_session`) to the vendor copy, and asserts the following are EQUAL character-for-character: (a) every line containing `sessions`, `bans`, `banned_ips`, or `known_ips` SQL, (b) the line containing the HMAC data label (the `"wempo-forum-ip:"` literal must appear untransformed in both), (c) `api/core/passwords.mjs` — assert the vendored file and the forum's file are fully identical after substitution (pepper + PBKDF2 iteration constants pinned), (d) `api/core/totp.mjs` fully identical after substitution. Run with `node --test tests/contract-parity.test.mjs`.

- [ ] **Step 2: Run the parity test — it fails (vendor copies don't exist yet)**

Run: `node --test tests/contract-parity.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Vendor the core modules**

Copy from `/Users/itswempo/wempos-forum/api/core/`: `crypto.mjs`, `passwords.mjs`, `cursors.mjs`, `http.mjs`, `auth.mjs`, `totp.mjs`, `images.mjs` into `api/core/`, applying ONLY the allow-listed substitutions plus the relative `constants.mjs` import path fix. In `auth.mjs` also re-point its `requestIpHash` HMAC label import (no change — the label literal stays). Do not "improve" the vendored code.

- [ ] **Step 4: Rebuild `constants.mjs` and `wrangler.toml`**

`constants.mjs` with the exports above. `wrangler.toml`: `database_name = "wempo-forum-data"` (keep the existing shared `database_id`), `[[ratelimits]]` entries named `GC_*_RATE_LIMITER` **without** `namespace_id` (wrangler allocates), DO bindings:

```toml
[[durable_objects.bindings]]
name = "ROOMS"
class_name = "ChatRoom"
[[durable_objects.bindings]]
name = "PRESENCE"
class_name = "PresenceHub"
[[migrations]]
tag = "v1"
new_classes = ["ChatRoom", "PresenceHub"]
```

Also set `TURNSTILE_HOSTNAMES = "goobercord.itswempo.workers.dev"`, `VERSION = "1.0.0"`. Placeholder DO classes (real ones in Task 8/9): stub `api/rooms.mjs`/`api/presence.mjs` exporting `export class ChatRoom {}` / `export class PresenceHub {}` and `worker.mjs` re-exports them so `wrangler dev` boots.

- [ ] **Step 5: Delete forum app modules, rebuild `worker.mjs` + placeholder index.html**

`worker.mjs`: keep `secureResponse`/`stampedAssetResponse`/`isDocumentRequest`/`apiError`/route-loop exactly as today but `API_HANDLERS = []` and the DB guard switches to `env.GOOBER_DB` ("The GooberCord database is not configured."). Delete listed files. `public/index.html`: minimal shell (doctype, `<meta name="viewport">`, script boot) — full shell in Task 11.

- [ ] **Step 6: Run parity test + `npm test` + `wrangler dev` smoke**

Run: `node --test tests/contract-parity.test.mjs && npm test && npx wrangler dev` → boot log with no config errors; `curl -s localhost:8787/api/version` returns 404 JSON with security headers (endpoint added in Task 3; a 404 with `X-Content-Type-Options: nosniff` proves the pipeline).
Expected: parity PASS, all tests PASS, dev boots.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: reset repo to GooberCord core, vendor auth contract with parity tests"
```

---

### Task 2: Migration 0001 — the `gc_` schema

**Files:**
- Create: `migrations/0001_initial_goobercord.sql`, `tests/migration-scoping.test.mjs`

**Interfaces:**
- Produces: tables Task 3–10 bind against — `gc_servers(id INTEGER PK AUTOINCREMENT, name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100), owner_user_id INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL)`; `gc_channels(id PK, server_id INTEGER NULL REFERENCES gc_servers(id), name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100) DEFAULT 'dm', kind TEXT NOT NULL CHECK(kind IN ('text','voice','dm','group')), position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, last_message_id INTEGER NULL, last_message_at INTEGER NULL)`; `gc_server_members(server_id INTEGER NOT NULL REFERENCES gc_servers(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','moderator','member')), joined_at INTEGER NOT NULL, PRIMARY KEY(server_id, user_id))` — plus `CREATE TRIGGER gc_server_members_owner_guard` preventing UPDATE of the owner row's role to non-owner (`BEFORE UPDATE ... WHEN OLD.role = 'owner' AND NEW.role <> 'owner'` → `RAISE(ABORT, 'server owner role is immutable')`); `gc_conversation_members(channel_id INTEGER NOT NULL REFERENCES gc_channels(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, last_read_message_id INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(channel_id, user_id))`; `gc_messages(id PK, channel_id INTEGER NOT NULL REFERENCES gc_channels(id) ON DELETE CASCADE, author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000), client_message_id TEXT NULL CHECK(length(client_message_id) BETWEEN 8 AND 64), source TEXT NULL CHECK(source IN ('forum-chat','forum-dm') OR source IS NULL), created_at INTEGER NOT NULL, edited_at INTEGER NULL, UNIQUE(channel_id, author_id, client_message_id))`; `gc_read_state(user_id INTEGER NOT NULL, channel_id INTEGER NOT NULL REFERENCES gc_channels(id) ON DELETE CASCADE, last_read_message_id INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id, channel_id))`; `gc_member_status(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, status_text TEXT NULL CHECK(status_text IS NULL OR length(status_text) <= 128), status_until INTEGER NULL, updated_at INTEGER NOT NULL)`; `gc_attachments(id PK, message_id INTEGER NULL REFERENCES gc_messages(id), uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, mime TEXT NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp','image/gif')), size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), width INTEGER NULL, height INTEGER NULL, created_at INTEGER NOT NULL, reviewed_by INTEGER NULL, reviewed_at INTEGER NULL)`; `gc_attachment_chunks(attachment_id INTEGER NOT NULL REFERENCES gc_attachments(id) ON DELETE CASCADE, seq INTEGER NOT NULL, data BLOB NOT NULL CHECK(length(data) BETWEEN 1 AND 64000), PRIMARY KEY(attachment_id, seq))`.

- [ ] **Step 1: Write the failing scoping test**

`tests/migration-scoping.test.mjs`: read `migrations/0001_initial_goobercord.sql`; strip comments; for each SQL statement, extract its target table (first table token after `CREATE TABLE`, `CREATE INDEX ... ON`, `CREATE TRIGGER ... ON`, `INSERT INTO`, `UPDATE`, `DELETE FROM`, `REFERENCES` for FKs is exempt); assert every extracted target matches `/^gc_/`. Also assert the file contains no `ALTER TABLE`, `DROP TABLE`, or pragma statements.

- [ ] **Step 2: Run it — the file doesn't exist yet**
Run: `node --test tests/migration-scoping.test.mjs` → Expected: FAIL.

- [ ] **Step 3: Write the migration**

One file containing the exact tables in **Interfaces** plus these indexes:
```sql
CREATE INDEX idx_gc_channels_server ON gc_channels(server_id, position);
CREATE INDEX idx_gc_messages_channel ON gc_messages(channel_id, id);
CREATE INDEX idx_gc_messages_pending ON gc_attachments(status) WHERE status = 'pending';
CREATE INDEX idx_gc_read_state_user ON gc_read_state(user_id);
CREATE INDEX idx_gc_conv_members_user ON gc_conversation_members(user_id);
```
DM/group channels carry `server_id IS NULL` and `kind IN ('dm','group')`; server text/voice channels carry `server_id NOT NULL` — add `CHECK((kind IN ('dm','group') AND server_id IS NULL) OR (kind IN ('text','voice') AND server_id IS NOT NULL))` to `gc_channels`.

- [ ] **Step 4: Run scoping test + apply to local D1**
Run: `node --test tests/migration-scoping.test.mjs && npm run db:migrate:local && npx wrangler d1 execute goobercord-data --local --command "SELECT name FROM sqlite_master WHERE name LIKE 'gc_%'"`
Expected: test PASS; the list shows all gc_ tables and none else.

- [ ] **Step 5: Commit**

```bash
git add migrations/0001_initial_goobercord.sql tests/migration-scoping.test.mjs
git commit -m "feat: gc_ schema migration with forum-table scoping pin"
```

---

### Task 3: Accounts — version, register, login, TOTP step, logout, me

**Files:**
- Create: `api/accounts.mjs`, `tests/accounts-module.test.mjs`
- Modify: `worker.mjs` (add `handleAccountRoutes` to `API_HANDLERS` + re-export `createSession` already there)

**Interfaces:**
- Consumes: Task 1 core (`requireUser`, `createSession`, `assertNetworkNotBanned`, `assertNotBanned`, `readJson`, `requiredText`, `rateLimit`, `readSession`), vendored `passwords.mjs` (`hashPassword`, `verifyPassword`, `isValidUsername` — take from forum `api/core/shapers.mjs` if vendoring leaves it out; copy just `isValidUsername` into `api/accounts.mjs` with its exact forum validation rules), vendored `totp.mjs` (forum `api/twofa.mjs`'s session-less challenge logic, re-pointed at `GOOBER_DB`).
- Produces: `handleAccountRoutes(request, env, url, path, method, ctx)` — the standard handler signature (matching the worker's dispatch loop, which passes `ctx` last) returning `Response | undefined`. Endpoints: `GET /api/version` → `{version, build}` from `env.VERSION`/`env.COMMIT_SHA`; `POST /api/auth/register` `{username, password, "cf-turnstile-response"}` (rate-limit `register`, Turnstile action `"register"`, network-ban gate, `assertNotBanned`-style `requireUnbanned` session); `POST /api/auth/login` `{username, password}` → either 200 `{user, csrfToken}`+Set-Cookie or 401; when `totp_enabled=1` returns 200 `{totpRequired: true, challenge: <signed session-less challenge token>}` and NO session; `POST /api/auth/totp` `{challenge, code}` → session (rate-limit `totp`); `POST /api/auth/logout` (CSRF; deletes session row, clears cookie `Max-Age=0`); `GET /api/me` → `{user: {id, username, role, bio, avatarUrl|null, totpEnabled}, csrfToken}` (read path: `readSession` shape identical to forum's — vendored `readSession` stays the single source; this route does not SELECT its own columns).

- [ ] **Step 1: Write the failing tests** (`tests/accounts-module.test.mjs`, fake-DB style): (a) login with wrong password → 401 and `first()` on the ban-check SQL recorded zero inserts; (b) login with correct password on an active-banned account → 403 "This account is currently banned."; (c) `totp_enabled=1` user gets `{totpRequired: true}` and no `INSERT INTO sessions` route fired; (d) `GET /api/version` returns `{version: "1.0.0"}`; (e) register rejects username failing `isValidUsername` with 400 before any Turnstile/D1 call (Turnstile call must be injected as `env._turnstileVerify` override so tests skip network).

- [ ] **Step 2: Run — FAIL** (`node --test tests/accounts-module.test.mjs` → module not found)

- [ ] **Step 3: Implement `api/accounts.mjs`** — one `handleAccountRoutes` dispatching by path/method per the endpoint table above. Session creation, TOTP verification, and Turnstile all delegate to the vendored core; this file owns only route dispatch, request-shape validation, and status codes.

- [ ] **Step 4: Run — PASS** (`node --test tests/accounts-module.test.mjs`)

- [ ] **Step 5: Wire into `worker.mjs`, run all tests, commit**

```bash
git add api/accounts.mjs tests/accounts-module.test.mjs worker.mjs
git commit -m "feat: accounts — register, login, TOTP second step, logout, /api/me"
```

---

### Task 4: Servers and channels API

**Files:**
- Create: `api/servers.mjs`, `tests/servers-module.test.mjs`
- Modify: `worker.mjs` (add `handleServerRoutes`)

**Interfaces:**
- Consumes: Task 3 session shape; Task 2 schema. Core `requireUser`, `json`, `readJson`, `requiredText`.
- Produces: `handleServerRoutes(request, env, url, path, method, ctx)`. Endpoints: `POST /api/servers` `{name}` → creates `gc_servers` row (owner = session user) + `gc_server_members` owner row + one `gc_channels` row `(name='general', kind='text', position=0)` in one `env.GOOBER_DB.batch`; returns `{server: {id, name}, channels: [...]}`. `GET /api/servers` → `{servers: [{id, name, role, channels: [{id, name, kind, position}]}]}` — one query joining `gc_server_members` + `gc_servers` + `gc_channels` ordered by `(position, id)`; DM/group channels excluded (`server_id NOT NULL`). `POST /api/servers/:id/channels` `{name, kind}` — must be `('text','voice')`, requester's server role must be `owner|moderator` (SQL check inside the INSERT...SELECT guard), appends at `position = (SELECT COALESCE(MAX(position), -1) + 1 ...)`. Server cap: 8 channels per server (`SELECT COUNT(*) <= 7` precondition in the guarded INSERT) — constant `MAX_CHANNELS_PER_SERVER = 8` in `constants.mjs`.

- [ ] **Step 1: Write failing tests**: (a) create server returns ids and a #general channel; (b) non-owner `POST channels` → 403; (c) 8th channel create → 400 "That server has reached its channel limit."; (d) `GET /api/servers` for a member with two servers returns both with roles; (e) server name with only whitespace → 400.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `api/servers.mjs`** per the endpoint table; all authorization rides SQL preconditions (`WHERE user_id = ? AND role IN ('owner','moderator')` inside guarded INSERTs) — no read-then-write races.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Wire into worker, full test run, commit**

```bash
git add api/servers.mjs tests/servers-module.test.mjs worker.mjs
git commit -m "feat: servers and channels api"
```

---

### Task 5: Messages — history, send, edit, delete (REST)

**Files:**
- Create: `api/messages.mjs`, `tests/messages-module.test.mjs`
- Modify: `worker.mjs` (add handler), `constants.mjs` (if any scope needed for `message` rate limit is missing)

**Interfaces:**
- Consumes: vendored cursors (bare-id cursor `[1-9][0-9]{0,14}`, inline at call site per forum convention), Task 4 servers, word filter — vendored `filterstore.mjs`-equivalent: copy the forum's `api/filterstore.mjs` + `api/filter.mjs` match predicate verbatim into `api/filter.mjs` (allow-listed substitutions only; `ensureFilterWords` cached per request like the forum).
- Produces: `handleMessageRoutes(request, env, url, path, method, ctx)` plus the shared send primitive `sendMessageToChannel(env, user, channelId, body, clientMessageId|null)` → `{message}` used by both the REST POST and Task 8's DO. Endpoints:
  - `GET /api/channels/:id/messages?after=<bare-id>&limit=` → the member's server text channels + their own dm/group channels only; access check = single SQL (`server channels`: `gc_server_members`; `dm/group`: `gc_conversation_members`); no membership → 404 `{error: "This channel does not exist or you cannot view it."}`. Returns `{messages: [{id, authorId, authorName, body, editedAt, source, attachmentIds}], nextAfter: <id|null>}` ordered by `id DESC LIMIT 50` (limit ≤ 100).
  - `POST /api/channels/:id/messages` `{body, clientMessageId?}` (rate-limit `message:userId`) — body ≤ `GC_MESSAGE_MAX`, trimmed non-empty, word-filtered (`FilterError` → 400 with the forum's standard filtered-message copy); returns `{message}`. With `clientMessageId`, re-posting the same triple (`channel_id, author_id, client_message_id`) returns the EXISTING row (`INSERT ... ON CONFLICT(channel_id, author_id, client_message_id) DO NOTHING` + follow-up SELECT on conflict; batch both). Updates the channel's `last_message_id`/`last_message_at` in the same batch.
  - `PATCH /api/messages/:id` `{body}` — author-only (SQL `WHERE id = ? AND author_id = ?`), re-filtered; sets `edited_at`. `DELETE /api/messages/:id` — author, or server owner/moderator for channels with `server_id NOT NULL`, or platform staff for any (`role IN ('owner','admin')` at platform tier via `readSession` user role); author-or-authorized DELETE guarded in SQL, 404 when no row deleted.

- [ ] **Step 1: Write failing tests**: the five Review-Focus/behavior pins — (a) outsider GET messages → 404 and no rows bound; (b) outsider POST → 404; (c) same `clientMessageId` twice → one row, both responses carry the same `id`; (d) edit by non-author → 404; (e) filtered word → 400 with filter error copy; (f) staff (platform tier, not member of the server) can DELETE a message; (g) `after=<id>` returns only older rows and `nextAfter` of the oldest page.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `api/messages.mjs`** per the endpoint table.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Wire into worker, full run, commit**

```bash
git add api/messages.mjs api/filter.mjs tests/messages-module.test.mjs worker.mjs
git commit -m "feat: message rest — history cursor, idempotent send, edit, delete"
```

---

### Task 6: Image attachments — upload, serving, review

**Files:**
- Create: `api/media.mjs`, `tests/media-module.test.mjs`
- Modify: `worker.mjs` (add handler), `api/messages.mjs` (attach `attachmentIds` at send if provided — see Interfaces below)

**Interfaces:**
- Consumes: vendored `api/core/images.mjs` (`sanitizeImage`, `sniffImageMime`, `imageResponse`, `blobToUint8Array`), `readLimitedBody`, `requireUser`, `requireStaff`. Task 2 media tables.
- Produces: `handleMediaRoutes(request, env, url, path, method, ctx)`. Endpoints:
  - `POST /api/attachments` via `multipart/form-data` (rate-limit `upload`, CSRF) — accepts exactly one `image` file field, ≤ 5 MiB (`size_bytes CHECK`); sniff MIME against the four allowed; stores sanitized bytes split into `gc_attachment_chunks` rows at 64,000 bytes + `gc_attachments` row `status='pending'` in one batch; returns `{attachment: {id, status: 'pending'}}`. Dimensions (width/height) parsed by the vendored image sniffing where available; null otherwise.
  - `GET /api/attachments/:id` → approved attachments: 200 with full `imageResponse` security headers + `Cache-Control: public, max-age=31536000, immutable`; `pending`/`rejected`: 200 **only** for the uploader or platform staff, else 404 (Review Focus pin).
  - `GET /api/admin/attachments` (`requireStaff`) → pending list `{attachments: [{id, uploaderName, sizeBytes, mime, createdAt}]}`; `POST /api/admin/attachments/:id/approve|reject` (`requireStaff`) → status transition guarded `WHERE status='pending'`; reject deletes chunk rows (batch).
  - **Send-with-image:** `POST /api/channels/:id/messages` gains an optional `multipart/form-data` variant with body field `body` + up to 1 attachment (same pipeline inlined via a shared `createAttachment(env, uploaderId, fileBytes)` exported from `api/media.mjs`), attachment pre-attached in the request batch, message row's `attachment_ids` passed back as `attachmentIds` (resolved by join at read time — messages store `gc_attachments.message_id` linking, no JSON columns).
  - Read-time gating: `GET messages` returns `attachmentIds` only for `status='approved'` rows plus the viewer's own pending ones (SQL: `(a.status='approved' OR a.uploader_id = ?)`).

- [ ] **Step 1: Write failing tests**: (a) upload rejected mime → 400 without any chunk rows; (b) upload > 5 MiB → 413; (c) pending attachment GET by third party → 404, by uploader → 200 content-type matches the sniffed mime; (d) approve transition flips status and then third-party GET → 200; (e) reject deletes chunk rows; (f) message-with-attachment read returns `attachmentIds` for approved but omits others' pending.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `api/media.mjs`** + the multipart branch in `api/messages.mjs`.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Wire into worker, full run, commit**

```bash
git add api/media.mjs api/messages.mjs tests/media-module.test.mjs worker.mjs
git commit -m "feat: image attachments — upload, review pipeline, gated serving"
```

---

### Task 7: Conversations — DMs and group chats

**Files:**
- Create: `api/conversations.mjs`, `tests/conversations-module.test.mjs`
- Modify: `worker.mjs`

**Interfaces:**
- Consumes: Task 2 `gc_channels`/`gc_conversation_members`, Task 5 message routes (dm/group channels are `gc_channels` rows with `server_id IS NULL` — this is the plan's realization of the spec's `gc_conversations`; the spec's "conversation" is a channel here).
- Produces: `handleConversationRoutes(request, env, url, path, method, ctx)`. Endpoints:
  - `POST /api/conversations` `{userIds}` — 1 id (DM) or 2–8 ids (group); validates every id exists in `users`; DM find-or-create keyed on the canonical pair: for a DM, reuse the existing `gc_channels` row where the same two `gc_conversation_members` rows exist (SQL: members count of the intersection = 2 AND kind = 'dm'); group chats always create new. Insert channel + member rows (self included) in one batch. Blocked pairs refuse: a blocker-blocked relation (forum `blocks` table, read-only use) → 403 "You can't start a conversation with that member." Returns `{conversation: {id, name, kind, members}}`; DM `name` = other member's username (server computes at read, not stored).
  - `GET /api/conversations` → the member's dm/group channels `{conversations: [{id, name, kind, members: [{userId, username}], lastMessage: {body, createdAt, authorName}|null, unread: <count via gc_conversation_members.last_read_message_id>}]}`.
  - Leave: `DELETE /api/conversations/:id` (group only; removes own member row — last member leaving deletes the channel, batched).

- [ ] **Step 1: Write failing tests**: (a) DM created then re-POSTed with same pair → same id; (b) group with 3 members creates separate channel even if a 3-way existed... (groups always create); (c) blocked pair → 403; (d) non-existent userId → 400; (e) unread count reflects `last_read_message_id`; (f) outsider GET /api/conversations only ever sees own channels (assert query binds session user).

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `api/conversations.mjs`**

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Wire, full run, commit**

```bash
git add api/conversations.mjs tests/conversations-module.test.mjs worker.mjs
git commit -m "feat: dm and group conversations — find-or-create, list, leave"
```

---

### Task 8: ChatRoom Durable Object — WebSocket live chat

**Files:**
- Create: `api/rooms.mjs` (replaces Task 1 stub), `tests/rooms-relay.test.mjs`
- Modify: `worker.mjs` (WS upgrade route inside a new small `api/ws.mjs`, added to `API_HANDLERS`; wire `env.ROOMS`)

**Interfaces:**
- Consumes: Task 5 message routes (the DO validates + inserts through the same authorization SQL, calling the exported `sendMessageToChannel(env, user, channelId, body, clientMessageId)` from `api/messages.mjs` — extracted as a function in Task 5, not re-implemented here).
- Produces: `export class ChatRoom extends DurableObject` (from `"cloudflare:workers"`), constructor `(ctx, env)`; `async fetch(request)` upgrades when `Upgrade: websocket`, tags each socket with `{userId, username, channelKind}` parsed from the query params the route validated. Envelope (pinned here — phase 2 voice extends, never breaks it): text frames only in phase 1.
  - Client→server: `{"type":"msg","clientMessageId":"...","body":"..."}`, `{"type":"typing"}`, `{"type":"ping"}` → replies `{"type":"pong","t":<client echo>}`.
  - Server→client: `{"type":"msg","message":{...}}` (Task 5 message shape), `{"type":"broadcast","kind":"typing","userId":...}`, `{"type":"roster","members":[{userId, username}]}` on join/leave.
  - Relay rule (the unit-tested core): every `msg` → insert via `sendMessageToChannel`, then `broadcastJson` to all OTHER sockets; `typing` → no persistence, broadcast to others, self-throttled client-side; join/leave broadcast `roster`.
  - `tests/rooms-relay.test.mjs` instantiates `ChatRoom` with fake `ctx`/`env` (fake WebSocket pair objects exposing `send`, `addEventListener(msg)`) and pins: (a) msg persists via `sendMessageToChannel` fake and broadcasts to others but not the sender; (b) typing broadcasts without persisting; (c) two joins produce roster frames to both; (d) malformed JSON frame → socket gets `{"type":"error","code":"bad_frame"}` and stays connected; (e) `ping` → `pong` echo and nothing broadcast.
  - WS route `api/ws.mjs`: `GET /api/ws?channel=<id>` — validates channel access identically to Task 5's read gate, then forwards to `env.ROOMS.get(env.ROOMS.idFromName("channel:" + channelId))`; hibernation API (`state.acceptWebSocket(ws)` with `webSocketMessage`/`webSocketClose` handlers). Voice/binary frames are reserved (phase 2): binary frames today → `{"type":"error","code":"binary_unsupported"}` and ignored.

- [ ] **Step 1: Write failing `tests/rooms-relay.test.mjs`** (pins a–e above).

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `api/rooms.mjs`** + `api/ws.mjs` upgrade route.

- [ ] **Step 4: Run — PASS** (`node --test tests/rooms-relay.test.mjs` over the fake socket pair).

- [ ] **Step 5: Manual smoke with two browser tabs** — `npm run dev`, sign in as two accounts in two tabs, same channel; messages + typing + roster visible in both. (No automated WS test in `node --test` — workerd behavior only verifiable in dev.)

- [ ] **Step 6: Commit**

```bash
git add api/rooms.mjs api/ws.mjs tests/rooms-relay.test.mjs worker.mjs
git commit -m "feat: chatroom durable object — websocket fan-out with hibernation"
```

---

### Task 9: PresenceHub DO + custom status

**Files:**
- Create: `api/presence.mjs` (replaces stub; DO + REST), `tests/presence-module.test.mjs`
- Modify: `worker.mjs`, `public/js` none yet

**Interfaces:**
- Consumes: Task 8's connection lifecycle — ChatRoom joins/leaves forward to `env.PRESENCE.get(env.PRESENCE.idFromName("hub"))` via a stub fetch (`{"type":"connect","userId"...}`) — but presence heartbeat is client-driven so the hub works even with zero chat WS open.
- Produces: `export class PresenceHub` — in-memory `Map` userId → `{username, lastSeen, statusText, statusUntil, channelLabel|null}` (DO memory is fine on Workers Free: hub hibernates when empty, no D1 writes); `fetch()` handles text frames: `{"type":"heartbeat","userId","username"}` → upsert + reply `{"type":"presence","online":[{userId, username, statusText, statusUntil}]}` (status hidden when `statusUntil < now`); `{"type":"leave","userId"}` → remove + echo presence. REST: `GET /api/presence` → `{online: [...]}` (server does the DO roundtrip); `PATCH /api/me/status` `{statusText|null, statusUntil|null}` (≤ 128 chars, persists to `gc_member_status` — hub re-reads status on next heartbeat; heartbeats ride the chat WS client, one `heartbeat` frame per 60s).

- [ ] **Step 1: Write failing tests** (fake DO env): heartbeat upserts and returns others' presence; leave removes; stale status (statusUntil past) is hidden; `PATCH /api/me/status` writes `gc_member_status` (SQL shape pinned) and null clears.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement** `api/presence.mjs`.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Wire, commit**

```bash
git add api/presence.mjs tests/presence-module.test.mjs worker.mjs
git commit -m "feat: presence hub and custom status"
```

---

### Task 10: Forum-chat import

**Files:**
- Create: `migrations/import-from-forum.sql`, `tests/import-sql.test.mjs`
- Modify: `package.json` (`"db:import:forum:local"` script: `npx wrangler d1 execute wempo-forum-data --local --file migrations/import-from-forum.sql`)

**Interfaces:**
- Consumes: forum tables `chat_messages(id, user_id, body, created_at)`, `dm_threads(id, user_a, user_b, created_at)`, `dm_messages(id, thread_id, user_id, body, created_at)` (verified against `wempos-forum/migrations/0032_presence_chat.sql`); Task 2 schema.
- Produces: idempotent SQL import. `gc_servers`: one row `(name='Wempo''s Forum', owner_user_id = <the forum admin — resolved as `(SELECT user_id FROM (SELECT user_id FROM sessions ORDER BY user_id, created_at LIMIT 1) )`… pin instead: the import takes the FIRST admin: `(SELECT id FROM users WHERE role IN ('owner','admin') ORDER BY created_at LIMIT 1)` — deterministic, testable); `gc_channels`: `#general` (`kind='text'`) + `#forum-archive` (`kind='text'`, `name='forum-archive'`); archive channel receives `INSERT INTO gc_messages SELECT ... FROM chat_messages` with `source='forum-chat'`, original `created_at`. DMs: each `dm_threads` row → a `gc_channels` `(kind='dm', server_id NULL)` row whose id maps deterministic: channel ids allocated via `INSERT ... SELECT` with a lookup subquery keyed on `(MIN(user_a,user_b), MAX(user_a,user_b))`; members rows for both users; messages with `source='forum-dm'`. Membership: every `users` row having chat or DM history becomes `gc_server_members(user_id, role='member')` (owner row separately for the admin). All INSERTs guarded with `WHERE NOT EXISTS` on deterministic keys (server name, channel name, `(chat_messages.id)` via a sentinel: message uniqueness rides `(channel_id, author_id, client_message_id)` where `client_message_id = 'import-chat-' || chat_messages.id` / `'import-dm-' || dm_messages.id` — makes rerun a no-op through the UNIQUE constraint alone).
- Cap: message bodies > 2000 chars cannot exist (forum max 1000) — assert with a test that forum chat bodies ≤ 1000 (read from the SQL constants, no live DB).

- [ ] **Step 1: Write failing `tests/import-sql.test.mjs`**: parse the import file; assert (a) every INSERT targets `gc_*`, (b) every guarded key uses the `import-chat-`/`import-dm-` client_message_id sentinels, (c) the archive channel name literal is `'forum-archive'`, (d) the owner subquery selects `role IN ('owner','admin') ORDER BY created_at LIMIT 1`.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Write `migrations/import-from-forum.sql`** per the Interfaces mapping.

- [ ] **Step 4: Apply against a local DB seeded with forum schema + rows**: apply forum migrations 0001..0041 + this repo's 0001 to a scratch local D1, seed 3 users / 2 chat messages / 1 dm thread with 2 messages, run the import SQL, assert via `d1 execute` counts: `gc_messages` = 4, one dm channel, archive channel holds 2 `forum-chat` rows, rerun → still 4.

- [ ] **Step 5: Commit**

```bash
git add migrations/import-from-forum.sql tests/import-sql.test.mjs package.json
git commit -m "feat: idempotent forum chat and dm import"
```

---

### Task 11: Frontend shell — index.html, boot, login route

**Files:**
- Create: `public/index.html`, `public/styles.css` (new base layer), `public/js/{api,state,icons,theme,router}.js`, `public/js/routes/login.js`, `public/js/theme-preload.js`
- Modify: none

**Interfaces:**
- Consumes: Task 3 endpoints. Ported from the forum repo (vanilla copies, allow-listed subs): `public/js/{theme,theme-preload,icons,api}.js` — `api.js` keeps the same `apiFetch(path, {method, body, csrf})` contract (reads `X-CSRF-Token` from state).
- Produces: SPA boot sequence: `theme-preload.js` (inline, in `<head>`) → `boot` in `state.js`: fetch `/api/me` → store session, mount router (`#/` app shell or `#/login`), stale-build check against `/api/version` every 60s (port from forum). `index.html`: one `<div id="app">`, link styles.css, module scripts. `routes/login.js`: register + login (+ TOTP code step) + Turnstile widget; on success store session and `location.hash = "#/"`. CSP is the vendored one in `core/http.mjs` — `connect-src 'self'` already allows the WS (`wss:` same-origin included in `'self'`? **No** — `api/core/http.mjs` CSP must add `wss:` — vendored `connect-src 'self'` needs `'self' wss:`; that IS an allow-listed divergence, add it and note it in the parity test's substitution list as `connect-src 'self';`→`connect-src 'self' wss:;`).

- [ ] **Step 1: Port the four shared JS modules + write login route + shell** (no unit tests in this task — DOM code; behavior pinned by Task 12's markdown tests and manual checks here).

- [ ] **Step 2: Manual smoke** — `npm run dev`: register a fresh account through the UI (Turnstile keys absent in dev → the form must still submit because `env.TURNSTILE_SECRET` unset skips verification per vendored `requireTurnstile` 403-only-when-configured path — verify that behavior holds and document it in the route's comment), land on `#/`, reload persists session, logout returns to login.

- [ ] **Step 3: Commit**

```bash
git add public/
git commit -m "feat: frontend shell, boot sequence, login route"
```

---

### Task 12: Frontend chat app — layout, live messaging, markdown

**Files:**
- Create: `public/js/{dom,markdown,ws}.js`, `public/js/routes/app.js`, `tests/markdown-render.test.mjs`
- Modify: `public/index.html`, `public/styles.css` (login route and shell land in Task 11)

**Interfaces:**
- Consumes: Tasks 3–5, 7–9 endpoints; Task 8 WS envelope (verbatim contract).
- Produces: app route `#/` renders the Discord layout — server rail (`GET /api/servers`), channel sidebar (per-server channels + DM list from `GET /api/conversations`), message pane (`GET messages` + WS live append), composer, member/presence sidebar (`GET /api/presence` + roster frames). `markdown.js`: port the forum's markdown subset (bold, italics, inline code, fenced blocks, links with the forum's `http(s)`/same-origin restriction) rendering via **textContent-only** DOM assembly — no `innerHTML` anywhere for user content. `ws.js`: one shared WebSocket per open channel, reconnect with jittered backoff, on reconnect re-`GET messages?after=<lastSeenId>` (the Resume rule — no server replay in phase 1), typing-throttle 3s.

- [ ] **Step 1: Write failing `tests/markdown-render.test.mjs`** — pins: `<img src=x onerror=alert(1)>` survives as literal text; `**bold**`/`*em*`/`` `code` `` produce the same DOM the forum's markdown produces; links render `<a href>` only for http(s)/same-origin, `javascript:alert(1)` stays literal text; assert no `innerHTML` usage in `markdown.js` source (regex the file).

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Port `markdown.js`** and the app layout per Interfaces.

- [ ] **Step 4: Run — PASS; then manual smoke:** two tabs (two accounts), same channel: live delivery works both ways, typing indicator, roster updates on tab close (WS close → roster), presence list shows both online, custom status set via PATCH shows up, edit + delete reflect for both tabs, DM opened from presence sidebar works, image message renders (Task 6 attachment).

- [ ] **Step 5: Commit**

```bash
git add public/ tests/markdown-render.test.mjs
git commit -m "feat: chat app frontend — layout, websocket live chat, markdown"
```

---

### Task 13: Frontend attachments + staff review strip

**Files:**
- Create: `public/js/attachments.js`, `public/js/routes/admin.js`
- Modify: `public/js/routes/app.js`, `public/styles.css`

**Interfaces:**
- Consumes: Task 6 endpoints (`POST /api/attachments`, gated `GET /api/attachments/:id`, admin review routes). Task 3 session (role owner/admin sees the admin entry).
- Produces: composer attach (file picker + paste-image), immediate local preview, send-with-attachment (multipart), pending attachments render in-message for their uploader with a "pending review" chip, approved render as `<img src="/api/attachments/:id">`. `routes/admin.js`: minimal staff strip — pending attachment list with approve/reject buttons.

- [ ] **Step 1: Implement per Interfaces** (no new unit tests; Task 6 already pins server behavior).

- [ ] **Step 2: Manual smoke** — upload png → pending chip for uploader, invisible as image to second tab; staff tab (role owner) sees review strip, approves → image visible in both tabs; rejected → removed for all; non-image file rejected with a clear message; >5 MiB rejected before upload via client-side size check (server is the authority, client check is UX).

- [ ] **Step 3: Commit**

```bash
git add public/
git commit -m "feat: attachment uploads in composer, staff review strip"
```

---

## Done means (Phase 1 exit criteria)

- A member of the forum signs in to GooberCord with existing credentials (incl. TOTP), sees the imported server with #forum-archive + their imported DMs, and chats live over WebSockets with presence and custom status.
- Images send, await review, and render once approved; staff approves from the UI.
- `npm test` green; `db:migrate:local` + import rerun idempotently; `wrangler dev` boots with zero config warnings.
- Forum untouched: no `gc_`-foreign SQL executed anywhere (parity + scoping tests pin it).

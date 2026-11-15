# GooberCord — Discord-style live-chat companion to Wempo's Forum

Date: 2026-11-15
Status: design (pre-plan), owner-approved approach

## Intent and why

Wempo's Forum keeps being a forum (posts, boards, reactions, profiles, the
archive). Its live side — `/chat`, `/dms`, presence — is being *replaced* by
GooberCord: a Discord-style app where the same community gets servers with
text and voice channels, DMs, group chats, and real audio voice calls, in the
Discord shape (server rail, channel sidebar, message pane, member list, voice
pane). "They migrate over to GooberCord" means the people do — the forum's
existing chat and DM history imports once, nothing is lost, and the forum's
live-chat endpoints retire after GooberCord ships.

Why this design: the community is one community. Splitting it into a second
account system would fracture it; renting media infrastructure would cost
money the project must not spend; keeping forum-code polling for a Discord
class of app would cap it at its starting features. The rewrite is required
by the shape change (servers/channels/voice are not a forum retrofit) and by
taste — the user asked for "rewrite everything."

## Goals

- Real-time text chat over WebSockets (Durable Objects), replacing the
  forum's polling loop.
- Servers: invite-style communities containing text and voice channels.
- DMs and group chats with the same message pipeline and history.
- Voice: working audio calls in voice channels — join/leave/who's-here,
  everyone can hear everyone. Opus over WebSocket, fanned out client-to-client
  through a Durable Object relay.
- Presence everywhere: who's online, in which channel, custom status,
  per-app presence for the forum (see the retire step below).
- Profiles ride the forum identity: same `users` rows, same avatars/flairs.
- Custom server emoji, polls in channels, moderation parity (reports, bans,
  word filter, blocks, admin desk), TOTP 2FA honored on login.
- One-time import of `chat_messages`, `dm_threads`, `dm_messages` into the
  GooberCord schema.
- Retire step: flip a `site_settings` flag that hides/disables the forum's
  `/chat`, `/dms` routes and endpoints after import; the forum keeps history
  readable via its archive until the flag says otherwise. Forum presence
  heartbeats may later re-point so both apps show one member list — left to
  the builder as a stretch.

## Non-goals (v1)

- Video, screen share, Go Live / streaming. Deferred deliberately; the
  WebSocket frame relay that carries voice does not carry latency-sensitive
  video. Revisit later — note that a $0 path exists (Cloudflare Realtime free
  tier, 1 TB/mo) but that is a new decision, not part of this design.
- Native desktop/mobile apps (PWA on mobile is a goal in polish, mirroring
  the forum's PWA approach).
- Third-party bots or a public API. Soundboard, account connections
  (Spotify/Xbox), server boosts, per-server profiles, profile effects: later
  phases or non-goals, not v1.
- Audio recording, transcription, moderation of voice content.

## Anti-goals

- Any recurring cost beyond the account's current Workers plan ($0 target).
- Fake UI: nothing gets shipped that *looks* live but isn't (a voice channel
  you can join but not hear is an anti-goal; voice ships when it works).
- Wholesale copying of forum code into GooberCord. The stack, conventions,
  and shared tables are reused; the application is rewritten.

## Constraints

- Cloudflare platform only: Workers (no frameworks, vanilla JS frontend,
  ES modules worker like `wempos-forum`'s), D1 (the shared
  `wempo-forum-data` database — binding renamed, `GOOBER_DB`), Durable
  Objects with SQLite storage and WebSocket hibernation, Static Assets,
  R2 free tier (10 GB) for attachments/avatar-scale media and custom emoji.
- Node ≥ 22, wrangler 4, same script names as the forum (`dev`, `deploy`,
  `db:migrate:local|remote`, `test` = `node --test`).
- CSP discipline as the forum: HTML never interpreted message content —
  everything lands via `textContent`; dynamic styling via CSSOM
  `setProperty`, not inline style strings.
- D1 is SHARED with the live forum. GooberCord migrations must only create
  their own tables (all GooberCord-owned tables are prefixed `gc_`) and must
  never alter or reindex forum tables. Deploy order: migrations are additive
  and safe to run while the forum is live.
- Two `*.workers.dev` subdomains are different cookie scopes (cookies are
  host-locked on the public-suffix domain), so sessions are NOT shared over
  the cookie jar — see Auth.

## Approaches considered and decided

### Voice transport (the defining choice)

1. **WebRTC peer-to-peer mesh** with Durable-Object signaling — real voice,
   $0, and the best latency, but capped around 5–10 participants and the
   browser-to-browser path doesn't scale for channel-shaped rooms (many
   listeners, few talkers).
2. **Rented SFU** (LiveKit Cloud / Cloudflare Realtime) — quality A/V and
   streaming, but a paid third party and the user explicitly wanted the SFU
   *built*, not bought.
3. **Build the media plumbing from scratch, but stay on Cloudflare** —
   chosen. Workers/Containers cannot terminate WebRTC media (no inbound UDP
   on Cloudflare by construction), so "from scratch" here means: every client
   encodes its mic to Opus locally, ships Opus frames over its WebSocket,
   and a per-room Durable Object relays frames to the other members with no
   server-side mixing (each client mixes the streams it receives). A star
   relay at the application layer — voice works, scales to many listeners
   per talker, costs nothing, and is genuinely ours. No video on this path;
   streaming is deferred (see non-goals).

### Accounts and database

1. **Shared database, shared accounts** — chosen. GooberCord lives in the
   forum's D1 with its own `gc_` tables; login and registration read/write
   the same `users` table, so every forum member signs in to GooberCord with
   their existing credentials (including TOTP) and their profile, avatars,
   flairs, and admin role arrive with them.
2. Separate database and accounts — rejected: fractures the community and
   contradicts "replaces the chat."

### Real-time transport

Durable Objects with WebSocket hibernation over forum-style polling —
chosen. One DO owns each live conversation (channel, DM, group chat) and
each voice room. REST keeps a role here for history fetch and compatibility
with the forum's cursor-pagination module; WS carries live delivery,
typing, presence, and voice frames.

## The parts of the how that were decided, as decided

### Auth contract (shared users, separate sessions)

- GooberCord has its own login/registration UI hitting the same `users`
  table (same `password_hash`/pepper machinery — the auth primitives come
  from a small shared-contract module, not a copy of forum code).
- GooberCord mints its own session rows and its own cookie on its own
  subdomain. Both apps coexist on `sessions` without trusting each other's
  cookies; TOTP second-step flows are re-implemented against the same TOTP
  columns in `users`.
- Future-friendly: if both apps ever move under one custom domain, a shared
  session cookie becomes possible — noted so nothing in the schema prevents it.

### Voice mechanics

- Per voice channel, one `gc` voice Durable Object ("VoiceRoom"). WebSockets
  per member; binary frames carry Opus packets; text frames carry control
  (join/leave/talking indicator/latency pings).
- Client: `getUserMedia` + AudioWorklet capture, WASM Opus encode, playback
  via AudioWorklet jitter buffer with local mixing of all received streams.
- Server: DO relays frames between members, enforces room capacity and
  state (mute/deafen flags are client-advertised, not enforced — no
  server-side audio processing of any kind).
- Latency target: feel-live (sub-300 ms end-to-end-ish); talker caps and
  bitrate are set in constants, tuned in phase 2.

### Layout (Discord shape)

Server rail → server sidebar (channels; voice channels show connected
members) → message pane (history above, composer below) → member list. DM
list replaces the rail under a "Direct Messages" home entry. Mobile: the
forum's responsive approach returns as its own layer; bottom bar replaces
the rail on narrow viewports.

### Data (all GooberCord-owned tables prefixed `gc_`)

- `gc_servers`, `gc_server_members`, `gc_channels`, `gc_invites`,
  `gc_roles`/`gc_permissions` (v1: owner/moderator/member per server —
  richer roles stay out of v1), `gc_messages` (channel-scoped),
  `gc_conversations` + `gc_conversation_members` (DMs and group chats),
  `gc_message_reactions`, `gc_mentions`, `gc_read_state` (unread
  counters), `gc_emoji` (metadata rows; bytes in R2), `gc_reports`,
  `gc_ban_exempt`-style needs reuse forum `bans` directly.
- Content filter, attachment review, and block semantics reuse the forum's
  primitives (`filterstore`, `attachments` review pipeline, `blocks`),
  applied to GooberCord message writes.
- Idempotent client message IDs (forum's `post_creation_idempotency`
  lesson, migration 0021) apply to chat writes from day one.

### Import and retire

- One-time import (a migration-style script, rerunnable until it
  succeeds): `chat_messages` → the server's designated "forum archive"
  channel; `dm_threads`/`dm_messages` → the same-named GooberCord DM
  conversation per member pair. Author mapping by user id; timestamps
  preserved.
- The forum's `site_settings` gains a flag consumed by the forum worker to
  turn off its chat/DM endpoints and routes. Throwing the switch is a
  human decision after GooberCord goes live, not part of GooberCord's deploy.

### Phasing (each phase shippable)

1. **Conversations core** — accounts/login (shared `users`), servers +
   channels + DMs/group chats, WebSocket chat, history, presence/status,
   the import. This is the "replaces the chat" milestone.
2. **Voice** — presence-in-voice first, working Opus relay second.
3. **Community layer** — invites, roles/permissions, moderation parity +
   admin desk, custom emoji.
4. **Polish/fun** — polls, badges, mentions surface, per-server profiles
   revisit, PWA, streaming decision point.

## What's left to the builder

- Opus encoder/playback stack choice for the client (WASM lib selection is
  free; constraints: AudioWorklet, no external paid service).
- DO naming/partitioning details, WS message envelope design, reconnect +
  resume protocol, exactly-once-enough delivery semantics.
- Cursor/pagination wiring for history (reuse the forum `cursors` core
  module where it fits).
- Rate-limit plan (mirror the forum's named limiter pattern; new namespaces
  in `wrangler.toml` under the same account).
- Notification model for v1: in-app only (forum notifications stay forum's).
- `TURNSTILE_HOSTNAMES` update for the new subdomain; `.dev.vars` secrets
  setup identical to the forum's documented flow.

## Cost

Target $0 recurring. Everything above runs on the account's existing plan:
Workers + D1 + assets (free-tier pattern already proven by the forum),
Durable Objects incl. WebSocket hibernation, R2 10 GB. Voice relay is
application-layer fan-out, charged as WS messages in the existing DO
budget. No Containers, no Realtime, no VPS.

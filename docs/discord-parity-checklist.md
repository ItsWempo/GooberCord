# Discord parity backlog (owner-provided references, 2026-11-16)

The owner is aligning GooberCord with Discord feature-for-feature. Sources:
Discord's official Sign-Up, Login, Getting Started (desktop/mobile), Join a
Server, Sending Messages, Group Chat and Calls, Markdown, Attachments,
Nitro Emoji Packs, Typing Indicator, Mention Suggestions, Voice Messages,
Bookmarks/Reminders, Forwarding, Message Requests, Link Previews and
OS-requirements guides, plus browser screenshots of Friends/DM/server/
discovery/profile/shop pages. Work items below fold into the UI redo
(post phase-2 merge) and Phase 3/4.
**Not carried over on purpose:** anything needing email/phone/DOB fields
or paid Nitro — GC has neither (owner's known decisions; ask first).

## UI redo (the owner-approved structure — next workstream)
- Discord structure: friends hub with search + tabs (All/Online/Pending/
  Blocked), Active Now panel, user footer (mute/deafen/gear, round rail
  icons), channel categories, server banner, boost progress bar,
  role-grouped member list, profile surface, richer discovery page.
- **Theme switch** (owner picked "Both"): the warm brand look default +
  the Discord dark skin, extended off public/js/theme.js's storage.
  Appearance-guide extras for the theme surfaces: browser Ctrl/Cmd +/-
  zoom is free; chat font-scale + message-spacing sliders are cheap
  CSS-var dials in settings; UI density (Compact/Default/Spacious) is
  one more spacing var. Custom theme colors + gradient = a later
  Goober+ perk: user-picked values land in the existing CSS-var token
  set (picker + hex input like the accent-perk dialog), never arbitrary
  inline styles (CSP); share-a-theme as a JSON blob is fine but only
  applied after every value passes the same hex/var whitelist — no
  eval.

## Sign-up / registration (Discord's flow)
- Login page carries an obvious "Register" entry; register form is one
  username + password + Continue step, CAPTCHA on submit (GC: Turnstile).
- **Invite-first registration**: an invite link for a signed-out person
  prompts account creation and then lands them in the server. GC already
  does this (#/join/CODE → login → auto-join) — keep it prominent in the
  register copy: "New here? Create an account — invites apply after."
- Join-or-create dialog: green "+" opens both "Create a server" AND
  "Join a server" (paste invite link). GC's rail "+" should offer both.
- GC deliberately has no email/DOB (forum account model has neither);
  do not invent fields without an owner decision. No QR login until a
  mobile app exists (desktop-app deferred). Note: Discord renames
  unverified accounts after 7 days — GC has no equivalent (and needs none
  without email).
  - QR Login FAQ (second paste): still a skip while mobile apps are
    deferred — but note the skip's premise is slightly over-strict: a
    phone BROWSER with a logged-in GC session could drive the approve
    step (QR rendered client-side via canvas, short-lived token, in-app
    "Approve this login?" screen with Cancel). If the owner ever wants
    password-free sign-in on unfamiliar machines, that's the shape;
    Discord's safety copy is the spec for the approval screen (never
    approve a login you didn't prompt; always Cancel-able). Owner gate,
    not queued.

## Keyboard shortcuts (browser/desktop parity targets)
Canonical list from the Windows hotkeys chart (macOS version was
image-only; swap Ctrl→⌘, keep the same bindings):
- Quick switcher (find/start a DM): Ctrl/⌘ + K
- Navigate between servers: Ctrl/⌘ + Alt + ↑/↓ (the GC rail);
  between channels: Alt + ↑/↓; between unread channels: Alt + Shift + ↑/↓
- Mark channel read: Esc; mark server read: Shift + Esc
- Pin/mentions/member-list popouts: Ctrl/⌘ + P / I / U (map to the
  pins panel, mentions inbox, member list toggles as those ship)
- Emoji picker: Ctrl/⌘ + E; GIF picker: Ctrl/⌘ + G
- Scroll chat: Page Up/Down; jump to oldest unread: Shift + Page Up
- Create/join a server: Ctrl/⌘ + Shift + N; create private group:
  Ctrl/⌘ + Shift + T
- Edit last message: Shift/⌥ + ↑; back/cancel: Esc
- Search current channel: Ctrl/⌘ + F; all channels: Ctrl/⌘ + Shift + F
- Return to previous text channel: Ctrl/⌘ + B (and last voice channel:
  Ctrl/⌘ + Alt + A) — the keyboard twin of the "return" affordance
- Toggle mute: Ctrl/⌘ + Shift + M; deafen: Ctrl/⌘ + Shift + D;
  upload file: Ctrl/⌘ + Shift + U; settings: Ctrl/⌘ + ,
- Toggle hotkeys/help: Ctrl/⌘ + / opens the shortcuts help dialog.
- Accessibility navigation (keyboard-navigation FAQ): GC already ships
  real buttons/links + aria-labels everywhere (vanilla DOM), so Tab
  order is largely free; add F6/Shift+F6 section jumping (rail ➝ channel
  list ➝ messages ➝ member list) and the focused-message action keys
  (r reply, + react, e edit, Backspace delete, p pin, Esc back to the
  composer) once those actions exist. A focus-ring style rides the
  existing :focus-visible tokens.
- Custom keybinds (add-keybinds guide): Discord's version is desktop-only
  because it captures keys GLOBALLY (outside the app) — a browser tab
  can't do that at all. GC ships the fixed palette above instead; an
  in-page rebindable-keys settings page is possible but low value, skip
  unless someone asks. PTT's key rides the voice-polish item.
- Accessibility settings (accessibility-settings-tab + reduced-motion
  guides): one settings section gathers — reduced motion (default =
  sync with the OS, i.e. honor prefers-reduced-motion automatically;
  reduced mode means: jumps are instant, tooltips/menus fade not slide,
  loading mascot static, animated emoji/GIF avatars play only on
  interaction),
  contrast + saturation sliders (CSS filter/color on the root token
  set), role-color display modes (names / dot beside the name / none —
  pairs with the phase-3 role colors), and the TTS rate slider (rides
  the /tts item). High-contrast = an alternate token set, cheap since
  GC themes are CSS vars already. Sticker/GIF autoplay toggles ride the
  media settings whenever attachments render.
- Reordering (accessible-drag-and-drop FAQ): GC doesn't reorder
  servers/channels by drag yet at all; if a reorder ships (natural
  phase-3 category work), use Discord's accessible pattern from the
  start — Ctrl/Cmd+D lift, arrows to move, Enter/Space drop, Esc
  cancel — so keyboard users get it for free; avoid a mouse-only
  implementation.

## Slash commands (v1 in-app commands, no third-party apps)
- Composer "/" opens an autocomplete menu; Enter executes.
- Starter set: /shrug, /tableflip, /unflip, /spoiler, /me, /giphy (media
  pipeline), plus per-feature commands once roles land (/kick, /timeout,
  /purge — Phase 3, gated by the mod permissions model).
- /tts (TTS 101 guide): feasible $0 — the Web Speech API (speechSynthesis)
  is local to each listener's browser, zero infra. Sender's /tts line
  flags the message; listeners render audible speech only if their local
  setting allows. Ship with: per-user off switch in the chat settings
  ("Never" semantics), TTS rate limiter for senders, and long-text
  truncation so the troll "WWWW…" spam has a cap. Queue after the base
  slash commands (needs /shimmer's message-metadata path, not new infra).

## Search (search guide)
- Server-scoped search panel off the channel header (Ctrl/⌘+F focuses
  it; also the header icon): D1 LIKE/FTS over gc_messages joined to the
  caller's membership, token shortcuts from:, in:, mentions:, has:
  (link/file/attachment), date before/after, sort newest/oldest/relevance,
  result rows jump to the message in-channel. Phase 3 item — pairs with
  mentions (mentions: needs the mention column) and pins (has: pin).
  Cap results (Discord: 500-ish) + server cap so a LIKE scan stays cheap
  on the shared D1. Cross-DM search later; GC's small user base makes
  the simple LIKE version adequate first.

## Inbox (Inbox FAQ guide)
- A message-center hub with two tabs, opened by Ctrl/⌘+I and an inbox
  icon on the top bar:
  - **Unreads tab**: every unmuted, unread channel/conversation with a
    badge count (DMs/group chats show red badges, matching the rail's
    existing unread markers — this tab AGGREGATES read-state data GC
    already tracks, so it's cheap). Per-message checkmark marks read;
    "Mark inbox as read" clears everything (Ctrl/⌘+Shift+E marks the
    top entry). @here-pings belong in Unreads, not Mentions (Discord's
    split: Mentions = addressed-to-you only).
  - **Mentions tab**: messages with @you/@role/@everyone — needs the
    phase-3 mention column + roles (owner-gated pair); filter chips
    (@everyone/@role toggles, all-servers), per-message X to dismiss,
    7-day auto-clear (GC version: keep 7d too — a small WHERE
    created_at > prune on read). Jump button on rows opens
    channel-at-message (same deep-link path as copy-message-link).
    Mute from the hub = channel/server mute preferences; GC needs a
    mute model first (phase 3, pairs with notification badges). Order:
    Unreads tab can ship with the UI redo's phase; Mentions tab waits
    for mentions. Not filed as UI-redo scope; queued phase 3 with
    pins/replies.

## Message formatting (markdown on render; textContent-only DOM build)
- Bold **x**, italic *x*, underline __x__, strikethrough ~~x~~,
  inline `code`, spoiler ||x|| (click-to-reveal class), and Ctrl/⌘ +
  B/I/U shortcuts in the composer. Spoiler extras from the Spoiler Tags
  guide: eye icon in the composer to wrap selection, /spoiler prefix,
  attachment "mark as spoiler" eye toggle before send (blur until
  clicked), spoilers re-hide when you leave the channel, spoilers are
  negated inside inline code.
- Render path must tokenize into element nodes (never innerHTML with user
  content); the renderer lives with the message row builder in app.js.

## Server structure (screenshots)
- Channel categories with collapse carets (e.g. "General Information"). Collapse state starts client-side (localStorage); if cross-device persistence is wanted later (collapse-syncing guide), it's a per-user server-side blob — cheap, but only after the category model itself exists (schema gap below).
- Server banner image + name header over the channel sidebar.
- Boost goal progress bar (boosts count / goal, milestone labels).
- Member list grouped by role with role-colored names and APP/user badges.
- Server profile card: banner color, avatar & decoration, connections,
  bio, badges (GC reads forum profiles; editing stays forum-side for now —
  revisit as an owner decision).
- Spoiler channels (spoiler-channels guide): a per-channel opt-in gate
  for sensitive/heavy topics — owner toggles "spoiler channel" on a
  channel; members see a notice (channel name + topic shown on the
  notice, so the topic doubles as the heads-up) with View it anyway /
  Go back; acknowledged opt-in is remembered client-side (localStorage
  ack is enough at GC scale) and the channel renders gray until then.
  GC-OWNED schema: a boolean on gc_channels needs a small migration but
  NO forum-table owner gate — genuinely cheap to add with channel
  settings; wire into the channel-edit route when it gains more than
  rename (phase 3). Age-restricted channels are N/A (no age model).
- Server Hub (server-hub guide): the gaming leaderboard + popular-games
  widgets are SKIP (activity sharing/connections don't exist). The
  transferable skeleton: a server HOME tab instead of a dashboard —
  server icon/name/banner + online/total/boost counts + an
  owner-authored text-and-image "about" block; cheap static content,
  could double as the invite/link-preview target. OWNER-GATED CANDIDATE
  (not queued): the shared Whiteboard — a persistent multiplayer canvas
  is buildable on the same DO frame-relay pattern as voice, but it's a
  real project (live canvas sync, ≤90-day retention, reporting/mod
  removal, role-restricted access) — flag for phase 4+ if the owner
  ever wants it. Hub system messages (leaderboard updates in a chosen
  channel) are leaderboard-only; skip with the widgets.

## Discovery (screenshots)
- Featured-server cards with banner art; big hero headline in Discord
  mode ("FIND YOUR COMMUNITY ON GOOBERCORD"), warm equivalents in brand
  mode; category tabs (Home/Homework/Fun/Minecraft) once servers fill out.

## Chat bar & messages (Sending Messages guide)
- Composer layout parity: "+" attachments (left), message box center,
  emoji picker (right), GIF/sticker tabs inside the picker. Drag-and-drop
  file upload onto the chat pane (GC already accepts file input; add DnD).
- Message cap 2000 chars (Nitro 4000 → GC: Goober+ perk 4000 free); over
  the cap Discord converts to a text file — GC: surface a clear 400 copy
  (no silent truncation) unless the owner wants the file-conversion quirk.
- Message hover bar: reactions, reply, thread (defer), bookmark, forward,
  pin, edit, more-options (…) menu.
- Pins (Pin Messages FAQ): a gc_message_pins table (channel + message +
  pinner), pin/unpin gated at the owner/moderator level (the mod-desk
  permission model), a pins panel off the channel header (newest first,
  Jump buttons), confirmation on pin/unpin (Shift skips it), and a
  "X pinned a message" system line in chat. GC has no message-permission
  model yet — ship pins with owner/mod roles only. Sits right after
  replies in priority since they share the hover-bar row.
- Replies: hover-bar Reply attaches a quoted reference above the message
  (content collapsed to one line, click jumps/quotes it), reply pings the
  author (the ping toggle stays a v2 nicety); data-wise a reply is just
  gc_messages.reply_to — needs the schema column + composer reply-bar + a
  "replying to" row rendering. Higher priority than bookmarks/forwarding.
- Edit flow (edit-messages guide): pen icon on the hover bar opens the
  inline editor pre-filled, Enter/Save commits, Esc backs out without
  changes, Shift+↑ opens it on your own latest message (already in the
  shortcuts list); edited messages carry a small "(edited)" marker and
  the edit updates via the normal WS path.
  (content collapsed to one line, click jumps/quotes it), reply pings the
  author (the ping toggle stays a v2 nicety); data-wise a reply is just
  gc_messages.reply_to — needs the schema column + composer reply-bar + a
  "replying to" row rendering. Higher priority than bookmarks/forwarding.
- Message Requests inbox for DMs from non-friends (accept/ignore/spam) —
  Phase 3 social layer (needs friends first). Do not gate on age groups.
- DM privacy + the unsendable-DM error (Why isn't my DM going through):
  per-user DM setting (anyone vs friends-only), server-level "allow DMs
  from members" toggle, and block — with GC's version of the Clyde copy
  on failure ("Your message could not be delivered…" shown verbatim with
  the reason). Needs the friends/block model; queue with Message
  Requests. Until then GC's everyone-can-DM stands (small trusted user
  base; forum admin tools cover bad actors).

## Social (Getting Started guides)
- Friend system: send request by exact username (friends hub "Add
  Friend" box + Pending tab for outgoing/incoming), accept/decline,
  cancel-outgoing X, profile-card "Add Friend" from member
  lists/message avatars, error copies ("didn't work. Double check that
  the username is correct." for a miss, "not accepting requests" when
  they have DMs/requests closed); friends hub (already on UI-redo list).
  Discord's 1000-friend caps are irrelevant at GC scale but a sane
  pending-request cap is cheap insurance. Friends List 101 confirms the
  hub's tabs: All / Online / Pending (sent + received) / Blocked — the
  same tabs as the owner's friends-hub screenshot. Group DMs cap ~10 members (GC group chats exist — add
  the select-friends-to-create flow + add-members/leave/remove/rename and
  custom group icon management). Group-chat invites: reuse the existing
  8-char invite link machinery for group conversations — member-facing
  link mint, the ~10-member cap turning the link dead when full,
  auto-expiry (~48h), and the creator's X to revoke. Blocked/invitee
  interplay waits for the block model.
- Profile privacy (profile-privacy guide): a who-sees-your-profile
  selector with a LIMITED-view contract. GC's profile payload is small
  enough that this is one boolean-ish setting, not Discord's tiered
  thing: FULL view (status/tagline/accent/badges + account facts) vs
  LIMITED view (avatar, display name, username, account age, mutual
  servers stay visible; tagline/status/badges swap to a lock icon).
  Discord's selector is friend-scoped (Friends & all servers / Friends
  & small servers / Friends only) — the 200-member middle tier is
  arbitrary at GC size; the GC split would be Everyone / Friends only
  once friends exist (phase 3, waits on the friend model). Kept from
  the spec: profile privacy is INDEPENDENT of DM settings (who can DM
  is its own knob), non-mods and mods see the same info (mods get no
  special visibility), and private profiles still accept friend
  requests. Default: everyone (GC's public-facing, owner-hosted
  community norm) — owner can flip the default.
- Reactions: click-to-add from a hover/long-press bar; emoji picker for
  custom reactions; counter chips with per-user state (your own chip
  toggles it off again). Hover-bar "quick react" with recent emojis;
  Shift-click multi-react like the picker. View Reactions details view
  (who reacted what, with a personal X) — needs the reactions table +
  join against users, then a small dialog. Mod removal (Manage Messages
  parity) rides the phase-3 mod desk. Goober+ "super" reaction = a
  sparkle-glow animation on the chip (free cosmetic; accessibility =
  respect prefers-reduced-motion instead of a settings page).

## Emojis / media (How to Add Emojis + Emoji Pack + picker guides)
- Emoji picker with search + recently-used; Shift-click multi-insert is a
  Discord pro tip worth copying.
- Wumboji: a message that is ONLY emojis renders them big (cap ~27 before
  they shrink back) — pure CSS off the render path, cheap and fun.
- Custom emojis per server (Phase 3), owner/permission-gated (the roles
  model adds "Create/Manage Expressions"), 50 per server, name rule
  >=2 alphanumeric/underscore chars as in Discord; upload rides the
  existing attachment intake (format rules + smaller cap). Custom
  emoji spec details: <=256 KB, JPEG/PNG/GIF/WEBP, GIFs animate, emoji
  suggestions while typing are a client nicety (toggle in chat settings).
- The emoji picker groups custom emojis by server; "external emoji" is a
  Goober+ perk for using other servers' emoji anywhere.
- Free "packs" as server-discovered emoji; non-members still see them
  rendered (cross-server emoji) if sent.
- Twitch-synced emotes: NOT applicable (third-party integration gate; 0
  accounts, 0 cost priority — skip unless the owner asks).
- GIFs: search Tenor-style picker — needs an external API and its key;
  owner-decision gate (free tier Tenor key is $0, but it's a third-party
  dependency). Defer until asked. If approved: category tabs + search,
  gold-star favoriting (persisted per user, Favorites folder first),
  favorites usable from the star in the picker — client-side list +
  small per-user store, no extra infra.
- Voice Messages (mobile-only in Discord): record-and-hold mic button,
  20-min opus clip in a play bubble — pairs naturally with GC's voice
  stack (encode client-side, upload as attachment, render player). Phase
  3/4, after phase-2 voice ships.
- Attachments: alt-text option on upload (accessibility), multiple files
  per message, spoiler-tagged files; NSFW scanning is not feasible on the
  free plan — skip without an owner ask. Alt-text guidance (from the
  image upload guide) goes into the upload dialog's helper copy: be
  succinct/specific, don't start with "image of…", include visible text,
  describe the *point* of the image. Drag-and-drop upload onto the chat
  pane + paste-an-image-URL detection (only renders an <img> per the
  link-preview rules; no server fetch).
- Text-file preview pane (File Preview guide): render plain-text uploads
  inline (expand, <=50 kB) instead of a download-only row — cheap client
  addition once attachments render in chat; sanitize as textContent.

## Markdown (Markdown 101 guide)
- v1 surface subset: bold/italic/underline/strike/inline code/spoiler
  (already in the checklist above). Add later: code blocks ``` with
  language line, block quotes (> and >>>), lists (-/*), headers (# ## ###)
  — line-level parse on render, same textContent-only DOM rules.

## Misc from the pasted guides
- Server setup guide (setup-101): mostly recaps of already-filed
  features. NEW bits worth pinning: (1) server-type framing (recapped
  by the clarifying-server-types guide): GC's is_public flag already
  implements the friend-vs-community split; "Discoverable" = is_public
  + the discovery route (done in phase 1); the public server web page
  pairs with the filed home-tab candidate. The one semantic Discord
  adds that GC hadn't: "community invites never expire by default" —
  GC's default stays 48h (owner can mint a permanent one per the
  INVITE VARIANTS note below, which is enough). Partnered/Verified
  badges = Discord-granted statuses; GC's equivalent is owner-issued
  badges (filed under profile badges). Server-type BADGE on the rail
  (tooltip: joinable-by + boost level) is a trivial UI redo extra —
  GC's rail icon could tooltip "open to discovery / invite-only".
  (2) INVITE VARIANTS on the existing 8-char machinery: expiry rules
  could extend to uses-cap OR time (both already specced for group
  invites) — a "permanent" invite option is its own toggle the owner
  can add; CUSTOM vanity URLs = skip (workers.dev domain, low value).
  Member applications (server-applications guide): a third join mode
  between invite-only and discoverable — "apply to join" with custom
  questions, admin review (approve / reject / interview-over-DM),
  pending applicants see nothing. GC-OWNED tables (app row + decision
  columns); extends the is_public mode into a tri-state; phase-3
  mod-desk feature, owner-gated on wanting the extra mode. (3)
  Verification level as a MODEST mod-desk feature: gate the first
  message by account age (email-based levels are N/A; "registered
  longer than N" is derivable from users.created_at) — phase 3.
  (4) Member prune (kick inactive-after-N-days) for the mod desk.
  (5) Raid protection = existing rate-limiter tiers + a join-burst
  limiter (phase 3 admin). SKIP: templates, server insights/analytics,
  forum channels (the site's forum IS it);
  threads/polls shelf for phase 4. Polls spec (polls guide): a poll
  message type — question + up to 10 answers (each optionally with a
  leading emoji), multi-select toggle, duration menu (1h / 4h / 8h /
  24h / 3d / 1w), creator can end early, votes are NON-anonymous
  (Discord's own answer: no anonymous mode), remove-vote-then-revote
  while open, results render as count bars with your own pick's
  checkmark. Storage is GC-OWNED (poll/vote tables keyed to the
  message id; deleting the message deletes the poll — same delete
  semantics), "Create Polls" permission rides the phase-3 role
  system; no archive mode (pinning a poll = the existing pin
  feature). Threads stay shelf-only (scoping work).
- Password change (password-resets guide): the "forgot password" email
  flow is permanently N/A (no email). What GC should have is the OTHER
  half — a change-password surface in settings (current password + new,
  TOTP second factor prompted when enabled) wired to the forum's
  password-set semantics through the existing relay and its
  password-change limiter tier; plus the owner-reset route already
  shipped for lockouts. Username-change belongs on the same settings
  page (rate-limited; Discord's own cap is 2/week) — the username rules
  (unique, case-insensitive) already run through the shared username_key
  path. One "account" settings page: username + password + TOTP +
  display name (owner decision above). Small settings item for the
  phase-3 account surfaces. TOTP specifics: GC's login-side TOTP
  challenge is fully built (route, rate limiter, challenge flow); the
  settings page adds enable/disable QR setup, and if the shared core
  lacks one-time BACKUP CODES (Discord's lost-app escape hatch) that's
  the one piece to add before enabling accounts to turn TOTP off
  without owner help. → Backup codes are now BUILT (owner confirmed:
  "we do need backup codes on wempos-forum as well") — single-use
  8-char codes hashed at rest, shown once at generate, burned via
  DELETE on the login MFA path in BOTH workers, wiped on TOTP disable;
  forum-side migration owns the table. (Passkeys guide confirms
  Discord's semantics: backup codes substitute for the app code even
  mid-MFA-challenge — same contract.)
- MFA lockout recovery (mfa-recovery guide): refines the backup-codes
  UI contract. (1) The TOTP login challenge needs a "verify with
  something else → use a backup code" affordance (the article's key
  UX: all-app-codes-used is signaled BY the option disappearing — for
  GC the field just accepts either format). (2) Disabling/removing the
  authenticator from settings is itself an MFA-verified action, and
  backup code counts as that MFA — the re-auth gate accepts a backup
  code, not only an app code. (3) "View backup codes" requires
  password re-entry — matches the generate-gate design. (4) SMS codes:
  skip (no SMS). (5) The "Discord can't help without codes" wall is
  GC's DIFFERENTIATOR: the owner IS the support team — admin desk
  should be able to clear a specific user's MFA (admin route + audit
  copy) as the loss-everything escape; small addition to the
  owner-gated admin reset work, phase 3. (MFA-setup guide adds two
  details: Discord lets you VIEW codes later ("View Backup Codes"
  shows codes + used/unused stamps + download, password-gated) — GC
  DESIGN DEVIATION, codes are hashed at rest so they're shown ONCE
  and the escape is regenerate-and-replace; recoverable-codes-at-rest
  would need encryption we don't have infrastructure for, keep the
  hashed design unless the owner flips it. And the generate-again
  step after recovery ("reconfigure, then generate new codes") is
  already the replace semantics.)
- Passkeys / security keys (passkeys guide): the one auth feature here
  that IS feasible on GC — WebAuthn is browser-native and free.
  Full shape if wanted: register in account settings (re-auth before
  enrollment, named key, list + delete, cap ~16), passwordless login
  ("sign in with passkey" on the login card), hardware security keys
  as the MFA second challenge, and the troubleshooting loop (keep
  backup codes during re-enrollment; delete old key after). OWNER
  DECISION GATE: this is a real build — hand-rolled CBOR/COSE
  verification (no-frameworks rule), a new table for public keys,
  login-flow changes. Password + TOTP + backup codes already covers
  every failure mode passkeys solve, so recommendation is DEFER
  (phase 3+ or never) unless the owner wants passwordless login.
- "Verification Required" (verify-account guide): email/phone
  verification is a deliberate SKIP (no email, no SMS — standing
  decision). One transferable idea for the phase-3 mod desk: Discord's
  trigger SIGNALS (joining many servers quickly, DMing many non-
  friends, burst-posting faster than human) map to GC's rate limiter
  tiers + a temporary-restriction state instead of a verification
  wall — note for the automod filter design.
- Remove-phone-number (remove-phone guide): phone is a skip; the only
  pattern worth keeping is already ours — removing sensitive data
  re-confirms the password (same gate as the password/TOTP changes on
  the account page).
- Display names (new-usernames guide): GC usernames are already unique,
  case-insensitive (username_key), lowercase-normalized — the Discord
  "new username" half is done, minus "." in the allowed set (adding it
  means checking username_key collisions carefully; only if wanted).
  The missing half is the non-unique DISPLAY NAME (1–32 chars, spaces/
  emoji, changeable freely, shown in messages/DMs/requests when no
  nickname set; username remains the exact-add identifier — friend
  requests add by username, chat shows display name). The users table
  is FORUM-owned, so this is an owner decision touching the shared
  schema (one additive column renderers on both sides could read).
  Server/friend nicknames ride the phase-3 roles model per-server.
- Mobile-layout guide transferables (the shell itself is N/A):
  favorite DMs/group chats pinned with a star at the top of the
  conversation list (per-user flag, cheap, pairs with pins), a pure-
  black "Midnight" third theme (OLED/battery — one more token set),
  a pre-join muted toggle on the voice pane (voice-polish shelf), a
  channel-details media/files/links gallery (with the search +
  attachment render work), and a settings search box once settings
  grow past one screen.
- Language switcher (language guide): English-only for now — full i18n
  (message catalogs for every UI string) is a large project with no
  signal of need; revisit only if non-English users actually show up.
- Caps reference (account/server caps guide) — GC's standing caps, for
  one place: server names 100 chars, channels per server
  (MAX_CHANNELS_PER_SERVER constant), server name checks 1..100,
  passwords 12–128 (stricter than Discord's 6 — keep it), DM/group cap
  10, invite codes 8-char with a per-server code cap, message cap 2000
  (Goober+ 4000 perk), upload caps per the attachment intake, one boost
  per member per server. When phase 3 adds roles/emoji/categories,
  adopt Discord's shapes: 500 channels/category 50, 250 roles, 50
  categories, emoji 50/server (skip sticker/soundboard/boost tiers).
- (You Bar guide is mobile-only navigation — N/A; its one transferable
  idea, a custom user status settable from the user footer, rides with
  the phase-2 presence work: status text next to the online dot.)
- Push-to-talk (PTT-activation-noise guide): queued on the voice-polish
  shelf with mic test/device picker — a hold-to-talk mode (composer bar
  button or Space-hold while in voice), plus the activate/deactivate
  beep toggle Discord has. Client-side only; the mute/deafen controls
  and speaking rings already exist.
- Voice channel status (voice-channels FAQ): a short text + emoji line
  ("Set a channel status") shown under the voice channel name, set by
  whoever's in the channel. GC version is DO-EPHEMERAL like all voice
  state (a tiny status field on the ChatRoom DO, broadcast to
  members, resets when the room empties) — no schema, no gate; slot
  on the voice-polish shelf with mic test/device picker. Locked voice
  channels (permission-gated join with a lock icon) ride the phase-3
  channel permissions; drag-to-reorder uses the existing position
  columns. Living Room = experimental skip.
- Per-channel audio bitrate (audio-bitrate FAQ): a slider on the
  voice channel's settings (default ~64 kbps, range 32–128 Kbps)
  stored on gc_channels and applied by each sender's AudioEncoder
  config — cheap on the Opus-over-WS stack (encoder bitrate is
  already a settable parameter). BOOST-TIER COUPLING (Discord: 128/
  256/384 Kbps at boost levels 1/2/3) is an owner decision — GC's
  boosts are real but perks have been free-cosmetics; a modest
  ceiling bump per tier is the cheap middle ground. Either way the
  slider IS the feature; tier-coupling is only presentation.
- Soundboard (soundboard guide): feasible on the existing voice infra —
  a short opus clip is just another binary frame stream; a soundboard
  button sends a "play clip X" frame through the ChatRoom DO and each
  peer's decoder plays it locally (server stores/streams, nobody
  re-encodes). GC version: per-server clips ride the attachment intake
  (small, length-capped, owner/mod-managed like custom emoji), a
  Soundboard button on the voice pane, per-user volume + opt-out. Slot
  tiers/Entrance Sounds/Nitro-cross-server are skip. Fun but not
  core — queue behind voice polish (mic test, device picker).
- Mic test (mic-testing guide): a "let's check" loopback on the voice
  pane — getUserMedia → AudioContext loopback to the speakers, with
  device selection and a plain-language "no mic detected" copy. Cheap
  client-side polish for the phase-2 voice UX; queue with other voice
  niceties once the basic flow is used in anger (same shelf as the
  push-to-talk toggle it pairs with).
- Voice regions (voice-regions FAQ): nothing to build — GC's per-room
  Durable Object is itself the "automatic" region: Cloudflare hosts the
  DO at an edge near where it was first created, so a call anchors close
  to whoever's there. There is no region picker to surface (one host,
  the Cloudflare edge) and no setting to hide; Discord's automatic/
  manual override taxonomy just collapses to "automatic, always".
- Noise suppression (Krisp FAQ): shipped in the phase-2 voice join —
  public/js/voice.js already requests the browser's noise suppression +
  echo cancellation + AGC via the getUserMedia constraints, so mic audio
  is pre-cleaned with zero extra infra. A Krisp-grade local ML model is
  out of scope for the $0 plan; the browser DSP is the whole story.
- Streamer mode (streamer-mode guide): a manual client-only toggle is
  feasible (auto-OBS-detection is desktop-only and stays dropped) — it
  would mask your own username in the UI (first letter + dots), hide
  invite codes, and silence notifications/sounds while screensharing.
  Only meaningful once GC shares screens at all; park with the deferred
  video work, don't build earlier.
- Voice filters (voice-filters guide): possible later as a Goober+ cosmetic
  — GC's voice pipeline already processes mic audio in WebAudio before
  the Opus encoder, so pitch-shift/reverb nodes are insertable with zero
  infra. Discord rolled the experiment back to a trial; GC treats it as
  a low-priority novelty (a filter picker + "x" to clear on the voice
  pane, all client-side). Not until the voice UX is battle-tested.
- (disable-tts guide confirms the per-user "Never" /tts toggle above.)
- Stickers (sticker-suggestions + custom-stickers-FAQ guides): no
  separate sticker concept — GC treats animated/webp server custom emoji
  as the equivalent (the emoji intake already accepts GIF/WEBP; Discord's
  sticker slots/boost levels don't apply). From the FAQ worth keeping:
  a short ascii-name + optional alt-text description on upload (already
  specced for attachments), and optional "related unicode emoji" mapping
  so client-side suggestions/search can find them while typing; editing
  keeps the name, deleting replaces the file. The settings-cog upload
  path is owner-only like expressions.
- AutoMod parity (why-was-my-message-not-delivered): GC already has the
  keyword filter (vendored filterstore + moderation desk + the
  undeliverable error copy for flagged words) — that's Discord's
  AutoMod keyword rule.
- Language filter (language-filter guide): a useful twist on GC's
  existing word filter — Discord's is client-side, opt-in per user, and
  REDACTS (asterisks) instead of blocking. GC's filterstore blocks
  server-side; a "redact" mode would let flagged messages through
  visibly-muzzled for members whose client has the toggle on (render_
  time, same filter words, zero extra storage) — a real moderation
  option between allowed and blocked. Queued with phase-3 mod-desk
  polish; needs the filter words exposed to the render path they're
  already loaded from. (Discord's mod-desk also leans on
  copy-IDs/links: with phase-3 message menus add "Copy message link" —
  a #/ hash deep link that jumps to the message — server/channel/user
  ID copying is admin-desk territory, not member UI.)
  Missing halves: the mention-spam filter (needs @mentions, phase 3) and
  the spam/similarity filter (needs message history heuristics; skip the
  external reputation lists, $0 plan) — the suspicious-link filter stays
  out too, same external-list reasoning.
- Compact message mode (compact-text-mode guide): a client-only display
  setting that swaps the message row to the dense list layout (no
  avatars, single timestamp column) — a body-level CSS class off the
  existing theme storage, ships with the settings surfaces in the UI
  redo; pairs with wumboji/avatars rules ("no wumboji in compact").
- Auto-embed toggles (disable auto-embed guide): "render link preview on
  paste" and "render my own uploads" as two chat settings (client
  preference only — both ship once the link/attachment render paths
  exist). The `<link>` angle-bracket wrap stays: it suppresses only that
  one link's embed, always on, no setting needed.
- Spellcheck: system-level (macOS/Windows) — the web composer already
  gets it for free from the browser's native spellchecker on the
  textarea; just don't set spellcheck="false", and the per-language
  management lives in the OS like Discord's. Desktop-app parity comes
  free with the future desktop clients (Chromium spellcheck).
- Link previews: GC deliberately has no outbound fetcher of message links
  (SSRF + moderation concerns); a safe later version would proxy images
  the uploader already attached. Owner-decision gate.
- Custom typing indicator (emoji + status word): cosmetic Goober+ perk;
  typing indicators themselves are not built yet — phase 3.
- Boost perks ("same as Nitro"): bigger upload cap, 4000-char messages,
  accent color ✓, tagline ✓, boosts ✓, animated avatar support, custom
  typing indicator — all free cosmetics per the original owner ask.
- Bookmark/reminders and forwarding: useful, lower priority than
  friends/reactions; queue behind phase 3 social. From Discord's beta
  list, same shelf: channel Favorites (a star on channels surfacing in
  the sidebar — trivial client-local or per-user server-side), and
  scheduled messages (needs a deferred-send DO timer; fun, later).
  "Personal profile widget" is Discord-Nitro territory — treat any
  equivalent as a Goober+ cosmetic, owner-gated.
- Account deletion (delete-account guide): owner-gated — a self-serve
  delete is a shared-schema feature (the forum owns users; deletion
  must also handle sessions on both workers, message authorship
  anonymization, and server-ownership transfer first, exactly
  Discord's precondition). At GC scale the pragmatic v1 is the owner
  doing admin-side removal/anonymization on request (the admin desk +
  credential-relay password-set path make that feasible today); a full
  self-serve flow with the 15-day grace period is a bigger forum-side
  project — build only if the owner wants it. (Restore-deleted guide
  fills in the grace window: login while pending-deletion shows a
  "Restore account" prompt that clears the flag; after the window it's
  gone for good. Two extra semantics if self-serve ever gets built:
  admin-removed/banned accounts are NOT restorable via login, and
  support-initiated deletions are cancelled by asking the owner — that's
  GC's version of "contact support".)
- Disable/re-enable account (disable-account guide): the softer sibling
  of deletion — set a disabled flag (forum-owned users table → owner
  decision on the schema change), login shows a disabled screen with
  "Restore account" instead of failing, ownership-transfer
  precondition before disable (same as deletion), memberships and
  messages stay intact. Cheaper than full deletion (no anonymization/
  grace machinery) and it fits the admin-removal interim: the owner
  can already disable-by-flag on request today. Owner gate: worth a
  proper self-serve disable surface only after the account settings
  page exists (phase-3 neighbor of the deletion item); no "inactive
  disabled accounts get deleted" rule (2-year Discord rule — skip, GC
  has no email to notify anyway).
- Notification preferences (mobile notifications-settings guide): the
  SETTINGS MODEL is the transferable part — this is the spec for the
  mute/notification model the Inbox filing deferred. Per-USER tiers:
  in-app notify on/off; reaction-notify (all / DMs only / never).
  Per-SERVER: All Messages / Only @mentions / Nothing, suppress
  @everyone+@here, suppress role mentions; Mute server with Discord's
  duration menu (15m / 1h / 3h / 8h / 24h / until I turn it on — the
  relative-duration math is trivial, store expires_at NULL = until
  toggled); per-CHANNEL overrides that beat the server setting
  (channel = category-equivalent for GC). Deltas from the desktop twin
  of this guide: channel overrides have FOUR modes (All / Mentions /
  Nothing / Mute — Mute silences even @mentions), and a server-wide
  mute still delivers @everyone mentions (mute ≠ mention-block).
  Access anchors: server-name dropdown → Notification Settings;
  right-click channel → Notification Settings; bell icon in the
  channel header toggles that channel's mute; right-click the server
  rail icon → Mute Server. MUTE SEMANTICS (mute-channels guide):
  muting suppresses UNREAD INDICATORS as well as notifications — a
  muted channel/server shows no unread dots at all, only a direct
  mention (@you/@role/@everyone/@here) surfaces a red count badge.
  OS/push/device settings
  (iOS/Android screens, full-screen notifications, announce-by-Siri):
  skip until mobile apps exist. Web push via service worker is free
  on Workers (VAPID + a fan-out endpoint) — a LATER owner-gated
  candidate after the preference model + friends exist; not queued.
  "Won't notify while the app is in focus" applies to web the same —
  in-app surface stays quiet while you're already in that channel.
- Display names (new-usernames guide): GC usernames are already unique,

## Shop / Nitro ("everything in Discord AND Discord Nitro", owner ask)
- Goober+ perks are free cosmetics (accent color, tagline, boosts,
  animated avatar support, bigger upload caps). A paid shop is a later,
  owner-gated decision. (Profile-effects guide: shop-bought animated
  effects = skip under no-shop, but the ACCESSIBILITY contract for any
  animated cosmetic is universal: effects must not animate when
  reduced-motion is on — GC's reduced-motion setting (defaults to the
  OS preference) governs everyone's cosmetics, not just your own.)
- Display name styles (display-name-styles guide): the GC version is
  narrow — custom FONTS and animated EFFECTS are skipped (readability
  + the reduced-motion contract; shipping a pack of decorative fonts
  for chat names isn't worth it), per-server profiles are skipped.
  The KEEP is two rules already half-owned: a user's chosen ACCENT
  COLOR can tint their display name in DMs/list surfaces (accent color
  is the shipped Goober+ perk; Discord's rule "in servers, role color
  wins" is the phase-3 mention of the same hierarchy), and an
  ACCESSIBILITY toggle to stop seeing other people's name styling
  (joins the accessibility bundle; colored names are exactly what
  that bundle's "calming surfaces" list is for).
- Custom-profile fields (custom-profiles guide): the profile-surface
  wishlist for Goober+. ALREADY SHIPPED: accent color (profile theme
  primary; Discord's second "accent" color is optional — one color is
  enough, extend only if the owner wants). QUEUE (most owner-gated on
  forum-owned users columns, same gate family as display names):
  About Me (190-char free text on the profile card, emojis + links
  render with the same message-markdown rules — GC's tagline could
  either grow into this or stay a one-liner with the bio separate;
  OWNER CALL), pronouns (short text field shown next to the name),
  profile banner (image upload via the existing attachment intake,
  min 680×240, GIF + static; pairs with profile privacy so a
  LIMITED-view hides it), GIF avatar + "recent avatars" picker
  (animated avatar support was already the filed Goober+ perk; the
  recent-avatars shelf is optional storage). From the custom-status
  guide, the CHEAPEST addition to this queue is a custom STATUS:
  short text + a leading emoji, set from the user footer's profile
  menu, auto-clears via expires_at (Discord default 1 day, menu from
  minutes-to-never; same relative-duration pattern as server mutes),
  shown next to the display name / on the profile card. PAIRED: the
  online-status model (online/idle/DND/invisible guide) — presence
  dot color from avatar (green/yellow/red/gray), doable DO-ephemeral
  like voice state (no schema gate), client idle-detection after
  inactivity, DND auto-muting the in-app toasts from the
  notification-preference model, invisible = stop broadcasting while
  fully usable. Picker lives in the user footer's profile menu.
  Discord's full dot legend (colored-dots guide) adds one deferred
  entry to spec now so the palette is stable at build time: PURPLE =
  streaming (the dots-go-live is on the deferred screenshare track;
  reserve the token, ship later). Offline members show grayed names +
  avatar rather than a dot. Statuses
  override presence text (GC's is "in voice"); status reaction/reply
  DM quirks from the experiment are skip. Same users-column owner
  gate. SKIP: per-server PROFILES (the per-server-profiles guide
  confirms: per-server avatar/banner/theme/About-Me — the heavy half,
  heavier than any GC benefit). Its FAQ keeps one free half: server
  NICKNAMES are free for all users, which is exactly GC's per-server
  identity shape (a nickname on the membership row, phase 3 with
  roles). Decorations/effects Shop surfaces: no-shop skip stands.
- Profile badges (profile-badges guide): the CHEAP version fits Goober+
  — tiny static icons next to the username on the profile card: Goober+
  supporter badge (the Nitro-badge equivalent, always visible while the
  perk is active), server-booster badge, early-supporter/creator badge
  (owner-issued list column, e.g. users.badges CSV — forum-owned table
  decision again, or deriveable: supporters + per-server boost EXISTS
  already). Display slots/hide/reorder are trivial client extras if
  badges exist; reorder-as-perk would be free for everyone at GC or a
  Goober+ flex — owner's call. SKIP the heavy parts: Badge Directory
  hub, Common/Rare/Epic/Mythic rarity, evolving/milestone badges,
  quest/activity-driven badges (game time, streaming stats) — that's
  Discord's gamification economy, not worth building at GC scale.
  Non-transferable across accounts is natural (they'd derive from
  account facts anyway). From the badge-meanings companion guide, two
  CHEAP nuances worth keeping: hover tooltips show TENURE (Nitro-badge
  hover reveals subscription date; booster hover reveals how long
  boosting, longest streak across servers — GC's boost rows already
  carry timestamps, so a tooltip is derivable, no evolving levels
  needed), and Discord's Early-Supporter badge is the exact precedent
  for an automatic early-adopter badge derivable from users.created_at
  (< an owner-chosen date) with no admin bookkeeping.

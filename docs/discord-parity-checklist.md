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
  "Join a server" (paste invite link — Discord puts the invite-code
  field on the create dialog too). GC's rail "+" should offer both.
  Icon helper copy from the create-server guide: 128×128 minimum,
  square crops; name/icon stay editable after creation (GC's PATCH
  route already covers that).
  Server folders (server-folders guide): drag one rail icon onto
  another to form a named, color-tinted folder with a stacked badge —
  NOT QUEUED, a later nicety, purely per-user (folder membership +
  open/closed state can live in localStorage; no schema), only worth
  it once a user's rail outgrows one screen.
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
- Channel categories with collapse carets (e.g. "General Information").
  NOW SPECCED (categories 101): the real model is a `gc_channel_
  categories` table (id, server_id, name, position) + `category_id`
  on gc_channels — GC-OWNED, successor batch to the roles build
  (which ships carets over the existing text/voice grouping today,
  session-persisted collapse). With categories: drag-reorder both
  layers using the existing position columns, empty-category
  auto-delete (Discord's "folder empty → deleted" rule), and the
  unread interplay Discord defines — collapsed shows only channels
  with unread, muted+collapsed hides everything except direct
  mention/role-ping channels (rides the mute+unread semantics).
  Permission SYNC (categories inherit overwrites; a channel can be
  synced or independent with a Sync Now button) rides the per-channel
  overwrites decision — if overwrites land, categories get them too
  or sync stays out of scope; owner call. Collapse state v1 stays
  client-side (localStorage); cross-device persistence is the cheap
  per-user server blob (collapse-syncing guide) if wanted later.
- Server banner image + name header over the channel sidebar (banners
  guide: 960×540 16:9 recommended, keep the top 48px unbusy so the
  name stays readable, upload in server settings by owner; the
  boost-level-2 gating is DISCARDED — banner is a plain owner upload
  for any GC server; animated banners at level 3 + the 5-second
  on-load animation are skip, and even if a GIF banner ever rides the
  attachment intake it falls under the existing reduced-motion
  contract). Schema: UI redo was told to ship it only if a banner
  column already exists; otherwise it's a gc_servers column away.
- Boost goal progress bar (boosts count / goal, milestone labels).
- Member list grouped by role with role-colored names and APP/user badges
  (crown-icon guide: the owner's crown badge — and per Discord's own
  rule, it VANISHES when a member with an Administrator-class role
  exists, returning if that role stops rendering as a separate group).
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
- System messages channel (new-member-messages guide): a server
  settings dropdown ("System Messages Channel", incl. a No Messages
  option) — GC posts a small "X joined" note in the chosen channel on
  invite-join (the join event already flows through gc/invite routes,
  so this is author a message row + a `system_channel_id` column on
  gc_servers). Cheap, phase-3 server-settings item; leave/boost
  variants are skip (no member list churn to announce — GC members
  leave quietly; boosts post in-channel already if wanted).
- Scheduled events (scheduled-events guide): server events with a name/
  description/time (channel-bound voice event or freeform "somewhere
  else" text), shown in an Events section of the channel list, RSVP
  = mark Interested (retractable), and a notify-when-live ping to
  interested members. GC-OWNED shape: gc_server_events (+ an
  interested join table), permissioned to Create/Manage Events (the
  own-your-own vs manage-everything split Discord uses maps cleanly
  onto phase-3 roles). OWNER-GATED CANDIDATE (not queued): real but
  not cheap — the live-ping needs either a Workers cron trigger (free
  tier) or an edge check at event time, and the Events tab is chrome
  on top; stage-channel events are skip with stage channels.
  Worth it if the community actually runs events (game nights).
- Server Hub (server-hub guide): the gaming leaderboard + popular-games
  widgets are SKIP (activity sharing/connections don't exist). The
  transferable skeleton: a server HOME tab instead of a dashboard —
  server icon/name/banner + online/total/boost counts + an
  owner-authored text-and-image "about" block; cheap static content,
  could double as the invite/link-preview target. ONE EXTRA IDEA from
  the retired Server-Home beta worth adding to that same surface:
  FEATURED MESSAGES — mods feature a message for 24h/3d/7d at the top
  (auto-unfeatures at expiry, distinct from pinning, rides the
  gc_message_pins machinery with an expires_at column variant).
  Muted-channel exclusion + "return to your last channel, not Home"
  are rules GC already follows naturally. (The community WELCOME
  SCREEN — deprecated by Discord in favor of onboarding — adds to
  that same home/about surface only its one good idea: up to five
  RECOMMENDED CHANNELS with one-line descriptions, owner-curated, a
  small JSON column on gc_servers shown on the join card. Worth
  folding in if the home tab is built.) Skip: Highlights/Active-Now
  algorithmic feeds (no activity model) and the feature itself
  (Discord killed it in 2023 — proof it's not load-bearing).
  OWNER-GATED CANDIDATE (not queued): the shared Whiteboard — a
  persistent multiplayer canvas
  is buildable on the same DO frame-relay pattern as voice, but it's a
  real project (live canvas sync, ≤90-day retention, reporting/mod
  removal, role-restricted access) — flag for phase 4+ if the owner
  ever wants it. Hub system messages (leaderboard updates in a chosen
  channel) are leaderboard-only; skip with the widgets.
- Server profile customization (server-profile guide): mostly RECAP —
  name ✓ and icon ✓ ship with phase-1 settings, banner + description
  (tagline) are filed above, and the Games list is skip (no activity/
  game detection). One genuinely NEW cheap field: TRAITS — a handful
  of free-text/emoji tags per server, stored on gc_servers and echoed
  on the discovery cards (they double as discovery metadata the
  category tabs can group on). The PRIVATE-PROFILE toggle maps onto
  is_public exactly: Discord's rule "profile is member-only unless
  discovery/widget is on" is GC's is_public flag semantics already.

## Discovery (screenshots)
- Featured-server cards with banner art; big hero headline in Discord
  mode ("FIND YOUR COMMUNITY ON GOOBERCORD"), warm equivalents in brand
  mode; category tabs (Home/Homework/Fun/Minecraft) once servers fill out.
- LURKER MODE (server-discovery guide) — the one new idea worth
  keeping: render a discoverable server's PUBLIC channels read-only
  from the discovery card before joining, and drop it from the rail
  when you leave. GC shape: a client-side preview route reads
  discovery's public payload (channels + an N-message tail of each
  public channel, already needed for the card) into a temporary
  read-only render — NO membership row, no server_rail entry, join
  stays the separate existing action; the preview key doesn't touch
  gc_server_members. Modest scope; owner call on whether lurk-before-
  join matters at GC scale (categories/search were filed with the
  discovery cards; the "recent custom emoji" peek is skip — custom
  emoji is a successor batch).
- Discovery GUIDELINES are a policy doc, not a feature — GC's scaled
  version: the site owner reviews the public-server list and
  removes a server from is_public by hand if it's unfit (there is
  no in-prod T&S team), and one soft requirement is free to copy:
  a short description (the filed tagline) should be set before a
  server shows on discovery — the discovery card already has the
  slot. Discord's age-gate framing (13+ audiences) is n/a (no age
  model), and their ML moderation is skip (manual, owner-run).

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
- Webhooks (intro-to-webhooks guide): inbound POST-to-URL automated
  messages into a channel — a genuinely good fit at GC (self-hosted,
  no third-party needed; GitHub/forum-events/scripts all feed it).
  Shape: `gc_webhooks` (GC-OWNED table: id, random token, channel_id,
  name, created_by, deleted flag), owner/mods mint + revoke in channel
  settings, URL `POST /api/hooks/<id>/<token>` accepts a small JSON
  {content, …} and authors a bot-labeled message row in that channel.
  OWNER-GATED on one thing: the URL carries a bearer-able secret and
  it's a NEW public unauthenticated endpoint, so it ships with the
  "upload"-class limiter + a modest per-webhook rate cap and revocable
  tokens from day one. Phase 3. The integrations-page article adds
  the MANAGEMENT surface for when they ship: a per-server webhook
  roster (who minted it, when, which channel it posts to; create /
  edit name+channel / copy URL / revoke) — GC keeps it in channel
  settings per webhook, and since there are no bots or Twitch /
  YouTube / following integrations at GC, the page itself stays a
  webhooks section, not a page (max-50 cap is a limiter-safety note
  at most). The BOT "permissions it requested" column is n/a — no
  third-party apps exist to request them.
- Linked channels (linked-channels FAQ): a bridge channel between
  Discord and an integrated GAME — SKIP as a feature (no third-party
  game integration, and the article is a stub anyway), but the GC-
  native shape already exists: a webhook feeding a channel IS a
  one-way game-to-chat bridge (a script or game server posts via
  POST /api/hooks/<id>/<token>). If two-way ever matters, it's
  webhook-like polling rather than new plumbing.
- TikTok LIVE subscriber roles (tiktok-perk FAQ): third-party
  platform integration (granting a Discord role to TikTok LIVE
  subscribers via OAuth connection) — SKIP, no external account
  connections exist at GC. The one idea worth retaining if any
  auto-granted role EVER exists (e.g. a future shop/perk tie-in):
  Discord's "expired subscription behavior" menu — remove role
  after 7d / 24h, kick after 7d / 24h, or no action — plus their
  practical warning that the platform-granting role must sit ABOVE
  the roles it manages in the hierarchy (GC's position rule
  enforces the same thing structurally).
- Server setup guide (setup-101): mostly recaps of already-filed
  features. NEW bits worth pinning: (1) server-type framing (recapped
  by the clarifying-server-types guide): GC's is_public flag already
  implements the friend-vs-community split; "Discoverable" = is_public
  + the discovery route (done in phase 1); the public server web page
  pairs with the filed home-tab candidate — and the
  discoverable-content article specs its accountability layer, which
  is what makes publishing messages publicly DEFENSIBLE at GC:
  public channels only, in discoverable servers only, on an
  admin-chosen channel ALLOWLIST, with the channel labeled and a
  pre-send notice; per-user account-wide consent toggled OFF-BY-
  DEFAULT (GC can skip Discord's region/teen defaults — everyone
  chooses), consent evaluated AT SEND time (messages sent while off
  never appear; turning it off later doesn't retract, only future
  deletes do — and message deletion propagates to the web view),
  and one GC-OWNED table (user_id + boolean) holds the preference so
  no forum-table gate. The companion web-presence article settles
  the SERVER side: one "web presence" block of per-channel
  inclusion (Discord's four-way channel setting — All / Messages-
  only / Off — compresses at GC without summaries to a per-channel
  boolean) + server-level off entirely, gated to the owner
  (Discord: owner or Administrator). INVERT Discord's defaults:
  they turn channels ON by default and publish a web page the
  moment a server becomes Discoverable — GC's public web page stays
  OPT-IN server-side (all features off until the owner enables
  them), consistent with per-member consent being off-by-default.
  Turning OFF discoverability (is_public) tears the web page down.
  The server-web-pages overview adds the last mechanics: the page's
  content is the filed server-profile/home-about surface (name, icon,
  banner, description/traits) plus a JOIN affordance straight off the
  page (GC: the existing join route accepts a link from the page —
  the invite-code path, no new auth); no boost level gates it
  (Discord agrees — all Discoverable servers, any level); Discord
  auto-publishes a default page from profile details, which is the
  concrete form of GC's inverted default (GC: nothing publishes
  until the owner flips it on). Guideline enforcement = the owner's
  hand, as filed with discovery.
  Channel SUMMARIES (auto-generated digest on
  the web page) are SKIP — AI-adjacent and the web page is static
  server-driven; search-engine caching caveats noted as out of our
  control. The one semantic Discord
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
  From the invite-friends how-to, one small nugget: an invite minted
  from a specific CHANNEL can carry that channel as the LANDING
  target (Discord routes the joiner's first view there) — a nullable
  channel_id on the invite row, consumed once at first paint. Tiny
  add to the join flow whenever invites are next touched.
  Member applications (server-applications guide): a third join mode
  between invite-only and discoverable — "apply to join" with custom
  questions, admin review (approve / reject / interview-over-DM),
  pending applicants see nothing. GC-OWNED tables (app row + decision
  columns); extends the is_public mode into a tri-state; phase-3
  mod-desk feature, owner-gated on wanting the extra mode. Rules
  (guilds FAQ — a CLOSED Discord experiment, so the verdict is skip
  for the "guild" wrapper: ≤200-member game guilds with charter/tags
  — Discord killed it; but it confirms the filings above and adds
  two transferables: (a) Start INTERVIEW = spin up a small group
  chat holding the applicant + the reviewing admins, a concrete
  affordance behind the applications spec's "interview-over-DM"
  note; (b) GUEST VOICE invites — a link that lets an outsider join
  ONE voice channel without becoming a member (can't see channels,
  can't return after disconnect) — a legit phase-4 candidate riding
  the invite machinery if the owner ever wants open-audience voice.
  (c) INVITES-101's "grant temporary membership" generalizes that
  pattern to whole-server guests: members who join via a
  temp-membership invite are auto-removed when they're gone UNLESS a
  role gets assigned to them (assignment = the act of promoting a
  guest to a real member — a neat, cheap trigger to reuse; rides the
  gc_member_roles write, no extra schema beyond a temp flag the
  sweeper reads). Owner call if guest access is ever wanted in
  full.)
  Rules screening (rules-screening FAQ): owner-authored per-server rules
  (Discord caps 16) shown to new members in a dialog before any
  talking/DMing/reacting; "accepted" = a flag on the membership row
  (GC-OWNED), mods can manually verify past the gate (Discord's member
  note). Same phase-3 onboarding/mod-desk cluster as applications —
  Discord's own caveat (extra join step → drop-off) reads doubly true
  for a small community; owner picks per-server whether either gate is
  worth it.
- Delete server (delete-server guide): no DELETE /api/servers/:id
  route exists yet, and the article's structure is worth copying
  when it does — OWNER-ONLY (Discord's answer: no permission
  confers it, so no permission bit to add), confirm gate = type-
  the-server-name normally / a re-auth (TOTP) prompt when the
  account has 2FA — the same re-auth helper again. (That gate is
  Discord's "2FA requirement for moderation" server flag — a global
  per-server switch making every destructive action demand the
  re-auth step; a one-column owner call GC could adopt when the
  destructive-action set grows past server-delete.) The "cannot be
  recovered" caveat is GC's discretion: hard delete is the default,
  but a `deleted_at` soft-delete flag (the join/discovery routes
  filter it) would keep the site owner an undo path, since GC's
  support team IS the owner. Owner call; phase-3 cleanup candidate.
  Sister gate (delete-channel how-to): the CHANNEL delete route also
  doesn't exist (only group-chat leave removes its kind='group'
  channel) — same shape: MANAGE_CHANNELS- or owner-gated, gear-menu
  → Delete Channel → Confirm, and one message-deletion rule the
  article leaves implicit: a channel's message rows go with it (a
  hard delete cascades; if GC picks the soft-delete flag instead,
  history stays frozen-but-recoverable — same owner call).
- Community onboarding (community-onboarding FAQ): the full
  question-driven channel/role self-selection flow is SKIP at GC
  scale (the sidebar already shows every view-permitted channel; the
  "overwhelming channel list" problem Discord solves starts at
  hundreds of channels, and the raid-protection advice recaps the
  filed join-burst work). The one transferable worth keeping:
  SELF-ASSIGNABLE roles — a boolean on gc_roles that lets members
  put the role on/take it off themselves via a compact
  "Channels & Roles" dialog (Discord's vanity-role pattern), riding
  the roles build's existing assign machinery with a
  self-assignable-only guard in the route. Cheap successor-batch
  add; rejoin-redo-onboarding semantics don't apply (GC has no
  onboarding flow to redo).
- Timeout (time-out FAQ): kick-lite with an expiry — a
  `timed_out_until` column on gc_server_members (GC-OWNED), nulled on
  early removal (allowed anytime, position-guarded: can't time out
  holders ≥ your highest role). Enforces in THREE gates the same
  read-only idea: send-message route (403 "timed out until …"),
  voice-join (the rooms route), and reactions when they ship —
  Discord's "can react to existing-reaction messages but add no new
  ones" quirk reads as their viewer-count optimization; GC would
  just deny reactions outright while timed out. They keep VIEW
  (still a member, list shows them on the Members page's timed-out
  view — the filed mod desk). Duration menu: 60s / 5m / 10m / 1h /
  1d / 1w; a reason field would want an audit trail GC doesn't have
  — fold it into the security-actions/alert record shape or skip;
  owner call. The TIME-OUT-MEMBERS permission is its own Discord
  bit: for v1 reuse KICK_MEMBERS (kick-lite semantics — gating
  timeout on kick is defensible) or add a MODERATE bit in the
  successor-roles batch; owner call. Automod-applying timeouts
  waits for automod (later). When it ships, point the members-page
  bullet's "Timed Out" line here instead of the generic note.
- Members page (members-page guide): the mod-desk core surface — a
  per-server member dashboard for owner+moderator roles showing
  joined-at (membership row), account age (users.created_at), join
  method (invite-code attribution: store the invite id on the
  membership row at join time — cheap add to the join flow), roles
  (the roles build's gc_member_roles), per-member message counts in
  the server (one GROUP BY over gc_messages, capped) — plus, from
  the insights FAQ, the one modest chart worth keeping: a
  most-used-channels bar (the same GROUP BY grouped by channel_id
  instead of author; retention/referrer/country breakouts are skip
  — no session-geography model and the aggregation is overkill at
  GC scale). Rules-accepted
  flag (the onboarding gate above), with search/sort/filters
  client-side over the roster endpoints. Signals (unusual DM activity
  / account activity / quarantined) are gated on friends+automod —
  later; Timed Out works once a timeout feature exists (timeout =
  kick-lite with an expiry on the membership row; phase-3 candidate).
  Batch actions (role-add, multi-ban) re-confirm password/2FA — the
  SAME re-auth gate the account settings use; Mod View = the member's
  per-server message history (pinned-search machinery with the member
  filter). Phase-3 mod desk.
- Command-permission lockout (command-permissions-lockout guide): GC
  has no third-party app commands to lock out, but the LESSON applies
  to every permission UI this phase builds: deny-all must NEVER hide
  the owner's access (GC's owner bypasses everything by design, so
  hard lockout is structurally impossible) and the tri-state
  convention (✓ allow / ✗ deny / "/" inherit) should be the role
  editor's idiom everywhere — plus a warning when saving a
  deny-everything change that would lock out the *editor's own role*.
  Keep as design notes for the role/channel-permission editors.
- Channel permissions 101 (channel-permissions guide): the per-channel
  override LAYER — the phase-3 roles design decision: server-level
  bits (the roles build) + optional per-channel overwrites per role
  (gc_channel_overwrites: channel, role_id, allow_mask, deny_mask) so
  private/slow channels like #mods-only work role-exclusively. The
  tri-state UI idiom from the lockout guide applies here (this is
  where "/"= inherit matters). Full Discord bit list is the reference
  for the mask vocabulary; GC ships the subset (view/send/manage/
  invites/webhooks/attachments/mentions/threads-map-to-later). Phase-3
  design decision — owner call on whether channel overwrites land in
  the first roles batch or immediately after. VIEW-AS-ROLE (view-as-
  role guide) is the natural companion once both exist: a preview mode
  that re-renders the sidebar + settings through ONE role's effective
  permission set (client-side filtering of already-cached data, plus a
  banner + Disable to exit; Discord's caveat that voice restrictions
  render from the user, not the simulation, applies to GC the same).
  Owner/admin-only; cheap once overwrites exist. Role-MENTION side
  (role-mention-permissions guide): (a) a `mentionable` boolean on
  gc_roles ("allow anyone to @mention this role") + a MENTION-ROLES
  bit allowing holders to bypass it — both single columns/bits in the
  roles build; (b) "suppress role pings" in the server notification
  settings is ALREADY in the filed notification-preference model.
  RESOLUTION ORDER (permission-hierarchy article) — pin as THE
  evaluation algorithm for gc_channel_overwrites: start from
  server-wide permissions (@everyone allows + the member's role
  allows), then on the channel apply layers in this order: @everyone
  deny → @everyone allow → all role denies summed → all role allows
  summed → member-specific deny → member-specific allow. Maps to a
  role_id NULL sentinel for @everyone; the member-specific tier is
  the one layer beyond roles — keep it OUT of v1 (roles + @everyone
  covers every filed use case) but note the reserved tier in the
  schema comment. Owner call if member overwrites are ever wanted.
  (The setup-FAQ (permissions guide) recaps the same layering —
  "channel permissions override server permissions" — plus the
  creator-never-needs-a-role rule (GC's owner bypass already
  embodies it) and the sync mechanics (filed with categories); the
  only NEW vocabulary is an ADD-REACTIONS bit to slot into the mask
  when the reactions feature ships, and its "add specific people"
  channel affordance is exactly the member tier noted above.)
  Worked examples (advanced-community-setup guide + the two
  role-exclusive how-tos, announcements + secret channel) worth
  pinning as THE overwrite use cases: the announcements pattern —
  deny Send to @everyone, allow Send for one role, read-only for
  everyone else — and the team-private pattern — deny VIEW at the
  category, allow per team, with the sync note above. The how-tos
  also confirm the PRIVATE-CHANNEL creation shortcut: picking a role
  at channel-creation time just auto-applies deny-VIEW(@everyone) +
  allow-VIEW(role); the UI affordance, not new schema. Two
  mask-vocabulary additions the voice walkthroughs surface:
  Connect/Speak as separate grants (so an "audience" channel can
  deny Speak), and a READ-MESSAGE-HISTORY gate (deny = the history
  route withholds past messages — cheap, one window over the
  existing query). Video + external-emoji bits are skip (video
  deferred; no cross-server emoji inventory). UX detail from the
  secret-channel how-to: a denied TEXT channel vanishes from the
  list entirely, but a denied VOICE channel stays visible with a
  no-slash hover — GC's channel sidebar should keep that same
  asymmetry (voice presence lives in the DO, and the "can't join"
  affordance beats hiding where everyone's hanging out).
- Roles & permissions fundamentals (roles-and-permissions guide):
  mostly CONFIRMS the in-flight roles build's spine — top-down
  hierarchy, members can only affect roles/holders BELOW their
  highest role, new roles land at the bottom, @everyone is the
  template. ADDITIONS it pins: (1) role COLORS — a single `color`
  TEXT column on gc_roles; the member's chat/list name tint comes
  from their highest-positioned role (the same hierarchy rule the
  Goober+ accent-color note already states: "in servers, role color
  wins"). (2) the ADMINISTRATOR all-permissive bit is SKIP — the
  owner bypasses everything structurally at GC, and Discord's own
  docs warn to assign it only with extreme caution; a freely-
  assignable equivalent would re-create that footgun. (Reconciling
  with the crown-vanish note above: with no Administrator bit, the
  crown's vanish trigger never exists — the crown stays on the
  owner permanently.) (3) the MANAGE-ROLES grant limit: holders may
  only GRANT permissions they themselves hold — Discord's rule; the
  build's position guard is necessary but not sufficient, write the
  grants ⊆ own-grants check into the role editor. (4) DUPLICATE
  CHANNEL (copy config incl. overwrites under a new name) is a
  cheap channel-settings extra. Sibling cosmetic (custom-role-icons
  FAQ): role ICONS — one per role, shown in the member list next to
  the role name and by usernames in chat; when a member holds
  several, only the HIGHEST role's icon shows (same cascade rule as
  colors). Boost gating is discarded (GC precedent: the banner). The
  cheap GC shape: an `icon_emoji` TEXT column (Unicode picker only)
  in the roles build; the uploaded-image variant (64×64 static) rides
  the media intake later if wanted — animated icons are skip exactly
  like animated banners, and MANAGE_ROLES governs setting/removing
  them (Discord agrees). Static-only, no off-switch (Discord's own
  answer: remove the icon instead).
  (3) Verification level (verification-levels article) as a MODEST
  mod-desk feature. Discord's five-level ladder (None / Low-email /
  Medium-email+5min / High-registered>5min + member>10min /
  Highest-phone) compresses at GC to two derivable gates — account
  age (users.created_at, "registered longer than N") and membership
  age (joined_at, "member longer than N"); email/phone levels are
  N/A (no email/SMS). Keep it SERVER-WIDE (one column on gc_servers;
  the FAQ's own answer: per-channel control is the overwrites
  layer's job) and have it gate BOTH sending text and joining voice,
  with the owner/mods bypassing. Phase 3.
  (4) Member prune (how-to-prune guide) for the mod desk — mechanics
  worth adopting: window menu 7 / 30 days, an estimated-count
  preview BEFORE commitment (one SELECT COUNT — cheap and kind),
  optional role filter ("also include members with these roles"),
  and Discord's own warning that KICK permission alone enables
  pruning, so gate it on KICK_MEMBERS in the roles build. The
  "inactive" signal at GC is derivable: last message in the server
  (gc_messages) or the user's last session row.
  (5) Raid protection = existing rate-limiter tiers + a join-burst
  limiter, extended by the activity-alerts guide into a mod-visible
  SHAPE: when the join burst trips, raise a per-server ALERT flag
  (banner for online mods + a note row in the chosen system channel),
  with SECURITY ACTIONS as the response surface — Pause Invites
  (a paused_until column the invite-mint/join routes check; cheap)
  and an alert record that mods resolve with a note for other mods.
  (The pause-invites FAQ widens that action into a STANDALONE tool:
  not just the raid response — a manual owner/Manage-Server toggle
  also serves maintenance mode, and it must gate DISCOVERY joins
  the same as invite joins (Discord confirms both routes pause),
  while links stay minted/visible; joiners see a distinct
  "invites are paused" notice, not the invalid-link error. Same
  single column serves both triggers; no auto-pause from automod
  (Discord's own answer), so the burst alert proposes the pause and
  a mod clicks it.)
- Invalid-invite taxonomy (invalid-invite-links guide): the four
  Discord join-refusal reasons map onto GC as — Unknown/Expired ✓
  and Invalid-code ✓ (both exist); the 200-server cap is SKIP (no
  hard membership ceiling at GC scale, Nitro tiering n/a); BANNED
  is the real gap — Discord bans by IP, GC bans by ACCOUNT (no IP
  model and none wanted): a Ban affordance = kick + a ban flag the
  join route checks, so a valid invite can't re-admit them.
  Phase-3 mod desk; pairs with the kick machinery (one batch), and
  mods un-ban from the members page.
  Pause-DMs-between-non-friends waits for the friend model (phase 3
  social). All mod-desk phase 3. Ownership transfer (transfer-request guide): VOLUNTARY transfer is a cheap route — PATCH /api/servers/:id with
  owner_user_id = a member id, confirmed by the recipient (or
  owner-only UI at GC scale); the INACTIVE-OWNER mediated-transfer
  policy (support ticket, 100-member minimum, 7-day reply window,
  one-server-per-request formality) is SKIP — GC's support team is
  the site owner, who can adjudicate any real case by hand via the
  admin desk. Mechanics from the how-to guide: the affordance lives
  on the member row's context menu, the confirm is a re-auth gate
  (password/TOTP — the account-settings gate), and the old owner
  STAYS as a plain member under their role's permissions afterward. SKIP: templates, server insights/analytics,
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
  feature). Threads (threads FAQ) now specced for phase 4: a thread is
  a child conversation rooted at a message (gc_threads row: channel,
  root_message_id, name, creator, closed_at/archived timestamps, plus
  a thread_id column on the message table — GC-OWNED tables). Surface:
  the existing message renderer in a side panel (threads are message
  lists; the conversation view works as-is), a per-channel Threads
  discovery list, join = post/participate, leave = stop following,
  close = archive (auto after inactivity: 1h/24h/3d/1w menu; reopen by
  posting or via menu; a MOD-locked thread only moderators reopen).
  Private threads: Create-Private permission + mention-to-invite + a
  per-user membership row; per-thread notify settings (all/mentions/
  none) ride the phase-3 preference work. Permissions: Create Public /
  Create Private / Send-in-Threads / Manage map onto the phase-3 role
  list. The threads-MODERATION article pins the refinements: (a) Send-
  in-Threads is deliberately SEPARATE from Send — the showcased setup
  "participants can post in a thread off an announcement post but not
  in the announcement channel" is exactly the read-only-channel pattern
  and needs the independence; (b) split the powers: thread CREATOR can
  rename/archive/set-invite-policy on their own thread, while
  unarchive-locked/delete/rename-others/view-private-set rides
  MANAGE-MESSAGES-class (Discord's "give it to content moderators" —
  same people who hold DELETE_MESSAGES at GC); (c) ARCHIVE-LOCK is
  already specced (mod-locked opens only for moderators); (d) the
  private-thread "anyone can invite" toggle = a boolean on the thread
  row the membership-ADD route checks. Cross-ref: view-as-role previews
  thread permissions too, with Discord's own caveat — private threads
  gate on USER membership, not roles, so the preview can diverge.
  SLOWMODE (slowmode FAQ) — split verdict: per-CHANNEL slowmode
  is ADOPTED for phase 3 (a `slowmode_seconds` column on gc_channels
  off Discord's menu 15m/30m/1h/2h/6h + per-user enforcement in the
  message route: a conditional INSERT that rejects when the author's
  previous message in that channel is newer than the cooldown —
  reads/writes stay indexed; client shows the countdown on the
  composer) + a Bypass-Slowmode bit in the role mask. Per-THREAD
  slowmode stays skip (nicety on top; the channel cooldown already
  bounds thread spam by construction).
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
- Priority speaker (priority-speaker guide): DO-FEASIBLE on the voice
  stack — the ChatRoom DO already labels every opus frame with its
  sender; add a priority flag to voice state (granted by a role bit),
  receivers simply scale non-priority participants' gain down while a
  priority speaker is talking (client-side gain, no re-encode). But it
  DEPENDS on PTT (Discord's own constraint; voice-activity vs priority
  don't mix) — so it queues behind the PTT item on the voice-polish
  shelf; phase 4, owner-gated on wanting it. Visual cue (spark on the
  speaking ring, honor reduced-motion).
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
- Stage channels (stage-channels FAQ): an audience/speaker SPLIT on a
  voice channel — and GC's shape fits with zero new tables: a stage
  is a voice channel running in "stage mode" where the DO holds an
  extra per-member role state (speaker / audience) + a hand-raise
  queue, all DO-EPHEMERAL like the rest of voice state; audience
  members join muted/receive-only (the DO already labels frames by
  sender — audience peers just don't send), speakers are promoted by
  a stage moderator (Connect/Speak grants already speced), the topic
  line rides the filed channel-status affordance, and raised hands
  surface in the moderator's pane. The 10k-audience scales and
  video/screen-share caps are irrelevant (GC deferred video; audiences
  at GC scale are small). Moderators' entry/leave silence and
  "invite to speak requires acceptance" are just client UX on the
  same DO messages. Slots on the voice shelf BEHIND mic test/PTT —
  it's the biggest voice-shelf item but needs nothing new server-side.
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
  the sidebar — the favorites FAQ adds to that shape: DMs/group-DMs
  favorite too, favorites group into named categories, 200-item cap;
  still trivial — a favorites surface is one more rail/group over the
  same data, Nitro-gating discarded at GC like every other experiment)
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
  "Hide Muted Channels" (hide-muted guide): a per-server tickbox in
  the server dropdown that removes muted channels from the sidebar
  entirely (mentions still unfurl them) — pure client toggle riding
  the same mute model, worth adding when the dropdown lands.
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
  AND NOW (owner decision, Nov 16 2026): a SHOP may exist — its
  currency is GOOBER COINS, an earned GC-native balance (NOT Orbs,
  NOT real money; the paid/trial/commerce layers stay skip). Shape:
  gc_wallet (user_id PK, coin balance, updated_at, GC-OWNED) + a
  ledger row per grant/spend; EARN (owner: "which u earn") = just
  being active in the community — a daily activity grant for
  participating (messages with a modest per-day cap, presence in
  voice) with a DAILY CEILING to stop farming; SINK = the
  Goober+ cosmetic list (accent colors, decorations, profile
  effects, typing-indicator styles — cosmetics stay cosmetic, never
  permissions or channels) AND GOOBER+ ITSELF (owner, Nov 16 2026:
  "goober coins is also how u get goober+", then "ALL the nitro
  perks are added to goober+") — Goober+ becomes the coin sink's
  flagship BUNDLE and its contents = every Nitro perk GC has or
  gains, mapped from the what-is-Nitro catalog: bigger upload cap
  + 4000-char messages (previously the free boost perks — flagged:
  whether they MOVE into the bundle or stay free is an owner
  confirmation to get at build time), accent color, tagline,
  animated avatar, custom typing indicator, early-adopter/tenure
  badges, soundboard + super-reactions when those features ship,
  display-name styles, custom themes — whatever GC builds of the
  Nitro list lands inside the one bundle; individual item pricing
  stays OUT (one bundle, one sink; simpler ledger). The
  free-always reading is superseded (nothing is paid-MONEY, but
  Goober+ and its perk set are EARNED through activity coins).
  From the gifting guide, a coin-native twist worth keeping: GIFT
  GOOBER+ — spending coins to grant Goober+ to a friend (a ledger
  row keyed to the recipient; claim links/card designs/confetti are
  Nitro-commerce dressing, skip — a direct transfer needs nothing
  but a confirm dialog). Optional at build; owner call.
  Duration (permanent unlock
  vs Discord-style 30-day renewal for a smaller coin price) is an
  owner call at build time; balance display in the user footer
  (Blaxel-branded coin); refunds = none (cosmetic unlock is instant
  and personal). OWNER-GATED build (phase 4): the shop TAB waits
  until the owner wants it; grants/spend ride the existing write
  limiter tier. The Nitro Orbs economy articles that seeded this
  all still skip as FEATURES — only the earned-currency shape
  transfers, renamed Goober Coins.
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
  identity shape (a nickname on the membership row). Nickname
  semantics from the dedicated guide: TWO permissions (Change Nickname
  = own, Manage Nickname = others' — the moderation tool), mention/
  search match on username OR nickname interchangeably, the profile
  always reveals the true username, /nick as the composer shortcut,
  and mods can rename but never reset someone's avatar. Phase 3 with
  roles; decorations/effects Shop surfaces: no-shop skip stands.
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
  (< an owner-chosen date) with no admin bookkeeping. (The
  evolving-Nitro-badge guide adds the one mechanic tied to Goober
  Coins: an evolving GOOBER+ badge — sprite upgrades at tenure
  milestones while the coin-unlocked Goober+ stays active, resets
  if the chosen renewal form lapses — is just a tenure lookup over
  the gc ledger row that granted Goober+, so it stays in the "no
  evolving/milestone economy" bucket only if the owner wants it to;
  the tenure TOOLTIP remains the cheap default regardless.)

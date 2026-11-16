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

## Keyboard shortcuts (browser/desktop parity targets)
- Quick switcher across channels/DMs: Ctrl/⌘ + K
- Search current channel: Ctrl/⌘ + F; all channels: Ctrl/⌘ + Shift + F
- Emoji picker: Ctrl/⌘ + E; GIF picker: Ctrl/⌘ + G
- Edit last message: Shift/⌥ + ↑; cancel/escape: Esc
- Between channels: Alt/⌥ + ↑/↓; between servers: Ctrl/⌘ + Alt +
  ←/→ (map to server rail buttons)
- Mute mic: Ctrl/⌘ + Shift + M; deafen: Ctrl/⌘ + Shift + D (voice phase 2)
- Upload file: Ctrl/⌘ + Shift + U; settings: Ctrl/⌘ + ,
- A "/shortcuts" or help dialog listing these (Ctrl + / parity).

## Slash commands (v1 in-app commands, no third-party apps)
- Composer "/" opens an autocomplete menu; Enter executes.
- Starter set: /shrug, /tableflip, /unflip, /spoiler, /me, /giphy (media
  pipeline), plus per-feature commands once roles land (/kick, /timeout,
  /purge — Phase 3, gated by the mod permissions model).

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
- Server banner image + name header over the channel sidebar.
- Boost goal progress bar (boosts count / goal, milestone labels).
- Member list grouped by role with role-colored names and APP/user badges.
- Server profile card: banner color, avatar & decoration, connections,
  bio, badges (GC reads forum profiles; editing stays forum-side for now —
  revisit as an owner decision).

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
- Friend system: send request by exact username, accept/decline, profile
  card "Add Friend" button from member lists/avatars; friends hub (already
  on UI-redo list). Group DMs cap ~10 members (GC group chats exist — add
  the select-friends-to-create flow + add-members/leave/remove/rename and
  custom group icon management).
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
  friends/reactions; queue behind phase 3 social.

## Shop / Nitro ("everything in Discord AND Discord Nitro", owner ask)
- Goober+ perks are free cosmetics (accent color, tagline, boosts,
  animated avatar support, bigger upload caps). A paid shop is a later,
  owner-gated decision — nothing charges money without explicit sign-off.

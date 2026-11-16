# Discord parity backlog (owner-provided references, 2026-11-16)

The owner is aligning GooberCord with Discord feature-for-feature. Sources:
Discord's official Sign-Up guide, Commands/Shortcuts guide, plus
browser screenshots of Friends/DM/server/discovery/profile/shop pages.
Work items below fold into the UI redo (post phase-2 merge) and Phase 3/4.

## Sign-up / registration (Discord's flow)
- Login page carries an obvious "Register" entry; register form is one
  username + password + Continue step, CAPTCHA on submit (GC: Turnstile).
- **Invite-first registration**: an invite link for a signed-out person
  prompts account creation and then lands them in the server. GC already
  does this (#/join/CODE → login → auto-join) — keep it prominent in the
  register copy: "New here? Create an account — invites apply after."
- GC deliberately has no email/DOB (forum account model has neither);
  do not invent fields without an owner decision.

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
  B/I/U shortcuts in the composer.
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

## Shop / Nitro ("everything in Discord AND Discord Nitro", owner ask)
- Goober+ perks are free cosmetics (accent color, tagline, boosts,
  animated avatar support, bigger upload caps). A paid shop is a later,
  owner-gated decision — nothing charges money without explicit sign-off.

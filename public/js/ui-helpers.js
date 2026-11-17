// UI redo (owner structure) — the client-side pieces that need no server:
//   - pure helpers the unit tests pin (skin-adjacent chrome, boost progress,
//     invite-code extraction, quick-switcher entries + filtering),
//   - the quick switcher dialog (Ctrl/⌘ + K — the checklist's top shortcut),
//     a keyboard-navigable search over the user's channels and DMs that
//     writes the existing #/s/... / #/c/... hashes via hashFor().
// Everything builds DOM through el()/createIcon (CSP-safe, no innerHTML);
// dialogs self-remove on close like every other GC dialog.
import { el } from "./dom.js";
import { createIcon, iconButton } from "./icons.js";
import { hashFor } from "./chat-store.js";

// --- boost progress (display only — no server-side logic added) --------------

// Discord's first milestone; GC's caches.servers boost rows carry `boosts`
// and `boostedByMe`. Pure so the pinned label math is testable.
export const BOOST_GOAL = 7;

// boostProgress(boosts, goal) -> { value, goal, label, title }: a clamped
// count (a server can only reach the goal, a negative count is API noise)
// with the n/goal label used next to the sparkle. Pure.
export function boostProgress(boosts, goal = BOOST_GOAL) {
  const limit = Number.isSafeInteger(Number(goal)) && Number(goal) > 0 ? Number(goal) : BOOST_GOAL;
  const parsed = Number(boosts);
  const value = Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, limit) : 0;
  return {
    value,
    goal: limit,
    label: value + "/" + limit,
    title: value + " of " + limit + " server boosts",
  };
}

// --- create-or-join (rail "+": Create / Join with an invite code) -----------

// Accepts either a bare invite code or a pasted full link whose hash fragment
// carries it ("…/#/join/AbC_dE-f"). Returns the validated code or null. Pure
// (chat-store.js's own code-shape rule, surfaced for the input field).
export function inviteCodeFromInput(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const match = raw.match(/#?\/?join\/([A-Za-z0-9_-]{4,64})$/) ||
    raw.match(/^([A-Za-z0-9_-]{4,64})$/);
  return match ? match[1] : null;
}

// --- quick switcher ---------------------------------------------------------------

// switcherEntries(servers, conversations) -> searchable rows in a stable
// order: conversations (DMs/groups) first, then each server's text channels,
// then voice channels. Each row carries the canonical hash it navigates to.
// Pure — the shell passes its module caches straight in.
export function switcherEntries(servers, conversations) {
  const rows = [];
  for (const conversation of Array.isArray(conversations) ? conversations : []) {
    const id = Number(conversation?.id);
    if (!Number.isSafeInteger(id)) continue;
    rows.push({
      kind: conversation.kind === "group" ? "group" : "dm",
      label: String(conversation.name || "Conversation"),
      sub: conversation.kind === "group" ? "Group" : "Direct message",
      hash: hashFor({ channelId: id }),
    });
  }
  for (const server of Array.isArray(servers) ? servers : []) {
    const serverName = String(server?.name || "Server");
    for (const channel of server?.channels || []) {
      const id = Number(channel?.id);
      if (!Number.isSafeInteger(id)) continue;
      if (channel.kind !== "text" && channel.kind !== "voice") continue;
      const isVoice = channel.kind === "voice";
      rows.push({
        kind: isVoice ? "voice" : "text",
        label: String(channel.name || "channel"),
        sub: serverName + " — " + (isVoice ? "Voice" : "Text"),
        // The bare channel + server row: a voice pick is a JOIN target, not a
        // navigation, so it carries an action (the shell wires startVoiceJoin
        // through onVoiceJoin) instead of an href hash.
        server: serverName,
        channelId: id,
        serverId: Number(server.id),
        hash: isVoice ? hashFor({ serverId: Number(server.id) }) : hashFor({ serverId: Number(server.id), channelId: id }),
      });
    }
  }
  return rows;
}

const SWITCHER_MAX = 12;

// Quick-switcher prefixes (Discord's guide, static category filters only):
// "*" = server channels, "@" = DMs/groups, "#" = text channels,
// "!" = voice channels. A leading prefix restricts the candidate set and is
// stripped; anything else searches everything. Pure.
export function stripSwitcherPrefix(query) {
  const raw = String(query || "");
  return ["*", "@", "#", "!"].includes(raw.charAt(0))
    ? { prefix: raw.charAt(0), rest: raw.slice(1) }
    : { prefix: null, rest: raw };
}

const PREFIX_KINDS = { "@": ["dm", "group"], "#": ["text"], "!": ["voice"] };

function haystackFor(entry, prefix) {
  // "*"-scoped queries search the SERVER name only (the channel picks come
  // from "#" / "!" / prefix-less); every other search covers label + sub.
  if (prefix === "*") return String(entry.server || "").toLowerCase();
  if (prefix === "@") return String(entry.label || "").toLowerCase();
  return (entry.label + " " + entry.sub).toLowerCase();
}

// filterEntries(query, entries) -> up to SWITCHER_MAX matches. Word-wise
// matching: every whitespace-separated word of the query must appear in the
// entry's haystack (label + sub so a channel can be narrowed by its server's
// name, Discord-style "hq lounge"); an empty/whitespace query returns the
// first SWITCHER_MAX rows. Pure.
export function filterEntries(query, entries) {
  const { prefix, rest } = stripSwitcherPrefix(query);
  const words = String(rest || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const kinds = PREFIX_KINDS[prefix];
  const list = (Array.isArray(entries) ? entries : []).filter((entry) =>
    kinds ? kinds.includes(entry.kind) : true);
  if (words.length === 0) return list.slice(0, SWITCHER_MAX);
  return list
    .filter((entry) => {
      const hay = haystackFor(entry, prefix);
      return words.every((word) => hay.includes(word));
    })
    .slice(0, SWITCHER_MAX);
}

// The dialog: a labeled input, a result list (arrow keys move the selection,
// Enter navigates, Esc closes). Writes the existing hashes on Enter or click;
// NOTHING is fetched — the render is client-side over the shell caches.
// `onVoiceJoin({ channel, serverId })` is the shell's join path (the SAME one
// the sidebar's click handler calls): a "!"/"voice" pick is a JOIN target, not
// a navigation. Without one, voice rows render inert (chosen when voice is
// unavailable). `previousHash` (captured by the caller before opening) is the
// Esc bounce: closing with Esc returns you to the channel you were in.
export function openQuickSwitcher(doc, win, { servers, conversations, onVoiceJoin, previousHash } = {}) {
  if (doc.getElementById("gc-quick-switcher")) return;

  const entries = switcherEntries(servers, conversations);
  const input = el("input", {
    type: "text",
    id: "gc-switcher-input",
    placeholder: "Where to? * servers, @ DMs, # text, ! voice…",
    "aria-label": "Quick switcher search",
    autocomplete: "off",
    spellcheck: "false",
  });
  const list = el("div", {
    class: "switcher-list",
    role: "listbox",
    "aria-label": "Go to channel",
  });
  const empty = el("p", { class: "muted list-note switcher-empty", text: "Nothing matches." });
  const inputField = el("div", { class: "form-field" }, input);
  const body = el("div", { class: "switcher-body" }, inputField, list, empty);

  let results = [];
  let selected = 0;
  let navigating = false; // a pick (vs an Esc/close) decides the hash after close

  const clearSelection = (nodes) => {
    for (const node of nodes) {
      node.setAttribute("aria-selected", "false");
      node.classList.remove("switcher-selected");
    }
  };

  const render = () => {
    empty.hidden = results.length > 0;
    list.replaceChildren();
    results.forEach((entry, index) => {
      const row = el("div", {
        class: "switcher-row" +
          (index === selected ? " switcher-selected" : "") +
          (entry.kind === "voice" && !onVoiceJoin ? " switcher-inert" : ""),
        role: "option",
        "aria-selected": index === selected ? "true" : "false",
        tabindex: "-1",
        dataset: { switcherIndex: String(index) },
      });
      row.append(
        el("span", { class: "switcher-kind", "aria-hidden": "true" },
          createIcon(doc, entry.kind === "voice" ? "speaker" : entry.kind === "group" ? "users" : entry.kind === "dm" ? "at-sign" : "hash")),
        el("span", { class: "switcher-label", text: entry.label }),
        // A voice pick joins; without the shell's join path it is inert, so
        // say so in copy rather than looking like a broken link.
        el("span", { class: "switcher-sub", text: entry.sub + (entry.kind === "voice" && !onVoiceJoin ? " (voice unavailable)" : "") }),
      );
      row.addEventListener("click", () => go(entry));
      list.append(row);
    });
  };

  const go = (entry) => {
    navigating = true;
    dialog.close();
    if (!entry) return;
    if (entry.kind === "voice" && typeof onVoiceJoin === "function") {
      onVoiceJoin({ channelId: entry.channelId, serverId: entry.serverId });
      return;
    }
    if (entry.hash) win.location.hash = entry.hash;
  };

  const move = (delta) => {
    if (results.length === 0) return;
    selected = (selected + delta + results.length) % results.length;
    clearSelection(list.querySelectorAll(".switcher-row"));
    const row = list.querySelectorAll(".switcher-row")[selected];
    if (row) {
      row.classList.add("switcher-selected");
      row.setAttribute("aria-selected", "true");
    }
  };

  input.addEventListener("input", () => {
    results = filterEntries(input.value, entries);
    selected = 0;
    render();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      go(results[selected]);
    }
    // Esc rides the native <dialog> behavior; the close handler bounces.
  });

  const dialog = el("dialog", { id: "gc-quick-switcher" },
    el("h2", { text: "Quick switcher" }),
    body,
    el("div", { class: "form-actions" },
      el("p", { class: "muted switcher-hint",
        text: "* servers · @ DMs · # text · ! voice · ↑↓ move · Enter go · Esc back" }),
      iconButton(doc, "x", { ariaLabel: "Close quick switcher", className: "icon-button button-quiet" }),
    ),
  );
  dialog.addEventListener("close", () => {
    dialog.remove();
    // Esc / backdrop / ✕ close = the "recent channel" bounce: the hash that
    // was live before the switcher opened is restored (a no-op when the user
    // never moved), while a pick is left alone.
    if (typeof previousHash === "string" && !navigating && win.location.hash !== previousHash) {
      win.location.hash = previousHash;
    }
  });
  dialog.querySelector(".form-actions .icon-button").addEventListener("click", () => dialog.close());
  // A click on the dialog card itself must not close through the backdrop.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  doc.body.append(dialog);
  dialog.showModal();
  input.focus();
  input.dispatchEvent(new Event("input"));
}

// --- phase-3 roles: server member list (roster grouping + display) ------------

// memberDisplay(member) -> the server-context display name with the filed
// precedence (nickname > username). DMs/profile keep their own rules — the
// caller decides when this applies. Pure.
export function memberDisplay(member) {
  const nickname = typeof member?.nickname === "string" ? member.nickname.trim() : "";
  const username = String(member?.username || "member");
  return nickname || username;
}

// memberGroups(members, roles) -> the grouped member list: Owner first, then
// one group per role in strongest-first order (roles arrive position DESC,
// id DESC), then the roleless "Members" group. A member sits in exactly ONE
// group — their top role's (Discord's convention), keyed by the first entry
// of roleIds; empty groups drop out. Pure, so the pinned tests cover the
// roster payload's whole shape without a DOM.
export function memberGroups(members, roles) {
  const list = Array.isArray(members) ? members : [];
  const roleList = Array.isArray(roles) ? roles : [];

  const groups = [
    { key: "owner", label: "Owner", role: null, members: [] },
    ...roleList.map((role) => ({
      key: "role-" + Number(role?.id),
      label: String(role?.name || "Role"),
      role: role,
      members: [],
    })),
    { key: "members", label: "Members", role: null, members: [] },
  ];
  const groupByKey = new Map(groups.map((group) => [group.key, group]));

  for (const member of list) {
    const isOwner = member?.membershipRole === "owner";
    // The Owner group is the OWNER row's identity, not a role: an owner
    // holding roles shows under Owner only.
    const topRoleId = isOwner
      ? null
      : Number(member?.roleIds?.[0]) || null;
    const key = isOwner
      ? "owner"
      : topRoleId !== null && groupByKey.has("role-" + topRoleId)
        ? "role-" + topRoleId
        : "members";
    groupByKey.get(key).members.push(member);
  }

  return groups.filter((group) => group.members.length > 0);
}

// --- phase-3 mod desk: the members page's menus + client-side filter -----------

// The filed menus, in the wire/copy pairs the selects render. The timeout
// menu is the time-out FAQ's duration list; the verification options carry
// the filed ladder's labels (0 = none); the prune windows are the
// how-to-prune guide's 7/30 pair.
export const TIMEOUT_MINUTE_OPTIONS = [[1, "1 minute"], [5, "5 minutes"], [10, "10 minutes"],
  [60, "1 hour"], [1440, "1 day"], [10080, "1 week"]];
export const VERIFICATION_LEVEL_OPTIONS = [[0, "None"], [1, "Account older than 1 day"],
  [2, "Account older than 7 days"], [3, "Member older than 10 minutes"],
  [4, "Account 7+ days and member 10+ minutes"]];
export const PRUNE_DAY_OPTIONS = [[7, "7 days"], [30, "30 days"]];

// The custom-status expiry menu (wave item 5): minutes (0 = "until I change
// it"), in the same wire/copy pair shape the server's
// PATCH /api/me/status rides (statusUntil = now + ms; null = clear-on-own).
export const STATUS_EXPIRY_OPTIONS = [[null, "Until I change it"], [240, "4 hours"],
  [480, "8 hours"], [1440, "24 hours"], [10080, "1 week"]];

// The DND preset: the client's one known quick-status text. Every member's
// client colors the presence dot coral for a member whose ACTIVE status
// equals this exact preset — the visible DND rides the text+expiry the
// status schema already has (no new column, no new frame).
export const STATUS_DND_TEXT = "Do not disturb";

// dndActive(entry, now): the preset is DND only while it is live — an expired
// status_until is as good as no status at all (presence.mjs already nulls
// stale ones on the hub, but the client re-checks so a cached row between
// heartbeats never shows a lapsed DND).
export function dndActive(entry, now = Date.now()) {
  if (!entry || entry.statusText !== STATUS_DND_TEXT) return false;
  if (entry.statusUntil === null || entry.statusUntil === undefined) return true;
  return Number(entry.statusUntil) > now;
}

// statusUntilFrom(expiresInMinutes, now): the wire value for the PATCH.
// Strictly integer-typed — the wiring converts the select's string value
// itself, so a string arriving here is a caller bug and fails CLOSED.
export function statusUntilFrom(expiresInMinutes, now = Date.now()) {
  if (expiresInMinutes === null || expiresInMinutes === undefined) return null;
  if (!Number.isInteger(expiresInMinutes) || expiresInMinutes <= 0) return null;
  return now + expiresInMinutes * 60000;
}

// --- onboarding (wave item 4): the create-server template chooser -----------

// SERVER_CHANNEL_TEMPLATES: the starter channels offered beside the name
// field on server create. The create itself seeds only #general (one atomic
// backend batch), so each checked template rides the create-channel route
// after the server exists. Text first, voice last — creation order is the
// sidebar position order.
export const SERVER_CHANNEL_TEMPLATES = [
  { name: "announcements", kind: "text", blurb: "owner posts, one-way" },
  { name: "off-topic", kind: "text", blurb: "the everyday chatter" },
  { name: "memes", kind: "text", blurb: "the fun stuff" },
  { name: "Lounge", kind: "voice", blurb: "hang out and talk" },
  { name: "Gaming", kind: "voice", blurb: "play together" },
];

// modDeskFilter(members, query): the members page's client-side filter box —
// a case-insensitive substring match over the username and the nickname. An
// empty (or junk) query is the unfiltered array, never a rejection. Pure.
export function modDeskFilter(members, query) {
  const list = Array.isArray(members) ? members : [];
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return [...list];
  return list.filter((member) => {
    const username = String(member?.username || "").toLowerCase();
    const nickname = typeof member?.nickname === "string" ? member.nickname.toLowerCase() : "";
    return username.includes(needle) || (nickname !== "" && nickname.includes(needle));
  });
}

// --- phase-3: spoiler-channel acknowledgments (client-side only) --------------

// The localStorage key the file'd spec pins: an ack is enough at GC scale.
export const SPOILER_ACK_KEY = "goober-spoiler-acks";

// readSpoilerAcks(storage) -> Set(channelIds). A blocked or corrupt store
// reads as empty (the notice simply re-shows), exactly like the collapsed
// categories' fallback. Pure over a storage-shaped object.
export function readSpoilerAcks(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(SPOILER_ACK_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(Number).filter(Number.isSafeInteger) : []);
  } catch {
    return new Set();
  }
}

// writeSpoilerAck(storage, channelId) -> the updated Set (or the previous one
// when the store refuses). Pure over a storage-shaped object.
export function writeSpoilerAck(storage, channelId) {
  const acked = readSpoilerAcks(storage);
  acked.add(Number(channelId));
  try {
    storage.setItem(SPOILER_ACK_KEY, JSON.stringify([...acked]));
  } catch {
    // Best effort: the notice re-shows on the next entry instead.
  }
  return acked;
}

// --- Goober Coins (0011): pure shaping for the shop page + footer chip -------
//
// Coins are earned ONLY by activity (never purchased, never transferable, and
// the balance is always the ledger's SUM). These helpers shape the API's
// payload — the numbers themselves live server-side (constants.mjs + the
// guarded ledger INSERTs) and arrive verbatim on every /api/coins read, so a
// stale client copy can never mint anything.

// coinBalanceLabel(balance): the footer chip + shop hero's number, thousands-
// separated; junk (null, a float, a negative the API could never send) reads
// as "0". Pure.
export function coinBalanceLabel(balance) {
  const value = Number(balance);
  const count = Number.isInteger(value) && value > 0 ? value : 0;
  return count.toLocaleString("en-US");
}

// coinDayProgress(earnedToday, ceiling) -> { label, title, pct }: today's earn
// against the ONE daily ceiling, clamped both ways (the API never sends a
// value past its ceiling; a junk read clamps to 0%). The pct is consumed by a
// CSS class — never an inline style (CSP: style-src 'self').
export function coinDayProgress(earnedToday, ceiling) {
  const earned = Number(earnedToday);
  const head = Number.isInteger(earned) && earned > 0 ? earned : 0;
  const goal = Number(ceiling);
  const cap = Number.isInteger(goal) && goal > 0 ? goal : 0;
  const pct = cap <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((head / cap) * 100)));
  return {
    label: head.toLocaleString("en-US") + " / " + cap.toLocaleString("en-US"),
    title: head + " of " + cap + " Goober Coins earned today (the shared ceiling)",
    pct,
  };
}

// Ledger row copy: one line per movement, in the vocabulary the economy
// speaks. Gifts read differently depending on which side the viewer is on: a
// spend the viewer made with a recipient reads "to <name>", a spend that
// merely names the gifter's recipient (the ledger's related trail) keeps it.
// Pure.
export function ledgerEntryCopy(entry) {
  const delta = Number(entry?.delta) || 0;
  const other = typeof entry?.relatedUsername === "string" && entry.relatedUsername.length > 0
    ? entry.relatedUsername
    : null;
  const label = (function () {
    switch (entry?.source) {
      case "daily":
        return "Daily activity grant";
      case "message":
        return "Message points";
      case "voice":
        return "Voice presence";
      case "plus_renewal":
        return "Goober+ renewal";
      case "plus_gift":
        return delta < 0 ? (other ? "Goober+ gift to @" + other : "Goober+ gift") : "Goober+ gift";
      default:
        return "Goober Coins";
    }
  })();
  return {
    label,
    amount: delta > 0 ? "+" + delta.toLocaleString("en-US") : "−" + Math.abs(delta).toLocaleString("en-US"),
    negative: delta < 0,
  };
}

// The gift form's client-side shape check — the SAME rule api/usernames.mjs
// enforces; the real check (membership, self-gift refusal, sufficient coins)
// is the route's. Pure.
export function giftUsernameValid(value) {
  return typeof value === "string" && /^[A-Za-z0-9_]{3,24}$/.test(value.trim());
}

// plusStateCopy(plus) -> { title, detail, tone }: the bundle panel's single
// line about standing. `plus` is the /api/coins shape ({ hasPlus, active,
// inGrace, renewsUntil, ... }). Pure — dates render through formatTimestamp.
export function plusStateCopy(plus, formatWhen) {
  const fmt = (value) => (typeof formatWhen === "function" ? formatWhen(value) : String(value));
  if (!plus?.hasPlus) {
    return { title: "Not a member yet", detail: "Goober+ is bought entirely with Goober Coins.", tone: "none" };
  }
  if (plus.renewsUntil > 0 && plus.inGrace) {
    return {
      title: "In the grace window",
      detail: "Your term lapsed on " + fmt(plus.renewsUntil * 1000) + " — renew before " + fmt(plus.graceUntil * 1000) + " to keep the streak.",
      tone: "grace",
    };
  }
  if (plus.active) {
    const gifter = typeof plus.giftedBy === "number" ? " (gifted)" : "";
    return {
      title: "Goober+ active" + gifter,
      detail: "Renews " + fmt(plus.renewsUntil * 1000) + ". Renewal stacks a fresh month on top.",
      tone: "active",
    };
  }
  return {
    title: "Goober+ lapsed",
    detail: "The grace window closed. Renewing keeps your tenure start — nothing resets.",
    tone: "lapsed",
  };
}

// --- phase-3 social layer (pure helpers; the routes live in api/social.mjs) -----

// The reaction picker's curated palette (the free set; Goober+'s sparkle
// reactions ride their own later cosmetic batch). Each entry is the RENDERED
// emoji the server stores (<= 32 chars by its schema CHECK).
export const REACTION_PALETTE = Object.freeze([
  "🙂", "😂", "😮", "😢", "🔥", "❤️", "👀", "🎉",
  "👍", "👎", "🙏", "💯", "😅", "🤔", "🥳", "⭐",
  "🐑", "✅", "🤝", "💀", "🫡", "🧀", "🚀", "😴",
]);

// reactionChips(reactionGroups, selfId) -> [{ emoji, count, mine, usernames }]:
// the chip row's whole derivation, pure so the unit tests pin it. reactionGroups
// is the grouped list payload shape (api/messages.mjs): one entry per emoji with
// its per-emoji user list. The count is the list's length (never a duplicated
// server number), and `mine` is the selfId membership — the personal state the
// chip's toggle relies on.
export function reactionChips(reactionGroups, selfId) {
  const groups = Array.isArray(reactionGroups) ? reactionGroups : [];
  const me = Number(selfId);
  return groups
    .filter((group) => group && typeof group.emoji === "string" && Array.isArray(group.users))
    .map((group) => ({
      emoji: group.emoji,
      count: group.users.length,
      mine: group.users.some((user) => Number(user?.id) === me),
      usernames: group.users.map((user) => String(user?.username || "")),
    }))
    .filter((chip) => chip.count > 0);
}

// toggleMyReaction(message, emoji, selfId, add) -> the NEXT reactionGroups for
// the same message: adding appends the viewer to the emoji group (a group the
// message doesn't carry yet is created at the end), removing deletes the
// membership and prunes empty groups. Pure — the caller renders from the result
// and PUTs/DELETEs the route; a refused call just re-reads the message list.
export function toggleMyReaction(message, emoji, selfId, add) {
  const me = Number(selfId);
  const groups = (Array.isArray(message?.reactions) ? message.reactions : []).map((group) => ({
    emoji: String(group?.emoji || ""),
    users: Array.isArray(group?.users)
      ? group.users.map((user) => ({ id: Number(user?.id), username: String(user?.username || "") }))
          .filter((user) => Number.isSafeInteger(user.id))
      : [],
  }));
  const group = groups.find((entry) => entry.emoji === String(emoji));
  if (add) {
    if (group) {
      if (!group.users.some((user) => user.id === me)) {
        group.users.push({ id: me, username: "" });
      }
    } else {
      groups.push({ emoji: String(emoji), users: [{ id: me, username: "" }] });
    }
  } else if (group) {
    group.users = group.users.filter((user) => user.id !== me);
  }
  return groups.filter((entry) => entry.users.length > 0);
}

// friendsHubTabCounts(payload) -> { all, online, pending, blocked }: the hub's
// tab labels, pure. `online` rides the presence snapshot the shell already
// caches (a friend GC cannot see online is simply absent from it — the tab
// keeps the truthful subset).
export function friendsHubTabCounts(payload, presenceIds = []) {
  const friends = Array.isArray(payload?.friends) ? payload.friends : [];
  const sent = Array.isArray(payload?.pendingSent) ? payload.pendingSent : [];
  const received = Array.isArray(payload?.pendingReceived) ? payload.pendingReceived : [];
  const blocked = Array.isArray(payload?.blocked) ? payload.blocked : [];
  const seen = new Set(presenceIds.map(Number));
  return {
    all: friends.length,
    online: friends.filter((friend) => seen.has(Number(friend.userId))).length,
    pending: sent.length + received.length,
    blocked: blocked.length,
  };
}

// socialActionCopy(kind) -> { title, detail, confirm }: the context-menu
// warning screens, per the filed block/ignore contract (they say what each
// tier does to the caller, and never notify the target). Pure.
export function socialActionCopy(kind, username) {
  const name = String(username || "this member").replace(/[<>&"']+/g, "");
  if (kind === "blocked") {
    return {
      title: "Block " + name + "?",
      detail: "Blocking means their DMs stop being delivered to you, your friendship ends, " +
        "and new friend requests between you are refused. Their messages in shared spaces " +
        "hide here (you can still reveal them). They are never told.",
      confirm: "Block",
    };
  }
  return {
    title: "Ignore " + name + "?",
    detail: "Ignoring means their messages hide here and their notifications are muted — " +
      "purely client-side. They keep full normal access, and your view changes nothing " +
      "on their side. They are never told.",
    confirm: "Ignore",
  };
}

// socialVisibilityCopy(kind) -> the one-line collapsed note a hidden row
// carries (the Show-reveal's own copy). Pure.
export function socialVisibilityCopy(kind) {
  return kind === "blocked"
    ? "Message from a blocked member"
    : "Message from an ignored member";
}

// socialRelationOf(userId, social, blocks) -> "friend" | "sent" |
// "received" | "blocked" | "ignored" | null: the affordance gate the context
// menus share (an Add-Friend entry only renders for the null relation). Pure
// over the hub payload (/api/friends) and the viewer's own block list.
export function socialRelationOf(userId, social, blocks) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const friends = Array.isArray(social?.friends) ? social.friends : [];
  const sent = Array.isArray(social?.pendingSent) ? social.pendingSent : [];
  const received = Array.isArray(social?.pendingReceived) ? social.pendingReceived : [];
  if (friends.some((friend) => Number(friend?.userId) === id)) return "friend";
  if (sent.some((entry) => Number(entry?.userId) === id)) return "sent";
  if (received.some((entry) => Number(entry?.userId) === id)) return "received";
  const block = (Array.isArray(blocks) ? blocks : []).find(
    (row) => Number(row?.userId) === id,
  );
  if (block) return block.kind === "blocked" ? "blocked" : "ignored";
  return null;
}

// socialMembersOf(kind, members, blocks) -> [{ userId, username }]: the
// members of a shared space the viewer's OWN block list puts in the given
// tier. Both filed client-side checks ride it:
//   - kind "blocked": the group-DM blocked-visitor notice (leave-or-stay on
//     first visit — the blocked-in-shared-space alert),
//   - kind "ignored": the voice join-with-them warning.
// Pure; the caller renders from the result.
export function socialMembersOf(kind, members, blocks) {
  const present = Array.isArray(members) ? members : [];
  const rows = Array.isArray(blocks) ? blocks : [];
  return present
    .map((member) => {
      const userId = Number(member?.userId ?? member?.id);
      return Number.isSafeInteger(userId) && userId > 0 &&
          rows.some((row) => row && row.kind === kind && Number(row.userId) === userId)
        ? { userId, username: String(member?.username || "") }
        : null;
    })
    .filter((entry) => entry !== null);
}

// blockedVisitorsIn(conversation, blocks) — the group-DM notice's roster: the
// hard tier inside ONE conversation's member list (a dm pair's blocked row
// already collapses to hidden rows; a group raises the visitor alert).
export function blockedVisitorsIn(conversation, blocks) {
  if (String(conversation?.kind) !== "group") return [];
  return socialMembersOf("blocked", conversation?.members, blocks);
}

// ignoredMembersHere(members, blocks) — the voice join-with-them warning's
// roster (the soft tier read of socialMembersOf, over whoever is present).
export function ignoredMembersHere(members, blocks) {
  return socialMembersOf("ignored", members, blocks);
}

// The localStorage key the blocked-visitor notice pins (its ack is the
// one-time-ness: the notice raises once per conversation, ever, then stays
// quiet — the Show-reveal already covers the day-to-day hiding).
export const BLOCKED_VISITOR_ACK_KEY = "gc_blocked_visitor_acks";

// readBlockedVisitorAcks(storage) -> Set(channelIds). A blocked or corrupt
// store degrades to "no acks" (the notice re-raises — the honest failure for
// a one-time gate over an unreadable store). Pure over a storage object.
export function readBlockedVisitorAcks(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(BLOCKED_VISITOR_ACK_KEY) || "[]");
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map(Number).filter((id) => Number.isInteger(id) && id > 0));
  } catch {
    return new Set();
  }
}

// writeBlockedVisitorAck(storage, channelId) -> the updated Set (or the
// previous one when storage throws — a refused write keeps the current read
// so a locked-down browser just sees the notice again next visit).
export function writeBlockedVisitorAck(storage, channelId) {
  const acks = readBlockedVisitorAcks(storage);
  acks.add(Number(channelId));
  try {
    storage.setItem(BLOCKED_VISITOR_ACK_KEY, JSON.stringify([...acks]));
  } catch {
    return readBlockedVisitorAcks(storage);
  }
  return acks;
}

// --- Wempo Accounts handshake (pure helpers; the relay routes live in
// api/sso.mjs and the boot door in state.js) ------------------------------------

// The query-string parameter the accounts worker redirects back with.
export const SSO_TICKET_PARAM = "wt";

// The exact origin the sign-in handoff carries: accounts' return allowlist
// takes an EXACT ORIGIN (https://goobercord.itswempo.workers.dev), never a
// query string or a path, so this is win.location.origin and nothing more.
export const WEMPO_ACCOUNTS_ORIGIN = "https://accounts.itswempo.workers.dev";

export function wempoAccountsSignInUrl(origin) {
  return WEMPO_ACCOUNTS_ORIGIN + "/?return=" + encodeURIComponent(origin || "");
}

// The sign-out handoff: a member site's Log out lands here so the
// accounts-site session clears too — without it, an existing Accounts
// session would auto-ticket straight back through the return flow and the
// member could never actually leave. No return parameter on purpose.
export function wempoAccountsSignOutUrl() {
  return WEMPO_ACCOUNTS_ORIGIN + "/?signout=1";
}

// ssoTicketFromSearch(search) -> the hex ticket, or "". A 32-byte-hex
// one-time ticket ONLY — anything else (missing, wrong length, non-hex) is
// not a ticket and the route treats ?wt as absent. Tolerates uppercase hex
// (the redeem endpoint normalizes) and never throws on a bad search string.
export function ssoTicketFromSearch(search) {
  let value = null;
  try {
    value = new URLSearchParams(search || "").get(SSO_TICKET_PARAM);
  } catch {
    return "";
  }
  return typeof value === "string" && /^[0-9a-fA-F]{64}$/.test(value) ? value.toLowerCase() : "";
}

// clearTicketParam(win) -> drop ?wt= (and nothing else the URL carried) from
// the address bar WITHOUT touching the '#' route or triggering a history
// entry, so the ticket can never be re-posted by a re-render, a reload, or
// the back button — a one-time code must be spent exactly once.
export function clearTicketParam(win) {
  const params = new URLSearchParams(win.location.search || "");
  if (!params.has(SSO_TICKET_PARAM)) return false;
  params.delete(SSO_TICKET_PARAM);
  const query = params.toString();
  win.history.replaceState(
    null,
    "",
    win.location.pathname + (query ? "?" + query : "") + win.location.hash,
  );
  return true;
}

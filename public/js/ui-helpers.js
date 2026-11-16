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


// The app shell (Tasks 11-13 scope + Phase 2 voice):
// server rail (#), channel sidebar (text/voice channels + DM list), the chat
// pane (history REST + one live WS per open channel), the composer with
// attach-image, the voice pane (Opus-over-WebSocket join UI: join/leave,
// mute, participant list with speaking indicators — js/voice.js owns the
// session, the room's DO fans the frames out), and the profile bits (avatar,
// custom status, logout, theme) in the user panel. Markdown is out of scope:
// bodies render as plain text — textContent only, never innerHTML with user
// data.
import { api, setCsrfToken } from "../api.js";
import {
  addTyping,
  expireTyping,
  mergeMessages,
  nextHistoryCursor,
  parseHash,
} from "../chat-store.js";
import { el, formatTimestamp, initials, validAccent } from "../dom.js";
import { createIcon, iconButton } from "../icons.js";
import {
  attachmentTooLarge,
  createPreview,
  isImageFile,
  renderAttachmentNode,
  revokePreview,
  sendMessageWithImage,
} from "../attachments.js";
import { state } from "../state.js";
import { createMascot, mascotMoment } from "../mascot.js";
import {
  openRulesDialog,
  openServerRulesMenu,
  readServerRules,
  rulesGateFromError,
  rulesGateFromFrame,
  rulesGatePending,
} from "../rules-dialog.js";
import { createChannelSocket, shouldSendTyping } from "../ws.js";
import { VOICE_COPY, createVoiceSession } from "../voice.js";
import { setSkinChoice, setThemeChoice } from "../theme.js";
import { openBackupCodesDialog } from "./backup-codes.js";
import {
  BLOCKED_VISITOR_ACK_KEY,
  boostProgress,
  coinBalanceLabel,

  friendsHubTabCounts,
  ignoredMembersHere,
  inviteCodeFromInput,
  memberDisplay,
  memberGroups,
  modDeskFilter,
  openQuickSwitcher,
  PRUNE_DAY_OPTIONS,
  readBlockedVisitorAcks,
  REACTION_PALETTE,
  reactionChips,
  readSpoilerAcks,
  SPOILER_ACK_KEY,
  socialActionCopy,
  socialMembersOf,
  socialRelationOf,
  socialVisibilityCopy,
  TIMEOUT_MINUTE_OPTIONS,
  toggleMyReaction,
  VERIFICATION_LEVEL_OPTIONS,
  wempoAccountsSignOutUrl,
  writeBlockedVisitorAck,
  writeSpoilerAck,
} from "../ui-helpers.js";
// Phase-3 name-only permission bits (mirrors api/permissions.mjs): the UI
// only ever CHECKS membership in the roster payload's `permissions` list —
// the integers are the server's authority, never the client's.
const SERVER_PERMISSION_NAMES = {
  MANAGE_CHANNELS: "MANAGE_CHANNELS",
  MANAGE_ROLES: "MANAGE_ROLES",
  KICK_MEMBERS: "KICK_MEMBERS",
  MANAGE_INVITES: "MANAGE_INVITES",
  DELETE_MESSAGES: "DELETE_MESSAGES",
  VIEW: "VIEW",
  SEND: "SEND",
  CONNECT: "CONNECT",
  SPEAK: "SPEAK",
  BYPASS_SLOWMODE: "BYPASS_SLOWMODE",
};

// The overwrite editor's tri-state vocabulary (channel-permissions guide):
// the bits a layer can explicitly allow or deny, in filed order.
const OVERWRITE_PERMISSION_NAMES = ["VIEW", "SEND", "CONNECT", "SPEAK"];

// The slowmode menu (slowmode FAQ): the values the gc_channels column stores.
const SLOWMODE_OPTIONS = [
  [0, "Off"],
  [900, "15 minutes"],
  [1800, "30 minutes"],
  [3600, "1 hour"],
  [7200, "2 hours"],
  [21600, "6 hours"],
];

const GC_MESSAGE_MAX = 2000;
const GC_TAGLINE_MAX = 80;
const HISTORY_PAGE = 50;
const HEARTBEAT_MS = 60000;

// Goober+ accent swatches (free-for-everyone perks): the site palette's own
// token values, offered as one-click picks next to the free hex input. The
// swatch fill is set through CSSOM only after validAccent() has passed the
// value, so nothing but strict lowercase hex ever reaches an inline style.
const ACCENT_PALETTE = [
  "#397357", // --green
  "#28583f", // --green-dark
  "#c65343", // --coral
  "#9c4035", // --coral-dark
  "#f3cf67", // --yellow
  "#c8e2e9", // --blue
  "#0758c9", // --focus
  "#245f49", // --link
  "#8b382e", // --link-hover
  "#87917e", // the quiet button's border tone
];
// WS-first sends: how long a pending row waits for settlement before the
// idempotent REST replay (same clientMessageId) confirms it — the DO excludes
// the sender's own socket from the msg fan-out, so a frame that never made it
// to persistence is repaired here instead of hanging forever.
const WS_SEND_FALLBACK_MS = 2500;
const LIST_REFRESH_MS = 30000;
// Voice-presence time grants (0011): one tick per connected window while the
// voice session is live. The server's grant rides the membership + caps inside
// its own SQL, so a spoofed tick stream earns exactly what honest time does.
const VOICE_COIN_TICK_MS = 600000;

// App-scoped caches — module-level so route re-renders keep their data.
const caches = {
  servers: null,
  conversations: null,
  presence: null,
  byChannel: new Map(), // channelId -> { messages, nextAfter }
  // Phase-3 roster payloads, serverId -> { viewer, roles, members } (the
  // member-list grouping, role colors, and the viewer's named permission
  // bits). Fetched on demand per server; invalidateServersCache clears it so
  // a fresh server join re-reads membership too.
  rosters: new Map(),
  // Goober Coins (0011): one standing /api/coins read the footer's balance
  // chip renders. Refreshed with the presence loop; a failed read keeps the
  // last known balance and just leaves the chip quiet.
  coins: null,

  // Phase-3 social: the friends hub payload (/api/friends) and the caller's
  // own block list (/api/blocks). The list is the SERVER-backed authority for
  // the block tier (the DM send gate refuses upstream); the ignore tier is
  // purely a client-side pref carried by the same rows — the hiding logic
  // reads these caches, exactly per the filed "client-side checks against the
  // loaded list".
  social: null,
  blocks: null,
};

// viewerCan(viewer, name): the UI-side permission check — the owner bypasses
// everything, everyone else needs the named bit in the roster payload.
function viewerCan(viewer, permissionName) {
  if (!viewer) return false;
  if (viewer.owner) return true;
  return Array.isArray(viewer.permissions) && viewer.permissions.includes(permissionName);
}

// channelPerm(channel, viewer, name): the per-channel effective check. The
// list payload carries the viewer's effective permissions per channel ONLY
// when the server layers any overwrites — absent that, the pre-0007 implicit
// base (VIEW/SEND for every member) is the whole answer, and the owner
// bypasses everything either way.
function channelPerm(channel, viewer, permissionName) {
  if (viewerCan(viewer, permissionName)) return true;
  const names = channel?.effectivePermissions;
  if (Array.isArray(names)) return names.includes(permissionName);
  return permissionName === "VIEW" || permissionName === "SEND";
}

// channelSlowmode(channel, viewer): the channel's cooldown for THIS viewer —
// 0 unless the column carries one AND the viewer doesn't bypass it. The
// owner and the moderation-class bit holders don't wait out the cooldown
// (the server enforces the same bypass; the client copy is the affordance).
function channelSlowmode(channel, viewer) {
  const seconds = Number(channel?.slowmodeSeconds) || 0;
  if (seconds <= 0) return 0;
  if (!viewer) return seconds;
  if (viewer.owner) return 0;
  const bits = Array.isArray(viewer.permissions) ? viewer.permissions : [];
  if (bits.includes("KICK_MEMBERS") || bits.includes("BYPASS_SLOWMODE")) return 0;
  return seconds;
}

let activeView = null; // the current shell render's live references + socket

// Voice state sits ABOVE route navigation on purpose: the voice session (its
// own WS to the voice channel's ChatRoom DO) must survive text-channel
// switches and server hops, so it is never tied to activeView.
let voiceSession = null;
let voiceStatus = "idle";
let voiceError = "";

const iconFor = {
  text: "hash",
  voice: "speaker",
  dm: "at-sign",
  group: "users",
};

// --- shell -------------------------------------------------------------------

// The keyboard-shortcut surface (checklist's top shortcut): Ctrl/⌘ + K opens
// the quick switcher. Bound ONCE per app-shell render on the module flag — the
// listener rides window, not the re-created shell DOM, so route re-renders
// must not stack duplicates. The review/discover standalone pages never bind
// it.
let quickSwitcherBound = false;

function bindQuickSwitcher(doc, win) {
  if (quickSwitcherBound) return;
  quickSwitcherBound = true;
  win.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey &&
      String(event.key).toLowerCase() === "k") {
      event.preventDefault();
      openQuickSwitcher(doc, win, {
        servers: caches.servers || [],
        conversations: caches.conversations || [],
        // The "recent channel" bounce: remember where the user was before the
        // switcher opened so an Esc close returns them there.
        previousHash: win.location.hash,
        // Voice picks are JOIN targets (the same path the sidebar rows use),
        // never navigations.
        onVoiceJoin: ({ channelId }) => {
          const channel = (caches.servers || [])
            .flatMap((server) => server.channels || [])
            .find((entry) => entry.id === channelId && entry.kind === "voice");
          if (channel) startVoiceJoin(doc, win, channel);
        },
      });
    }
  });
}

export function renderAppPage(doc, win, route) {
  const app = doc.getElementById("app");

  const rail = el("nav", { class: "gc-rail", "aria-label": "Servers" });
  const sidebar = el("div", { class: "gc-sidebar" });
  const main = el("main", { class: "gc-main" });
  const aside = el("aside", { class: "gc-aside", "aria-label": "Presence and voice" });

  // The aside is always present at >=720px; narrow screens overlay it.
  const grid = el("div", { class: "gc-app has-aside" },
    rail, sidebar, main, aside,
  );
  app.replaceChildren(grid);

  bindQuickSwitcher(doc, win);
  renderRail(doc, win, rail, route);
  renderSidebar(doc, win, sidebar, route);
  renderAside(doc, win, aside, route);
  renderMain(doc, win, main, route);

  // Background refresh: unread badges + presence. One module-level timer —
  // channel switches tear channel-scoped timers down, so this one lives above
  // them and re-reads the route hash each tick.
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => void refreshLoop(doc, win), LIST_REFRESH_MS);
  void refreshLoop(doc, win);
}

// --- background data loop ------------------------------------------------------

let refreshTimer = 0;

// Goober Coins (0011): one standing /api/coins read consumed by the footer's
// balance chip. A failed read is silent — the chip keeps the last count (or
// waits empty), exactly the graceful default the other loop reads ride.
async function refreshCoins(doc, win) {
  try {
    caches.coins = await api("/api/coins");
  } catch {
    // Keep the stale cache; the chip stays as-is until the next tick.
  }
  if (caches.coins) rerenderUserPanel(doc, win);
}

async function refreshLoop(doc, win) {
  // The server rail list: fetched once, then only re-rendered on explicit
  // creates (refreshServersAndRerender).
  if (caches.servers === null) {
    try {
      caches.servers = (await api("/api/servers")).servers || [];
    } catch {
      // Keep null and retry next tick; the shell stays usable without it.
    }
    if (activeView) {
      const current = parseHash(globalThis.location.hash);
      const rail = doc.querySelector(".gc-rail");
      const sidebar = doc.querySelector(".gc-sidebar");
      if (rail?.isConnected) renderRail(doc, doc.defaultView, rail, current);
      if (sidebar?.isConnected) renderSidebar(doc, doc.defaultView, sidebar, current);
    }
  }
  try {
    caches.conversations = (await api("/api/conversations")).conversations || [];
  } catch {
    // Keep the stale list; the loop re-tries (the conversations route lands
    // with Task 7's merge).
  }
  try {
    caches.presence = (await api("/api/presence")).online || [];
  } catch {
    // Ditto (Task 9's merge).
  }
  await refreshCoins(doc, win);

  // Phase-3 social: the hub payload + the caller's own block list. A refusal
  // keeps the stale cache — the social surfaces degrade to "loading" rather
  // than to wrong data.
  try {
    caches.social = await api("/api/friends");
  } catch {
    // Stale/absent friends: the hub renders its empty state.
  }
  try {
    caches.blocks = (await api("/api/blocks")).blocked || [];
  } catch {
    // Stale/absent blocks: the hiding logic simply reveals (never hides a row
    // it cannot see).
  }
  // The blocked-in-shared-space alert (the filed one-time leave-or-stay
  // notice): the ACTIVE group DM containing a member the viewer BLOCKED
  // raises it once, ever — the ack lands in localStorage BEFORE the dialog
  // resolves, so a leave-or-stay never re-asks. Silent to the other party at
  // every step (the notice says the same to nobody).
  if (caches.social && caches.blocks && activeView) {
    const visitRoute = parseHash(win.location.hash);
    const conversation = (caches.conversations || []).find(
      (entry) => Number(entry.id) === Number(visitRoute.channelId) && entry.kind === "group",
    );
    const visitors = conversation ? blockedVisitorsIn(conversation, caches.blocks) : [];
    if (visitors.length > 0 && !readBlockedVisitorAcks(win.localStorage).has(Number(conversation.id))) {
      writeBlockedVisitorAck(win.localStorage, conversation.id);
      openBlockedVisitorDialog(doc, win, conversation, visitors);
    }
  }
  if (!activeView) return;

  const current = parseHash(win.location.hash);
  if (current.serverId === null) {
    const scroll = doc.querySelector(".gc-sidebar .gc-sidebar-scroll");
    if (scroll) renderConversationList(doc, win, scroll, current);
    // The friends-hub main pane shows the same list; keep its cards fresh
    // (a #/c/<id> DM is NOT the hub — loadChannel owns that pane).
    const hub = doc.querySelector(".friends-hub-list");
    if (hub?.isConnected && current.channelId === null) {
      const main = doc.querySelector(".gc-main");
      if (main) renderMain(doc, win, main, current);
    }
  }
  if (activeView) {
    const aside = doc.querySelector(".gc-aside");
    if (aside?.isConnected) renderAside(doc, win, aside, current);
  }
  // The footer's presence dot reads the refreshed hub snapshot.
  if (caches.presence) rerenderUserPanel(doc, win);
}

// --- data refresh entry used by dialogs --------------------------------------

let rosterInflight = new Map(); // serverId -> Promise (one fetch at a time)

// ensureRoster(serverId): fetch the phase-3 roster payload once per server
// visit and re-render the chrome that consumes it (sidebar affordances +
// member list). Failures stay quiet — the shell renders today's un-grouped
// layout without it, the graceful default.
async function ensureRoster(doc, win, serverId) {
  if (caches.rosters.has(serverId)) return caches.rosters.get(serverId);
  if (rosterInflight.has(serverId)) return rosterInflight.get(serverId);

  const pending = (async () => {
    try {
      const payload = await api("/api/servers/" + serverId + "/roster");
      caches.rosters.set(serverId, payload);
    } catch {
      // No payload: affordances ride the plain owner/moderator checks below.
    } finally {
      rosterInflight.delete(serverId);
    }
    const route = parseHash(win.location.hash);
    if (route.serverId === serverId) renderServersChrome(doc, win);
    const aside = doc.querySelector(".gc-aside");
    if (aside?.isConnected && route.serverId === serverId) {
      renderAside(doc, win, aside, route);
    }
    // An open channel in this server re-renders its rows so chat names pick
    // up the role colors/nicknames the roster just landed with.
    if (activeView && activeView.channelId !== null && route.serverId === serverId &&
        findChannelContext(activeView.channelId)?.server?.id === serverId) {
      renderMessages(doc, win, false, null);
    }
    return caches.rosters.get(serverId) || null;
  })();
  rosterInflight.set(serverId, pending);
  return pending;
}

// currentRoster(serverId) -> the cached payload or null (never a fetch —
// pure over the caches so a mid-render call stays synchronous).
function currentRoster(serverId) {
  return caches.rosters.get(serverId) || null;
}

// The viewer's roster record for one user id, when the roster is loaded.
function rosterMember(serverId, userId) {
  return (currentRoster(serverId)?.members || [])
    .find((member) => Number(member.id) === Number(userId)) || null;
}

export async function refreshServersAndRerender(doc, win, route) {
  try {
    caches.servers = (await api("/api/servers")).servers || [];
  } catch {
    // Keep the stale list.
  }
  const rail = doc.querySelector(".gc-rail");
  const sidebar = doc.querySelector(".gc-sidebar");
  if (rail) renderRail(doc, win, rail, route);
  if (sidebar) renderSidebar(doc, win, sidebar, route);
}

// --- server rail --------------------------------------------------------------

// The boost badge: the sparkle + count pair that rides boosted rail buttons
// and server headers. Decorative icon, the count stays text.
function boostBadge(doc, boosts) {
  const badge = el("span", {
    class: "server-boost-badge",
    text: String(Number(boosts) > 99 ? "99+" : Number(boosts)),
    "aria-hidden": "true",
  });
  badge.prepend(createIcon(doc, "sparkles"));
  return badge;
}

// Re-render only the rail and the sidebar chrome (no refetch): the boost
// dialog updates caches.servers itself from the response before calling this.
function renderServersChrome(doc, win) {
  if (!doc.querySelector(".gc-app")) return;
  const route = parseHash(win.location.hash);
  const rail = doc.querySelector(".gc-rail");
  const sidebar = doc.querySelector(".gc-sidebar");
  if (rail?.isConnected) renderRail(doc, win, rail, route);
  if (sidebar?.isConnected) renderSidebar(doc, win, sidebar, route);
}

function renderRail(doc, win, rail, route) {
  const home = iconButton(doc, "home", {
    className: "server-button server-home" + (route.serverId === null ? " active-home" : ""),
    ariaLabel: "Direct messages",
  });
  home.addEventListener("click", () => {
    win.location.hash = "#/";
  });

  rail.replaceChildren(home, el("div", { class: "rail-spacer", role: "separator" }));

  for (const server of caches.servers || []) {
    const boosted = Number(server.boosts) > 0;
    const button = el("button", {
      class: "server-button" + (boosted ? " server-boosted" : ""),
      type: "button",
      "aria-label": server.name,
      title: server.name,
      "aria-current": route.serverId === server.id ? "true" : "false",
      text: initials(server.name),
    });
    // Iconed servers render their media filling the round button (the initials
    // stay underneath as the fallback: an icon only serves to its uploader
    // until a reviewer approves it, so everyone else's <img> 404s and the
    // initials remain — see attachments.js's gated <img> handling).
    if (server.iconUrl) {
      const image = el("img", { class: "server-icon", src: server.iconUrl, alt: "" });
      image.addEventListener("error", () => image.remove());
      button.append(image);
    }
    if (boosted) {
      button.append(boostBadge(doc, server.boosts));
    }
    button.addEventListener("click", () => {
      win.location.hash = "#/s/" + server.id;
    });
    rail.append(button);
  }

  // Discovery (before the create "+" button, after the server list).
  const discover = iconButton(doc, "magnifier", {
    ariaLabel: "Discover servers",
    className: "server-button",
  });
  discover.addEventListener("click", () => {
    win.location.hash = "#/discover";
  });
  rail.append(discover);

  // Goober Coins (0011): the blaxel shop tile — balance, the daily claim, and
  // the Goober+ bundle (one bundle; boosts stay free). Earned only by
  // activity; nothing here is ever purchased.
  const shop = iconButton(doc, "coin", {
    ariaLabel: "Goober Shop",
    className: "server-button server-button-coin",
  });
  shop.addEventListener("click", () => {
    win.location.hash = "#/shop";
  });
  rail.append(shop);

  const create = iconButton(doc, "plus", {
    ariaLabel: "Create or join a server",
    className: "server-button",
  });
  create.addEventListener("click", () => createOrJoinServerDialog(doc, win));
  rail.append(create);
}

// --- server icon picker (shared by the create + settings dialogs) ---------------

// The moderation note every icon surface carries: an icon uploads as a plain
// attachment, so it is PENDING until a reviewer approves it — the owner's
// session renders it (the media route serves pending rows to their uploader),
// every other member keeps the initials until then.
const SERVER_ICON_NOTE =
  "Icons go through attachment review: you see yours right away; members keep " +
  "seeing the server's initials until a reviewer approves it.";

// One round icon preview + upload button, shared by the create-server and
// server-settings dialogs. The preview shows the picked file instantly (an
// <object-URL>, revoked on release); `file()` returns the chosen File for the
// caller's multipart PATCH, or null. The client checks mirror the composer's
// pre-checks only — the server's intake (magic bytes + the 5 MiB cap) is the
// authority.
function buildServerIconPicker(doc, { label, initialIconUrl, initialsText }) {
  const preview = el("span", {
    class: "server-icon-preview",
    "aria-hidden": "true",
    text: initialsText || "?",
  });
  if (initialIconUrl) {
    preview.replaceChildren(el("img", { src: initialIconUrl, alt: "" }));
  }

  let picked = null;
  const fileInput = el("input", {
    type: "file",
    accept: "image/*",
    class: "visually-hidden",
    "aria-hidden": "true",
    tabindex: "-1",
  });
  const choose = el("button", { class: "button button-quiet", type: "button", text: label });
  const error = el("p", { class: "muted list-note", role: "alert" });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    if (!isImageFile(file)) {
      error.textContent = "Only images can be server icons (JPEG, PNG, WebP, GIF).";
      return;
    }
    if (attachmentTooLarge(file.size)) {
      error.textContent = "Images must be 5 MiB or smaller.";
      return;
    }
    error.textContent = "";
    revokePreview(picked);
    picked = createPreview(file);
    preview.replaceChildren(el("img", { src: picked.url, alt: "" }));
  });

  choose.addEventListener("click", () => fileInput.click());

  const controls = el("div", { class: "server-icon-picker-controls" }, choose, error);
  const node = el("div", { class: "server-icon-picker" }, preview, controls, fileInput);

  return {
    node,
    controls,
    file: () => picked?.file || null,
    release: () => {
      revokePreview(picked);
      picked = null;
    },
  };
}

// Sign-up polish (checklist): Discord's green "+" offers BOTH paths — create
// a server, or join one with an invite code. The join half reuses the
// #/join/CODE route (signed-in: discover.js's renderJoinRoute runs the join
// API and lands in the server), so this dialog never talks to the join
// endpoint itself.
function createOrJoinServerDialog(doc, win) {
  const codeInput = el("input", {
    type: "text",
    id: "join-invite-code",
    placeholder: "#/join/AbC_dE-f",
    "aria-label": "Invite code or link",
    spellcheck: "false",
    autocomplete: "off",
  });
  const joinError = el("p", { class: "error-copy", role: "alert" });

  const create = el("button", {
    class: "button button-secondary create-or-join-option",
    type: "button",
  });
  create.append(
    el("span", { class: "create-or-join-head" }, createIcon(doc, "plus"), el("span", { text: "Create a server" })),
    el("span", { class: "muted", text: "Start fresh — you become its owner." }),
  );
  create.addEventListener("click", () => {
    dialog.close();
    createServerDialog(doc, win);
  });

  const goJoin = () => {
    joinError.textContent = "";
    const code = inviteCodeFromInput(codeInput.value);
    if (!code) {
      joinError.textContent = "Paste an invite link or a 4+ character code.";
      return;
    }
    dialog.close();
    win.location.hash = "#/join/" + code;
  };
  codeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      goJoin();
    }
  });

  const joinButton = el("button", {
    class: "button button-primary",
    type: "button",
    text: "Join",
  });
  joinButton.addEventListener("click", goJoin);

  const dialog = el("dialog", {},
    el("h2", { text: "Add a server" }),
    el("div", { class: "create-or-join" },
      create,
      el("div", { class: "form-field invite-join-field" },
        el("label", { for: "join-invite-code", text: "Join a server — invite link or code" }),
        codeInput,
        joinError,
      ),
    ),
    el("div", { class: "form-actions" },
      el("button", { class: "button button-quiet", type: "button", text: "Cancel", onclick: () => dialog.close() }),
      joinButton,
    ),
  );
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  doc.body.append(dialog);
  dialog.showModal();
  codeInput.focus();
}

function createServerDialog(doc, win) {
  const nameInput = el("input", { type: "text", maxlength: "100", required: "", id: "server-name" });
  const iconPicker = buildServerIconPicker(doc, {
    label: "Upload an icon (optional)",
    initialIconUrl: null,
    initialsText: "?",
  });
  const error = el("p", { class: "error-strip", role: "alert" });
  const cancel = el("button", { class: "button button-quiet", type: "button", text: "Cancel" });
  const dialog = el("dialog", {},
    el("h2", { text: "Create a server" }),
    el("form", { novalidate: "" },
      iconPicker.node,
      el("p", { class: "muted list-note", text: SERVER_ICON_NOTE }),
      el("div", { class: "form-field" },
        el("label", { for: "server-name", text: "Server name" }),
        nameInput,
      ),
      error,
      el("div", { class: "form-actions" },
        cancel,
        el("button", { class: "button button-primary", type: "submit", text: "Create" }),
      ),
    ),
  );
  dialog.addEventListener("close", () => {
    iconPicker.release();
    dialog.remove();
  });

  cancel.addEventListener("click", () => dialog.close());
  dialog.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    try {
      const result = await api("/api/servers", {
        method: "POST",
        body: { name: String(nameInput.value || "").trim() },
      });

      // The optional icon is a FOLLOW-UP multipart PATCH: the create stays
      // one atomic batch (server + membership + #general), and an icon that
      // trips the intake only surfaces a note — the server already exists.
      const iconFile = iconPicker.file();
      if (iconFile) {
        dialog.close();
        const form = new FormData();
        form.append("image", iconFile, iconFile.name || "icon.png");
        try {
          await api("/api/servers/" + result.server.id, { method: "PATCH", body: form });
        } catch (caught) {
          showTransientError(
            doc,
            "The server is ready, but its icon could not be uploaded: " +
              (caught?.message || "the upload was refused."),
          );
        }
        win.location.hash = "#/s/" + result.server.id;
        refreshServersAndRerender(doc, win, { serverId: result.server.id, channelId: null });
        return;
      }

      caches.servers = null;
      dialog.close();
      win.location.hash = "#/s/" + result.server.id;
      refreshServersAndRerender(doc, win, { serverId: result.server.id, channelId: null });
    } catch (caught) {
      error.textContent = caught?.message || "The server could not be created.";
    }
  });

  doc.body.append(dialog);
  dialog.showModal();
  nameInput.focus();
}

// --- server settings (owner-only) -----------------------------------------------

function openServerSettingsDialog(doc, win, serverId) {
  const server = (caches.servers || []).find((entry) => entry.id === serverId) ?? null;
  const originalName = server?.name || "";
  // The verification level the owner last picked (0008): zero (or a
  // pre-0008 payload shape without the column) is the same "None".
  const originalVerification = Number(server?.verificationLevel) || 0;

  const nameInput = el("input", {
    type: "text",
    maxlength: "100",
    required: "",
    id: "server-settings-name",
    value: originalName,
  });

  // The server-wide verification select (filed labels): a send + voice-join
  // gate the owner turns on or off here, owner-only per the filed "SERVER-WIDE
  // one column; owner call" reading.
  const verificationSelect = el("select", { id: "server-settings-verification" });
  for (const [value, label] of VERIFICATION_LEVEL_OPTIONS) {
    const option = el("option", { value: String(value), text: label });
    if (value === originalVerification) option.selected = true;
    verificationSelect.append(option);
  }
  const iconPicker = buildServerIconPicker(doc, {
    label: "Upload an icon",
    initialIconUrl: server?.iconUrl || null,
    initialsText: initials(originalName),
  });

  // The rules gate's owner edit (0012): a textarea over the document, the
  // existing settings idiom. The member-only rules read carries the CURRENT
  // text (a blank field on a gate-off server just stays blank), and an empty
  // field at save time CLEARS the rules — the gate's OFF state.
  const rulesInput = el("textarea", {
    id: "server-settings-rules",
    maxlength: "20000",
    rows: "8",
  });
  let originalRules = "";
  if (server?.hasRules) {
    void readServerRules(serverId).then((loaded) => {
      // The read also confirms the owner is a member (they always are); a
      // refused read just leaves the field blank-and-unchanged.
      const rules = loaded !== null && typeof loaded.rules === "string" ? loaded.rules : "";
      originalRules = rules;
      if (!rulesChangedManually) rulesInput.value = rules;
    });
  }
  let rulesChangedManually = false;
  rulesInput.addEventListener("input", () => {
    rulesChangedManually = true;
  });

  // Clearing the icon: a JSON PATCH with iconMediaId null. Only offered while
  // an icon is set; a picked (unsaved) file releases first so nothing
  // half-chosen wins over the explicit remove.
  const removeIcon = el("button", {
    class: "button button-quiet",
    type: "button",
    text: "Remove icon",
    hidden: server?.iconUrl ? undefined : "",
  });
  iconPicker.controls.append(removeIcon);

  const error = el("p", { class: "error-strip", role: "alert" });
  const cancel = el("button", { class: "button button-quiet", type: "button", text: "Cancel" });
  const dialog = el("dialog", {},
    el("h2", { text: "Server settings" }),
    el("form", { novalidate: "" },
      iconPicker.node,
      el("p", { class: "muted list-note", text: SERVER_ICON_NOTE }),
      el("div", { class: "form-field" },
        el("label", { for: "server-settings-name", text: "Server name" }),
        nameInput,
      ),
      el("div", { class: "form-field" },
        el("label", { for: "server-settings-verification", text: "Verification level" }),
        verificationSelect,
        el("p", {
          class: "muted list-note",
          text: "Gates sending and joining voice for accounts/members younger than the level. Owner and moderators bypass it.",
        }),
      ),
      el("div", { class: "form-field" },
        el("label", { for: "server-settings-rules", text: "Server rules" }),
        rulesInput,
        el("p", {
          class: "muted list-note",
          text: "Members must accept these rules before they can send, react, or join voice. Empty clears them (the gate turns off).",
        }),
      ),
      error,
      el("div", { class: "form-actions" },
        cancel,
        el("button", {
          class: "button button-quiet",
          type: "button",
          text: "Roles…",
          onclick: () => openRolesDialog(doc, win, serverId),
        }),
        el("button", { class: "button button-primary", type: "submit", text: "Save" }),
      ),
    ),
  );
  dialog.addEventListener("close", () => {
    iconPicker.release();
    dialog.remove();
  });

  removeIcon.addEventListener("click", async () => {
    error.textContent = "";
    try {
      await api("/api/servers/" + serverId, {
        method: "PATCH",
        body: { iconMediaId: null },
      });
      iconPicker.release();
      removeIcon.hidden = true;
      iconPicker.node.querySelector(".server-icon-preview").textContent =
        initials(originalName);
      refreshServersAndRerender(doc, win, parseHash(win.location.hash));
    } catch (caught) {
      error.textContent = caught?.message || "The icon could not be removed.";
    }
  });

  cancel.addEventListener("click", () => dialog.close());
  dialog.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";

    const name = String(nameInput.value || "").trim();
    if (!name) {
      error.textContent = "Server name must be between 1 and 100 characters.";
      return;
    }

    const iconFile = iconPicker.file();
    // The verification level rides the same JSON PATCH only when it moved
    // (the ladder values are ints; the select's options are strings).
    const chosenVerification = Number(verificationSelect.value) || 0;
    const verificationChanged = chosenVerification !== originalVerification;

    // The rules document (0012) rides the same PATCH when it moved: a
    // non-empty field sets the text, an empty one clears it (rules_text
    // null → the gate OFF).
    const nextRules = String(rulesInput.value || "").trim();
    const rulesChanged = nextRules !== originalRules;
    if (nextRules.length > 20000) {
      error.textContent = "The rules must be 20000 characters or fewer.";
      return;
    }
    const rulesBody = rulesChanged
      ? { rules_text: nextRules === "" ? null : nextRules }
      : {};

    if (name === originalName && !iconFile && !verificationChanged && !rulesChanged) {
      // Nothing changed; the dialog just closes.
      dialog.close();
      return;
    }

    try {
      if (iconFile) {
        // Multipart PATCH: the icon runs the attachment intake (pending
        // moderation), and an accompanying rename rides the same request.
        const form = new FormData();
        if (name !== originalName) form.append("name", name);
        form.append("image", iconFile, iconFile.name || "icon.png");
        await api("/api/servers/" + serverId, { method: "PATCH", body: form });
        // Rules are JSON-only (like is_public/verification), so a moved rules
        // field rides a follow-up owner PATCH in the same submit.
        if (rulesChanged) {
          await api("/api/servers/" + serverId, { method: "PATCH", body: rulesBody });
        }
      } else if (verificationChanged) {
        await api("/api/servers/" + serverId, {
          method: "PATCH",
          body: { verification_level: chosenVerification, ...rulesBody },
        });
      } else {
        await api("/api/servers/" + serverId, { method: "PATCH", body: { name, ...rulesBody } });
      }
      iconPicker.release();
      dialog.close();
      refreshServersAndRerender(doc, win, parseHash(win.location.hash));
    } catch (caught) {
      error.textContent = caught?.message || "The server could not be updated.";
    }
  });

  doc.body.append(dialog);
  dialog.showModal();
  nameInput.focus();
}

// --- channel sidebar -----------------------------------------------------------

// The boost progress pill (checklist: "boosts count / goal, milestone labels")
// — display only, styled from the perks tokens. The fill width rides CSSOM
// with a clamped percentage string (the same discipline as the accent swatch:
// nothing unvalidated ever reaches an inline style). Shows once the server has
// boosted or the viewer owns it; a zero-count member server stays quiet.
function boostProgressNode(doc, server) {
  if (!server) return null;
  const boosted = Number(server.boosts) > 0;
  if (!boosted && server.role !== "owner") return null;
  const progress = boostProgress(server.boosts);

  const fill = el("span", { class: "server-boost-fill", "aria-hidden": "true" });
  const percent = Math.max(0, Math.min(100, Math.round((progress.value / progress.goal) * 100)));
  fill.style.width = percent + "%";

  const node = el("div", {
    class: "server-boost-progress",
    title: progress.title,
    role: "img",
    "aria-label": progress.title,
  }, el("span", { class: "server-boost-bar", "aria-hidden": "true" }, fill));
  node.append(
    createIcon(doc, "sparkles"),
    el("span", { class: "server-boost-count", text: progress.label }),
  );
  return node;
}

// Channel categories (0007): real gc_channel_categories folders when the
// server has them, with the EXISTING text/voice fallback grouping when it
// doesn't (a no-categories server renders exactly as before). Collapse state
// persists in localStorage keyed by category id ("folder empty → deleted"
// makes a session-scoped store the wrong memory anyway).
const COLLAPSED_KEY = "goober-collapsed-categories";

function readCollapsedCategories(win) {
  try {
    const raw = win.localStorage.getItem(COLLAPSED_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeCollapsedCategories(win, collapsed) {
  try {
    win.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  } catch {
    // Best effort; the caret state is per-page otherwise.
  }
}

// The text/voice fallback keys share the same store as the category ids —
// they never collide (ids are numbers).
const FALLBACK_CATEGORY_KEYS = ["text", "voice"];

function renderSidebar(doc, win, sidebar, route) {
  const head = el("div", { class: "gc-sidebar-head" });
  const scroll = el("div", { class: "gc-sidebar-scroll" });
  const userPanel = el("div", { class: "user-panel" });

  sidebar.replaceChildren(head, scroll, userPanel);

  const server = (caches.servers || []).find((entry) => entry.id === route.serverId) ?? null;

  if (route.serverId !== null) {
    const roster = currentRoster(route.serverId);
    const viewer = roster?.viewer || null;
    const boosted = Number(server?.boosts) > 0;
    head.append(
      el("h2", {
        class: boosted ? "server-boosted" : "",
        text: server?.name || "Unknown server",
      }),
      el("span", { class: "head-spacer" }),
    );

    // Invite people (every member can mint an invite link — the server keeps
    // the MANAGE_INVITES extension server-side; the button stays universal).
    const invite = iconButton(doc, "person", { ariaLabel: "Invite people" });
    invite.addEventListener("click", () => inviteDialog(doc, win, route.serverId));
    head.append(invite);

    // Public/Private toggle (owner only): flips is_public via PATCH.
    if (server?.role === "owner") {
      head.append(visibilityToggleButton(doc, win, route.serverId, server?.isPublic === true));
    }

    // Create a channel: owner or moderator (yesterday's behavior) — the
    // roster's viewer block extends it to MANAGE_CHANNELS role holders once
    // loaded (graceful default: without a roster, nothing changes).
    if (server?.role === "owner" || server?.role === "moderator" ||
        viewerCan(viewer, SERVER_PERMISSION_NAMES.MANAGE_CHANNELS)) {
      const channelCreate = iconButton(doc, "plus", { ariaLabel: "Create a channel" });
      channelCreate.addEventListener("click", () => createChannelDialog(doc, win, route.serverId));
      head.append(channelCreate);
      // And its folder: the category-create affordance rides the same
      // MANAGE_CHANNELS authority (0007).
      const categoryCreate = iconButton(doc, "folder", { ariaLabel: "Add a category" });
      categoryCreate.addEventListener("click", () =>
        createCategoryDialog(doc, win, route.serverId));
      head.append(categoryCreate);
    }

    // The rules gate (0012): a scroll button rides the head ONLY when the
    // owner has set a rules document — the re-readable-anytime menu entry
    // (the member reads without an error in front of them).
    if (server?.hasRules) {
      const rulesButton = iconButton(doc, "scroll", {
        ariaLabel: "Server rules",
        className: "icon-button button-quiet",
      });
      rulesButton.addEventListener("click", () => {
        void openServerRulesMenu(doc, route.serverId, {
          // A fresh accept clears the member's own pending flag from the
          // cached list payload without the full refresh the settings flow
          // needs (the payload's rulesAccepted feeds nothing else live).
          onAccepted: () => {
            if (server && server.rulesAccepted === false) {
              server.rulesAccepted = true;
            }
          },
        });
      });
      head.append(rulesButton);
    }

    // Roles (phase-3): the shield opens the roles dialog — owner or any
    // MANAGE_ROLES holder. The owner's settings dialog embeds it too.
    if (server?.role === "owner" || viewerCan(viewer, SERVER_PERMISSION_NAMES.MANAGE_ROLES)) {
      const roles = iconButton(doc, "shield", {
        ariaLabel: "Server roles",
        className: "icon-button button-quiet",
      });
      roles.addEventListener("click", () => openRolesDialog(doc, win, route.serverId));
      head.append(roles);
    }

    // Owner-only server settings: rename + icon, the Discord-style gear in the
    // channel sidebar head.
    if (server?.role === "owner") {
      const settings = iconButton(doc, "gear", {
        ariaLabel: "Server settings",
        className: "icon-button button-quiet",
      });
      settings.addEventListener("click", () =>
        openServerSettingsDialog(doc, win, route.serverId));
      head.append(settings);
    }

    if (boosted) {
      head.append(boostBadge(doc, server.boosts));
    }
    const progress = boostProgressNode(doc, server);
    if (progress) head.append(progress);
    renderChannelList(doc, win, scroll, route, server);
    // The roster (member grouping + role colors) loads in the background and
    // re-renders this chrome when it lands.
    void ensureRoster(doc, win, route.serverId);
  } else {
    head.append(el("h2", { text: "Direct Messages" }));
    renderConversationList(doc, win, scroll, route);
  }

  renderUserPanel(doc, win, userPanel);
}

function renderChannelList(doc, win, scroll, route, server) {
  const collapsed = readCollapsedCategories(win);
  const roster = currentRoster(route.serverId);
  const viewer = roster?.viewer || null;
  const manageChannels = server?.role === "owner" || server?.role === "moderator" ||
    viewerCan(roster?.viewer, SERVER_PERMISSION_NAMES.MANAGE_CHANNELS);
  const spoilerAcks = readSpoilerAcks(win.localStorage);
  const options = { manageChannels, spoilerAcks, viewer };
  const channels = server?.channels || [];
  const categories = server?.categories || [];

  const wrapper = el("div", { class: "channel-categories" });

  if (categories.length > 0) {
    // The real category model (0007): an unlabeled pocket for the not-yet-
    // filed channels, then every category folder in position order. A TEXT
    // channel this viewer cannot VIEW VANISHES from the list (the filed UX
    // detail); a denied VOICE channel stays visible — its Join is what
    // refuses at the door, not the sidebar's silence.
    const filed = channels.filter((channel) => channel.categoryId !== undefined && channel.categoryId !== null);
    const pocket = channels.filter((channel) => channel.categoryId === undefined || channel.categoryId === null);
    const visibleGroup = (groupChannels, key) => groupChannels
      .filter((channel) => channel.kind !== "text" || channelPerm(channel, viewer, "VIEW"));
    const pocketGroup = visibleGroup(pocket, "pocket");
    if (pocketGroup.length > 0) {
      const group = el("div", { class: "channel-category" });
      for (const channel of pocketGroup) group.append(channelRow(doc, win, channel, route, options));
      wrapper.append(group);
    }
    for (const category of categories) {
      const key = "cat-" + Number(category.id);
      const groupChannels = visibleGroup(
        filed.filter((channel) => Number(channel.categoryId) === Number(category.id)), key,
      );
      const isCollapsed = collapsed.has(key);
      wrapper.append(categoryGroup(doc, win, {
        key, label: category.name, channels: groupChannels,
      }, route, collapsed, isCollapsed, options));
    }
    scroll.replaceChildren(wrapper);
    return;
  }

  // The no-categories fallback: the pre-0007 text/voice pairing, byte for byte.
  const groups = [
    { key: "text", label: "Text channels", channels: channels.filter((c) => c.kind === "text") },
    { key: "voice", label: "Voice channels", channels: channels.filter((c) => c.kind === "voice") },
  ];
  for (const category of groups) {
    const isCollapsed = collapsed.has(category.key);
    wrapper.append(categoryGroup(doc, win, category, route, collapsed, isCollapsed, options));
  }
  scroll.replaceChildren(wrapper);
}

// One collapsible category group: a caret button header plus the rows. The
// rows drop out of the DOM when collapsed (no hidden-but-focusable buttons).
function categoryGroup(doc, win, category, route, collapsed, isCollapsed, options) {
  const group = el("div", { class: "channel-category" });
  const caret = el("span", { class: "category-caret", "aria-hidden": "true" });
  caret.append(createIcon(doc, "caret-down"));
  const header = el("button", {
    class: "category-header sidebar-label" + (isCollapsed ? " category-collapsed" : ""),
    type: "button",
    "aria-expanded": isCollapsed ? "false" : "true",
    "aria-label": (isCollapsed ? "Expand " : "Collapse ") + category.label.toLowerCase(),
    text: category.label + " (" + category.channels.length + ")",
  });
  header.prepend(caret);
  header.addEventListener("click", () => {
    if (collapsed.has(category.key)) collapsed.delete(category.key);
    else collapsed.add(category.key);
    writeCollapsedCategories(win, collapsed);
    const scrollHost = doc.querySelector(".gc-sidebar .gc-sidebar-scroll");
    if (scrollHost) renderChannelList(doc, win, scrollHost, route, caches.servers?.find((s) => s.id === route.serverId));
  });
  group.append(header);

  if (isCollapsed) return group;

  if (category.channels.length === 0) {
    group.append(el("p", { class: "muted list-note", text: "Nothing here yet." }));
  }
  for (const channel of category.channels) {
    group.append(channelRow(doc, win, channel, route, options));
  }
  return group;
}

// One channel row. Spoiler channels (phase-3) render grayed until this
// browser has acknowledged the notice (localStorage ack, per the filed
// spec); the FIRST entry of an un-acknowledged spoiler shows the notice
// dialog (name + topic, "View it anyway"/"Go back") and only navigates
// through "View it anyway". A channel-settings gear rides rows the viewer
// can manage (owner OR MANAGE_CHANNELS): the spoiler toggle.
function channelRow(doc, win, channel, route, options) {
  const isVoice = channel.kind === "voice";
  // The voice asymmetry (filed): a denied voice channel STAYS in the sidebar
  // (its people are why you'd linger) — the row just renders locked, and the
  // join refuses at the door. A denied TEXT channel never reaches this call.
  const connectLocked = isVoice && !channelPerm(channel, options?.viewer, "CONNECT");
  const selected = route.channelId === channel.id;
  const isSpoiler = channel.isSpoiler === true;
  const acked = isSpoiler && (options?.spoilerAcks || readSpoilerAcks(win.localStorage))
    .has(Number(channel.id));
  // A spoiler channel you are currently IN is its own acknowledgment (the
  // notice has already been answered on the way here).
  const grayed = isSpoiler && !acked && selected !== true;
  const row = el("button", {
    class: "channel-item" + (isVoice ? " voice-item" : "") +
      (grayed ? " channel-spoiler" : "") + (isSpoiler ? " spoiler-item" : "") +
      (connectLocked ? " channel-locked" : ""),
    type: "button",
    "aria-current": selected ? "true" : "false",
  });
  row.append(createIcon(doc, iconFor[channel.kind] || "hash"));
  row.append(el("span", { class: "name", text: channel.name }));

  const goToChannel = () => {
    win.location.hash = route.serverId !== null
      ? "#/s/" + route.serverId + "/c/" + channel.id
      : "#/c/" + channel.id;
  };

  row.addEventListener("click", () => {
    if (isVoice) {
      startVoiceJoin(doc, win, channel);
      return;
    }
    if (isSpoiler && !acked) {
      spoilerNoticeDialog(
        doc, win, channel,
        () => { writeSpoilerAck(win.localStorage, channel.id); rerenderChannelList(doc, win, route); goToChannel(); },
        goToChannel, // "Go back": the hash change is a no-op when not navigating
      );
      return;
    }
    goToChannel();
  });

  if (options?.manageChannels) {
    const settings = iconButton(doc, "gear", {
      ariaLabel: "Channel settings for " + channel.name,
      className: "icon-button button-quiet channel-settings",
    });
    settings.addEventListener("click", (event) => {
      event.stopPropagation();
      openChannelSettingsDialog(doc, win, route.serverId, channel);
    });
    row.append(settings);
  }

  return row;
}

// Re-render just the channel list in place (post-acknowledgment).
function rerenderChannelList(doc, win, route) {
  const scrollHost = doc.querySelector(".gc-sidebar .gc-sidebar-scroll");
  if (scrollHost) {
    renderChannelList(
      doc, win, scrollHost, route,
      caches.servers?.find((server) => server.id === route.serverId),
    );
  }
}

// The spoiler notice (checklist's spoiler-channels guide): channel name +
// topic, "View it anyway" (which records the ack) or "Go back". The topic is
// optional — an empty topic renders the generic heads-up line instead.
function spoilerNoticeDialog(doc, win, channel, onViewAnyway, onGoBack) {
  const dialog = el("dialog", {},
    el("h2", { text: "Spoiler channel" }),
    el("p", { class: "spoiler-notice-name", text: String(channel?.name || "This channel") }),
    el("p", {
      class: "muted",
      text: String(channel?.topic || "").trim()
        ? String(channel.topic).trim()
        : "This channel is marked as a spoiler channel — it is grayed out until you choose to view it.",
    }),
    el("div", { class: "form-actions" },
      el("button", { class: "button button-quiet", type: "button", text: "Go back", onclick: () => dialog.close() }),
      el("button", {
        class: "button button-primary",
        type: "button",
        text: "View it anyway",
        onclick: () => { dialog.close(); if (onViewAnyway) onViewAnyway(); },
      }),
    ),
  );
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (onGoBack) onGoBack();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  doc.body.append(dialog);
  dialog.showModal();
}

function renderConversationList(doc, win, scroll, route) {
  const conversations = caches.conversations || [];

  const wrapper = el("div", {});
  wrapper.append(el("p", { class: "sidebar-label", text: "Directs and groups (" + conversations.length + ")" }));

  if (conversations.length === 0) {
    wrapper.append(el("p", { class: "muted list-note", text: "No conversations yet." }));
  }

  for (const conversation of conversations) wrapper.append(conversationRow(doc, win, conversation, route));

  const startButton = el("button", {
    class: "button button-quiet",
    type: "button",
    text: "Start a conversation",
    class: "start-conversation-button",
  });
  startButton.addEventListener("click", () => startConversationDialog(doc, win));

  scroll.replaceChildren(wrapper, startButton);
}

function conversationRow(doc, win, conversation, route) {
  const row = el("button", {
    class: "channel-item",
    type: "button",
    "aria-current": route.channelId === conversation.id ? "true" : "false",
  });
  row.append(createIcon(doc, iconFor[conversation.kind] || "at-sign"));
  row.append(el("span", { class: "name", text: conversation.name || "Conversation" }));

  if (conversation.unread > 0) {
    row.append(el("span", { class: "unread-badge", text: unreadBadge(conversation.unread) }));
  }

  row.addEventListener("click", () => {
    win.location.hash = "#/c/" + conversation.id;
  });

  return row;
}

// unreadCount lives in chat-store.js (pure, tested); this is only the badge
// string. The server's unread comes straight off GET /api/conversations.
function unreadBadge(count) {
  return count > 99 ? "99+" : String(count);
}

// --- user footer (Discord's bottom-left) ----------------------------------------

// Presence state from the voice/presence modules: voice while the session is
// live, online while the hub knows the user, offline otherwise. Pure over the
// module caches; the dot's class + copy ride the tokens.
function selfPresenceState() {
  if (voiceSession?.active) return "voice";
  const me = state.currentUser;
  const online = (caches.presence || []).some(
    (entry) => Number(entry.userId) === Number(me?.id),
  );
  return online ? "online" : "offline";
}

const PRESENCE_COPY = {
  voice: "In voice",
  online: "Online",
  offline: "Offline",
};

// Footer re-render helper: voice callbacks and the 30s loop re-run just the
// panel, like rerenderVoicePane does for the aside.
function rerenderUserPanel(doc, win) {
  const panel = doc.querySelector(".gc-sidebar .user-panel");
  if (panel?.isConnected) renderUserPanel(doc, win, panel);
}

function renderUserPanel(doc, win, userPanel) {
  const me = state.currentUser;
  if (!me) return;

  userPanel.replaceChildren();

  // Identity: avatar + display name + the presence dot + the custom status
  // line. The whole block is one button opening the user settings dialog —
  // Discord's footer behavior.
  const presence = selfPresenceState();
  const current = (caches.presence || []).find(
    (entry) => Number(entry.userId) === Number(me?.id),
  );
  const statusText = typeof current?.statusText === "string" ? current.statusText : "";

  const avatar = el("span", { class: "user-avatar", "aria-hidden": "true", text: initials(me.username) });
  if (me.avatarUrl) {
    avatar.replaceChildren(el("img", { src: me.avatarUrl, alt: "" }));
  }

  const identity = el("button", {
    class: "user-identity",
    type: "button",
    "aria-label": "Open user settings",
    title: "User settings",
  });
  identity.append(
    el("span", { class: "user-identity-avatar" }, avatar,
      el("span", {
        class: "presence-dot presence-dot-" + presence,
        "aria-hidden": "true",
      })),
    el("span", { class: "meta" },
      el("span", { class: "name", text: me.username }),
      el("span", { class: "user-presence-copy", text: statusText || PRESENCE_COPY[presence] }),
    ),
  );
  identity.addEventListener("click", () => userSettingsDialog(doc, win));

  // Control row: mute and deafen ride the live voice session (unified with
  // the voice pane's controls — one session, one state); the gear opens the
  // settings dialog.
  const inVoice = Boolean(voiceSession?.active);
  const mute = iconButton(doc, voiceSession?.muted ? "mic-off" : "mic", {
    ariaLabel: voiceSession?.muted ? "Unmute microphone" : "Mute microphone",
    className: "icon-button button-quiet user-mute" + (voiceSession?.muted ? " muted" : ""),
  });

  // Deafen (B4): the headphones toggle silences the incoming downlink and
  // mutes the mic in one click — the gap the §4b-style audit parked is closed.
  const deafen = inVoice
    ? iconButton(doc, "headphones", {
        ariaLabel: voiceSession.deafened ? "Undeafen (incoming voice returns)" : "Deafen (silence incoming voice)",
        className: "icon-button button-quiet user-deafen" + (voiceSession.deafened ? " muted" : ""),
      })
    : null;
  if (inVoice) {
    deafen.addEventListener("click", () => voiceSession?.setDeafened(!voiceSession.deafened));
  }

  if (inVoice) {
    mute.addEventListener("click", () => voiceSession?.setMuted(!voiceSession.muted));
    mute.setAttribute("aria-disabled", "false");
  } else {
    mute.setAttribute("aria-disabled", "true");
    mute.title = "Join a voice channel to use the mic.";
    mute.addEventListener("click", () => {
      showTransientError(doc, "Join a voice channel to use the mic.");
    });
  }

  // Goober Coins (0011): the balance chip — the standing /api/coins read from
  // the presence loop, one tap to the blaxel shop. Earned only by activity;
  // nothing here is ever purchased.
  const coinAmount = coinBalanceLabel(caches.coins?.balance);
  const coinChip = el("button", {
    class: "coin-chip user-coins",
    type: "button",
    "aria-label": "Goober Coins — " + coinAmount + " earned. Open the shop.",
    title: "Goober Coins: earned by activity, never sold.",
  }, createIcon(doc, "coin"),
    el("span", { class: "coin-chip-amount", text: coinAmount }),
  );
  coinChip.addEventListener("click", () => {
    win.location.hash = "#/shop";
  });

  const perks = iconButton(doc, "sparkles", {
    ariaLabel: "Perks",
    className: "icon-button button-quiet",
  });
  perks.addEventListener("click", () => perksDialog(doc, win));
  // Backup codes (v4.8.1): the key beside Perks opens the one-time sign-in
  // codes dialog (generate + the one-look-at-the-raw-codes view).
  const backup = iconButton(doc, "key", {
    ariaLabel: "Backup codes",
    className: "icon-button button-quiet",
  });
  backup.addEventListener("click", () => openBackupCodesDialog(doc, win));
  const actions = el("div", { class: "actions" }, coinChip, mute);
  if (deafen) actions.append(deafen);
  actions.append(backup, perks);

  if (me.role === "owner" || me.role === "admin") {
    const review = iconButton(doc, "shield", {
      ariaLabel: "Attachment review desk",
      className: "icon-button button-quiet",
    });
    review.addEventListener("click", () => {
      win.location.hash = "#/review";
    });
    actions.append(review);
  }

  const logout = iconButton(doc, "logout", {
    ariaLabel: "Log out",
    className: "icon-button button-quiet",
  });
  logout.addEventListener("click", async () => {
    // Dropping the session means dropping the mic: the voice WS rides the
    // same auth cookie, so a stale session must not keep a live channel.
    if (voiceSession) leaveVoice(doc, win);
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // Clear the client anyway; the session cookie is HttpOnly.
    }
    state.currentUser = null;
    setCsrfToken("");
    win.location.assign(wempoAccountsSignOutUrl());
  });
  actions.append(logout);

  const gear = iconButton(doc, "gear", {
    ariaLabel: "User settings",
    className: "icon-button button-quiet user-gear",
  });
  gear.addEventListener("click", () => userSettingsDialog(doc, win));
  actions.append(gear);

  userPanel.append(identity, actions);
}

// User settings (the footer gear): appearance — the TWO-dimensional switcher
// (light/dark theme on top of the brand/discord skin) — plus the custom
// status field, with Perks and Log out riding the actions row.
function userSettingsDialog(doc, win) {
  const me = state.currentUser;
  const current = (caches.presence || []).find(
    (entry) => Number(entry.userId) === Number(me?.id),
  );
  const statusInput = el("input", {
    type: "text",
    maxlength: "128",
    value: typeof current?.statusText === "string" ? current.statusText : "",
    placeholder: "What's up?",
    id: "user-status-text",
  });

  // Theme (light/dark) pickers.
  const themeGroup = el("div", { class: "appearance-group", role: "group", "aria-label": "Theme" });
  const themeButtons = {};
  for (const theme of ["light", "dark"]) {
    const pick = el("button", {
      class: "button button-quiet appearance-pick",
      type: "button",
      "aria-pressed": "false",
      text: theme === "dark" ? "Dark" : "Light",
    });
    pick.addEventListener("click", () => setThemeChoice(doc, win.localStorage, theme));
    themeButtons[theme] = pick;
    themeGroup.append(pick);
  }

  // Skin pickers (brand default / Discord-dark).
  const skinGroup = el("div", { class: "appearance-group", role: "group", "aria-label": "Skin" });
  const skinButtons = {};
  for (const skin of ["brand", "discord"]) {
    const pick = el("button", {
      class: "button button-quiet appearance-pick",
      type: "button",
      "aria-pressed": "false",
      text: skin === "brand" ? "GooberCord" : "Discord",
    });
    pick.addEventListener("click", () => setSkinChoice(doc, win.localStorage, skin));
    skinButtons[skin] = pick;
    skinGroup.append(pick);
  }

  const syncPicks = () => {
    const themeNow = doc.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const skinNow = doc.documentElement.dataset.skin === "discord" ? "discord" : "brand";
    themeButtons[themeNow].setAttribute("aria-pressed", "true");
    themeButtons[themeNow === "dark" ? "light" : "dark"].setAttribute("aria-pressed", "false");
    skinButtons[skinNow].setAttribute("aria-pressed", "true");
    skinButtons[skinNow === "brand" ? "discord" : "brand"].setAttribute("aria-pressed", "false");
  };
  syncPicks();

  const error = el("p", { class: "error-strip", role: "alert" });
  const dialog = el("dialog", {},
    el("h2", { text: "User settings" }),
    el("form", { novalidate: "" },
      el("div", { class: "form-field" },
        el("span", { class: "form-label", text: "Theme" }),
        themeGroup,
      ),
      el("div", { class: "form-field" },
        el("span", { class: "form-label", text: "Skin — the warm GooberCord look or the Discord-dark skin" }),
        skinGroup,
      ),
      el("div", { class: "form-field" },
        el("label", { for: "user-status-text", text: "Custom status (up to 128 characters)" }),
        statusInput,
      ),
      error,
      el("div", { class: "form-actions" },
        el("button", { class: "button button-quiet", type: "button", text: "Perks", id: "settings-perks" }),
        el("button", { class: "button button-quiet", type: "button", text: "Log out", id: "settings-logout" }),
        el("button", { class: "button button-primary", type: "submit", text: "Save" }),
      ),
    ),
  );

  dialog.addEventListener("close", () => dialog.remove());
  dialog.querySelector("#settings-perks").addEventListener("click", () => {
    dialog.close();
    perksDialog(doc, win);
  });
  dialog.querySelector("#settings-logout").addEventListener("click", async () => {
    dialog.close();
    if (voiceSession) leaveVoice(doc, win);
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // Clear the client anyway; the session cookie is HttpOnly.
    }
    state.currentUser = null;
    setCsrfToken("");
    win.location.assign(wempoAccountsSignOutUrl());
  });

  dialog.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    const statusText = String(statusInput.value || "").trim();
    try {
      await api("/api/me/status", {
        method: "PATCH",
        body: statusText ? { statusText, statusUntil: null } : { statusText: null, statusUntil: null },
      });
      dialog.close();
      // Presence refreshes on the 30s loop; nudge it now too.
      refreshPresenceNow(win);
    } catch (caught) {
      error.textContent = caught?.message || "The settings could not be saved.";
    }
  });

  doc.body.append(dialog);
  dialog.showModal();
  statusInput.focus();
}

// --- Goober+ perks (free-for-everyone: accent, tagline, boosts) ---------------

// Perks dialog: the Nitro-flavored pack with no payments anywhere. The
// accent pick is a swatch grid over the site palette plus a free hex input
// (both gated by validAccent — inline styles are set through CSSOM only),
// the tagline is a bounded field, and each joined server gets its boost row.
// The dialogs render from caches.servers and re-render the rail/
// server-header chrome from the responses, so a boost is visible everywhere
// without a history refetch.
function perksDialog(doc, win) {
  const me = state.currentUser;
  if (!me) return;

  const hexInput = el("input", {
    type: "text",
    maxlength: "7",
    placeholder: "#rrggbb",
    id: "perks-hex",
    spellcheck: "false",
  });
  const taglineInput = el("input", {
    type: "text",
    maxlength: String(GC_TAGLINE_MAX),
    value: typeof me.tagline === "string" ? me.tagline : "",
    placeholder: "A little line under your status",
    id: "perks-tagline",
  });
  const error = el("p", { class: "error-strip", role: "alert" });
  const cancel = el("button", { class: "button button-quiet", type: "button", text: "Cancel" });

  // The swatch grid: every site-palette pick writes its hex into the input
  // (one source of truth); the "none" swatch clears it.
  const swatches = el("div", { class: "perk-swatches", role: "group", "aria-label": "Accent color picks" });
  const clearSwatch = el("button", {
    class: "perk-swatch perk-swatch-none",
    type: "button",
    "aria-pressed": validAccent(me.accentColor) ? "false" : "true",
    "aria-label": "No accent color",
    title: "No accent",
  });
  clearSwatch.append(el("span", { class: "perk-swatch-x", "aria-hidden": "true", text: "×" }));
  clearSwatch.addEventListener("click", () => {
    hexInput.value = "";
    markSelectedSwatches();
  });
  swatches.append(clearSwatch);
  for (const hex of ACCENT_PALETTE) {
    if (!validAccent(hex)) continue;
    const swatch = el("button", {
      class: "perk-swatch",
      type: "button",
      "aria-pressed": "false",
      "aria-label": "Accent " + hex,
      title: hex,
    });
    // CSSOM-only (CSP: no inline style attributes), and only strict hex.
    swatch.style["background-color"] = validAccent(hex);
    swatch.addEventListener("click", () => {
      hexInput.value = hex;
      markSelectedSwatches();
    });
    swatch.dataset.hex = hex;
    swatches.append(swatch);
  }

  const markSelectedSwatches = () => {
    const picked = validAccent(String(hexInput.value || "").trim());
    for (const swatch of swatches.querySelectorAll(".perk-swatch")) {
      swatch.setAttribute(
        "aria-pressed",
        swatch.dataset.hex ? String(swatch.dataset.hex === picked) : String(!picked),
      );
    }
  };
  hexInput.addEventListener("input", markSelectedSwatches);
  hexInput.value = validAccent(me.accentColor) ? me.accentColor : "";
  markSelectedSwatches();

  const boostRows = el("div", { class: "perk-boost-list", "aria-label": "Server boosts" });
  const renderBoostRows = () => {
    boostRows.replaceChildren();
    const servers = caches.servers || [];
    if (servers.length === 0) {
      boostRows.append(
        mascotMoment(null, {
          mood: "waiting",
          size: "mini",
          text: "Join a server first — boosts ride the servers you are in.",
        }),
      );
      return;
    }
    for (const server of servers) {
      boostRows.append(boostRow(doc, win, server, () => {
        renderBoostRows();
        renderServersChrome(doc, win);
      }, error));
    }
  };
  renderBoostRows();

  const dialog = el("dialog", {},
    el("h2", { text: "Perks" }),
    el("p", { class: "muted", text: "Free for everyone — Goober+ has no payments, ever." }),
    el("form", { novalidate: "" },
      el("div", { class: "form-field" },
        el("label", { for: "perks-hex", text: "Accent color" }),
        swatches,
        hexInput,
      ),
      el("div", { class: "form-field" },
        el("label", { for: "perks-tagline", text: "Tagline (up to 80 characters)" }),
        taglineInput,
      ),
      el("div", { class: "form-field" },
        el("label", { text: "Boost your servers" }),
        boostRows,
      ),
      error,
      el("div", { class: "form-actions" },
        cancel,
        el("button", { class: "button button-primary", type: "submit", text: "Save" }),
      ),
    ),
  );

  cancel.addEventListener("click", () => dialog.close());
  dialog.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";

    // One accent source: the hex input. Uppercase is lowercased client-side so
    // the server's strict-lowercase rule never surprises the keyboard.
    const hex = String(hexInput.value || "").trim().toLowerCase();
    if (hex !== "" && validAccent(hex) !== hex) {
      error.textContent = "Accent color must be a lowercase #rgb or #rrggbb hex color.";
      return;
    }
    const tagline = String(taglineInput.value || "").trim();

    try {
      const result = await api("/api/profile", {
        method: "PATCH",
        body: {
          accentColor: hex === "" ? null : hex,
          tagline: tagline === "" ? null : tagline,
        },
      });
      state.currentUser = {
        ...state.currentUser,
        accentColor: result?.profile?.accentColor ?? null,
        tagline: result?.profile?.tagline ?? null,
      };
      const panel = doc.querySelector(".gc-sidebar .user-panel");
      if (panel?.isConnected) renderUserPanel(doc, win, panel);
      dialog.close();
    } catch (caught) {
      error.textContent = caught?.message || "The perks could not be saved.";
    }
  });

  doc.body.append(dialog);
  dialog.showModal();
}

function boostRow(doc, win, server, onChanged, error) {
  const boosted = server.boostedByMe === true;
  const name = el("span", { class: "name", text: server.name });
  const button = el("button", {
    class: "button " + (boosted ? "button-quiet" : "button-secondary"),
    type: "button",
    text: boosted ? "Retract boost" : "Boost server",
  });
  button.addEventListener("click", async () => {
    error.textContent = "";
    button.disabled = true;
    try {
      const result = boosted
        ? await api("/api/servers/" + server.id + "/boost", { method: "DELETE" })
        : await api("/api/servers/" + server.id + "/boost", { method: "POST" });
      // The response's re-derived count is the new truth for the cached row.
      server.boosts = Number(result?.server?.boosts ?? 0);
      server.boostedByMe = result?.server?.boostedByMe === true;
      onChanged();
    } catch (caught) {
      if (caught?.status === 409) {
        // Another tab boosted first: fold it into the shown state.
        server.boostedByMe = true;
        onChanged();
        return;
      }
      error.textContent = caught?.message || "The boost could not be updated.";
      button.disabled = false;
    }
  });

  return el("div", { class: "perk-boost-row" }, name, button);
}

async function refreshPresenceNow(win) {
  try {
    caches.presence = (await api("/api/presence")).online || [];
  } catch {
    // The 30s loop retries.
  }
  const aside = document.querySelector(".gc-aside");
  if (aside && activeView) renderAside(win.document, win, aside, parseHash(win.location.hash));
}

// --- voice pane + presence aside ---------------------------------------------------

function renderAside(doc, win, aside, route) {
  const server = (caches.servers || []).find((entry) => entry.id === route.serverId) ?? null;
  const voiceChannels = server?.channels?.filter((channel) => channel.kind === "voice") || [];
  const roster = activeView?.roster ? [...activeView.roster.values()] : [];
  const presence = caches.presence || [];

  aside.replaceChildren();

  const voiceLabel = el("button", {
    class: "sidebar-label",
    type: "button",
    text: "Voice (" + voiceChannels.length + ")",
  });
  const voicePane = renderVoicePane(doc, win, voiceChannels, presence);

  const rosterLabel = el("button", {
    class: "sidebar-label",
    type: "button",
    text: "In this channel (" + roster.length + ")",
  });
  const rosterList = el("div", {});
  if (roster.length === 0) {
    rosterList.append(el("p", { class: "muted list-note", text: "Open a channel to see who's here." }));
  }
  for (const member of roster) {
    rosterList.append(presenceRow(doc, win, member.username, member.userId, null));
  }

  const presenceLabel = el("button", {
    class: "sidebar-label",
    type: "button",
    text: "Online (" + presence.length + ")",
  });
  const presenceList = el("div", {});
  if (presence.length === 0) {
    presenceList.append(
      mascotMoment(null, {
        mood: "waiting",
        size: "mid",
        text: "It's quiet in here. blaxel keeps the seats warm — presence shows up when friends sign in.",
      }),
    );
  }
  for (const entry of presence) {
    presenceList.append(presenceRow(doc, win, entry.username, entry.userId, entry.statusText));
  }

  aside.append(voiceLabel, voicePane, rosterLabel, rosterList, presenceLabel, presenceList);

  // Phase-3 member list: Owner first, then roles by position, then everyone
  // else — the roster endpoint's payload, grouped client-side. Without a
  // loaded roster it stays out of the way (the graceful default).
  if (route.serverId !== null) {
    aside.append(buildMemberListSection(doc, win, route.serverId));
    void ensureRoster(doc, win, route.serverId);
  }
}

// The member-list aside (the filed gap): one role-colored row per member,
// grouped Owner / role / Members via ui-helpers' memberGroups, with the
// phase-3 moderation affordances riding each row (nickname rename via the
// pencil or the right-click context menu, roles via the shield, kick) —
// all of them gated on the roster's viewer block, so a member without the
// powers sees a plain list.
function buildMemberListSection(doc, win, serverId) {
  const roster = currentRoster(serverId);
  const section = el("div", { class: "member-list-section" });

  if (!roster) {
    const note = el("button", {
      class: "sidebar-label",
      type: "button",
      text: "Members…",
    });
    note.addEventListener("click", () => void ensureRoster(doc, win, serverId));
    section.append(note);
    return section;
  }

  const label = el("button", {
    class: "sidebar-label",
    type: "button",
    text: "Members (" + roster.members.length + ")",
  });

  // The mod desk's door (0008): a gear on the member-list head for the
  // owner or KICK_MEMBERS holders — the members page's viewer class.
  const modViewer = roster.viewer && (roster.viewer.owner ||
    (roster.viewer.permissions || []).includes(SERVER_PERMISSION_NAMES.KICK_MEMBERS));
  if (modViewer) {
    const labelRow = el("div", { class: "member-list-head" });
    labelRow.append(label);
    const manage = iconButton(doc, "gear", {
      ariaLabel: "Manage members",
      className: "icon-button button-quiet member-desk",
    });
    manage.addEventListener("click", () => openModDeskDialog(doc, win, serverId));
    labelRow.append(manage);
    section.append(labelRow);
  } else {
    section.append(label);
  }

  for (const group of memberGroups(roster.members, roster.roles)) {
    section.append(el("p", {
      class: "member-group-label",
      text: group.label + " (" + group.members.length + ")",
    }));
    const list = el("div", { class: "member-group" });
    for (const member of group.members) {
      list.append(memberRow(doc, win, serverId, member, roster.viewer));
    }
    section.append(list);
  }

  return section;
}

// One member row: display name (nickname > username) in the highest role's
// color, then the affordances the viewer may use. The context menu
// ("right-click-ish" affordance) mirrors the pencil on renameable rows.
function memberRow(doc, win, serverId, member, viewer) {
  const me = state.currentUser;
  const isSelf = Number(member.id) === Number(me?.id);
  const isOwnerMember = member.membershipRole === "owner";
  const color = typeof member.color === "string" && validAccent(member.color)
    ? member.color
    : null;

  const row = el("div", {
    class: "presence-row member-row" + (isSelf ? " member-row-self" : ""),
    dataset: { rosterUserId: String(member.id) },
  });
  row.append(el("span", { class: "presence-dot", "aria-hidden": "true" }));

  const meta = el("div", { class: "meta" });
  const name = el("span", { class: "name", text: memberDisplay(member) });
  if (color) name.style.color = color;
  if (isOwnerMember) name.append(createIcon(doc, "shield"));
  meta.append(name);
  // Nickname set: the real username stays visible as the secondary line
  // (display precedence nickname > username, context = this server only).
  if (memberDisplay(member) !== member.username) {
    meta.append(el("span", { class: "member-username", text: member.username }));
  }
  row.append(meta);

  const canManageNicknames = viewerCan(viewer, SERVER_PERMISSION_NAMES.KICK_MEMBERS) &&
    viewerCan(viewer, SERVER_PERMISSION_NAMES.MANAGE_ROLES);
  const canRename = isSelf || (canManageNicknames && !isOwnerMember);
  const canKick = !isSelf && viewerCan(viewer, SERVER_PERMISSION_NAMES.KICK_MEMBERS) && !isOwnerMember;
  const canAssignRoles = viewerCan(viewer, SERVER_PERMISSION_NAMES.MANAGE_ROLES) && !isOwnerMember;

  if (canAssignRoles) {
    const roles = iconButton(doc, "shield", {
      ariaLabel: "Roles for " + memberDisplay(member),
      className: "icon-button button-quiet member-roles",
    });
    roles.addEventListener("click", () =>
      openMemberRolesDialog(doc, win, serverId, member));
    row.append(roles);
  }
  if (canRename) {
    const rename = iconButton(doc, "pen", {
      ariaLabel: (isSelf ? "Change your nickname" : "Change nickname for " + memberDisplay(member)),
      className: "icon-button button-quiet member-nickname",
    });
    rename.addEventListener("click", () =>
      openNicknameDialog(doc, win, serverId, member, isSelf));
    row.append(rename);
  }
  if (canKick) {
    const kick = iconButton(doc, "logout", {
      ariaLabel: "Kick " + memberDisplay(member),
      className: "icon-button button-quiet member-kick",
    });
    kick.addEventListener("click", () => kickMemberDialog(doc, win, serverId, member));
    row.append(kick);
  }

  if (isSelf) {
    // Your own row keeps the plain nickname affordance (the social menu has
    // nothing to say about yourself).
    if (canRename) {
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        openNicknameDialog(doc, win, serverId, member, isSelf);
      });
    }
  } else {
    // Another member's row opens the social context menu (the member-list
    // face of the filed Add-Friend-from-member-lists affordance): the block
    // / ignore / Add-Friend entries, with the nickname dialog riding along
    // for renameable rows (the mod-desk affordance stays reachable).
    row.addEventListener("contextmenu", (event) => {
      const extras = canRename
        ? [{ label: "Change nickname…", run: () => openNicknameDialog(doc, win, serverId, member, isSelf) }]
        : [];
      openSocialContextMenu(doc, win, event, { userId: member.id, username: member.username }, extras);
    });
  }

  return row;
}

// The voice pane (phase 2): the join/leave/mute controls when connected, then
// one card per voice channel with its live participant list. Who's in which
// channel has two sources — the joined session's voice_roster (authoritative,
// speaking state rides frame arrival) and the presence hub's voiceChannel
// marker (covers channels this browser isn't speaking in).
function renderVoicePane(doc, win, voiceChannels, presence) {
  const pane = el("div", { class: "voice-pane" });
  const joinedChannelId = voiceSession?.active ? voiceSession.channelId : null;

  if (voiceSession && voiceSession.active) {
    const channel = voiceChannels.find((entry) => entry.id === joinedChannelId);
    pane.append(voiceControlsCard(doc, win, channel?.name || "Voice channel"));
  }

  const list = el("div", { class: "voice-channel-list" });
  if (voiceChannels.length === 0) {
    list.append(el("p", { class: "muted list-note", text: "No voice channels here yet." }));
  }
  for (const channel of voiceChannels) {
    list.append(voiceChannelCard(doc, win, channel, presence, channel.id === joinedChannelId));
  }

  if (voiceChannels.length > 0 && joinedChannelId === null) {
    const note = el("div", { class: "voice-pane-note voice-pane-moment" });
    note.append(
      mascotMoment(null, {
        mood: "waiting",
        voice: true,
        size: "mid",
        text: "Press a channel to join. Your mic only sends while you talk. " + VOICE_COPY.LIMIT,
      }),
    );
    list.append(note);
  }
  if (joinedChannelId !== null && voiceError) {
    const strip = el("p", { class: "error-strip voice-error", role: "alert", text: voiceError });
    list.append(strip);
  }

  pane.append(list);
  return pane;
}

// Connection controls for the CURRENT voice channel: status line, mute, and
// leave. Status copy is plain about the two degraded states (mic declined →
// listen-only; no encoder → listen-only), per the no-guilt rule.
function voiceControlsCard(doc, win, channelName) {
  const card = el("div", { class: "voice-controls" });
  card.append(el("p", { class: "voice-controls-title", text: channelName }));
  card.append(el("p", { class: "voice-status", text: voiceStatusCopy() }));

  const actions = el("div", { class: "voice-actions" });
  const mute = iconButton(doc, voiceSession.muted ? "mic-off" : "mic", {
    ariaLabel: voiceSession.muted ? "Unmute microphone" : "Mute microphone",
    className: "icon-button button-quiet voice-mute" + (voiceSession.muted ? " muted" : ""),
  });
  mute.addEventListener("click", () => {
    voiceSession?.setMuted(!voiceSession.muted);
  });
  actions.append(mute);

  // Deafen (B4): the same session, the same state the footer's toggle drives.
  const deafen = iconButton(doc, "headphones", {
    ariaLabel: voiceSession.deafened ? "Undeafen (incoming voice returns)" : "Deafen (silence incoming voice)",
    className: "icon-button button-quiet voice-deafen" + (voiceSession.deafened ? " muted" : ""),
  });
  deafen.addEventListener("click", () => voiceSession?.setDeafened(!voiceSession.deafened));
  actions.append(deafen);

  const leave = iconButton(doc, "logout", {
    ariaLabel: "Leave voice",
    className: "icon-button button-quiet voice-leave",
  });
  leave.addEventListener("click", () => leaveVoice(doc, win));
  actions.append(leave);

  card.append(actions);
  return card;
}

function voiceStatusCopy() {
  switch (voiceStatus) {
    case "connecting":
      return "Connecting to voice…";
    case "reconnecting":
      return "Voice is reconnecting…";
    case "muted":
      return "In voice — mic muted.";
    case "deafened":
      return "In voice — deafened. You hear nothing, your mic sends nothing.";
    case "listening":
      return "In voice — mic unavailable, you can still hear everyone.";
    case "speaking":
    case "live":
      return "In voice. Your mic sends only while you talk.";
    case "left":
    default:
      return "";
  }
}

// One channel's card: name, a Join button (or a connected marker), and
// participants. Speaking dots are toggled later by applySpeaking via
// data-voice-user so a 4Hz indicator never rebuilds the DOM.
function voiceChannelCard(doc, win, channel, presence, isConnected) {
  const card = el("div", { class: "voice-channel-card" });
  const head = el("div", { class: "voice-channel-head" });
  head.append(
    createIcon(doc, "speaker"),
    el("span", { class: "name", text: channel.name }),
  );

  if (isConnected) {
    head.append(el("span", { class: "voice-connected", text: "connected" }));
  } else {
    const join = el("button", {
      class: "button button-quiet voice-join",
      type: "button",
      text: "Join",
      "aria-label": "Join voice channel " + channel.name,
    });
    join.addEventListener("click", () => startVoiceJoin(doc, win, channel));
    head.append(join);
  }
  card.append(head);

  const members = isConnected
    ? voiceSession.participants.map((entry) => ({
        userId: entry.userId,
        username: entry.username,
        muted: entry.muted,
      }))
    : presence
        .filter((entry) => Number(entry.voiceChannel) === Number(channel.id))
        .map((entry) => ({ userId: entry.userId, username: entry.username, muted: false }));

  if (members.length === 0) {
    card.append(el("p", { class: "muted voice-empty", text: "Nobody's here." }));
    return card;
  }

  const list = el("div", { class: "voice-members" });
  for (const member of members) {
    const row = el("div", {
      class: "voice-member" + (member.muted ? " muted" : ""),
      dataset: { voiceUserId: String(member.userId) },
    });
    row.append(el("span", { class: "speaking-ring", "aria-hidden": "true" }));
    row.append(el("span", { class: "voice-member-name", text: member.username }));
    if (member.muted) row.append(createIcon(doc, "mic-off"));
    // A member without mic access (listen-only) still appears plainly.
    list.append(row);
  }
  card.append(list);
  return card;
}

// Speaking indicator: class toggles only — no DOM rebuild at 4Hz.
function applySpeaking(ids) {
  const speaking = new Set(ids.map(Number));
  const aside = document.querySelector(".gc-aside");
  if (!aside || !aside.isConnected) return;
  for (const node of aside.querySelectorAll(".voice-member")) {
    const id = Number(node.dataset.voiceUserId);
    node.classList.toggle("speaking", speaking.has(id));
  }
}

// Join from the sidebar row or a card's Join button. The CONNECT gate is
// client-side FIRST (the list payload's effective permissions) so a denied
// member sees the refusal toast instead of a socket that would just bounce;
// the ws route re-asserts the same rule server-side. The soft tier's
// join-with-them warning rides in front of the connect itself: a channel
// already holding someone the viewer IGNORED raises the heads-up dialog, and
// only its continue lands in the connect path.
function startVoiceJoin(doc, win, channel) {
  const route = parseHash(win.location.hash);
  const viewer = currentRoster(route.serverId)?.viewer || null;
  if (!channelPerm(channel, viewer, "CONNECT")) {
    showTransientError(doc, caughtMessage403());
    return;
  }
  if (voiceSession?.active && voiceSession.channelId === channel.id) return;

  // The rules gate (0012): a voice join rides the same member gates as a
  // send — the WS upgrade's 403 body never reaches the browser, so the
  // member-only rules read goes FIRST; a pending gate opens the dialog and
  // the join (re-)starts only after an accepted dialog closes. A gate-off
  // server (or a refused read) joins exactly as before.
  void (async () => {
    if (route.serverId !== null) {
      const state = await readServerRules(route.serverId);
      const pending = rulesGatePending(state);
      if (pending && openRulesDialog(doc, {
        serverId: pending.serverId,
        rules: pending.rules,
        onAccepted: () => startVoiceJoin(doc, win, channel),
      })) {
        return;
      }
    }
    // The soft tier's join-with-them warning rides in front of the connect:
    // a channel already holding someone the viewer IGNORED raises the
    // heads-up dialog, and only its continue lands in the connect path.
    if (voiceSession?.active) voiceSession.leave();
    const present = (caches.presence || []).filter(
      (entry) => Number(entry?.voiceChannel) === Number(channel.id),
    );
    const ignored = ignoredMembersHere(present, caches.blocks || []);
    if (ignored.length > 0) {
      openIgnoredInVoiceDialog(doc, win, ignored, () => beginVoiceJoin(doc, win, channel));
      return;
    }
    beginVoiceJoin(doc, win, channel);
  })();
}

// The connect path startVoiceJoin ends at (the client-side checks passed).
function beginVoiceJoin(doc, win, channel) {
  voiceStatus = "connecting";
  voiceError = "";

  voiceSession = createVoiceSession({
    channelId: channel.id,
    selfId: Number(state.currentUser?.id) || NaN,
    win,
    onRoster: () => rerenderVoicePane(doc, win),
    onStatus: (next) => {
      voiceStatus = next;
      rerenderVoicePane(doc, win);
      // The footer's mute button + presence dot follow the same session.
      rerenderUserPanel(doc, win);
    },
    onSpeaking: (ids) => applySpeaking(ids),
    onError: (message) => {
      voiceError = message;
      rerenderVoicePane(doc, win);
    },
  });
  voiceSession.join();

  // Goober Coins (0011): voice presence earns per connected window. One timer
  // per live session (cleared on leave); a refused tick (cap reached, a
  // foreign channel) is routine and stays quiet — the caps all ride the
  // server's own guarded INSERT.
  stopVoiceCoinTicks(win);
  voiceCoinTickTimer = win.setInterval(async () => {
    const channelId = voiceSession?.channelId;
    if (!voiceSession?.active || !Number.isInteger(channelId)) return;
    try {
      await api("/api/coins/voice/tick", { method: "POST", body: { channelId } });
      await refreshCoins(doc, win);
    } catch {
      // The next window tries again; nothing user-visible here.
    }
  }, VOICE_COIN_TICK_MS);
}

let voiceCoinTickTimer = 0;

function stopVoiceCoinTicks(win) {
  if (voiceCoinTickTimer) win.clearInterval(voiceCoinTickTimer);
  voiceCoinTickTimer = 0;
}

function leaveVoice(doc, win) {
  stopVoiceCoinTicks(win);
  voiceSession?.leave();
  voiceSession = null;
  voiceStatus = "idle";
  voiceError = "";
  applySpeaking([]);
  rerenderVoicePane(doc, win);
}

function rerenderVoicePane(doc, win) {
  const aside = document.querySelector(".gc-aside");
  if (aside && aside.isConnected) {
    renderAside(doc, win, aside, parseHash(win.location.hash));
  }
}

function presenceRow(doc, win, username, userId, statusText) {
  const row = el("div", { class: "presence-row" });
  const meta = el("div", { class: "meta" },
    el("span", { class: "name", text: username }),
    statusText ? el("span", { class: "presence-status", text: statusText }) : null,
  );

  row.append(el("span", { class: "presence-dot", "aria-hidden": "true" }), meta);

  if (Number(userId) !== Number(state.currentUser?.id)) {
    const dmButton = iconButton(doc, "at-sign", {
      ariaLabel: "Message " + username,
      className: "icon-button button-quiet start-dm",
    });
    dmButton.addEventListener("click", () => startDirectTo(doc, win, userId));
    row.append(dmButton);
  }

  return row;
}

// --- phase-3 dialogs: roles, nicknames, kicks, channel settings ---------------

// Drop the server's cached roster so the next render re-reads membership.
function dropRoster(doc, win, serverId) {
  caches.rosters.delete(serverId);
  const route = parseHash(win.location.hash);
  const aside = doc.querySelector(".gc-aside");
  if (aside?.isConnected) renderAside(doc, win, aside, route);
}

function closeDialogOnBackdrop(dialog) {
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

// Nickname dialog (the "Change/Manage-Nickname" split's UI): a rename input,
// a Clear affordance when one is set, and the save that rides the free
// self-route or the manage route — the pick is the caller's.
function openNicknameDialog(doc, win, serverId, member, isSelf) {
  const existing = typeof member.nickname === "string" ? member.nickname : "";
  const input = el("input", {
    type: "text",
    maxlength: "32",
    id: "nickname-input",
    value: existing,
    "aria-label": "Nickname",
    placeholder: member.username,
  });
  const error = el("p", { class: "error-strip", role: "alert" });

  const dialog = el("dialog", {},
    el("h2", { text: isSelf ? "Change your nickname" : "Change nickname" }),
    el("p", {
      class: "muted",
      text: "Nicknames are per server — this server sees it, your other servers and DMs still use " + member.username + ".",
    }),
    el("form", { novalidate: "" },
      el("div", { class: "form-field" },
        el("label", { for: "nickname-input", text: "Nickname" }),
        input,
      ),
      error,
      el("div", { class: "form-actions" },
        el("button", {
          class: "button button-quiet",
          type: "button",
          text: "Clear nickname",
          hidden: existing ? undefined : "",
          onclick: () => void save(null),
        }),
        el("button", { class: "button button-quiet", type: "button", text: "Cancel", onclick: () => dialog.close() }),
        el("button", { class: "button button-primary", type: "submit", text: "Save" }),
      ),
    ),
  );

  const save = async (nickname) => {
    error.textContent = "";
    const path = isSelf
      ? "/api/servers/" + serverId + "/nick"
      : "/api/servers/" + serverId + "/nick/" + Number(member.id);
    try {
      await api(path, { method: "PATCH", body: { nickname } });
      dialog.close();
      dropRoster(doc, win, serverId);
    } catch (caught) {
      error.textContent = caught?.message || "The nickname could not be saved.";
    }
  };

  dialog.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = String(input.value || "").trim();
    void save(value || null);
  });

  closeDialogOnBackdrop(dialog);
  doc.body.append(dialog);
  dialog.showModal();
  input.focus();
}

// Kick confirm dialog (a role-position-ruled destructive act).
function kickMemberDialog(doc, win, serverId, member) {
  const display = memberDisplay(member);
  const dialog = el("dialog", {},
    el("h2", { text: "Kick " + display + "?" }),
    el("p", { class: "muted", text: "The member leaves this server (an invite can bring them back). Their messages stay." }),
    el("div", { class: "form-actions" },
      el("button", { class: "button button-quiet", type: "button", text: "Cancel", onclick: () => dialog.close() }),
      el("button", {
        // Destructive confirm idiom (unfriend/ban/delete all agree): the
        // danger chrome, never the positive green — kick is a removal.
        class: "button button-danger",
        type: "button",
        text: "Kick",
        onclick: async () => {
          try {
            await api("/api/servers/" + serverId + "/members/" + Number(member.id), { method: "DELETE" });
            dialog.close();
            dropRoster(doc, win, serverId);
          } catch (caught) {
            dialog.close();
            showTransientError(doc, caught?.message || "The member could not be kicked.");
          }
        },
      }),
    ),
  );
  closeDialogOnBackdrop(dialog);
  doc.body.append(dialog);
  dialog.showModal();
}

// Per-member roles dialog: one checkbox per role; the toggle is immediate
// (PUT/DELETE per click, idempotent server-side), the local cache follows so
// the member list regroups on close.
function openMemberRolesDialog(doc, win, serverId, member) {
  const roster = currentRoster(serverId);
  if (!roster) return;
  const ownIds = new Set(member.roleIds);
  const error = el("p", { class: "error-strip", role: "alert" });
  const list = el("div", { class: "fieldset-list", role: "group", "aria-label": "Roles" });

  if (roster.roles.length === 0) {
    list.append(el("p", { class: "muted list-note", text: "No roles on this server yet." }));
  }
  for (const role of roster.roles) {
    const checkbox = el("input", {
      type: "checkbox",
      value: String(role.id),
      ...(ownIds.has(Number(role.id)) ? { checked: "" } : {}),
    });
    checkbox.addEventListener("change", async () => {
      error.textContent = "";
      const path = "/api/servers/" + serverId + "/roles/" + Number(role.id) +
        "/members/" + Number(member.id);
      try {
        if (checkbox.checked) {
          await api(path, { method: "PUT" });
          member.roleIds = [Number(role.id), ...member.roleIds.filter((id) => id !== Number(role.id))];
        } else {
          await api(path, { method: "DELETE" });
          member.roleIds = member.roleIds.filter((id) => id !== Number(role.id));
        }
        dropRoster(doc, win, serverId);
      } catch (caught) {
        checkbox.checked = !checkbox.checked;
        error.textContent = caught?.message || "The role assignment could not be saved.";
      }
    });
    const row = el("label", {}, checkbox, el("span", { text: role.name }));
    if (role.color && validAccent(role.color)) {
      const dot = el("span", { class: "role-dot", "aria-hidden": "true" });
      dot.style.setProperty("--role-color", validAccent(role.color));
      row.prepend(dot);
    }
    list.append(row);
  }

  const dialog = el("dialog", {},
    el("h2", { text: "Roles for " + memberDisplay(member) }),
    list,
    error,
    el("div", { class: "form-actions" },
      el("button", { class: "button button-primary", type: "button", text: "Done", onclick: () => dialog.close() }),
    ),
  );
  closeDialogOnBackdrop(dialog);
  doc.body.append(dialog);
  dialog.showModal();
}

// The roles management dialog (owner settings embeds it): list, create,
// rename, recolor, reorder, delete. The server re-checks every act — the UI
// affordances only decide what is worth showing.
const ROLE_COLOR_RE = /^#[0-9a-f]{6}$/;

function openRolesDialog(doc, win, serverId) {
  const error = el("p", { class: "error-strip", role: "alert" });
  const list = el("div", { class: "roles-list", "aria-label": "Roles" });
  const nameInput = el("input", {
    type: "text",
    maxlength: "32",
    id: "new-role-name",
    "aria-label": "New role name",
    placeholder: "Moderator",
  });
  const colorInput = el("input", {
    type: "text",
    maxlength: "7",
    id: "new-role-color",
    "aria-label": "Role color (#rrggbb, optional)",
    placeholder: "#397357",
  });
  const permsFieldset = el("fieldset", { class: "perks-fieldset" },
    el("legend", { text: "Extra powers (base membership stays as-is)" }));
  const permBoxes = [];
  for (const [name] of Object.entries(SERVER_PERMISSION_NAMES)) {
    if (name === "VIEW") continue; // implicit for every member (graceful default)
    const checkbox = el("input", { type: "checkbox", value: name });
    permBoxes.push(checkbox);
    permsFieldset.append(el("label", {}, checkbox,
      el("span", { text: name.toLowerCase().replace(/_/g, " ") })));
  }

  const reload = async () => {
    try {
      const payload = await api("/api/servers/" + serverId + "/roles");
      renderRoleList(payload.roles || []);
    } catch (caught) {
      error.textContent = caught?.message || "Roles could not be loaded.";
    }
  };

  const renderRoleList = (roles) => {
    list.replaceChildren();
    if (roles.length === 0) {
      list.append(el("p", { class: "muted list-note", text: "No roles yet — this server behaves exactly as it does today." }));
      return;
    }
    for (const role of roles) {
      list.append(roleRow(doc, win, serverId, role, roles, reload, error));
    }
  };

  const dialog = el("dialog", {},
    el("h2", { text: "Server roles" }),
    el("p", { class: "muted", text: "Strongest roles first. A member can only manage roles strictly below the strongest one they hold." }),
    list,
    error,
    el("form", { novalidate: "", class: "new-role-form" },
      el("div", { class: "form-field" },
        el("label", { for: "new-role-name", text: "New role" }),
        nameInput,
      ),
      el("div", { class: "form-field" },
        el("label", { for: "new-role-color", text: "Color (optional)" }),
        colorInput,
      ),
      permsFieldset,
      el("div", { class: "form-actions" },
        el("button", { class: "button button-quiet", type: "button", text: "Done", onclick: () => dialog.close() }),
        el("button", { class: "button button-primary", type: "submit", text: "Create role" }),
      ),
    ),
  );

    dialog.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      error.textContent = "";
      const name = String(nameInput.value || "").trim();
      const color = String(colorInput.value || "").trim().toLowerCase();
      if (!name) {
        error.textContent = "Role name must be between 1 and 32 characters.";
        return;
      }
      if (color && !ROLE_COLOR_RE.test(color)) {
        error.textContent = "Role color must be a #rrggbb hex string or blank.";
        return;
      }
      try {
        await api("/api/servers/" + serverId + "/roles", {
          method: "POST",
          body: {
            name,
            color: color || null,
            permissions: permBoxes.filter((box) => box.checked).map((box) => box.value),
          },
        });
        nameInput.value = "";
        colorInput.value = "";
        for (const box of permBoxes) box.checked = false;
        await reload();
        dropRoster(doc, win, serverId);
      } catch (caught) {
        error.textContent = caught?.message || "The role could not be created.";
      }
    });

  closeDialogOnBackdrop(dialog);
  doc.body.append(dialog);
  dialog.showModal();
  nameInput.focus();
  void reload();
}

// --- phase-3 mod desk: the members page (dialog), bans, timeouts, prune --------
//
// The filed members page reads the roster payload the member list already
// rides: joined-at, the account age's source, the live timeout, the invite
// attribution, this viewer's resolved verification eligibility, and — only for
// the owner/KICK_MEMBERS viewer class — the server's bans. A banned member is
// an ex-member (they render in the Bans section, never in the member list).

// accountAgeCopy(iso): the humanized account age the desk's age column shows.
// A missing/undecodable value reads as "unknown" — never an invented figure.
function accountAgeCopy(iso) {
  if (typeof iso !== "string" || iso === "") return "unknown";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "unknown";
  const days = Math.max(0, Math.floor((Date.now() - time) / 86400000));
  if (days < 1) return "fresh";
  if (days === 1) return "1 day old";
  if (days < 62) return days + " days old";
  if (days < 365) return Math.round(days / 30.4) + " months old";
  const years = Math.floor(days / 365);
  return years + (years === 1 ? " year" : " years") + " old";
}

// The members desk: one re-renderable table over the CURRENT roster, plus the
// Bans section. Every act re-reads the roster when it lands, so the counts,
// the badges, and the ban section all follow without a manual refresh.
function openModDeskDialog(doc, win, serverId) {
  const error = el("p", { class: "error-strip", role: "alert" });
  const filter = el("input", {
    type: "search",
    id: "mod-desk-filter",
    placeholder: "Filter by username or nickname",
    "aria-label": "Filter members",
    autocomplete: "off",
  });
  const membersBox = el("div", { class: "mod-desk-members", "aria-live": "polite" });
  const bansBox = el("div", { class: "mod-desk-bans" });
  const pruneButton = el("button", {
    class: "button button-quiet",
    type: "button",
    text: "Prune inactive members…",
  });
  const automodButton = el("button", {
    class: "button button-quiet automod-open",
    type: "button",
    text: "AutoMod…",
  });

  const deskRefresh = () => {
    dropRoster(doc, win, serverId);
    void ensureRoster(doc, win, serverId).then((roster) => {
      if (roster) render();
    });
  };

  const render = () => {
    error.textContent = "";
    const roster = currentRoster(serverId);
    if (!roster) return;
    membersBox.replaceChildren();

    const query = String(filter.value || "");
    const shown = modDeskFilter(roster.members, query);
    membersBox.append(el("p", {
      class: "muted list-note",
      text: query.trim() === ""
        ? "Members (" + roster.members.length + ")"
        : "Members matching “" + query.trim() + "” (" + shown.length + ")",
    }));

    if (shown.length === 0) {
      membersBox.append(el("p", { class: "muted list-note", text: "No members match." }));
    }
    for (const member of shown) {
      membersBox.append(modDeskMemberRow(doc, win, serverId, member, roster.roles, deskRefresh));
    }

    // The Bans section rides the same payload, only when the roster carried it
    // (the mod-desk viewer class); the empty case still renders so the
    // section never flickers in and out.
    bansBox.replaceChildren();
    const bans = roster.bans || [];
    bansBox.append(el("p", { class: "member-group-label", text: "Bans (" + bans.length + ")" }));
    if (bans.length === 0) {
      bansBox.append(el("p", { class: "muted list-note", text: "No one is banned from this server." }));
    }
    for (const ban of bans) {
      bansBox.append(modDeskBanRow(doc, win, serverId, ban, deskRefresh));
    }
  };

  filter.addEventListener("input", render);

  pruneButton.addEventListener("click", () => {
    openPruneDialog(doc, win, serverId, deskRefresh);
  });

  automodButton.addEventListener("click", () => {
    openAutomodDialog(doc, win, serverId);
  });

  const dialog = el("dialog", { class: "mod-desk-dialog" },
    el("h2", { text: "Member management" }),
    el("p", {
      class: "muted list-note",
      text: "Joined dates, account ages, timeouts, and this server's bans. The server re-checks every act.",
    }),
    filter,
    membersBox,
    bansBox,
    error,
    el("div", { class: "form-actions" },
      el("button", { class: "button button-quiet", type: "button", text: "Done", onclick: () => dialog.close() }),
      pruneButton,
      automodButton,
    ),
  );
  closeDialogOnBackdrop(dialog);
  // Self-removing: the dialog leaves the DOM when it closes (every act opens
  // its own dialog; nothing lingers over the desk).
  dialog.addEventListener("close", () => dialog.remove());
  doc.body.append(dialog);
  dialog.showModal();
  filter.focus();

  // Fresh roster read first: bans + timeouts ride the payload's newest state.
  void ensureRoster(doc, win, serverId).then((roster) => {
    if (roster) render();
  });
}

// One desk row: identity, the joined/account ages, the roles, the timeout
// badge, and the kick / ban / timeout / roles affordances.
function modDeskMemberRow(doc, win, serverId, member, roles, refresh) {
  const me = state.currentUser;
  const isSelf = Number(member.id) === Number(me?.id);
  const isOwnerMember = member.membershipRole === "owner";
  const display = memberDisplay(member);
  const color = validAccent(member.color);

  const row = el("div", { class: "mod-desk-row" });
  const main = el("div", { class: "mod-desk-main" });

  const name = el("span", { class: "name", text: display });
  if (color) name.style.color = color;
  if (isOwnerMember) name.append(createIcon(doc, "shield"));
  main.append(el("div", { class: "mod-desk-name" }, name,
    el("span", { class: "member-username", text: member.username })));

  const roleNames = (member.roleIds || [])
    .map((roleId) => roles.find((role) => Number(role.id) === Number(roleId))?.name)
    .filter(Boolean);
  main.append(el("span", {
    class: "mod-desk-meta",
    text: "Joined " + formatTimestamp(member.joinedAt) +
      " · " + accountAgeCopy(member.accountCreatedAt) +
      (member.createdByInvite ? " · via “" + member.createdByInvite + "”" : "") +
      (roleNames.length > 0 ? " · " + roleNames.join(", ") : ""),
  }));
  if (typeof member.timedOutUntil === "string") {
    main.append(el("span", {
      class: "mod-desk-badge",
      text: "Timed out until " + formatTimestamp(member.timedOutUntil),
    }));
  }
  if (member.verificationEligible === false) {
    main.append(el("span", {
      class: "mod-desk-badge mod-desk-badge-warn",
      text: "Not yet past the verification level",
    }));
  }
  // The rules gate (0012): a pending acceptance is the desk's badge — the
  // Verify affordance below answers it on the member's behalf.
  if (member.rulesAccepted === false) {
    main.append(el("span", {
      class: "mod-desk-badge mod-desk-badge-warn",
      text: "Rules not accepted yet",
    }));
  }
  row.append(main);

  const actions = el("div", { class: "mod-desk-actions" });

  const rowViewer = (currentRoster(serverId) || {}).viewer || null;
  if (viewerCan(rowViewer, SERVER_PERMISSION_NAMES.MANAGE_ROLES) && !isOwnerMember) {
    const rolesButton = iconButton(doc, "shield", {
      ariaLabel: "Roles for " + display,
      className: "icon-button button-quiet",
    });
    rolesButton.addEventListener("click", () => openMemberRolesDialog(doc, win, serverId, member));
    actions.append(rolesButton);
  }
  if (viewerCan(rowViewer, SERVER_PERMISSION_NAMES.KICK_MEMBERS) && !isSelf) {
    const banButton = iconButton(doc, "logout", {
      ariaLabel: "Ban " + display,
      className: "icon-button button-quiet mod-desk-ban",
    });
    banButton.addEventListener("click", () => {
      banMemberDialog(doc, win, serverId, member, refresh);
    });
    actions.append(banButton);
    if (!isOwnerMember) {
      const kickButton = iconButton(doc, "logout", {
        ariaLabel: "Kick " + display,
        className: "icon-button button-quiet member-kick",
      });
      kickButton.addEventListener("click", () => {
        kickMemberDialog(doc, win, serverId, member);
      });
      actions.append(kickButton);
      const timeoutLabel = typeof member.timedOutUntil === "string"
        ? "Change timeout for " + display
        : "Time out " + display;
      const timeoutButton = iconButton(doc, "gear", {
        ariaLabel: timeoutLabel,
        className: "icon-button button-quiet mod-desk-timeout",
      });
      timeoutButton.addEventListener("click", () => {
        openTimeoutDialog(doc, win, serverId, member, refresh);
      });
      actions.append(timeoutButton);
      // The rules gate's manual verify (0012): the same KICK_MEMBERS desk
      // class records the member's acceptance — "a moderator who accepted on
      // someone's behalf". Idempotent server-side; the desk re-reads the
      // roster so the badge follows.
      if (member.rulesAccepted === false) {
        const verifyButton = iconButton(doc, "check", {
          ariaLabel: "Mark rules accepted for " + display,
          className: "icon-button button-quiet mod-desk-rules-verify",
        });
        verifyButton.addEventListener("click", async () => {
          try {
            await api(
              "/api/servers/" + serverId + "/members/" + Number(member.id) + "/rules-verify",
              { method: "POST" },
            );
            refresh();
          } catch (caught) {
            showTransientError(doc, caught?.message || "The verification could not be recorded.");
          }
        });
        actions.append(verifyButton);
      }
    }
  }

  row.append(actions);
  return row;
}

// One ban row: the ex-member, the reason, when, and the un-ban affordance.
function modDeskBanRow(doc, win, serverId, ban, refresh) {
  const row = el("div", { class: "mod-desk-row mod-desk-ban-row" });
  const main = el("div", { class: "mod-desk-main" });
  main.append(el("div", { class: "mod-desk-name" },
    el("span", { class: "name", text: ban.username || "member" })));
  main.append(el("span", {
    class: "mod-desk-meta",
    text: "Banned " + formatTimestamp(ban.bannedAt) +
      (ban.reason ? " · " + ban.reason : ""),
  }));
  row.append(main);

  const unban = el("button", {
    class: "button button-quiet",
    type: "button",
    text: "Un-ban",
  });
  unban.addEventListener("click", async () => {
    try {
      await api("/api/servers/" + serverId + "/bans/" + Number(ban.id), { method: "DELETE" });
      refresh();
    } catch (caught) {
      showTransientError(doc, caught?.message || "The ban could not be removed.");
    }
  });
  const actions = el("div", { class: "mod-desk-actions" }, unban);
  row.append(actions);
  return row;
}

// The ban confirm: kick + a flag the join routes check, reason optional —
// the destructive gate rides a dialog that removes itself on close.
function banMemberDialog(doc, win, serverId, member, refresh) {
  const display = memberDisplay(member);
  const reasonInput = el("input", {
    type: "text",
    maxlength: "280",
    id: "ban-reason",
    placeholder: "Optional reason (at most 280 characters)",
    "aria-label": "Ban reason",
  });
  const error = el("p", { class: "error-strip", role: "alert" });
  const dialog = el("dialog", {},
    el("h2", { text: "Ban " + display + "?" }),
    el("p", {
      class: "muted",
      text: "The member leaves this server and no invite can bring them back while the ban stands. The server re-checks this.",
    }),
    el("div", { class: "form-field" },
      el("label", { for: "ban-reason", text: "Reason (optional)" }),
      reasonInput,
    ),
    error,
    el("div", { class: "form-actions" },
      el("button", { class: "button button-quiet", type: "button", text: "Cancel", onclick: () => dialog.close() }),
      el("button", {
        class: "button button-danger",
        type: "button",
        text: "Ban",
        onclick: async () => {
          try {
            const reason = String(reasonInput.value || "").trim();
            await api("/api/servers/" + serverId + "/bans", {
              method: "POST",
              body: { user_id: Number(member.id), ...(reason === "" ? {} : { reason }) },
            });
            dialog.close();
            refresh();
          } catch (caught) {
            error.textContent = caught?.message || "The ban could not be saved.";
          }
        },
      }),
    ),
  );
  closeDialogOnBackdrop(dialog);
  doc.body.append(dialog);
  dialog.showModal();
  reasonInput.focus();
}

// The timeout dialog: the filed duration menu plus the remove affordance.
function openTimeoutDialog(doc, win, serverId, member, refresh) {
  const display = memberDisplay(member);
  const timedOut = typeof member.timedOutUntil === "string";
  const error = el("p", { class: "error-strip", role: "alert" });

  const menu = el("select", { id: "timeout-minutes", "aria-label": "Timeout duration" });
  for (const [minutes, label] of TIMEOUT_MINUTE_OPTIONS) {
    menu.append(el("option", { value: String(minutes), text: label }));
  }

  const dialog = el("dialog", {},
    el("h2", { text: "Time out " + display + "?" }),
    el("p", {
      class: "muted list-note",
      text: "While it lasts they can read but not send or join voice. Removal is anytime and always allowed.",
    }),
    el("div", { class: "form-field" },
      el("label", { for: "timeout-minutes", text: "Duration" }),
      menu,
    ),
    error,
    el("div", { class: "form-actions" },
      el("button", { class: "button button-quiet", type: "button", text: "Cancel", onclick: () => dialog.close() }),
      ...(timedOut ? [el("button", {
        class: "button button-quiet",
        type: "button",
        text: "Remove timeout",
        onclick: async () => {
          try {
            await api("/api/servers/" + serverId + "/members/" + Number(member.id) + "/timeout", {
              method: "DELETE",
            });
            dialog.close();
            refresh();
          } catch (caught) {
            error.textContent = caught?.message || "The timeout could not be removed.";
          }
        },
      })] : []),
      el("button", {
        class: "button button-primary",
        type: "button",
        text: "Time out",
        onclick: async () => {
          try {
            await api("/api/servers/" + serverId + "/members/" + Number(member.id) + "/timeout", {
              method: "PUT",
              body: { minutes: Number(menu.value) || 0 },
            });
            dialog.close();
            refresh();
          } catch (caught) {
            error.textContent = caught?.message || "The timeout could not be saved.";
          }
        },
      }),
    ),
  );
  closeDialogOnBackdrop(dialog);
  doc.body.append(dialog);
  dialog.showModal();
}

// The prune dialog (the how-to-prune guide): a 7/30 window, an optional role
// filter, the preview COUNT before any commitment, then the confirm apply.
function openPruneDialog(doc, win, serverId, refresh) {
  const roster = currentRoster(serverId);
  const error = el("p", { class: "error-strip", role: "alert" });
  const preview = el("p", { class: "muted list-note" });

  const windowSelect = el("select", { id: "prune-days", "aria-label": "Inactive for at least" });
  for (const [days, label] of PRUNE_DAY_OPTIONS) {
    windowSelect.append(el("option", { value: String(days), text: label }));
  }
  const roleSelect = el("select", { id: "prune-role", "aria-label": "Role filter" });
  roleSelect.append(el("option", { value: "", text: "Any role" }));
  for (const role of roster?.roles || []) {
    roleSelect.append(el("option", { value: String(role.id), text: role.name }));
  }

  const applyButton = el("button", {
    class: "button button-primary",
    type: "button",
    text: "Apply prune",
    hidden: "",
  });

  const body = () => ({
    days: Number(windowSelect.value) || 0,
    dry_run: true,
  });

  const previewButton = el("button", {
    class: "button button-secondary",
    type: "button",
    text: "Preview count",
  });
  previewButton.addEventListener("click", async () => {
    error.textContent = "";
    preview.textContent = "";
    applyButton.hidden = true;
    try {
      const result = await api("/api/servers/" + serverId + "/prune", { method: "POST", body: body() });
      // The server's answer decides: dry_run comes back true with the count.
      const count = result.dry_run === true ? Number(result.count) : 0;
      preview.textContent = count === 1
        ? "1 member qualifies right now."
        : count + " members qualify right now.";
      applyButton.hidden = count <= 0;
    } catch (caught) {
      error.textContent = caught?.message || "The prune preview could not be loaded.";
      applyButton.hidden = true;
    }
  });

  applyButton.addEventListener("click", async () => {
    error.textContent = "";
    try {
      const result = await api("/api/servers/" + serverId + "/prune", {
        method: "POST",
        body: { ...body(), dry_run: false },
      });
      dialog.close();
      showTransientError(doc, "Prune applied — " + Number(result.kicked) + " member(s) removed.");
      refresh();
    } catch (caught) {
      error.textContent = caught?.message || "The prune could not be applied.";
    }
  });

  const dialog = el("dialog", {},
    el("h2", { text: "Prune inactive members" }),
    el("p", {
      class: "muted",
      text: "Kicks members with no messages in this server since the window opened. The owner and members above you are never pruned — preview first.",
    }),
    el("div", { class: "form-field" },
      el("label", { for: "prune-days", text: "Inactive for at least" }),
      windowSelect,
    ),
    el("div", { class: "form-field" },
      el("label", { for: "prune-role", text: "Only members with role" }),
      roleSelect,
    ),
    preview,
    error,
    el("div", { class: "form-actions" },
      el("button", { class: "button button-quiet", type: "button", text: "Cancel", onclick: () => dialog.close() }),
      previewButton,
      applyButton,
    ),
  );
  closeDialogOnBackdrop(dialog);
  doc.body.append(dialog);
  dialog.showModal();
}

// --- 0010 AutoMod: the rules + alerts desk -------------------------------------
//
// The per-server filter rules surface (the keyword filter's keyword rules,
// care rules, name checks, and the alerts feed), reachable from the members
// desk. Every act re-reads both endpoints; el()/textContent only.

const AUTOMOD_ACTION_OPTIONS = [[
  "block", "Block the message"
], ["alert", "Alert the mod feed"], ["timeout", "Time the member out"]];

function automodRuleSummary(rule) {
  const termText = (rule.terms || []).map((term) => term.text).join(", ");
  const actionText = rule.isCare
    ? "care only"
    : (rule.actions.length > 0 ? rule.actions.join(" + ") : "block");
  const flags = [];
  if (rule.isCare) flags.push("care");
  if (rule.checkNames) flags.push("names");
  return rule.name + " — " + termText + " · " + actionText +
    (flags.length > 0 ? " · " + flags.join(", ") : "");
}

// One rule row: the summary line and its edit + delete affordances.
function automodRuleRow(doc, win, serverId, rule, reload) {
  const row = el("div", { class: "mod-desk-row automod-rule-row" });
  const main = el("div", { class: "mod-desk-main" });
  main.append(el("div", { class: "mod-desk-name" },
    el("span", { class: "name", text: rule.name }),
    rule.isCare ? el("span", { class: "mod-desk-badge", text: "care" }) : null,
    rule.checkNames ? el("span", { class: "mod-desk-badge", text: "names" }) : null));
  main.append(el("span", { class: "mod-desk-meta", text: automodRuleSummary(rule) }));
  row.append(main);

  const actions = el("div", { class: "mod-desk-actions" });
  const edit = el("button", { class: "button button-quiet", type: "button", text: "Edit" });
  edit.addEventListener("click", () => openAutomodRuleDialog(doc, win, serverId, rule, reload));
  const remove = el("button", {
    class: "button button-quiet automod-rule-delete",
    type: "button",
    text: "Delete",
  });
  remove.addEventListener("click", async () => {
    try {
      await api("/api/servers/" + serverId + "/filter/rules/" + Number(rule.id), { method: "DELETE" });
      await reload();
    } catch (caught) {
      showTransientError(doc, caught?.message || "The rule could not be deleted.");
    }
  });
  actions.append(edit, remove);
  row.append(actions);
  return row;
}

function openAutomodDialog(doc, win, serverId) {
  const rulesBox = el("div", { class: "mod-desk-members automod-rules", "aria-live": "polite" });
  const alertsBox = el("div", { class: "mod-desk-bans automod-alerts", "aria-live": "polite" });
  const addButton = el("button", {
    class: "button button-quiet automod-add",
    type: "button",
    text: "Add rule…",
  });
  addButton.addEventListener("click", () =>
    openAutomodRuleDialog(doc, win, serverId, null, reload));

  async function fetchAll() {
    const [rulesPayload, alertsPayload] = await Promise.all([
      api("/api/servers/" + serverId + "/filter/rules"),
      api("/api/servers/" + serverId + "/filter/alerts"),
    ]);
    return { rules: rulesPayload.rules || [], alerts: alertsPayload.alerts || [] };
  }

  async function reload() {
    rulesBox.replaceChildren();
    alertsBox.replaceChildren();
    let data;
    try {
      data = await fetchAll();
    } catch (caught) {
      rulesBox.append(el("p", {
        class: "muted list-note",
        text: caught?.message || "The AutoMod desk could not be read.",
      }));
      return;
    }

    rulesBox.append(el("p", {
      class: "member-group-label",
      text: "Rules (" + data.rules.length + ") — keywords, wildcards like bad*, regex like /ba\\s?d/, care, name checks",
    }));
    if (data.rules.length === 0) {
      rulesBox.append(el("p", { class: "muted list-note", text: "No rules yet. Only the site-wide keyword list applies." }));
    }
    for (const rule of data.rules) {
      rulesBox.append(automodRuleRow(doc, win, serverId, rule, reload));
    }

    alertsBox.append(el("p", {
      class: "member-group-label",
      text: "Alerts (" + data.alerts.length + ") — the newest " + 200 + " a server keeps",
    }));
    if (data.alerts.length === 0) {
      alertsBox.append(el("p", { class: "muted list-note", text: "Nothing has tripped a rule yet." }));
    }
    for (const alert of data.alerts) {
      const row = el("div", { class: "mod-desk-row automod-alert-row" });
      const main = el("div", { class: "mod-desk-main" });
      main.append(el("div", { class: "mod-desk-name" },
        el("span", { class: "name", text: alert.username || "member" }),
        el("span", { class: "mod-desk-meta", text: " · " + (alert.ruleName || "rule") })));
      main.append(el("span", {
        class: "mod-desk-meta",
        text: formatTimestamp(alert.createdAt) +
          (alert.matched ? " · matched " + alert.matched : "") +
          (alert.messageId ? " · message stored" : ""),
      }));
      row.append(main);
      alertsBox.append(row);
    }
  }

  const dialog = el("dialog", { class: "mod-desk-dialog automod-dialog" },
    el("h2", { text: "AutoMod" }),
    el("p", {
      class: "muted list-note",
      text: "Per-server keyword rules on top of the site-wide list. Care rules never block — their notice rides the message itself.",
    }),
    rulesBox,
    alertsBox,
    el("div", { class: "form-actions" },
      el("button", { class: "button button-quiet", type: "button", text: "Done", onclick: () => dialog.close() }),
      addButton,
    ),
  );
  closeDialogOnBackdrop(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  doc.body.append(dialog);
  dialog.showModal();
  void reload();
}

// The rule editor dialog (add or edit). Care rules ignore their actions on
// the server; the editor hides the action pick when the care box is on.
function openAutomodRuleDialog(doc, win, serverId, existing, reload) {
  const nameInput = el("input", {
    type: "text",
    maxlength: "64",
    id: "automod-rule-name",
    value: existing?.name || "",
    "aria-label": "Rule name",
  });
  const termsInput = el("textarea", {
    id: "automod-rule-terms",
    rows: "6",
    "aria-label": "Filter terms, one per line",
    placeholder: "forbiddenterm\ncat*\n*dog*\n/rx\\s?term/",
  });
  termsInput.value = (existing?.terms || []).map((term) => term.text).join("\n");

  const careCheck = el("input", { type: "checkbox", id: "automod-rule-care" });
  careCheck.checked = existing?.isCare === true;
  const namesCheck = el("input", { type: "checkbox", id: "automod-rule-names" });
  namesCheck.checked = existing?.checkNames === true;

  const actionBoxes = AUTOMOD_ACTION_OPTIONS.map(([action, label]) => {
    const box = el("input", {
      type: "checkbox",
      id: "automod-action-" + action,
      value: action,
    });
    box.checked = existing
      ? existing.actions.includes(action)
      : action === "block";
    return { action, box, label };
  });

  const blockMessageInput = el("input", {
    type: "text",
    maxlength: "150",
    id: "automod-rule-block-message",
    value: existing?.blockMessage || "",
    "aria-label": "Block message (optional)",
  });

  const timeoutSelect = el("select", { id: "automod-rule-timeout", "aria-label": "Timeout length" });
  for (const [minutes, label] of TIMEOUT_MINUTE_OPTIONS) {
    const option = el("option", { value: String(minutes), text: label });
    if (existing?.timeoutMinutes !== undefined && Number(existing.timeoutMinutes) === Number(minutes)) {
      option.selected = true;
    } else if (minutes === 10 && existing?.timeoutMinutes === undefined) {
      option.selected = true;
    }
    timeoutSelect.append(option);
  }

  const error = el("p", { class: "error-strip", role: "alert" });

  const syncCare = () => {
    for (const { box } of actionBoxes) box.disabled = careCheck.checked;
    namesCheck.disabled = careCheck.checked;
  };
  careCheck.addEventListener("change", syncCare);
  syncCare();

  async function save() {
    error.textContent = "";
    const payload = {
      name: nameInput.value,
      terms: termsInput.value,
      isCare: careCheck.checked,
      checkNames: namesCheck.checked,
      blockMessage: blockMessageInput.value === "" ? null : blockMessageInput.value,
    };
    if (!careCheck.checked) {
      payload.actions = actionBoxes.filter((entry) => entry.box.checked).map((entry) => entry.action);
      if (payload.actions.includes("timeout")) payload.timeoutMinutes = Number(timeoutSelect.value);
    }
    try {
      if (existing) {
        await api("/api/servers/" + serverId + "/filter/rules/" + Number(existing.id), {
          method: "PUT",
          body: payload,
        });
      } else {
        await api("/api/servers/" + serverId + "/filter/rules", { method: "POST", body: payload });
      }
      dialog.close();
      if (typeof reload === "function") await reload();
    } catch (caught) {
      error.textContent = caught?.message || "The rule could not be saved.";
    }
  }

  const dialog = el("dialog", {},
    el("h2", { text: existing ? "Edit rule: " + (existing?.name || "") : "Add AutoMod rule" }),
    el("div", { class: "form-field" },
      el("label", { for: "automod-rule-name", text: "Rule name" }),
      nameInput,
    ),
    el("div", { class: "form-field" },
      el("label", { for: "automod-rule-terms", text: "Terms (one per line; cat* prefix, *cat suffix, *cat* anywhere, /regex/, plain text)" }),
      termsInput,
    ),
    el("div", { class: "form-field" },
      el("label", { for: "automod-rule-care" }, careCheck,
        document.createTextNode(" Care rule (never blocks — the message ships with a supportive notice)")),
    ),
    el("div", { class: "form-field" },
      el("label", { for: "automod-rule-names" }, namesCheck, document.createTextNode(" Check nicknames with these terms")),
    ),
    el("fieldset", { class: "automod-actions" },
      el("legend", { text: "Response (combinable)" }),
      actionBoxes.map(({ action, box, label }) =>
        el("div", { class: "automod-action" },
          el("label", { for: "automod-action-" + action }, box, document.createTextNode(" " + label))),
      ),
      el("div", { class: "form-field automod-timeout" },
        el("label", { for: "automod-rule-timeout", text: "Timeout length" }),
        timeoutSelect,
      ),
    ),
    el("div", { class: "form-field" },
      el("label", { for: "automod-rule-block-message", text: "Message the member sees (optional, <= 150 chars)" }),
      blockMessageInput,
    ),
    error,
    el("div", { class: "form-actions" },
      el("button", { class: "button button-quiet", type: "button", text: "Cancel", onclick: () => dialog.close() }),
      el("button", { class: "button button-primary", type: "button", text: "Save", onclick: () => void save() }),
    ),
  );
  closeDialogOnBackdrop(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  doc.body.append(dialog);
  dialog.showModal();
  nameInput.focus();
}

// One role row in the roles dialog: color dot, name, powers, and the
// reorder / rename / delete affordances.
function roleRow(doc, win, serverId, role, roles, reload, error) {
  const row = el("div", { class: "role-row", dataset: { roleId: String(role.id) } });
  const dot = el("span", { class: "role-dot role-dot-static", "aria-hidden": "true" });
  if (role.color && validAccent(role.color)) {
    dot.style.setProperty("--role-color", validAccent(role.color));
  }
  row.append(dot);
  row.append(el("span", { class: "role-name", text: role.name }));
  row.append(el("span", {
    class: "role-perms",
    text: (role.permissions || []).length > 0 ? role.permissions.join(", ") : "no extra powers",
  }));

  const actions = el("div", { class: "role-actions" });

  const move = (delta) => {
    const index = roles.findIndex((entry) => Number(entry.id) === Number(role.id));
    const neighborIndex = index + delta;
    if (neighborIndex < 0) {
      error.textContent = "That role is already first.";
      return;
    }
    if (neighborIndex >= roles.length) {
      error.textContent = "That role is already last.";
      return;
    }
    error.textContent = "";
    void (async () => {
      try {
        await api("/api/servers/" + serverId + "/roles/" + Number(role.id), {
          method: "PATCH",
          body: { position: Number(roles[neighborIndex].position) },
        });
        await reload();
        dropRoster(doc, win, serverId);
      } catch (caught) {
        error.textContent = caught?.message || "The role could not be moved.";
      }
    })();
  };
  const up = iconButton(doc, "caret-down", {
    ariaLabel: "Increase " + role.name + " position",
    className: "icon-button button-quiet role-up",
  });
  up.style.transform = "rotate(180deg)";
  up.addEventListener("click", () => move(-1));
  actions.append(up);
  const down = iconButton(doc, "caret-down", {
    ariaLabel: "Decrease " + role.name + " position",
    className: "icon-button button-quiet role-down",
  });
  down.addEventListener("click", () => move(1));
  actions.append(down);

  const rename = iconButton(doc, "pen", {
    ariaLabel: "Rename " + role.name,
    className: "icon-button button-quiet role-rename",
  });
  rename.addEventListener("click", () => openRoleEditDialog(doc, win, serverId, role, reload));
  actions.append(rename);

  const remove = iconButton(doc, "trash", {
    ariaLabel: "Delete " + role.name,
    className: "icon-button button-quiet role-delete",
  });
  remove.addEventListener("click", () =>
    roleDeleteDialog(doc, win, serverId, role, reload));
  actions.append(remove);

  row.append(actions);
  return row;
}

function openRoleEditDialog(doc, win, serverId, role, reload) {
  const nameInput = el("input", {
    type: "text",
    maxlength: "32",
    id: "role-name-edit",
    value: role.name,
    "aria-label": "Role name",
  });
  const colorInput = el("input", {
    type: "text",
    maxlength: "7",
    id: "role-color-edit",
    value: role.color || "",
    "aria-label": "Role color",
    placeholder: "#397357",
  });
  const error = el("p", { class: "error-strip", role: "alert" });
  const dialog = el("dialog", {},
    el("h2", { text: "Edit role" }),
    el("form", { novalidate: "" },
      el("div", { class: "form-field" },
        el("label", { for: "role-name-edit", text: "Name" }),
        nameInput,
      ),
      el("div", { class: "form-field" },
        el("label", { for: "role-color-edit", text: "Color (blank = default)" }),
        colorInput,
      ),
      error,
      el("div", { class: "form-actions" },
        el("button", { class: "button button-quiet", type: "button", text: "Cancel", onclick: () => dialog.close() }),
        el("button", { class: "button button-primary", type: "submit", text: "Save" }),
      ),
    ),
  );
  dialog.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    const name = String(nameInput.value || "").trim();
    const raw = String(colorInput.value || "").trim().toLowerCase();
    if (!name) {
      error.textContent = "Role name must be between 1 and 32 characters.";
      return;
    }
    if (raw && !ROLE_COLOR_RE.test(raw)) {
      error.textContent = "Role color must be a #rrggbb hex string or blank.";
      return;
    }
    try {
      await api("/api/servers/" + serverId + "/roles/" + Number(role.id), {
        method: "PATCH",
        body: { name, color: raw || null },
      });
      dialog.close();
      await reload();
      dropRoster(doc, win, serverId);
    } catch (caught) {
      error.textContent = caught?.message || "The role could not be saved.";
    }
  });
  closeDialogOnBackdrop(dialog);
  doc.body.append(dialog);
  dialog.showModal();
  nameInput.focus();
}

function roleDeleteDialog(doc, win, serverId, role, reload) {
  const dialog = el("dialog", {},
    el("h2", { text: "Delete " + role.name + "?" }),
    el("p", { class: "muted", text: "Members holding this role lose it (not the server). Its color and powers go with it." }),
    el("div", { class: "form-actions" },
      el("button", { class: "button button-quiet", type: "button", text: "Cancel", onclick: () => dialog.close() }),
      el("button", {
        class: "button button-primary",
        type: "button",
        text: "Delete",
        onclick: async () => {
          try {
            await api("/api/servers/" + serverId + "/roles/" + Number(role.id), { method: "DELETE" });
            dialog.close();
            await reload();
            dropRoster(doc, win, serverId);
          } catch (caught) {
            dialog.close();
            showTransientError(doc, caught?.message || "The role could not be deleted.");
          }
        },
      }),
    ),
  );
  closeDialogOnBackdrop(dialog);
  doc.body.append(dialog);
  dialog.showModal();
}

// Channel settings (phase-3): the spoiler toggle (0006), plus the 0007 layer
// controls — the category move, the slowmode, and the overwrite editor (the
// tri-state idiom: ✓ allow / ✗ deny / "/" inherit, one row per layer, one
// select per bit). The section loads on open (the overwrites endpoint);
// every PUT/DELETE re-reads the server list so the sidebar follows.
function openChannelSettingsDialog(doc, win, serverId, channel) {
  const server = (caches.servers || []).find((entry) => entry.id === serverId) || null;
  const viewer = currentRoster(serverId)?.viewer || null;

  const checkbox = el("input", {
    type: "checkbox",
    id: "spoiler-toggle",
    ...(channel.isSpoiler === true ? { checked: "" } : {}),
  });
  const categorySelect = el("select", { name: "category_id", id: "channel-category" });
  categorySelect.append(el("option", { value: "", text: "(no category)" }));
  for (const category of server?.categories || []) {
    categorySelect.append(
      el("option", { value: String(Number(category.id)), text: category.name }),
    );
  }
  if (channel.categoryId !== undefined && channel.categoryId !== null) {
    categorySelect.value = String(Number(channel.categoryId));
  }
  const slowmodeSelect = el("select", { name: "slowmode_seconds", id: "channel-slowmode" });
  for (const [seconds, label] of SLOWMODE_OPTIONS) {
    slowmodeSelect.append(el("option", { value: String(seconds), text: label }));
  }
  slowmodeSelect.value = String(Number(channel.slowmodeSeconds) || 0);

  const error = el("p", { class: "error-strip", role: "alert" });
  const permsHost = el("div", { class: "overwrite-editor", "aria-label": "Channel permissions" });

  const dialog = el("dialog", {},
    el("h2", { text: "Channel settings — " + channel.name }),
    el("form", { novalidate: "", class: "channel-settings-form" },
      el("div", { class: "form-field spoiler-field" },
        el("label", { for: "spoiler-toggle" },
          checkbox,
          el("span", { text: "Spoiler channel" }),
        ),
        el("p", { class: "muted", text: "Members see a notice before entering, and the channel stays grayed until they opt in (per browser)." }),
      ),
      el("div", { class: "form-field" },
        el("label", { for: "channel-category", text: "Category" }),
        categorySelect,
      ),
      el("div", { class: "form-field" },
        el("label", { for: "channel-slowmode", text: "Slowmode" }),
        slowmodeSelect,
      ),
      error,
      el("div", { class: "form-actions" },
        el("button", { class: "button button-quiet", type: "button", text: "Cancel", onclick: () => dialog.close() }),
        el("button", { class: "button button-primary", type: "submit", text: "Save" }),
      ),
    ),
    el("h3", { text: "Permissions" }),
    el("p", {
      class: "muted",
      text: "“/” inherits the layer below (✓ allows, ✗ denies). Denying VIEW makes a text channel vanish for those members — owners always see everything.",
    }),
    permsHost,
  );
  dialog.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    try {
      const categoryId = categorySelect.value === "" ? null : Number(categorySelect.value);
      await api("/api/servers/" + serverId + "/channels/" + Number(channel.id), {
        method: "PATCH",
        body: {
          is_spoiler: checkbox.checked,
          category_id: categoryId,
          slowmode_seconds: Number(slowmodeSelect.value || 0),
        },
      });
      channel.isSpoiler = checkbox.checked;
      channel.categoryId = categoryId === null ? undefined : categoryId;
      channel.slowmodeSeconds = Number(slowmodeSelect.value || 0);
      dialog.close();
      await refreshServersAndRerender(doc, win, parseHash(win.location.hash));
    } catch (caught) {
      error.textContent = caught?.message || "The channel could not be updated.";
    }
  });

  // The overwrite editor loads in the background (only for viewers who could
  // actually edit — everyone else keeps the dialog to the three toggles).
  if (viewer?.owner || viewerCan(viewer, "MANAGE_CHANNELS") ||
      viewerCan(viewer, "MANAGE_ROLES")) {
    void loadOverwriteEditor(doc, win, serverId, channel, permsHost);
  } else {
    permsHost.append(el("p", { class: "muted list-note", text: "No permission editor here." }));
  }

  closeDialogOnBackdrop(dialog);
  doc.body.append(dialog);
  dialog.showModal();
}

// The tri-state overwrite editor: one row per layer (@everyone + each role),
// one select per editable bit ("/" inherit — no mask —, ✓ allow, ✗ deny).
// Saving a fully-inherited layer DELETEs its overwrite row; anything else PUTs
// the computed masks. Every save re-reads the list payload, so the sidebar
// and this dialog agree with the server the same way.
async function loadOverwriteEditor(doc, win, serverId, channel, host) {
  host.replaceChildren(el("p", { class: "muted list-note", text: "Loading permissions…" }));
  let payload;
  try {
    payload = await api(
      "/api/servers/" + serverId + "/channels/" + Number(channel.id) + "/overwrites",
    );
  } catch (caught) {
    if (!host.isConnected) return;
    host.replaceChildren(
      el("p", { class: "muted list-note",
        text: caught?.message || "The permissions could not be loaded." }),
    );
    return;
  }
  if (!host.isConnected) return;

  // state: layer key -> {VIEW|SEND|CONNECT|SPEAK: "inherit"|"allow"|"deny"}.
  // An existing row whose deny holds a bit wins the prefill (deny-over-allow
  // is also the evaluator's own read of a conflicted mask).
  const rows = payload.overwrites || [];
  const rowByLayer = new Map(rows.map((row) => [row.roleId === null ? "everyone" : row.roleId, row]));
  const state = new Map();
  const layerEntry = (key) => {
    const existing = state.get(key) || { VIEW: "inherit", SEND: "inherit", CONNECT: "inherit", SPEAK: "inherit" };
    const row = rowByLayer.get(key);
    if (row) {
      for (const name of OVERWRITE_PERMISSION_NAMES) {
        existing[name] = row.deny?.includes(name) ? "deny"
          : row.allow?.includes(name) ? "allow"
          : "inherit";
      }
    }
    state.set(key, existing);
    return existing;
  };

  const layers = [
    { key: "everyone", label: "@everyone", entry: layerEntry("everyone") },
    ...(payload.roles || []).map((role) => ({
      key: Number(role.id),
      label: role.name,
      entry: layerEntry(Number(role.id)),
    })),
  ];

  const renderRow = (layer) => {
    const row = el("div", { class: "overwrite-row", dataset: { layerKey: String(layer.key) } });
    row.append(el("span", { class: "overwrite-layer", text: layer.label }));
    const selects = new Map();
    for (const name of OVERWRITE_PERMISSION_NAMES) {
      const select = el("select", {
        "aria-label": name + " for " + layer.label,
      });
      for (const [value, mark] of [["inherit", " / "], ["allow", "✓"], ["deny", "✗"]]) {
        const option = el("option", { value, text: mark + " " + (value === "inherit" ? "inherit" : value.toLowerCase()) });
        select.append(option);
      }
      select.value = layer.entry[name];
      selects.set(name, select);
      row.append(el("span", { class: "overwrite-bit" }, select));
    }
    const note = el("span", { class: "muted overwrite-note" });
    const save = el("button", { class: "button button-quiet", type: "button", text: "Save" });
    save.addEventListener("click", async () => {
      save.disabled = true;
      const allow = OVERWRITE_PERMISSION_NAMES.filter((name) => selects.get(name).value === "allow");
      const deny = OVERWRITE_PERMISSION_NAMES.filter((name) => selects.get(name).value === "deny");
      const path = "/api/servers/" + serverId + "/channels/" + Number(channel.id) +
        "/overwrites/" + (layer.key === "everyone" ? "everyone" : String(Number(layer.key)));
      const hasRow = rowByLayer.has(layer.key);
      try {
        if (allow.length === 0 && deny.length === 0) {
          if (hasRow) await api(path, { method: "DELETE" });
        } else {
          await api(path, { method: "PUT", body: { allow_mask: allow, deny_mask: deny } });
        }
        await refreshServersAndRerender(doc, win, parseHash(win.location.hash));
        await loadOverwriteEditor(doc, win, serverId, channel, host);
      } catch (caught) {
        note.textContent = caught?.message || "The permissions could not be saved.";
        save.disabled = false;
      }
    });
    row.append(save, note);
    return row;
  };

  host.replaceChildren(...layers.map(renderRow));
}

// --- conversation starters ------------------------------------------------------

async function startDirectTo(doc, win, userId) {
  try {
    const result = await api("/api/conversations", {
      method: "POST",
      body: { userIds: [Number(userId)] },
    });
    caches.conversations = null;
    win.location.hash = "#/c/" + result.conversation.id;
  } catch (caught) {
    showTransientError(doc, caught?.message || "The conversation could not be started.");
  }
}

function startConversationDialog(doc, win) {
  const online = caches.presence || [];
  const error = el("p", { class: "error-strip", role: "alert" });

  const list = el("div", { class: "fieldset-list", role: "group", "aria-label": "People" });
  const others = online.filter((entry) => Number(entry.userId) !== Number(state.currentUser?.id));

  for (const entry of others) {
    const checkbox = el("input", { type: "checkbox", value: String(entry.userId) });
    list.append(el("label", {}, checkbox, el("span", { text: entry.username })));
  }

  if (others.length === 0) {
    list.append(
      mascotMoment(null, {
        mood: "waiting",
        size: "mini",
        text: "Nobody else is online right now — conversations need at least one other member.",
      }),
    );
  }

  const cancel = el("button", { class: "button button-quiet", type: "button", text: "Cancel" });
  const dialog = el("dialog", {},
    el("h2", { text: "Start a conversation" }),
    el("p", { class: "muted", text: "One pick opens a DM; two to eight opens a group." }),
    el("form", { novalidate: "" }, list, error,
      el("div", { class: "form-actions" },
        cancel,
        el("button", { class: "button button-primary", type: "submit", text: "Open conversation" }),
      ),
    ),
  );

  cancel.addEventListener("click", () => dialog.close());
  dialog.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";

    const picked = [...dialog.querySelectorAll('input[type="checkbox"]:checked')]
      .map((node) => Number(node.value))
      .filter((value) => Number.isSafeInteger(value) && value > 0);

    if (picked.length < 1 || picked.length > 8) {
      error.textContent = "Pick between 1 and 8 people.";
      return;
    }

    try {
      const result = await api("/api/conversations", { method: "POST", body: { userIds: picked } });
      dialog.close();
      caches.conversations = null;
      win.location.hash = "#/c/" + result.conversation.id;
    } catch (caught) {
      error.textContent = caught?.message || "The conversation could not be started.";
    }
  });

  doc.body.append(dialog);
  dialog.showModal();
}

function createChannelDialog(doc, win, serverId) {
  const server = (caches.servers || []).find((entry) => entry.id === serverId) || null;
  const nameInput = el("input", { type: "text", maxlength: "100", required: "", id: "channel-name" });
  const kindSelect = el("select", { name: "kind", id: "channel-kind" },
    el("option", { value: "text", text: "Text" }),
    el("option", { value: "voice", text: "Voice" }),
  );
  const categorySelect = el("select", { name: "category_id", id: "channel-category" });
  categorySelect.append(el("option", { value: "", text: "(no category)" }));
  for (const category of server?.categories || []) {
    categorySelect.append(
      el("option", { value: String(Number(category.id)), text: category.name }),
    );
  }
  const slowmodeSelect = el("select", { name: "slowmode_seconds", id: "channel-slowmode" });
  for (const [seconds, label] of SLOWMODE_OPTIONS) {
    slowmodeSelect.append(el("option", { value: String(seconds), text: label }));
  }
  const privateBox = el("input", { type: "checkbox", id: "channel-private" });
  const error = el("p", { class: "error-strip", role: "alert" });
  const cancel = el("button", { class: "button button-quiet", type: "button", text: "Cancel" });
  const dialog = el("dialog", {},
    el("h2", { text: "Create a channel" }),
    el("form", { novalidate: "" },
      el("div", { class: "form-field" },
        el("label", { for: "channel-name", text: "Channel name" }),
        nameInput,
      ),
      el("div", { class: "form-field" },
        el("label", { for: "channel-kind", text: "Kind" }),
        kindSelect,
      ),
      el("div", { class: "form-field" },
        el("label", { for: "channel-category", text: "Category" }),
        categorySelect,
      ),
      el("div", { class: "form-field" },
        el("label", { for: "channel-slowmode", text: "Slowmode" }),
        slowmodeSelect,
      ),
      el("div", { class: "form-field" },
        el("label", { for: "channel-private" },
          privateBox,
          el("span", {
            text: "Private channel",
            title: "Only members holding a role can view it (you always can). Pick roles later in the channel's permissions settings.",
          }),
        ),
      ),
      error,
      el("div", { class: "form-actions" },
        cancel,
        el("button", { class: "button button-primary", type: "submit", text: "Create" }),
      ),
    ),
  );

  cancel.addEventListener("click", () => dialog.close());
  dialog.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    try {
      await api("/api/servers/" + serverId + "/channels", {
        method: "POST",
        body: {
          name: String(nameInput.value || "").trim(),
          kind: String(kindSelect.value || "text"),
          category_id: categorySelect.value === "" ? null : Number(categorySelect.value),
          slowmode_seconds: Number(slowmodeSelect.value || 0),
          private: privateBox.checked === true,
        },
      });
      dialog.close();
      await refreshServersAndRerender(doc, win, { serverId, channelId: null });
    } catch (caught) {
      error.textContent = caught?.message || "The channel could not be created.";
    }
  });

  doc.body.append(dialog);
  dialog.showModal();
  nameInput.focus();
}

// The category-create dialog (0007): a name and an append-at-bottom INSERT
// — the route's guard carries the owner OR MANAGE_CHANNELS authority.
function createCategoryDialog(doc, win, serverId) {
  const nameInput = el("input", {
    type: "text",
    maxlength: "32",
    required: "",
    id: "category-name",
    "aria-label": "Category name",
    placeholder: "Text channels",
  });
  const error = el("p", { class: "error-strip", role: "alert" });
  const cancel = el("button", { class: "button button-quiet", type: "button", text: "Cancel" });
  const dialog = el("dialog", {},
    el("h2", { text: "Add a category" }),
    el("form", { novalidate: "" },
      el("div", { class: "form-field" },
        el("label", { for: "category-name", text: "Category name" }),
        nameInput,
      ),
      error,
      el("div", { class: "form-actions" },
        cancel,
        el("button", { class: "button button-primary", type: "submit", text: "Create" }),
      ),
    ),
  );

  cancel.addEventListener("click", () => dialog.close());
  dialog.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    try {
      await api("/api/servers/" + serverId + "/categories", {
        method: "POST",
        body: { name: String(nameInput.value || "").trim() },
      });
      dialog.close();
      await refreshServersAndRerender(doc, win, parseHash(win.location.hash));
    } catch (caught) {
      error.textContent = caught?.message || "The category could not be created.";
    }
  });

  doc.body.append(dialog);
  dialog.showModal();
  nameInput.focus();
}

// --- invites + visibility (discovery task) ---------------------------------------

// The server cache is module-private; the discover/join routes clear it before
// landing in a freshly joined server so the refetch sees the new membership.
// The roster payload is per-server membership too, so it clears with it.
export function invalidateServersCache() {
  caches.servers = null;
  caches.rosters.clear();
  rosterInflight.clear();
}

function visibilityToggleButton(doc, win, serverId, isPublic) {
  const button = el("button", {
    class: "icon-button button-quiet visibility-toggle",
    type: "button",
    "aria-label": (isPublic ? "Private" : "Public") + " toggle",
    title: isPublic ? "Visible in discovery — switch to private" : "Private — switch to public",
    text: "",
  });
  button.textContent = isPublic ? "Public" : "Private";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await api("/api/servers/" + serverId, {
        method: "PATCH",
        body: { is_public: !isPublic },
      });
      // The next render reads the fresh list (and its role/isPublic fields).
      invalidateServersCache();
      await refreshServersAndRerender(doc, win, { serverId, channelId: null });
    } catch (caught) {
      showTransientError(doc, caught?.message || "The server could not be updated.");
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

// Mints a fresh invite code on every open and shows the copyable join link.
// clipboard.writeText is best effort: on rejection (or on http:// origins
// without clipboard permission) the link stays selectable in the input.
function inviteDialog(doc, win, serverId) {
  const linkInput = el("input", {
    type: "text",
    readonly: "",
    class: "invite-link-input",
    "aria-label": "Invite link",
    value: "",
  });
  const error = el("p", { class: "error-strip", role: "alert" });
  const copy = el("button", { class: "button button-primary", type: "button", text: "Copy", disabled: "" });
  const done = el("button", { class: "button button-quiet", type: "button", text: "Done" });

  const dialog = el("dialog", {},
    el("h2", { text: "Invite people" }),
    el("p", { class: "muted", text: "Anyone with this link can join the server — even if it is private." }),
    el("div", { class: "invite-link-row" }, linkInput, copy),
    error,
    el("div", { class: "form-actions" }, done),
  );

  const mint = async () => {
    error.textContent = "";
    linkInput.value = "";
    copy.disabled = true;
    try {
      const result = await api("/api/servers/" + serverId + "/invites", { method: "POST" });
      linkInput.value = win.location.origin + "/#/join/" + result.code;
      copy.disabled = false;
    } catch (caught) {
      error.textContent = caught?.message || "The invite could not be created.";
      copy.disabled = true;
    }
  };

  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(linkInput.value);
      copy.textContent = "Copied!";
      win.setTimeout(() => { copy.textContent = "Copy"; }, 2000);
    } catch {
      // Best effort: fall back to selecting so a manual Ctrl/Cmd-C still works.
      linkInput.focus();
      linkInput.select();
      copy.textContent = "Select all";
      win.setTimeout(() => { copy.textContent = "Copy"; }, 2000);
    }
  });

  done.addEventListener("click", () => dialog.close());

  doc.body.append(dialog);
  dialog.showModal();
  void mint();
}

// Non-destructive error surface for frames/route actions with no composer
// error strip in view: a transient toast line pinned under the rail.
// Error moments pair blaxel (sheepish) with the copy — the error strip
// becomes a mascot moment without losing its alert semantics.
function errorMomentNode(doc, message) {
  const strip = doc.createElement("p");
  strip.className = "error-strip error-moment";
  strip.setAttribute("role", "alert");
  strip.append(
    createMascot(doc, { mood: "sheepish", size: "mini" }),
    Object.assign(doc.createElement("span"), { textContent: message }),
  );
  return strip;
}

// The one shared 403 copy, for the client-side mirrors of server refusals.
function caughtMessage403() {
  return "You do not have permission to do that.";
}

function showTransientError(doc, message) {
  const existing = doc.getElementById("gc-transient-note");
  if (existing) existing.remove();
  const note = el("div", { id: "gc-transient-note", class: "stale-strip", text: message, role: "status" });
  note.addEventListener("click", () => note.remove());
  doc.body.append(note);
  setTimeout(() => note.remove(), 6000);
}

// The Care class's notice (0010): an affirming, calm, dismissible strip —
// never the error styling, never an accusation. The helpline link rides as
// plain text copy (it is a fixed constant the server vetted, not user data).
function showCareNotice(doc, notice) {
  const existing = doc.getElementById("gc-care-note");
  if (existing) existing.remove();
  const note = el("div", { id: "gc-care-note", class: "care-strip", role: "status" },
    createMascot(doc, { mood: "idle", size: "mini" }),
    el("span", { text: notice }),
  );
  note.addEventListener("click", () => note.remove());
  doc.body.append(note);
  setTimeout(() => note.remove(), 15000);
}

// --- main pane -------------------------------------------------------------------

function renderMain(doc, win, main, route) {
  if (route.channelId === null) {
    teardownActive();
    // The DM view is the friends-hub-like shell (UI redo): header row with
    // the conversation tabs GC can populate ("All") and the Add affordance;
    // a server picked without a channel keeps the plain welcome note.
    if (route.serverId === null) {
      main.replaceChildren(friendsHub(doc, win, route));
      return;
    }
    main.replaceChildren(homeNote());
    return;
  }

  void loadChannel(doc, win, main, route);
}

// The friends hub (phase-3 social, the UI redo's shell wired to real data):
// the Add-Friend box (exact username, the filed miss/closed copies ride the
// server's own 400s), the All / Online / Pending / Blocked tabs of the filed
// friends-list guide (Pending = sent + received with accept/decline/cancel;
// Blocked = the combined list with unblock/unignore), and the existing
// conversation list under a Messages tab. Online is the TRUEFUL subset the
// shell's presence snapshot can see — an offline friend simply doesn't appear
// there.
function friendsHub(doc, win, route) {
  void route;
  const social = caches.social || { friends: [] };
  const payload = { ...social, blocked: caches.blocks || [] };

  const head = el("header", { class: "friends-hub-head" });
  head.append(
    el("span", { class: "icon-inline" }, createIcon(doc, "users")),
    el("h1", { text: "Friends" }),
    el("span", { class: "spacer" }),
  );

  const addError = el("p", { class: "error-strip", role: "alert" });
  const addBox = el("form", { class: "add-friend-box", novalidate: "", role: "search" },
    el("input", {
      class: "composer-input add-friend-input",
      maxlength: "40",
      placeholder: "Add a friend by username",
      "aria-label": "Add a friend by their exact username",
    }),
    el("button", { class: "button button-primary", type: "submit", text: "Send friend request" }),
  );
  addBox.addEventListener("submit", async (event) => {
    event.preventDefault();
    addError.textContent = "";
    const input = addBox.querySelector(".add-friend-input");
    const username = String(input.value || "").trim();
    if (!username) {
      addError.textContent = "Enter the exact username of the friend to add.";
      return;
    }
    try {
      await api("/api/friends/requests", { method: "POST", body: { username } });
      input.value = "";
      await refreshSocial(doc, win);
      showTransientError(doc, "Friend request sent.");
    } catch (caught) {
      addError.textContent = caught?.message || "That request didn't work. Double check that the username is correct.";
    }
  });
  head.append(addBox, addError);

  const counts = friendsHubTabCounts(payload, (caches.presence || []).map((entry) => entry.userId));
  const content = el("div", { class: "friends-hub-content" });
  const tabs = el("div", { class: "friends-hub-tabs", role: "tablist", "aria-label": "Friends tabs" });
  const TABS = [
    ["friends", "All (" + counts.all + ")"],
    ["online", "Online (" + counts.online + ")"],
    ["pending", "Pending (" + counts.pending + ")"],
    ["blocked", "Blocked (" + counts.blocked + ")"],
    ["messages", "Messages (" + (caches.conversations || []).length + ")"],
  ];
  let selected = "friends";
  const tabButtons = new Map();
  for (const [key, label] of TABS) {
    const tab = el("button", {
      class: "friends-hub-tab",
      type: "button",
      role: "tab",
      text: label,
    });
    tab.addEventListener("click", () => {
      selected = key;
      for (const [tabKey, button] of tabButtons) {
        button.classList.toggle("friends-hub-tab-active", tabKey === selected);
        button.setAttribute("aria-selected", tabKey === selected ? "true" : "false");
      }
      renderTab();
    });
    tabButtons.set(key, tab);
    tabs.append(tab);
  }
  tabButtons.get("friends").classList.add("friends-hub-tab-active");

  const renderTab = () => {
    const conversations = caches.conversations || [];
    const routeNow = parseHash(win.location.hash);
    if (selected === "messages") {
      const cards = el("div", { class: "friends-hub-list", role: "list", "aria-label": "Conversations" });
      const start = el("button", {
        class: "button button-quiet start-conversation-button",
        type: "button",
        text: "Start a conversation",
      });
      start.addEventListener("click", () => startConversationDialog(doc, win));
      cards.append(start);
      if (conversations.length === 0) {
        cards.append(homeNote());
      }
      for (const conversation of conversations) {
        const row = el("button", {
          class: "channel-item friends-hub-row",
          type: "button",
          role: "listitem",
          "aria-current": routeNow.channelId === conversation.id ? "true" : "false",
        });
        row.append(createIcon(doc, iconFor[conversation.kind] || "at-sign"));
        row.append(el("span", { class: "name", text: conversation.name || "Conversation" }));
        if (conversation.unread > 0) {
          row.append(el("span", { class: "unread-badge", text: unreadBadge(conversation.unread) }));
        }
        row.addEventListener("click", () => {
          win.location.hash = "#/c/" + conversation.id;
        });
        cards.append(row);
      }
      content.replaceChildren(cards);
      return;
    }

    const list = el("div", { class: "friends-hub-friends", role: "list", "aria-label": "Friends" });
    const rows = socialListsForTab(doc, win, selected);
    if (rows.length === 0) {
      list.append(friendsEmptyNote(selected));
    }
    for (const row of rows) {
      list.append(row);
    }
    content.replaceChildren(list);
  };
  renderTab();

  // Live data: the very first paint may predate the hub payload — one lazy
  // fetch re-renders the hub when it lands (the 30s refresh loop keeps it
  // fresh afterwards). The storm walls live inside refreshSocial: a landed
  // payload is the only thing that re-renders here, and only one lazy fetch
  // runs at a time — a FAILED refresh leaves this hub as-is (its empty
  // state) and never re-triggers itself.
  if (caches.social === null || caches.blocks === null) {
    void refreshSocial(doc, win, { rerender: true });
  }

  return el("div", { class: "friends-hub" }, head, tabs, content);
}

// socialListsForTab(doc, win, tab) -> the tab's row nodes. Pending = received
// first (they need an accept) with the sent rows after (they need the cancel
// X); Blocked = the combined two-tier list, each row carrying its kind label
// and the unblock/unignore affordance.
function socialListsForTab(doc, win, selected) {
  const social = caches.social || { friends: [], pendingSent: [], pendingReceived: [] };
  const blocked = caches.blocks || [];

  if (selected === "pending") {
    const incoming = (social.pendingReceived || []).map((entry) =>
      pendingFriendRow(doc, win, entry, "received"));
    const outgoing = (social.pendingSent || []).map((entry) =>
      pendingFriendRow(doc, win, entry, "sent"));
    return [...incoming, ...outgoing];
  }
  if (selected === "blocked") {
    return blocked.map((entry) => blockedRow(doc, win, entry));
  }
  if (selected === "online") {
    const present = new Set((caches.presence || []).map((entry) => Number(entry.userId)));
    return (social.friends || [])
      .filter((friend) => present.has(Number(friend.userId)))
      .map((friend) => friendRow(doc, win, friend));
  }
  return (social.friends || [])
    .slice()
    .sort((a, b) => String(a.username).localeCompare(String(b.username)))
    .map((friend) => friendRow(doc, win, friend));
}

// Empty states, blaxel moments per tab (the friends hub keeps its mascot
// beats — the file'd friends-list guide's "empty roster" beat).
function friendsEmptyNote(selected) {
  const copy = {
    friends: "No friends yet — send your first request with the box above.",
    online: "No friends online right now — blaxel keeps the seats warm.",
    pending: "No pending requests — incoming requests appear here when they arrive.",
    blocked: "Nobody blocked or ignored yet — right-click a message to block or ignore someone.",
  }[selected];
  return mascotMoment(null, {
    mood: selected === "friends" ? "idle" : "waiting",
    size: "mid",
    text: copy,
  });
}

// One accepted-friend row: display name, the Open DM affordance (the friend
// pair always clears the DM gate), and the unfriend X. Right-click opens a
// social context menu too (unfriend / message / block entries).
function friendRow(doc, win, friend) {
  const row = el("div", { class: "channel-item friends-hub-row friend-row", role: "listitem" });
  row.append(el("span", { class: "user-avatar avatar", "aria-hidden": "true", text: initials(friend.username) }));
  row.append(el("span", { class: "name", text: friend.username }));

  const open = el("button", { class: "button button-quiet", type: "button", text: "Message" });
  open.addEventListener("click", async () => {
    try {
      const result = await api("/api/conversations", { method: "POST", body: { userIds: [friend.userId] } });
      caches.conversations = null;
      win.location.hash = "#/c/" + result.conversation.id;
    } catch (caught) {
      showTransientError(doc, caught?.message || "That conversation could not be opened.");
    }
  });
  row.append(open);

  const unfriend = iconButton(doc, "x", { ariaLabel: "Unfriend " + friend.username, className: "icon-button button-quiet" });
  unfriend.addEventListener("click", () => unfriendDialog(doc, win, friend));
  row.append(unfriend);
  return row;
}

// One pending row: the received side carries Accept / Decline, the sent side
// the cancel X (filed accept/decline/cancel affordances).
function pendingFriendRow(doc, win, entry, direction) {
  const row = el("div", { class: "channel-item friends-hub-row friend-row", role: "listitem" });
  row.append(el("span", { class: "user-avatar avatar", "aria-hidden": "true", text: initials(entry.username) }));
  row.append(el("div", { class: "meta" },
    el("span", { class: "name", text: entry.username }),
    el("span", { class: "member-username", text: direction === "sent" ? "Pending — it's on you" : "They want to be friends" }),
  ));

  if (direction === "received") {
    const accept = el("button", { class: "button button-primary", type: "button", text: "Accept" });
    accept.addEventListener("click", () => decideFriendRequest(doc, win, entry.userId, "accept"));
    const decline = el("button", { class: "button button-quiet", type: "button", text: "Decline" });
    decline.addEventListener("click", () => decideFriendRequest(doc, win, entry.userId, "decline"));
    row.append(accept, decline);
  } else {
    const cancel = iconButton(doc, "x", { ariaLabel: "Cancel the request for " + entry.username, className: "icon-button button-quiet" });
    cancel.addEventListener("click", () => cancelFriendRequest(doc, win, entry.userId));
    row.append(cancel);
  }
  return row;
}

// One blocked/ignored row: the kind label and the unblock/unignore X (the
// filed "Blocked accounts" management surface).
function blockedRow(doc, win, entry) {
  const row = el("div", { class: "channel-item friends-hub-row friend-row", role: "listitem" });
  row.append(el("span", { class: "user-avatar avatar", "aria-hidden": "true", text: initials(entry.username) }));
  row.append(el("div", { class: "meta" },
    el("span", { class: "name", text: entry.username || "Member #" + entry.userId }),
    el("span", { class: "member-username", text: entry.kind === "blocked" ? "Blocked" : "Ignored" }),
  ));
  const undo = el("button", {
    class: "button button-quiet",
    type: "button",
    text: entry.kind === "blocked" ? "Unblock" : "Unignore",
  });
  undo.addEventListener("click", () => unblockUser(doc, win, entry));
  row.append(undo);
  return row;
}

// --- social mutations (small shared helpers; every failure re-surfaces) ---------

// A social action's mutation + the hub/cache refresh shared by every entry
// point (hub rows, message context menu, reactions details dialog).
//
// The request-storm fix. The hub's lazy fetch is refreshSocial({rerender}),
// so the old shape — ALWAYS re-render after the fetch settled — was the
// infinite loop's whole engine when the fetch FAILED: the hub renders (its
// caches are still null) → refreshSocial fires → the fetch 500s → the
// unconditional re-render re-renders a hub whose caches are STILL null →
// the lazy fetch fires again... thousands of /api/friends + /api/blocks
// reads per second until the read limiter 429s every route. Two walls now:
//   1) Only a LANDED payload re-renders — a failed refresh is a silent
//      keep-the-stale-caches no-op, so a failed fetch can never trigger the
//      render that would re-fetch it.
//   2) One in-flight refresh at a time in rerender mode — a concurrent hub
//      render while one is still running is the SAME fetch, not a second.
export async function refreshSocial(doc, win, { rerender = false } = {}) {
  if (rerender) {
    if (socialHubRefreshInFlight) return;
    socialHubRefreshInFlight = true;
  }
  try {
    let landed = false;
    try {
      const [friends, blocked] = await Promise.all([
        api("/api/friends"),
        api("/api/blocks"),
      ]);
      caches.social = friends;
      caches.blocks = blocked.blocked || [];
      landed = true;
    } catch {
      // A failed refresh keeps the stale caches (the graceful default) — and
      // by the wall above, never re-renders.
    }
    if (rerender && landed) {
      const main = doc.querySelector(".gc-main");
      const route = parseHash(win.location.hash);
      if (main?.isConnected && route.channelId === null && route.serverId === null) {
        renderMain(doc, win, main, route);
      }
    }
  } finally {
    if (rerender) socialHubRefreshInFlight = false;
  }
}

let socialHubRefreshInFlight = false;

async function decideFriendRequest(doc, win, userId, decision) {
  const route = parseHash(win.location.hash);
  try {
    await api("/api/friends/requests/" + decision, { method: "POST", body: { userId } });
  } catch (caught) {
    showTransientError(doc, caught?.message || "That request could not be settled.");
    return;
  }
  await refreshSocial(doc, win, { rerender: route.channelId === null && route.serverId === null });
}

async function cancelFriendRequest(doc, win, userId) {
  const route = parseHash(win.location.hash);
  try {
    await api("/api/friends/requests/" + userId, { method: "DELETE" });
  } catch (caught) {
    showTransientError(doc, caught?.message || "That request could not be cancelled.");
    return;
  }
  await refreshSocial(doc, win, { rerender: route.channelId === null && route.serverId === null });
}

// Unfriend: a confirm dialog (non-destructive habit), then the either-side
// DELETE and the same hub refresh.
function unfriendDialog(doc, win, friend) {
  const cancel = el("button", { class: "button button-quiet", type: "button", text: "Cancel" });
  const confirm = el("button", { class: "button button-danger", type: "submit", text: "Unfriend" });
  const dialog = el("dialog", {},
    el("h2", { text: "Unfriend " + friend.username + "?" }),
    el("p", { class: "muted", text: "They leave your friends list immediately, and a new request has to start again from zero. They are never told." }),
    el("form", { novalidate: "", class: "unfriend-form" },
      el("div", { class: "form-actions" }, cancel, confirm),
    ),
  );
  cancel.addEventListener("click", () => dialog.close());
  dialog.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/friends/" + friend.userId, { method: "DELETE" });
    } catch (caught) {
      showTransientError(doc, caught?.message || "That unfriend could not be completed.");
    }
    dialog.close();
    await refreshSocial(doc, win, { rerender: true });
  });
  dialog.addEventListener("close", () => dialog.remove());
  doc.body.append(dialog);
  dialog.showModal();
}

// The block/ignore warning screen (filed): the dialog carries the tier's own
// contract verbatim (what changes for the caller, what the target never
// learns), and the PUT lands on /api/blocks/:id with the tier's kind. The
// platform staff target is refused server-side; the client surfaces the copy.
function openSocialActionDialog(doc, win, target, kind) {
  const copy = socialActionCopy(kind, target.username);
  const cancel = el("button", { class: "button button-quiet", type: "button", text: "Cancel" });
  const confirm = el("button", { class: "button button-danger", type: "submit", text: copy.confirm });
  const error = el("p", { class: "error-strip", role: "alert" });
  const dialog = el("dialog", {},
    el("h2", { text: copy.title }),
    el("p", { class: "muted", text: copy.detail }),
    el("form", { novalidate: "" }, error, el("div", { class: "form-actions" }, cancel, confirm)),
  );
  cancel.addEventListener("click", () => dialog.close());
  dialog.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    try {
      await api("/api/blocks/" + target.userId, { method: "PUT", body: { kind } });
    } catch (caught) {
      error.textContent = caught?.message || "That block could not be saved.";
      return;
    }
    dialog.close();
    await refreshSocial(doc, win, { rerender: true });
    // Message rows re-read the block list; a chat view re-renders its own.
    if (activeView?.scroll?.isConnected) renderMessages(doc, win, false, null);
  });
  dialog.addEventListener("close", () => dialog.remove());
  doc.body.append(dialog);
  dialog.showModal();
}

// Unblock/unignore: the DELETE, then the shared refresh.
async function unblockUser(doc, win, entry) {
  try {
    await api("/api/blocks/" + entry.userId, { method: "DELETE" });
  } catch (caught) {
    showTransientError(doc, caught?.message || "That unblock could not be completed.");
    return;
  }
  await refreshSocial(doc, win, { rerender: true });
  if (activeView?.scroll?.isConnected) renderMessages(doc, win, false, null);
}

// myBlockOf(userId) -> the caller's own block row for the user, or null.
// The block tier gates DMs upstream; the client uses the list only for
// hiding (the filed client-side checks against the loaded list).
function myBlockOf(userId) {
  const me = Number(state.currentUser?.id);
  void me;
  return (caches.blocks || []).find((entry) => Number(entry.userId) === Number(userId)) || null;
}

// The blocked-in-shared-space alert (the filed leave-or-stay notice): the
// group DM carries a member the viewer blocked. One-time per conversation
// (the caller wrote the ack before rendering), silent to the other party.
// Leave rides the group-leave route — only a group reaches this dialog (the
// helper's own kind gate), and a dm pair needs no leave to stop seeing.
function openBlockedVisitorDialog(doc, win, conversation, visitors) {
  const names = visitors
    .map((entry) => entry.username || "Member #" + entry.userId)
    .join(", ");
  const cancel = el("button", { class: "button button-quiet", type: "button", text: "Stay" });
  const leave = el("button", { class: "button button-danger", type: "submit", text: "Leave the group" });
  const error = el("p", { class: "error-strip", role: "alert" });
  const dialog = el("dialog", {},
    el("h2", { text: "A member you've blocked is in this group" }),
    el("p", {
      class: "muted",
      text: names + " is part of " + (conversation.name || "this group") + ". Their messages hide " +
        "here, but you're still in the conversation with them. Leave, or stay and keep the hiding.",
    }),
    el("form", { novalidate: "" }, error, el("div", { class: "form-actions" }, cancel, leave)),
  );
  const goHome = () => {
    dialog.remove();
    win.location.hash = "#/";
  };
  cancel.addEventListener("click", () => dialog.close());
  dialog.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/conversations/" + conversation.id, { method: "DELETE" });
    } catch (caught) {
      error.textContent = caught?.message || "The group could not be left.";
      return;
    }
    caches.conversations = null;
    dialog.close();
    goHome();
  });
  dialog.addEventListener("close", () => dialog.remove());
  doc.body.append(dialog);
  dialog.showModal();
}

// The voice join-with-them warning (the filed soft-tier affordance): a voice
// channel already holds someone the viewer IGNORED. Purely a heads-up — they
// keep full access, this viewer just knows who's there. Continue or cancel.
function openIgnoredInVoiceDialog(doc, win, ignored, onContinue) {
  const names = ignored.map((entry) => entry.username || "Member #" + entry.userId).join(", ");
  const cancel = el("button", { class: "button button-quiet", type: "button", text: "Cancel" });
  const join = el("button", { class: "button button-primary", type: "submit", text: "Join anyway" });
  const dialog = el("dialog", {},
    el("h2", { text: "Someone you've ignored is in this voice channel" }),
    el("p", {
      class: "muted",
      text: "Ignoring hides their text messages — it changes nothing about voice. You'll hear " +
        names + ", and they'll hear you. They're never told about this screen.",
    }),
    el("form", { novalidate: "" }, el("div", { class: "form-actions" }, cancel, join)),
  );
  cancel.addEventListener("click", () => dialog.close());
  dialog.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    dialog.close();
    onContinue();
  });
  dialog.addEventListener("close", () => dialog.remove());
  doc.body.append(dialog);
  dialog.showModal();
}

// The social context menu: a small dismiss-on-click popup carrying the friend
// / block / ignore (or unfriend / unblock / unignore) entries — the filed
// context-menu surface, extended to any shared-space row the target appears
// on (member lists and message avatars have no profile card of their own).
// The platform-staff target can never be blocked; the server refuses and the
// dialog shows its copy.
function openSocialContextMenu(doc, win, event, target, extraEntries = []) {
  event.preventDefault();
  const existing = doc.querySelector(".social-context-menu");
  if (existing) existing.remove();

  // The filed context-menu surface carries ALL three affordances against a
  // non-friend target (the profile-card "Add Friend" rides the same menu —
  // member lists and message avatars have no card of their own): Add Friend
  // first (by user id — the exact-username box is the hub's), then the block
  // / ignore pair. A target already in the graph reads its own state back
  // (unfriend / unblock / unignore / the kind switch) instead.
  const relation = socialRelationOf(target.userId, caches.social, caches.blocks);
  const entries = [];
  if (relation === null) {
    entries.push({
      label: "Add Friend",
      run: async () => {
        try {
          await api("/api/friends/requests", { method: "POST", body: { userId: target.userId } });
          await refreshSocial(doc, win);
          showTransientError(doc, "Friend request sent.");
        } catch (caught) {
          showTransientError(doc, caught?.message || "That request could not be sent.");
        }
      },
    });
  } else if (relation === "friend") {
    entries.push({ label: "Unfriend " + target.username, run: () => unfriendDialog(doc, win, target) });
  } else if (relation === "sent") {
    entries.push({
      label: "Cancel your request",
      run: () => void cancelFriendRequest(doc, win, target.userId),
    });
  }
  const currentBlock = relation === "blocked" || relation === "ignored" ? myBlockOf(target.userId) : null;
  if (currentBlock) {
    entries.push({
      label: currentBlock.kind === "blocked"
        ? "Unblock " + target.username
        : "Unignore " + target.username,
      run: async () => {
        await unblockUser(doc, win, currentBlock);
      },
    });
    entries.push({
      label: currentBlock.kind === "blocked" ? "Switch to ignore" : "Switch to block",
      run: async () => {
        await runBlockSwitch(doc, win, target, currentBlock.kind === "blocked" ? "ignored" : "blocked");
      },
    });
  } else {
    entries.push(
      { label: "Block " + target.username + "…", run: () => openSocialActionDialog(doc, win, target, "blocked") },
      { label: "Ignore " + target.username + "…", run: () => openSocialActionDialog(doc, win, target, "ignored") },
    );
  }
  for (const entry of extraEntries) entries.push(entry);

  const menu = el("div", { class: "social-context-menu", role: "menu" });
  for (const entry of entries) {
    const item = el("button", { class: "social-context-item", type: "button", role: "menuitem", text: entry.label });
    item.addEventListener("click", () => {
      menu.remove();
      entry.run();
    });
    menu.append(item);
  }
  menu.style.left = Math.max(4, event.clientX - 8) + "px";
  menu.style.top = Math.max(4, event.clientY - 8) + "px";
  doc.body.append(menu);
  const dismiss = (dismissEvent) => {
    if (menu.contains(dismissEvent.target)) return;
    menu.remove();
    doc.removeEventListener("click", dismiss, true);
  };
  doc.addEventListener("click", dismiss, true);
}

// The kind switch (block <-> ignore) skips the warning screen — the row
// already carries one tier, so the PUT's upsert flips it.
async function runBlockSwitch(doc, win, target, kind) {
  try {
    await api("/api/blocks/" + target.userId, { method: "PUT", body: { kind } });
  } catch (caught) {
    showTransientError(doc, caught?.message || "That change could not be saved.");
    return;
  }
  await refreshSocial(doc, win, { rerender: true });
  if (activeView?.scroll?.isConnected) renderMessages(doc, win, false, null);
}


// Welcome moment: blaxel (GooberCord's system mascot) hero, with the
// starfish twinkle on the onboarding beat.
function homeNote() {
  const note = el("div", { class: "empty-chat-note" });
  note.append(
    mascotMoment(null, {
      mood: "idle",
      size: "hero",
      sparkle: true,
      text: "blaxel says hi!",
    }),
    el("h2", { text: "Welcome to GooberCord" }),
    el("p", {
      class: "muted",
      text: "Pick a channel from the left — or start a conversation with someone online from the side panel.",
    }),
  );
  return note;
}

function findChannelContext(channelId) {
  for (const server of caches.servers || []) {
    for (const channel of server.channels || []) {
      if (channel.id === channelId) return { server, channel };
    }
  }
  const conversation = (caches.conversations || []).find((entry) => entry.id === channelId);
  return conversation ? { conversation, channel: conversation } : null;
}

async function loadChannel(doc, win, main, route) {
  teardownActive();
  activeView = {
    destroyed: false,
    socket: null,
    channelId: route.channelId,
    channelKind: null,
    roster: new Map(),
    typing: new Map(),
    messages: [],
    nextAfter: null,
    pendingSends: new Map(),
    timers: [],
    loadingOlder: false,
    lastTypingSent: 0,
    revealedHidden: new Set(),
  };

  const cached = caches.byChannel.get(route.channelId);
  if (cached) {
    activeView.messages = cached.messages;
    activeView.nextAfter = cached.nextAfter;
  }

  const channelId = route.channelId;

  // Head.
  const head = el("div", { class: "channel-head" });
  const sidebarToggle = iconButton(doc, "users", {
    ariaLabel: "Members and presence",
    className: "icon-button button-quiet",
  });
  sidebarToggle.addEventListener("click", () => {
    doc.querySelector(".gc-sidebar")?.toggleAttribute("hidden");
  });
  head.append(
    el("span", { class: "icon-inline" }, createIcon(doc, "chat")),
    el("h1", { text: "Loading…", id: "channel-title" }),
    el("span", { class: "spacer" }),
    sidebarToggle,
  );

  const scroll = el("div", { class: "messages-scroll", tabindex: "0", "aria-label": "Messages" });
  const typingNote = el("p", { class: "typing-note", "aria-live": "polite" });
  const composerError = el("p", { class: "error-strip", role: "alert" });

  main.replaceChildren(head, scroll, typingNote, composerError);
  // The composer's slowmode copy reads the list payload (the channel's
  // cooldown for this viewer — the server's 429 stays the authority).
  const composerSlowmode = composerContext?.channel && composerContext.channel.kind === "text"
    ? channelSlowmode(composerContext.channel, currentRoster(composerContext.server.id)?.viewer || null)
    : 0;
  main.append(buildComposer(doc, win, main, composerError, composerSlowmode));

  activeView.scroll = scroll;
  activeView.typingNote = typingNote;
  activeView.composerError = composerError;

  scroll.addEventListener("scroll", () => {
    if (scroll.scrollTop < 60 && activeView && activeView.nextAfter !== null) {
      loadOlderMessages(doc, win);
    }
  });

  // Loading idle: blaxel sets the room up while history loads.
  scroll.append(
    mascotMoment(null, { mood: "idle", size: "mid", text: "blaxel is setting things up…" }),
  );

  try {
    const page = await api("/api/channels/" + channelId + "/messages?limit=" + HISTORY_PAGE);
    activeView.messages = (page.messages || []).slice().sort((a, b) => a.id - b.id);
    activeView.nextAfter = nextHistoryCursor(page);
    caches.byChannel.set(channelId, { messages: activeView.messages, nextAfter: activeView.nextAfter });

    const context = findChannelContext(channelId);
    const title = doc.getElementById("channel-title");
    if (context?.channel && title) {
      title.textContent = channelTitle(context.channel);
      const headIcon = head.querySelector(".icon-inline svg");
      headIcon?.replaceWith(createIcon(doc, iconFor[context.channel.kind] || "chat"));
    }
    // The server roster (role colors + nicknames for chat names) rides the
    // channel load; the sidebar already kicks off the same idempotent fetch.
    if (context?.server) void ensureRoster(doc, win, context.server.id);

    renderMessages(doc, win, true);
    openSocket(doc, win, channelId);
  } catch (caught) {
    scroll.replaceChildren(
      mascotMoment(null, {
        mood: "sheepish",
        error: true,
        text: caught?.message || "This channel could not be loaded.",
      }),
    );
  }
}

function channelTitle(channel) {
  if (channel.kind === "dm" || channel.kind === "group") {
    return channel.name || "Conversation";
  }
  return channel.name;
}

async function loadOlderMessages(doc, win) {
  if (!activeView || activeView.nextAfter === null || activeView.loadingOlder) return;
  activeView.loadingOlder = true;
  const beforeId = activeView.messages[0]?.id ?? null;

  try {
    const page = await api(
      "/api/channels/" + activeView.channelId +
        "/messages?limit=" + HISTORY_PAGE + "&after=" + activeView.nextAfter,
    );
    const { messages } = mergeMessages(activeView.messages, page.messages || []);
    activeView.messages = messages;
    activeView.nextAfter = nextHistoryCursor(page);
    caches.byChannel.set(activeView.channelId, {
      messages: activeView.messages,
      nextAfter: activeView.nextAfter,
    });
    renderMessages(doc, win, false, beforeId);
  } catch {
    // Scroll-up paging failures stay silent; the next scroll retries.
  } finally {
    activeView.loadingOlder = false;
  }
}

// --- message rendering -----------------------------------------------------------

function renderMessages(doc, win, scrollToEnd, beforeAnchorId) {
  if (!activeView || !activeView.scroll) return;
  const scroll = activeView.scroll;

  if (activeView.messages.length === 0) {
    scroll.replaceChildren(
      mascotMoment(null, {
        mood: "idle",
        size: "mid",
        text: "No messages here yet. Say something first!",
      }),
    );
    return;
  }

  const me = state.currentUser;
  const staff = me?.role === "owner" || me?.role === "admin";
  const container = el("div", {});
  let previousAuthor = null;

  for (const message of activeView.messages) {
    const mine = Number(message.authorId) === Number(me?.id);
    const showHeader = message.authorId !== previousAuthor;
    previousAuthor = message.authorId;

    // The block/ignore tier's client-side hiding (filed): a blocked or
    // ignored AUTHOR's row renders collapsed with a Show-reveal — the
    // reveal is per-row state on the live view, never a change to the
    // message list (server-side, blocked rows still deliver as normal).
    const visibility = mine ? null : myBlockOf(message.authorId);
    const hidden = visibility !== null && !activeView.revealedHidden.has(message.id);
    if (hidden) {
      const hiddenRow = el("div", {
        class: "chat-message message-visibility-hidden",
        dataset: { messageId: String(message.id) },
      });
      const reveal = el("button", {
        class: "button button-quiet visibility-reveal",
        type: "button",
        text: socialVisibilityCopy(visibility.kind) + " — Show message",
      });
      reveal.addEventListener("click", () => {
        activeView.revealedHidden.add(message.id);
        renderMessages(doc, win, false, null);
      });
      hiddenRow.append(reveal);
      container.append(hiddenRow);
      continue;
    }

    // Goober+ accent: the inline values are set through CSSOM AFTER
    // validAccent() (public/js/dom.js) has passed the value, so nothing but
    // strict lowercase hex can ever reach a style. Rows without an accent
    // render exactly as before.
    const accent = validAccent(message.accent);
    const row = el("div", {
      class: "chat-message" + (showHeader ? "" : " message-continued") +
        (accent ? " message-accent" : ""),
      dataset: { messageId: String(message.id) },
    });
    if (accent) row.style.setProperty("--gc-accent", accent);

    if (showHeader) {
      const stamp = messageCreatedAt(message);
      // Phase-3 server context: a member's chat name shows their per-server
      // nickname, and the highest role's color BEATS the user's accent
      // (filed rule — chat member names inherit role color). DMs/profile
      // keep the plain username/accent rules.
      const context = findChannelContext(activeView.channelId);
      const authorMember = context?.server
        ? rosterMember(context.server.id, message.authorId)
        : null;
      const roleColor = authorMember && validAccent(authorMember.color)
        ? validAccent(authorMember.color)
        : null;
      const display = authorMember ? memberDisplay(authorMember) : String(message.authorName);
      const authorName = el("span", { text: display });
      if (roleColor) authorName.style.color = roleColor;
      else if (accent) authorName.style.color = accent;
      row.append(
        el("span", { class: "user-avatar avatar", "aria-hidden": "true", text: initials(display) }),
        el("div", { class: "author" },
          authorName,
          el("time", { datetime: stamp.toISOString(), text: formatTimestamp(stamp) }),
        ),
      );
    }

    const body = el("div", { class: "body" });
    body.textContent = String(message.body ?? "");
    if (message.editedAt) {
      body.append(el("span", { class: "message-edited", text: " (edited)" }));
    }
    row.append(body);

    for (const attachmentId of message.attachmentIds || []) {
      row.append(renderAttachmentNode(doc, attachmentId, mine || staff));
    }

    // The reaction chip row (phase-3 social): the grouped payload's chips —
    // each with its count, personal-state class, and the per-emoji user list
    // as the title. Click toggles the personal state; contextmenu / a
    // long-press opens the View-Reactions dialog.
    const chips = reactionChips(message.reactions, me?.id);
    if (chips.length > 0) {
      const chipsRow = el("div", { class: "message-reactions" });
      for (const chip of chips) {
        const chipNode = el("button", {
          class: "reaction-chip" + (chip.mine ? " reaction-chip-mine" : ""),
          type: "button",
          text: chip.emoji + " " + chip.count,
          title: chip.usernames.filter(Boolean).join(", ") ||
            (chip.mine ? "Your reaction" : "Reactions"),
          "aria-pressed": chip.mine ? "true" : "false",
          "aria-label": (chip.mine ? "Remove your " : "Add your ") + chip.emoji +
            " reaction (" + chip.count + ")",
        });
        chipNode.addEventListener("click", () =>
          void toggleMessageReaction(doc, win, message, chip.emoji, chip.mine));
        bindReactionsDetail(doc, win, chipNode, message);
        chipsRow.append(chipNode);
      }
      row.append(chipsRow);
    }

    if (mine || staff) {
      const actions = el("div", { class: "row-actions" });
      if (mine) {
        const edit = iconButton(doc, "pen", { ariaLabel: "Edit message" });
        edit.addEventListener("click", () => editMessageInline(doc, win, message));
        actions.append(edit);
      }
      const remove = iconButton(doc, "trash", { ariaLabel: "Delete message" });
      remove.addEventListener("click", () => deleteMessageDialog(doc, win, message));
      actions.append(remove);
      row.append(actions);
    }

    // Everyone's hover bar gets the add-react affordance (filed: the hover
    // bar's quick react opens the picker; Shift keeps it open for a second
    // pick, the cheap multi-react). The bar rides the same row-actions strip
    // the edit/delete pair already occupies.
    const hoverBar = row.querySelector(".row-actions") || el("div", { class: "row-actions" });
    const react = el("button", {
      class: "reaction-add",
      type: "button",
      text: "🙂",
      "aria-label": "Add a reaction",
      title: "Add a reaction (Shift-click to add another after)",
    });
    react.addEventListener("click", () => void openReactionPicker(doc, win, message));
    hoverBar.append(react);
    if (!hoverBar.isConnected) row.append(hoverBar);

    // The social context menu on a non-mine row (filed block/ignore entries).
    if (!mine) {
      row.addEventListener("contextmenu", (event) => {
        openSocialContextMenu(doc, win, event, {
          userId: Number(message.authorId),
          username: String(message.authorName || "this member"),
        });
      });
    }

    container.append(row);

    // A REVEALED hidden row carries its Hide-again affordance at the foot —
    // the body renders as normal (the reveal is per-row state, never a list
    // change), and the collapse is one click away.
    if (visibility !== null) {
      const unHide = el("button", {
        class: "button button-quiet visibility-reveal visibility-reveal-shown",
        type: "button",
        text: socialVisibilityCopy(visibility.kind) + " — Hide again",
      });
      unHide.addEventListener("click", () => {
        activeView.revealedHidden.delete(message.id);
        renderMessages(doc, win, false, null);
      });
      container.append(unHide);
    }
  }

  const anchor = beforeAnchorId
    ? scroll.querySelector('[data-message-id="' + beforeAnchorId + '"]')
    : null;

  scroll.replaceChildren(container);

  if (anchor) {
    anchor.scrollIntoView({ block: "start" });
  } else if (scrollToEnd) {
    scroll.scrollTop = scroll.scrollHeight;
  }
}

// publicMessage carries no created_at in phase 1; the roster-safe fallback is
// "now" — Task 12's markdown carry may add the field, and this degrades to a
// slightly-wrong clock, never a crash.
function messageCreatedAt(message) {
  const value = message?.createdAt ?? message?.created_at;
  if (value !== undefined && value !== null) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

// --- reactions (phase-3 social) ----------------------------------------------------

// toggleMessageReaction: the chip/personal-state toggle. The optimistic local
// state rides ui-helpers' toggleMyReaction (pure), and the PUT/DELETE lands on
// /api/messages/:id/reactions; a refusal re-renders from the (unmoved) list.
// A timed-out member's ADD is refused server-side (403) — REMOVALS of their
// own reactions stay allowed either way (the route never runs the timeout
// gate on a DELETE).
async function toggleMessageReaction(doc, win, message, emoji, mine) {
  const method = mine ? "DELETE" : "PUT";
  try {
    await api("/api/messages/" + message.id + "/reactions", { method, body: { emoji } });
  } catch (caught) {
    showTransientError(doc, caught?.message || "That reaction could not be saved.");
    renderMessages(doc, win, false, null);
    return;
  }
  message.reactions = toggleMyReaction(message, emoji, state.currentUser?.id, !mine);
  renderMessages(doc, win, false, null);
}

// The chip's detail affordance: contextmenu (right-click / long-press) opens
// the View-Reactions dialog. A pointerdown long-press (~550ms) covers touch.
function bindReactionsDetail(doc, win, chipNode, message) {
  chipNode.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    void openReactionsDialog(doc, win, message);
  });
  let pressTimer = 0;
  chipNode.addEventListener("pointerdown", () => {
    pressTimer = win.setTimeout(() => {
      pressTimer = 0;
      void openReactionsDialog(doc, win, message);
    }, 550);
  });
  const cancel = () => {
    if (pressTimer) win.clearTimeout(pressTimer);
    pressTimer = 0;
  };
  chipNode.addEventListener("pointerup", cancel);
  chipNode.addEventListener("pointerleave", cancel);
  chipNode.addEventListener("pointercancel", cancel);
}

// The reaction picker: the curated palette plus a free text field (the filed
// "emoji picker for custom reactions" — any emoji/shortname up to the server's
// 32-char cap). A Shift-held pick keeps the dialog open for the next one
// (the filed Shift-click multi-react, the cheap form).
function openReactionPicker(doc, win, message) {
  const existing = [...doc.querySelectorAll("dialog")].find((dialog) =>
    dialog.classList.contains("reaction-picker"));
  if (existing) existing.remove();

  const error = el("p", { class: "error-strip", role: "alert" });
  const grid = el("div", { class: "reaction-palette", role: "listbox", "aria-label": "Pick a reaction" });
  const customInput = el("input", {
    class: "composer-input reaction-custom",
    maxlength: "32",
    placeholder: "Or type an emoji or :shortname:",
    "aria-label": "Custom reaction",
  });

  const close = () => dialog.close();
  const dialog = el("dialog", { class: "reaction-picker gc-dialog" });
  const pick = async (emoji, shiftHeld) => {
    const already = reactionChips(message.reactions, state.currentUser?.id)
      .find((chip) => chip.emoji === emoji);
    if (already?.mine) {
      close();
      return; // your own current chip is your toggle-off (the file'd chip rule)
    }
    const ok = await toggleMessageReaction(doc, win, message, emoji, false);
    if (!ok) return;
    if (shiftHeld) {
      customInput.value = "";
      customInput.focus();
      return;
    }
    close();
  };
  for (const emoji of REACTION_PALETTE) {
    const choice = el("button", {
      class: "reaction-palette-choice",
      type: "button",
      text: emoji,
      "aria-label": "React with " + emoji,
    });
    choice.addEventListener("click", (event) => void pick(emoji, Boolean(event.shiftKey)));
    grid.append(choice);
  }
  const customForm = el("form", { novalidate: "", class: "reaction-custom-form" }, customInput,
    el("button", { class: "button button-quiet", type: "submit", text: "Add" }));
  customForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const custom = String(customInput.value || "").trim();
    if (!custom || custom.length > 32) {
      error.textContent = "Reactions are at most 32 characters.";
      return;
    }
    void pick(custom, Boolean(event.shiftKey));
  });

  dialog.append(
    el("h2", { text: "Add a reaction" }),
    grid,
    customForm,
    error,
  );

  const closeButton = el("button", {
    class: "button button-quiet",
    type: "button",
    text: "Done",
  });
  closeButton.addEventListener("click", close);
  dialog.append(closeButton);

  dialog.addEventListener("close", () => dialog.remove());
  doc.body.append(dialog);
  dialog.showModal();
}

// The View-Reactions details dialog (filed): the server's per-emoji user
// lists, one section each, with the personal X on the CALLER'S OWN rows (the
// author of the reaction removes it; nobody else's X is ever rendered).
// Every removal re-reads the dialog's payload, so the other users' rows stay
// server-true.
async function openReactionsDialog(doc, win, message) {
  let payload = null;
  try {
    payload = await api("/api/messages/" + message.id + "/reactions");
  } catch (caught) {
    showTransientError(doc, caught?.message || "The reactions could not be loaded.");
    return;
  }

  const meId = Number(state.currentUser?.id);
  const dialog = el("dialog", { class: "reactions-dialog gc-dialog" });
  const body = el("div", { class: "reactions-dialog-body" });
  const close = el("button", { class: "button button-quiet", type: "button", text: "Close" });
  close.addEventListener("click", () => dialog.close());

  const rebuild = (groups) => {
    body.replaceChildren();
    if ((groups || []).length === 0) {
      body.append(el("p", { class: "muted", text: "No reactions yet — be the first." }));
      return;
    }
    for (const group of groups) {
      const section = el("div", { class: "reactions-group" });
      section.append(el("h3", { text: group.emoji + " " + (group.users || []).length }));
      const list = el("ul", { class: "reactions-user-list" });
      for (const user of group.users || []) {
        const entry = el("li", { class: "reactions-user" },
          el("span", { text: user.username || "Member #" + user.id }));
        if (Number(user.id) === meId) {
          const remove = iconButton(doc, "x", {
            ariaLabel: "Remove your " + group.emoji + " reaction",
            className: "icon-button button-quiet",
          });
          remove.addEventListener("click", async () => {
            try {
              await api("/api/messages/" + message.id + "/reactions", {
                method: "DELETE",
                body: { emoji: group.emoji },
              });
            } catch (caught) {
              showTransientError(doc, caught?.message || "That reaction could not be removed.");
              return;
            }
            message.reactions = toggleMyReaction(message, group.emoji, meId, false);
            // Locally the caller's own chips are derivable...
            renderMessages(doc, win, false, null);
            // ...and the dialog's remaining rows re-read the server truth.
            try {
              payload = await api("/api/messages/" + message.id + "/reactions");
            } catch {
              // The dialog stays on the last good payload.
            }
            rebuild(payload.reactions);
          });
          entry.append(remove);
        }
        list.append(entry);
      }
      section.append(list);
      body.append(section);
    }
  };

  dialog.append(el("h2", { text: "Message reactions" }), body,
    el("div", { class: "form-actions" }, close));
  dialog.addEventListener("close", () => dialog.remove());
  doc.body.append(dialog);
  dialog.showModal();
  rebuild(payload.reactions);
}



// --- composer ---------------------------------------------------------------------

function buildComposer(doc, win, main, composerError, slowmodeSeconds = 0) {
  const textarea = el("textarea", {
    class: "composer-input",
    placeholder: "Message this channel",
    maxlength: String(GC_MESSAGE_MAX),
    "aria-label": "Message composer",
  });

  const counter = el("span", { class: "char-counter", text: "0 / " + GC_MESSAGE_MAX });
  const fileInput = el("input", {
    type: "file",
    accept: "image/*",
    class: "visually-hidden",
    "aria-hidden": "true",
    tabindex: "-1",
  });

  const attachButton = iconButton(doc, "paperclip", {
    ariaLabel: "Attach image",
    className: "icon-button",
  });
  const sendButton = iconButton(doc, "send", {
    ariaLabel: "Send message",
    className: "icon-button button-primary",
  });

  const attachPreviewArea = el("div", {});

  const box = el("div", { class: "composer-box" },
    fileInput,
    attachButton,
    textarea,
    sendButton,
  );

  const composer = el("div", { class: "composer" },
    attachPreviewArea,
    box,
    counter,
  );

  // Slowmode (0007): while the channel's cooldown runs, the send button is
  // disabled and a countdown note rides a data attribute (a simple
  // disabled-state affordance — the server's own 429 stays the authority).
  // The timer clears itself once the strip leaves the DOM.
  const slownote = el("p", {
    class: "composer-slowmode muted",
    dataset: { slowmodeSeconds: String(Number(slowmodeSeconds) || 0), slowmodeUntil: "0" },
    text: "",
  });
  if (slowmodeSeconds > 0) {
    composer.append(slownote);
  }
  const startSlowmodeCooldown = () => {
    if (slowmodeSeconds <= 0) return;
    const until = Date.now() + slowmodeSeconds * 1000;
    slownote.dataset.slowmodeUntil = String(until);
    sendButton.disabled = true;
    const tick = () => {
      if (!composer.isConnected) return;
      const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      slownote.textContent = remaining > 0 ? "Slowmode — next message in " + remaining + "s" : "";
      if (remaining <= 0) {
        sendButton.disabled = false;
        return;
      }
      win.setTimeout(tick, 500);
    };
    win.setTimeout(tick, 1);
  };

  let pendingAttachment = null;

  attachButton.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";

    if (!file) return;

    if (!isImageFile(file)) {
      composerError.textContent = "Only images can be attached (JPEG, PNG, WebP, GIF).";
      return;
    }

    if (attachmentTooLarge(file.size)) {
      composerError.textContent = "Images must be 5 MiB or smaller.";
      return;
    }

    composerError.textContent = "";
    if (pendingAttachment) revokePreview(pendingAttachment);
    pendingAttachment = createPreview(file);

    const name = el("span", { class: "name", text: file.name });
    const clear = iconButton(doc, "x", { ariaLabel: "Remove attachment" });
    clear.addEventListener("click", () => {
      revokePreview(pendingAttachment);
      pendingAttachment = null;
      attachPreviewArea.replaceChildren();
    });

    attachPreviewArea.replaceChildren(
      el("div", { class: "attach-preview" },
        el("img", { src: pendingAttachment.url, alt: "Attachment preview" }),
        name,
        clear,
      ),
    );
    textarea.focus();
  });

  const setCounter = () => {
    const used = textarea.value.length;
    counter.textContent = used + " / " + GC_MESSAGE_MAX;
    counter.classList.toggle("char-over", used >= GC_MESSAGE_MAX);
  };
  textarea.addEventListener("input", () => {
    setCounter();
    sendTypingFrame(doc);
  });
  setCounter();

  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  });

  sendButton.addEventListener("click", submit);

  async function submit() {
    if (!activeView || activeView.channelId === null) return;

    const body = textarea.value.trim();

    if (!body && !pendingAttachment) return;

    const channelId = activeView.channelId;
    const clientMessageId = newClientId();
    const attachment = pendingAttachment ? pendingAttachment.file : null;
    const preview = pendingAttachment;

    // Optimistic pending row (non-destructive: the draft stays in the box
    // until the server or the WS confirms — a failure only clears the
    // pending row, never the composer text).
    const draft = { body, preview };
    activeView.pendingSends.set(clientMessageId, draft);
    const scroll = activeView.scroll;
    const pending = pendingRow(doc, clientMessageId, draft);
    scroll?.append(pending);
    scroll.scrollTop = scroll.scrollHeight;

    // Clear the composer immediately so a double-Enter can't double-send;
    // the draft rides the pending row until settlement either way.
    textarea.value = "";
    setCounter();
    if (preview) {
      attachPreviewArea.replaceChildren();
    }
    composerError.textContent = "";
    pendingAttachment = null;
    // The cooldown starts with the send attempt (the server's 429 would only
    // correct the display a round-trip later).
    startSlowmodeCooldown();

    // Live send (Task 8 envelope): text goes out as one {"type":"msg"} frame
    // over the shared WS — the DO persists it AND relays it to every other
    // socket, so other tabs receive it live. The sender's own socket is
    // excluded from the fan-out (per-socket exclusion) and the public row
    // carries no clientMessageId, so settlement for THIS tab rides a short
    // idempotent REST replay: same clientMessageId → same row, no double
    // insert, only pending cleanup. (Attachments stay REST — the WS frame
    // carries no binary.)
    const socket = activeView.socket;
    if (!attachment && socket && socket.send({ type: "msg", clientMessageId, body })) {
      win.setTimeout(() => {
        if (activeView && activeView.pendingSends.has(clientMessageId)) {
          void settleViaRest(clientMessageId, body, null, pending);
        }
      }, WS_SEND_FALLBACK_MS);
      return;
    }

    await settleViaRest(clientMessageId, body, attachment, pending);
  }

  async function settleViaRest(clientMessageId, body, attachment, pendingRow) {
    try {
      const result = attachment
        ? await sendMessageWithImage(channelId, body, clientMessageId, attachment)
        : await api("/api/channels/" + channelId + "/messages", {
            method: "POST",
            body: { body, clientMessageId },
          });

      activeView.pendingSends.delete(clientMessageId);
      pendingRow.remove();
      if (result?.message) {
        applyIncomingMessage(doc, win, result.message);
      }
      // The Care class (0010): the send response may carry the inline notice
      // — render it the same way the WS frame does, calm and dismissible.
      if (typeof result?.careNotice === "string" && result.careNotice) {
        showCareNotice(doc, result.careNotice);
      }
    } catch (caught) {
      // The rules gate (0012): the shared 403 carries the pointer, the dialog
      // opens over the pending send, and an accepted dialog re-dispatches the
      // SAME idempotent send. A dismissal falls through here as plain
      // failure; a dialog that was already up opens nothing new (the catch
      // below keeps the composer whole instead).
      const gate = rulesGateFromError(caught);
      if (gate && openRulesDialog(doc, {
        serverId: gate.serverId,
        rules: gate.rules,
        onAccepted: () => void settleViaRest(clientMessageId, body, attachment, pendingRow),
        onDismiss: (acceptedNow) => {
          if (acceptedNow) return; // the re-dispatch owns the outcome
          activeView.pendingSends.delete(clientMessageId);
          pendingRow.remove();
          composerError.replaceChildren(
            errorMomentNode(doc, caught.message || "The message could not be sent."),
          );
          // Non-destructive: put the text back so nothing is lost.
          textarea.value = body + (textarea.value ? "\n" + textarea.value : "");
          textarea.dispatchEvent(new Event("input"));
        },
      })) {
        return;
      }

      activeView.pendingSends.delete(clientMessageId);
      pendingRow.remove();
      composerError.replaceChildren(
        errorMomentNode(doc, caught?.message || "The message could not be sent."),
      );
      // Non-destructive: put the text back so nothing is lost.
      textarea.value = body + (textarea.value ? "\n" + textarea.value : "");
      textarea.dispatchEvent(new Event("input"));
    }
  }

  function sendTypingFrame(docRef) {
    const now = Date.now();
    if (!shouldSendTyping(activeView?.lastTypingSent || 0, now, TYPING_THROTTLE_MS)) return;
    activeView.lastTypingSent = now;
    activeView?.socket?.send({ type: "typing" });
  }

  composer.append();
  return composer;
}

// Idempotency key: 8..64 chars (schema UNIQUE(channel_id, author_id,
// client_message_id)).
export function newClientId() {
  return "gc-" + (globalThis.crypto?.randomUUID?.() || String(Date.now()) + "-" + Math.random().toString(36).slice(2));
}

function pendingRow(doc, clientMessageId, draft) {
  const row = el("div", { class: "chat-message message-pending", dataset: { pendingId: clientMessageId } });
  row.append(
    el("span", {
      class: "user-avatar avatar",
      "aria-hidden": "true",
      text: initials(state.currentUser?.username),
    }),
    el("div", { class: "author" },
      el("span", { text: state.currentUser?.username || "" }),
      el("time", { text: "sending…" }),
    ),
    el("div", { class: "body", text: draft.body }),
  );
  if (draft.preview?.url) {
    row.append(el("img", {
      src: draft.preview.url,
      alt: "",
      class: "pending-preview",
    }));
  }
  return row;
}

// --- websocket wiring -------------------------------------------------------------

function openSocket(doc, win, channelId) {
  const socket = createChannelSocket({
    channelId,
    resumeAfter: activeView.messages.at(-1)?.id || 0,
    onMessage: (frame) => handleFrame(doc, win, frame),
    window: win,
  });

  activeView.socket = socket;

  // Presence heartbeat rides the chat socket (Task 9): one frame per 60s.
  const heartbeat = setInterval(() => {
    const ok = socket.send({
      type: "heartbeat",
      userId: state.currentUser?.id,
      username: state.currentUser?.username,
    });
    if (!ok) {
      // No open socket; the presence REST stays the fallback surface.
    }
  }, HEARTBEAT_MS);
  activeView.timers.push(heartbeat);
}

function teardownActive() {
  if (!activeView) return;
  activeView.destroyed = true;
  for (const timer of activeView.timers) clearInterval(timer);
  activeView.socket?.close();
  for (const preview of activeView.pendingSends.values()) revokePreview(preview);
  activeView = null;
}

const TYPING_TTL_MS = 6000;
const TYPING_THROTTLE_MS = 3000;

function handleFrame(doc, win, frame) {
  if (!activeView) return;

  switch (frame?.type) {
    case "msg":
      if (frame.message) applyIncomingMessage(doc, win, frame.message);
      break;

    case "broadcast":
      if (frame.kind === "typing" && frame.userId !== undefined) {
        activeView.typing = addTyping(activeView.typing, frame.userId, Date.now(), TYPING_TTL_MS);
        typingIndicator();
        setTimeout(typingIndicator, TYPING_TTL_MS + 250);
      }
      break;

    case "roster": {
      const members = Array.isArray(frame.members) ? frame.members : [];
      activeView.roster = new Map(
        members
          .filter((member) => member?.userId !== undefined)
          .map((member) => [Number(member.userId), member]),
      );
      const aside = doc.querySelector(".gc-aside");
      if (aside) renderAside(doc, win, aside, parseHash(win.location.hash));
      break;
    }

    case "error":
      handleServerError(doc, frame);
      break;

    case "care_notice":
      // 0010's Care class, WS path: the notice rides to the AUTHOR only, and
      // the message itself already landed — calm strip, never a block copy.
      if (typeof frame.body === "string" && frame.body) showCareNotice(doc, frame.body);
      break;

    case "pong":
      // Keepalive echo — nothing to render.
      break;

    case "presence":
      if (Array.isArray(frame.online)) {
        caches.presence = frame.online;
        const aside = doc.querySelector(".gc-aside");
        if (aside) renderAside(doc, win, aside, parseHash(win.location.hash));
      }
      break;

    default:
      // Unknown frame types are phase 2's envelope extensions; ignored, never
      // a crash.
      break;
  }
}

function handleServerError(doc, frame) {
  // {"type":"error","code":"send_failed"|"bad_frame"|"binary_unsupported"}
  const copy = {
    send_failed: "The server rejected that message (send_failed). Your draft is still in the composer — try again in a moment.",
    bad_frame: "That last action could not be processed (bad_frame).",
    binary_unsupported: "Binary frames only carry voice here, and only inside voice channels (binary_unsupported).",
  };
  // ChatRoom echoes HttpError copy on send_failed (frame.message); prefer it.
  const message = (frame.code === "send_failed" && frame.message) ||
    copy[frame.code] ||
    "The server reported: " + (frame.code || "unknown error") + ".";

  if (frame.code === "send_failed" && activeView?.composerError) {
    // The rules gate (0012): the DO relays the gate pointer on the frame —
    // open the ONE dialog instead of the strip. The composer's pending send
    // stays "sending…"; accepting it keeps the draft whole (the short REST
    // settle replay re-checks the gate with the accepted state and lands the
    // message), a dismissal shows the strip through the replay's 403 catch.
    const gate = rulesGateFromFrame(frame);
    if (gate && openRulesDialog(doc, {
      serverId: gate.serverId,
      rules: gate.rules,
    })) return;

    // Non-destructive: the composer text was left untouched by the failed
    // send; show the strip and nothing crashes.
    activeView.composerError.replaceChildren(
      errorMomentNode(doc, message),
    );
    return;
  }

  showTransientError(doc, message);
}

function applyIncomingMessage(doc, win, message) {
  if (!activeView) return;

  // Only live-append to the open channel.
  const { messages } = mergeMessages(activeView.messages, [message]);
  activeView.messages = messages;
  caches.byChannel.set(activeView.channelId, {
    messages: activeView.messages,
    nextAfter: activeView.nextAfter,
  });

  const scroll = activeView.scroll;
  const nearBottom = scroll
    ? scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 240
    : true;

  renderMessages(doc, win, nearBottom || isMine(message));

  // A message seen while the channel is open reads as read — the
  // conversation badge clears on the next list refresh.
  if (activeView.typing && Number(message.authorId) !== Number(state.currentUser?.id)) {
    activeView.typing.delete(Number(message.authorId));
    typingIndicator();
  }
}

function isMine(message) {
  return Number(message.authorId) === Number(state.currentUser?.id);
}

function typingIndicator() {
  if (!activeView?.typingNote) return;
  const pruned = expireTyping(activeView.typing, Date.now());
  activeView.typing = pruned;

  const names = [];
  for (const [userId] of pruned) {
    // Resolve names from the roster/presence first, else the message history.
    const rosterMember = activeView.roster?.get(Number(userId));
    const presenceEntry = (caches.presence || []).find((entry) => Number(entry.userId) === Number(userId));
    const historyAuthor = activeView.messages.findLast?.((message) => Number(message.authorId) === Number(userId));
    names.push(rosterMember?.username || presenceEntry?.username || historyAuthor?.authorName || "Someone");
  }

  activeView.typingNote.textContent =
    names.length === 0 ? "" : names.join(", ") + (names.length === 1 ? " is" : " are") + " typing…";
}

// --- edit + delete ------------------------------------------------------------------

function editMessageInline(doc, win, message) {
  const scroll = activeView?.scroll;
  const row = scroll?.querySelector('[data-message-id="' + message.id + '"]');
  if (row) {
    const body = row.querySelector(".body");
    if (row.dataset.editing === "1") return;
    row.dataset.editing = "1";

    const textarea = el("textarea", {
      class: "composer-input",
      maxlength: String(GC_MESSAGE_MAX),
      "aria-label": "Edit message",
    });
    textarea.value = String(message.body ?? "");

    const save = el("button", { class: "button button-primary", type: "button", text: "Save" });
    const cancel = el("button", { class: "button button-quiet", type: "button", text: "Cancel" });
    const error = el("span", { class: "error-copy" });

    const finish = () => {
      row.dataset.editing = "";
      renderMessages(doc, win, false);
    };

    save.addEventListener("click", async () => {
      error.textContent = "";
      try {
        const result = await api("/api/messages/" + message.id, {
          method: "PATCH",
          body: { body: textarea.value.trim() },
        });
        if (result?.message) applyIncomingMessage(doc, win, result.message);
        finish();
      } catch (caught) {
        error.textContent = caught?.message || "The edit could not be saved.";
      }
    });
    cancel.addEventListener("click", finish);

    const editor = el("div", { class: "editor-row" },
      textarea, error, save, cancel,
    );
    body.replaceWith(editor);
    textarea.focus();
  }
}

function deleteMessageDialog(doc, win, message) {
  const cancel = el("button", { class: "button button-quiet", type: "button", text: "Cancel" });
  const confirm = el("button", { class: "button button-danger", type: "button", text: "Delete" });
  const error = el("p", { class: "error-strip", role: "alert" });
  const dialog = el("dialog", {},
    el("h2", { text: "Delete message?" }),
    el("p", { class: "muted", text: "This removes the message (and its image) for everyone." }),
    error,
    el("div", { class: "form-actions" }, cancel, confirm),
  );

  cancel.addEventListener("click", () => dialog.close());
  confirm.addEventListener("click", async () => {
    try {
      await api("/api/messages/" + message.id, { method: "DELETE" });
      dialog.close();
      if (activeView) {
        activeView.messages = activeView.messages.filter(
          (entry) => Number(entry.id) !== Number(message.id),
        );
        caches.byChannel.set(activeView.channelId, {
          messages: activeView.messages,
          nextAfter: activeView.nextAfter,
        });
        renderMessages(doc, win, false);
      }
    } catch (caught) {
      error.textContent = caught?.message || "The message could not be deleted.";
    }
  });

  doc.body.append(dialog);
  dialog.showModal();
}

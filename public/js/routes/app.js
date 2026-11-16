
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
import { createChannelSocket, shouldSendTyping } from "../ws.js";
import { VOICE_COPY, createVoiceSession } from "../voice.js";
import { setSkinChoice, setThemeChoice } from "../theme.js";
import { openBackupCodesDialog } from "./backup-codes.js";
import {
  boostProgress,
  inviteCodeFromInput,
  openQuickSwitcher,
} from "../ui-helpers.js";

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

// App-scoped caches — module-level so route re-renders keep their data.
const caches = {
  servers: null,
  conversations: null,
  presence: null,
  byChannel: new Map(), // channelId -> { messages, nextAfter }
};

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
// must not stack duplicates. Login/review/discover pages never bind it.
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

  const nameInput = el("input", {
    type: "text",
    maxlength: "100",
    required: "",
    id: "server-settings-name",
    value: originalName,
  });
  const iconPicker = buildServerIconPicker(doc, {
    label: "Upload an icon",
    initialIconUrl: server?.iconUrl || null,
    initialsText: initials(originalName),
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
      error,
      el("div", { class: "form-actions" },
        cancel,
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
    if (name === originalName && !iconFile) {
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
      } else {
        await api("/api/servers/" + serverId, { method: "PATCH", body: { name } });
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

// Channel categories (server structure): gc_channels has no category column —
// the schema gap is noted in the render itself. The EXISTING grouping
// conventions (text vs voice) are the two categories, now with Discord's
// collapse caret; the collapsed labels persist per session only.
const COLLAPSED_KEY = "goober-collapsed-categories";

function readCollapsedCategories(win) {
  try {
    const raw = win.sessionStorage.getItem(COLLAPSED_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeCollapsedCategories(win, collapsed) {
  try {
    win.sessionStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  } catch {
    // Best effort; the caret state is per-page otherwise.
  }
}

function renderSidebar(doc, win, sidebar, route) {
  const head = el("div", { class: "gc-sidebar-head" });
  const scroll = el("div", { class: "gc-sidebar-scroll" });
  const userPanel = el("div", { class: "user-panel" });

  sidebar.replaceChildren(head, scroll, userPanel);

  const server = (caches.servers || []).find((entry) => entry.id === route.serverId) ?? null;

  if (route.serverId !== null) {
    const boosted = Number(server?.boosts) > 0;
    head.append(
      el("h2", {
        class: boosted ? "server-boosted" : "",
        text: server?.name || "Unknown server",
      }),
      el("span", { class: "head-spacer" }),
    );

    // Invite people (every member can mint an invite link).
    const invite = iconButton(doc, "person", { ariaLabel: "Invite people" });
    invite.addEventListener("click", () => inviteDialog(doc, win, route.serverId));
    head.append(invite);

    // Public/Private toggle (owner only): flips is_public via PATCH.
    if (server?.role === "owner") {
      head.append(visibilityToggleButton(doc, win, route.serverId, server?.isPublic === true));
    }

    const channelCreate = iconButton(doc, "plus", { ariaLabel: "Create a channel" });
    channelCreate.addEventListener("click", () => createChannelDialog(doc, win, route.serverId));
    head.append(channelCreate);

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
  } else {
    head.append(el("h2", { text: "Direct Messages" }));
    renderConversationList(doc, win, scroll, route);
  }

  renderUserPanel(doc, win, userPanel);
}

function renderChannelList(doc, win, scroll, route, server) {
  const collapsed = readCollapsedCategories(win);
  const categories = [
    { key: "text", label: "Text channels", channels: (server?.channels || []).filter((c) => c.kind === "text") },
    { key: "voice", label: "Voice channels", channels: (server?.channels || []).filter((c) => c.kind === "voice") },
  ];

  const wrapper = el("div", { class: "channel-categories" });
  for (const category of categories) {
    const isCollapsed = collapsed.has(category.key);
    wrapper.append(categoryGroup(doc, win, category, route, collapsed, isCollapsed));
  }
  scroll.replaceChildren(wrapper);
}

// One collapsible category group: a caret button header plus the rows. The
// rows drop out of the DOM when collapsed (no hidden-but-focusable buttons).
function categoryGroup(doc, win, category, route, collapsed, isCollapsed) {
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
  for (const channel of category.channels) group.append(channelRow(doc, win, channel, route));
  return group;
}

function channelRow(doc, win, channel, route) {
  const isVoice = channel.kind === "voice";
  const selected = route.channelId === channel.id;
  const row = el("button", {
    class: "channel-item" + (isVoice ? " voice-item" : ""),
    type: "button",
    "aria-current": selected ? "true" : "false",
  });
  row.append(createIcon(doc, iconFor[channel.kind] || "hash"));
  row.append(el("span", { class: "name", text: channel.name }));

  row.addEventListener("click", () => {
    if (isVoice) {
      startVoiceJoin(doc, win, channel);
      return;
    }
    win.location.hash = route.serverId !== null
      ? "#/s/" + route.serverId + "/c/" + channel.id
      : "#/c/" + channel.id;
  });

  return row;
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

  // Control row: mute rides the live voice session (unified with the voice
  // pane's mute — one session, one state); the gear opens the settings
  // dialog. Deafen is a KNOWN GAP: voice.js has no incoming-audio gate, so a
  // fake-off toggle is never rendered.
  const inVoice = Boolean(voiceSession?.active);
  const mute = iconButton(doc, voiceSession?.muted ? "mic-off" : "mic", {
    ariaLabel: voiceSession?.muted ? "Unmute microphone" : "Mute microphone",
    className: "icon-button button-quiet user-mute" + (voiceSession?.muted ? " muted" : ""),
  });
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
  const actions = el("div", { class: "actions" }, mute, backup, perks);

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
    win.location.hash = "#/login";
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
    win.location.hash = "#/login";
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

// Join from the sidebar row or a card's Join button.
function startVoiceJoin(doc, win, channel) {
  if (voiceSession?.active && voiceSession.channelId === channel.id) return;
  if (voiceSession?.active) voiceSession.leave();
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
}

function leaveVoice(doc, win) {
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
  const nameInput = el("input", { type: "text", maxlength: "100", required: "", id: "channel-name" });
  const kindSelect = el("select", { name: "kind", id: "channel-kind" },
    el("option", { value: "text", text: "Text" }),
    el("option", { value: "voice", text: "Voice" }),
  );
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
        },
      });
      dialog.close();
      refreshServersAndRerender(doc, win, { serverId, channelId: null });
    } catch (caught) {
      error.textContent = caught?.message || "The channel could not be created.";
    }
  });

  doc.body.append(dialog);
  dialog.showModal();
  nameInput.focus();
}

// --- invites + visibility (discovery task) ---------------------------------------

// The server cache is module-private; the discover/join routes clear it before
// landing in a freshly joined server so the refetch sees the new membership.
export function invalidateServersCache() {
  caches.servers = null;
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

function showTransientError(doc, message) {
  const existing = doc.getElementById("gc-transient-note");
  if (existing) existing.remove();
  const note = el("div", { id: "gc-transient-note", class: "stale-strip", text: message, role: "status" });
  note.addEventListener("click", () => note.remove());
  doc.body.append(note);
  setTimeout(() => note.remove(), 6000);
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

// Friends-hub-like shell for the home/DM view. NOTE (gap, owner-visible): GC
// has no friend model yet, so Discord's All/Online/Pending/Blocked tabs are
// deliberately NOT faked — the hub ships the surfaces that exist: the
// conversation list (the "All" tab), the Add affordance (the existing
// start-conversation dialog), the discovery link, and the create-or-join
// dialog. A friend model would add the remaining tabs with real data.
function friendsHub(doc, win, route) {
  const conversations = caches.conversations || [];

  const head = el("header", { class: "friends-hub-head" });
  head.append(
    el("span", { class: "icon-inline" }, createIcon(doc, "users")),
    el("h1", { text: "Direct Messages" }),
    el("span", { class: "spacer" }),
  );

  const add = el("button", {
    class: "button button-primary",
    type: "button",
  });
  add.append(createIcon(doc, "plus"), el("span", { text: "Start a conversation" }));
  add.addEventListener("click", () => startConversationDialog(doc, win));
  head.append(add);

  // Tabs: only the ones this data can populate — the conversations list is
  // "All"; discovery rides the rail magnifier already, an inline link keeps
  // the hub self-explanatory.
  const tabs = el("div", { class: "friends-hub-tabs", role: "tablist", "aria-label": "Message tabs" },
    el("button", {
      class: "friends-hub-tab friends-hub-tab-active",
      type: "button",
      role: "tab",
      "aria-selected": "true",
      text: "All (" + conversations.length + ")",
    }),
    el("a", {
      class: "friends-hub-tab friends-hub-tab-link",
      href: "#/discover",
      role: "tab",
      text: "Discover servers",
    }),
  );

  const cards = el("div", { class: "friends-hub-list", role: "list", "aria-label": "Conversations" });
  if (conversations.length === 0) {
    cards.append(homeNote());
  }
  for (const conversation of conversations) {
    const row = el("button", {
      class: "channel-item friends-hub-row",
      type: "button",
      role: "listitem",
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
    cards.append(row);
  }

  return el("div", { class: "friends-hub" }, head, tabs, cards);
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
  main.append(buildComposer(doc, win, main, composerError));

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
      const authorName = el("span", { text: message.authorName });
      if (accent) authorName.style.color = accent;
      row.append(
        el("span", { class: "user-avatar avatar", "aria-hidden": "true", text: initials(message.authorName) }),
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

    container.append(row);
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

// --- composer ---------------------------------------------------------------------

function buildComposer(doc, win, main, composerError) {
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
    } catch (caught) {
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

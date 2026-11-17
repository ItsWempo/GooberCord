// The shell — the three-pane chrome every route renders inside:
// [server rail 72px] [channel rail 260px] [main pane | members 240px]
//
// W-R1 owns the frame, the server/channel rails, the pane placeholders, the
// theme toggle, and the sign-out handoff. The wave builders inherit:
//   chat/composer -> they re-register the "channel" route (router.addRoute
//     with the same name replaces the current render) and fill the main pane;
//   members       -> they own the .members-rail body inside the shell grid;
//   social        -> they re-register "home" (or add routes) for DM/hub content.
//
// Store keys the shell reads and writes (the contract for every wave):
//   user             the /api/me session user (set by main.js)
//   servers          the /api/servers payload list (set here)
//   activeServerId   the rail's selected server (set here)
//   activeChannelId  the selected channel within it (set here)

import { h } from "../core/dom.js";
import { api } from "../core/api.js";
import store from "../core/store.js";
import * as router from "../core/router.js";
import { makeAppearance } from "../vendor/frontload/tokens.mjs";
import { wempoAccountsSignOutUrl } from "./landing.js";

// The theme engine is Kit's (frontload/tokens) — the storage-key family and
// the browser-chrome repaint ride it; there is no bespoke theme module. GC
// has ONE skin (the forum's look): writes go to goober-theme, forum-theme
// rides along as a read-only legacy home, and the skin vocabulary collapses
// to "brand" from both sides.
export const appearance = makeAppearance({
  themeKey: "goober-theme",
  skinKey: "goober-skin",
  legacyThemeKeys: ["forum-theme"],
  altSkin: "brand",
  defaultSkin: "brand",
  chromeColors: { brand: { light: "#f7efdc", dark: "#131b27" } },
});

export function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

// The initials on a server tile: up to two characters, Space Grotesk 700.
export function tileLabel(name) {
  return String(name || "?").trim().slice(0, 2).toUpperCase() || "?";
}

// The home door tile: WEMPO (the standing persona ruling — the door carries
// Wempo's face; Blaxel keeps to the CONTENTS). One <img>, no inline styles.
function homeTile(activeServerId) {
  return h("button", {
    class: ["server-tile", "server-home", activeServerId === null ? "server-active" : null],
    type: "button",
    "aria-label": "Direct messages",
    title: "Direct messages",
    onClick: () => {
      store.set({ activeServerId: null, activeChannelId: null });
      router.navigate("/");
    },
  }, h("img", { class: "tile-face", src: "/assets/wempo.png", alt: "WEMPO" }));
}

let serversLoading = false;

async function loadServers() {
  if (store.get("servers") || serversLoading) return;
  serversLoading = true;
  try {
    const payload = await api("/api/servers");
    store.set({ servers: Array.isArray(payload?.servers) ? payload.servers : [] });
  } catch {
    // A failed list leaves the rails empty rather than a broken shell.
    store.set({ servers: [] });
  } finally {
    serversLoading = false;
  }
}

function initialFor(text) {
  return String(text || "").trim().slice(0, 2).toUpperCase();
}

// The placeholder panes: the chat wave replaces the "channel" route by re-
// registering the same route NAME with its own render (addRoute drops the old
// render for a name). Each takes (route, mount) — the router's arg order.
export function channelPlaceholder(route, mount) {
  const server = (store.get("servers") || []).find(
    (entry) => entry.id === Number(route.params.serverId),
  );
  const channel = server?.channels?.find((c) => c.id === Number(route.params.channelId));
  const pane = h("section", { class: "pane-main" },
    h("header", { class: "pane-header" },
      h("h2", { class: "pane-title", text: channel ? "#" + channel.name : "Channel" })),
    h("div", { class: "pane-body" },
      h("p", { class: "empty-state", text: "Messages land here — the chat wave is next." })));
  mount.append(renderShell(route, pane));
  document.title = channel ? `${channel.name} — GooberCord` : "GooberCord";
}

export function serverPlaceholder(route, mount) {
  const server = (store.get("servers") || []).find(
    (entry) => entry.id === Number(route.params.serverId),
  );
  const pane = h("section", { class: "pane-main" },
    h("header", { class: "pane-header" },
      h("h2", { class: "pane-title", text: server ? server.name : "Server" })),
    h("div", { class: "pane-body" },
      h("p", { class: "empty-state", text: "No channels yet — the manage wave adds creating them." })));
  mount.append(renderShell(route, pane));
}

export function renderShell(route, paneOverride = null) {
  const frame = h("div", { class: "shell" });
  frame.append(serverRail(), channelRail());
  frame.append(paneOverride ?? mainPane(route));
  frame.append(membersRail());
  loadServers();
  return frame;
}

// --- the server rail (72px) --------------------------------------------------

function serverRail() {
  const rail = h("nav", { class: "rail-servers", "aria-label": "Servers" });
  const servers = store.get("servers") || [];
  const activeServerId = store.get("activeServerId") ?? null;

  rail.append(homeTile(activeServerId));

  for (const server of servers) {
    rail.append(h("button", {
      class: [
        "server-tile",
        activeServerId === server.id ? "server-active" : null,
      ],
      type: "button",
      title: server.name,
      "aria-label": server.name,
      text: initialFor(server.name),
      onClick: () => {
        store.set({ activeServerId: server.id, activeChannelId: null });
        const first = server.channels?.[0];
        router.navigate(first ? `/s/${server.id}/${first.id}` : `/s/${server.id}`);
      },
    }));
  }

  const foot = h("div", { class: "rail-servers-foot" });
  foot.append(h("button", {
    class: "server-tile server-add",
    type: "button",
    title: "Add a server",
    "aria-label": "Add a server",
    text: "+",
    onClick: () => {
      // The manage wave owns the add-server dialog; for now the + carries
      // the member to the empty servers state it will become.
    },
  }));
  rail.append(foot);
  return rail;
}

// --- the channel rail (260px) ------------------------------------------------

function channelRail() {
  const rail = h("nav", { class: "rail-channels", "aria-label": "Channels" });
  const servers = store.get("servers") || [];
  const activeServerId = store.get("activeServerId");
  const activeChannelId = store.get("activeChannelId");
  const server = servers.find((entry) => entry.id === activeServerId) || null;

  rail.append(h("header", { class: "rail-header" },
    h("h2", {
      class: "rail-title",
      text: server ? server.name : "GooberCord",
    })));

  if (server && Array.isArray(server.channels)) {
    // Channels file under their categories when the server has any;
    // otherwise one shared "Text channels" section carries them all.
    const byCategory = new Map(); // categoryId -> channels (null = unfiled)
    for (const channel of server.channels) {
      const key = channel.categoryId ?? null;
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key).push(channel);
    }
    const categoryNames = new Map(
      (server.categories || []).map((category) => [category.id, category.name]),
    );
    for (const [categoryId, channels] of byCategory) {
      rail.append(h("h3", {
        class: "rail-section",
        text: categoryNames.get(categoryId) ?? "Text channels",
      }));
      for (const channel of channels) {
        rail.append(channelRow(channel, activeChannelId, server));
      }
    }
  } else {
    rail.append(h("p", {
      class: "empty-state",
      text: "Join a server to see your channels.",
    }));
  }

  rail.append(userBlock());
  return rail;
}

function channelRow(channel, activeChannelId, server) {
  const selected = activeChannelId === channel.id;
  const slow = channel.slowmodeSeconds ? ` (${channel.slowmodeSeconds}s slow)` : "";
  return h("button", {
    class: ["channel-row", selected ? "channel-active" : null],
    type: "button",
    title: "#" + channel.name + slow,
    onClick: () => {
      store.set({ activeChannelId: channel.id });
      router.navigate(`/s/${server.id}/${channel.id}`);
    },
  }, h("span", { class: "channel-hash", text: "#" }), channel.name);
}

function userBlock() {
  const user = store.get("user");
  const foot = h("footer", { class: "rail-user" });
  foot.append(
    h("span", {
      class: "user-initials",
      "aria-hidden": "true",
      text: user ? initialFor(user.username) : "?",
    }),
    h("span", { class: "user-name", text: user ? user.username : "" }),
    h("button", {
      class: "control-quiet",
      type: "button",
      text: currentTheme() === "dark" ? "Light theme" : "Dark theme",
      onClick: function toggleTheme(event) {
        const next = currentTheme() === "dark" ? "light" : "dark";
        // Kit's engine: attribute, browser chrome, storage — in one call.
        appearance.setThemeChoice(document, localStorage, next);
        event.currentTarget.textContent = next === "dark" ? "Light theme" : "Dark theme";
      },
    }),
    h("a", {
      class: "control-quiet",
      href: wempoAccountsSignOutUrl(),
      text: "Sign out",
    }),
  );
  return foot;
}

// --- the main pane -----------------------------------------------------------

// First run is ONE screen (the owner's rethink #4): "You're in." — join with
// an invite link/code or create a server, nothing else. Blaxel decorates the
// CONTENTS; the + tile at the rail's foot is the create affordance the manage
// wave wires up.
function homePane() {
  const servers = store.get("servers") || [];
  if (servers.length === 0) {
    return h("section", { class: "pane-main" },
      h("div", { class: "pane-body first-run" },
        h("img", { class: "blaxel-face", src: "/assets/blaxel.png", alt: "" }),
        h("h2", { class: "display", text: "You're in." }),
        h("p", { class: "empty-state", text: "Join with an invite link, or create a server from the + tile." })));
  }
  return h("section", { class: "pane-main" },
    h("header", { class: "pane-header" },
      h("h2", { class: "pane-title", text: "Home" })),
    h("div", { class: "pane-body" },
      h("p", {
        class: "empty-state",
        text: "Pick a channel — its messages land here in the next build wave.",
      })));
}

function mainPane() {
  return homePane();
}

// --- the members rail (240px) ------------------------------------------------

function membersRail() {
  return h("aside", { class: "rail-members", "aria-label": "Members" },
    h("header", { class: "rail-header" },
      h("h2", { class: "rail-title", text: "Members" })),
    h("p", {
      class: "empty-state",
      text: "The member list fills in with the members wave.",
    }));
}

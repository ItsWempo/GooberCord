// The discovery page + signed-in invite-join route (discovery/invites task).
// Rendered from state.js's renderHash dispatch:
//   "#/discover"    -> renderDiscoverPage: one GET /api/discover grid, a Join
//                      button per panel that lands in the server on success.
//   "#/join/<CODE>" -> renderJoinRoute: signed-in, so the stash/login dance
//                      never happened — join straight from the code, then land.
// Both share the same "land in the server" rule: clear the app shell's server
// cache (renderAppPage only refetches a null caches.servers) and set the
// "#/s/<id>" hash — the shell's hashchange re-render does the rest.
import { api } from "../api.js";
import { el, initials } from "../dom.js";
import { iconButton } from "../icons.js";
import { mascotMoment } from "../mascot.js";
import { invalidateServersCache } from "./app.js";

function landInServer(win, serverId) {
  invalidateServersCache();
  win.location.hash = "#/s/" + Number(serverId);
}

function discoverShell(doc, win, { heading = "Discover servers",
  intro = "Public servers any GooberCord member can join. Invite links still work for private servers." } = {}) {
  const app = doc.getElementById("app");

  const back = iconButton(doc, "home", {
    className: "icon-button button-quiet",
    ariaLabel: "Back to GooberCord",
  });
  back.addEventListener("click", () => {
    win.location.hash = "#/";
  });

  const headingNode = el("h1", { class: "discover-heading", text: heading });
  const introNode = el("p", { class: "muted", text: intro });
  const grid = el("div", { class: "discover-grid", role: "list", "aria-label": "Public servers" });

  const panel = el("section", { class: "panel discover-panel" },
    el("div", { class: "form-actions discover-head-row" }, back),
    headingNode,
    introNode,
    grid,
  );

  const screen = el("div", { class: "auth-screen place-start-center discover-screen" }, panel);
  app.replaceChildren(screen);

  return grid;
}

export function renderDiscoverPage(doc, win) {
  const grid = discoverShell(doc, win);
  grid.replaceChildren(el("p", { class: "muted", text: "Loading public servers…" }));

  void (async () => {
    try {
      const payload = await api("/api/discover");
      const servers = payload?.servers || [];

      if (servers.length === 0) {
        grid.replaceChildren(
          mascotMoment(null, {
            mood: "waiting",
            size: "mid",
            text: "Nothing to discover yet — when a server owner flips it public, blaxel pins it here.",
          }),
        );
        return;
      }

      grid.replaceChildren();
      for (const server of servers) {
        grid.append(discoverPanel(doc, win, server));
      }
    } catch (caught) {
      grid.replaceChildren(
        mascotMoment(null, {
          mood: "sheepish",
          error: true,
          text: caught?.message || "The discovery list could not be loaded.",
        }),
      );
    }
  })();
}

function discoverPanel(doc, win, server) {
  const join = el("button", { class: "button button-primary join-button", type: "button", text: "Join" });
  const note = el("p", { class: "error-copy", role: "alert" });
  const name = String(server.name || "Unnamed server");

  const panel = el("div", { class: "panel discover-card", role: "listitem" },
    el("span", { class: "discover-badge", "aria-hidden": "true", text: initials(name) }),
    el("h3", { class: "discover-name", text: name }),
    el("p", { class: "muted member-count", text: memberCountLabel(server.memberCount) }),
    note,
    join,
  );

  join.addEventListener("click", async () => {
    join.disabled = true;
    note.textContent = "";
    try {
      // A server flipped private between render and click answers 404 here —
      // the panel shows the server's copy in place, no silent no-op.
      await api("/api/discover/" + Number(server.id) + "/join", { method: "POST" });
      landInServer(win, server.id);
    } catch (caught) {
      join.textContent = "Try again";
      note.textContent = caught?.message || "That server could not be joined.";
      join.disabled = false;
    }
  });

  return panel;
}

// memberCount arrives as a server-side COUNT(*) (never -1/undefined in phase
// 1); the label collapses 1 to the singular form. Pure.
export function memberCountLabel(count) {
  const parsed = Number(count);
  const members = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  return members === 1 ? "1 member" : members + " members";
}

// --- "#/join/CODE" (signed-in) ----------------------------------------------------

export function renderJoinRoute(doc, win, route) {
  const grid = discoverShell(doc, win, {
    heading: "Opening your invite",
    intro: "blaxel is checking the invite code before the door closes.",
  });
  grid.replaceChildren(
    mascotMoment(null, {
      mood: "idle",
      size: "mid",
      text: "blaxel is opening the door…",
    }),
  );

  void (async () => {
    try {
      const result = await api("/api/invites/" + encodeURIComponent(route.code) + "/join", {
        method: "POST",
      });
      // joined:false (already a member) lands the same way — idempotent.
      landInServer(win, result?.serverId);
    } catch (caught) {
      const retry = iconButton(doc, "home", {
        className: "button button-quiet",
        ariaLabel: "Back to GooberCord",
      });
      retry.textContent = "Back to GooberCord";
      retry.addEventListener("click", () => {
        win.location.hash = "#/";
      });
      grid.replaceChildren(
        el("div", { class: "discover-join-error" },
          mascotMoment(null, {
            mood: "sheepish",
            error: true,
            text: caught?.message || "That invite could not be used.",
          }),
          retry,
        ),
      );
    }
  })();
}

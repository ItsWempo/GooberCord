// The members lane: the roster pane (the shell's right rail), the member card
// route, and the nickname writes. Contract truth:
//   GET /api/servers/:id/roster          -> roster envelope (§3)
//   PATCH /api/servers/:id/nick          -> self, { nickname: null|""|string }
//   PATCH /api/servers/:id/nick/:uid     -> staff (KICK_MEMBERS+MANAGE_ROLES+position)
// The roster is a LINK list (G-7): rows offer themselves and open the member
// card route; the card carries the actions. Mod fields render for staff
// eyes only (owner or KICK_MEMBERS) — zero mod bits means the fields never
// render at all, not disabled ones.
import { h } from "../core/dom.js";
import { api } from "../core/api.js";
import store from "../core/store.js";
import { createForm, createInput } from "../vendor/designer/kit.mjs";
import * as router from "../core/router.js";
import { renderShell } from "./shell.js";
import { startConversation } from "./social.js";

const rosterKey = (serverId) => `roster:${serverId}`;

// loadRoster(serverId) — the roster envelope into the store's per-server
// entry. A refusal leaves the previous cache (or nothing) and rethrows so the
// pane can render the shared 403 string inline (G-3: never a fake empty list).
export async function loadRoster(serverId) {
  const payload = await api(`/api/servers/${serverId}/roster`);
  store.set({ [rosterKey(serverId)]: payload });
  return payload;
}

export function rosterOf(serverId) {
  return store.get(rosterKey(serverId)) || null;
}

const staffViewing = (payload) => !!(payload?.viewer?.owner
  || payload?.viewer?.permissions?.includes("KICK_MEMBERS"));

const canManage = (payload) => !!(payload?.viewer?.owner
  || payload?.viewer?.permissions?.includes("MANAGE_ROLES"));

// renderRosterBody(pane, serverId) — the members rail's body for an active
// server. The rail is a list of self-offering links; the card route holds
// every action. Blocks re-sorted by top position and colored by the member's
// top role.
export function renderRosterBody(pane, serverId) {
  const payload = rosterOf(serverId);
  if (!payload) {
    loadRoster(serverId).then(() => {
      if (rosterOf(serverId)) {
        pane.replaceChildren();
        renderRosterBody(pane, serverId);
      }
    }).catch((error) => {
      pane.replaceChildren();
      pane.append(h("p", { class: "empty-state", text: error.message }));
    });
    pane.append(h("p", { class: "empty-state", text: "Fetching the roster…" }));
    return;
  }
  const staff = staffViewing(payload);
  const cardUrl = (id) => `/s/${serverId}/member/${id}`;
  const members = [...payload.members].sort((a, b) => b.topPosition - a.topPosition);
  if (members.length <= 1) {
    pane.append(h("p", {
      class: "empty-state",
      text: "It's just you in here so far — invite someone.",
    }), h("a", { class: "control-quiet", href: "/join", text: "Invite or discover a server" }));
    return;
  }
  for (const member of members) {
    pane.append(h("a", {
      class: "member-row", href: cardUrl(member.id),
      title: member.nickname ? `${member.nickname} (${member.username})` : member.username,
      "aria-label": member.nickname || member.username,
    },
    h("span", {
      class: "member-dot",
      style: member.color ? `--member-color:${member.color}` : undefined,
    }),
    h("span", { class: "member-name", text: member.nickname || member.username }),
    member.isPlus ? h("span", { class: "mark-plus", title: "Goober+", text: "+" }) : null,
    member.timedOutUntil && staff ? h("span", {
      class: "mark-muted", title: member.timedOutUntil, text: "timed out",
    }) : null));
  }
}

// saveNickname(serverId, uid, nickname) — the two nick writes share one body
// grammar ({ nickname: null|""|string }); a word-filter or shape 400 keeps
// the caller's input (the form is not cleared) and its error renders verbatim.
export async function saveNickname(serverId, uid, nickname) {
  const path = uid === null
    ? `/api/servers/${serverId}/nick`
    : `/api/servers/${serverId}/nick/${uid}`;
  const result = await api(path, {
    method: "PATCH", body: { nickname: nickname === null ? null : String(nickname) },
  });
  const cached = rosterOf(serverId);
  if (cached) {
    store.set({ [rosterKey(serverId)]: {
      ...cached,
      members: cached.members.map((member) => member.id === (result?.member?.userId ?? uid)
        ? { ...member, nickname: result?.member?.nickname ?? null }
        : member),
    } });
  }
  return result;
}

function nicknameForm(serverId, uid, current, onDone) {
  const errorLine = h("p", { class: "form-error", role: "alert", "aria-live": "polite" });
  const field = createInput(document, {
    id: "nickname-input", label: uid === null ? "Your nickname here" : "Nickname",
    description: "1–32 characters.", value: current || "",
  });
  const form = createForm(document, "nickname", [field], "Save nickname");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const raw = form.querySelector("#nickname-input").value.trim();
    try {
      await saveNickname(serverId, uid, raw === "" ? null : raw);
      errorLine.textContent = "";
      onDone?.();
    } catch (error) {
      errorLine.textContent = error.message; // verbatim (G-2): input stays
    }
  });
  return h("div", { class: "panel" }, h("h3", { text: "Nickname" }), form, errorLine);
}

// renderMemberCard(route, mount) — the "/s/:serverId/member/:uid" task page
// (G-6: a route, never a dialog stack). Fields, then the affordances the
// viewer actually has.
export function renderMemberCard(route, mount) {
  const serverId = Number(route.params.serverId);
  const uid = Number(route.params.uid);
  const payload = rosterOf(serverId);
  const me = store.get("user");
  const card = h("section", { class: "task-page" });

  if (!payload) {
    card.append(h("p", { class: "empty-state", text: "Fetching the roster…" }));
    loadRoster(serverId).then(() => routerRerender()).catch((error) => {
      card.replaceChildren(h("p", { class: "empty-state", text: error.message }));
    });
    mount.append(renderShellAroundCard(card));
    return;
  }

  const member = payload.members.find((entry) => entry.id === uid);
  if (!member) {
    card.append(h("p", {
      class: "empty-state", text: "That member is not in this server.",
    }));
    mount.append(renderShellAroundCard(card));
    return;
  }

  const staff = staffViewing(payload);
  const roles = payload.roles.filter((role) => member.roleIds.includes(role.id));

  card.append(
    h("header", { class: "task-header" },
      h("a", { class: "back-link", href: `/s/${serverId}`, text: "← Back" }),
      h("h2", { class: "page-heading", text: member.nickname || member.username })),
    h("p", { class: "muted", text: member.nickname && member.nickname !== member.username
      ? member.username : "No nickname set." }),
    h("div", { class: "chip-row" },
      ...roles.map((role) => h("span", {
        class: "chip", style: role.color ? `--member-color:${role.color}` : undefined,
        text: role.name,
      })),
      member.isPlus ? h("span", { class: "chip mark-plus", text: "Goober+" }) : null,
      member.timedOutUntil ? h("span", {
        class: "chip mark-muted",
        text: "timed out until " + member.timedOutUntil,
      }) : null,
      payload.server.hasRules && member.rulesAccepted ? h("span", {
        class: "chip mark-muted", text: "rules accepted",
      }) : null,
      member.verificationEligible ? h("span", {
        class: "chip mark-muted", text: "verification pending",
      }) : null),
    h("p", { class: "muted", text: "Joined " + member.joinedAt
      + " · account made " + member.accountCreatedAt }),
  );

  // Staff-only fields (C5), NEVER hidden-but-rendered for plain members.
  if (staff && (member.createdByInvite || member.verificationEligible)) {
    const notes = [member.createdByInvite
      ? "Came in on invite " + member.createdByInvite : null,
    member.verificationEligible ? "Still owes verification." : null]
      .filter(Boolean);
    card.append(h("div", { class: "panel staff-notes" },
      h("h3", { text: "Moderation notes" }),
      h("ul", {}, ...notes.map((note) => h("li", { text: note })))));
  }

  if (me && me.id === uid) {
    card.append(nicknameForm(serverId, null, member.nickname, routerRerender));
  } else if (canManage(payload) && member.topPosition < payload.viewer.topPosition) {
    card.append(nicknameForm(serverId, uid, member.nickname, routerRerender));
  }

  card.append(h("div", { class: "affordance-row" },
    h("a", { class: "control-quiet", href: "/friends", text: "Friends & DMs" }),
    startDmControl(serverId, member)));

  mount.append(renderShellAroundCard(card));
}

// startDmControl — the quiet Message affordance; the DM attempt's 403/400
// shapes flow back inline on the card (the blocked-pair and friends-gate
// texts are the contract's, never paraphrased).
function startDmControl(serverId, member) {
  const link = h("a", {
    class: "control-quiet", href: "#", text: "Message",
    onclick: async (event) => {
      event.preventDefault();
      try {
        await startConversation(member.id);
      } catch (error) {
        link.textContent = error.message; // inline, verbatim
      }
    },
  });
  return link;
}

// routerRerender — the card re-reads the store the cheap way: re-running the
// current route's render through the router (avoids cross-module DOM reaches).
function routerRerender() {
  if (router.current()) router.renderCurrent();
}

// renderShellAroundCard(card) — the task page reuses the shell frame with the
// card in the main pane (members rail stays live beside it).
function renderShellAroundCard(card) {
  const pane = h("section", { class: "pane-main task-main" },
    h("div", { class: "pane-body" }, card));
  return renderShell(null, pane);
}

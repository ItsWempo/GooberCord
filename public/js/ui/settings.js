// The server-settings lane — SERVER settings ONLY (the settings wave's scope
// law: no register, no account settings; Accounts owns those). One task page
// per server management area, each a route with a back affordance (G-6):
//   /s/:id/settings    server settings + the rules doc (+ server delete)
//   /s/:id/channels    channels + categories (+ channel counts line)
//   /s/:id/roles       roles list; /s/:id/roles/:rid the one role editor
//   /s/:id/channels/:cid/overwrites  the overwrite editor
//   /s/:id/invites     invites
//   /join              the invite-code door + discovery (member-facing half)
// Every failure renders the payload's error string verbatim inline (G-2);
// caps cite payload values or mirrored constants with pin tests (G-4);
// deletions are single confirmations (G-6); rows never carry buttons (G-7)
// except the hover-revealed quiet writes the members/social lanes share.
import { h } from "../core/dom.js";
import { api } from "../core/api.js";
import store from "../core/store.js";
import { createForm, createInput, createSelect } from "../vendor/designer/kit.mjs";
import { openDialog } from "../vendor/frontload/dom.mjs";
import * as router from "../core/router.js";
import { renderShell, refreshServers } from "./shell.js";
import { guardRulesGate } from "./rules-gate.js";
import { rosterOf, loadRoster } from "./members.js";

// --- mirrored constants (G-4: pinned against constants.mjs / the contract) ----

export const UI_SLOWMODE_CHOICES = [0, 900, 1800, 3600, 7200, 21600];
export const UI_SERVER_PERMISSIONS = [
  "MANAGE_CHANNELS", "MANAGE_ROLES", "KICK_MEMBERS", "MANAGE_INVITES", "DELETE_MESSAGES",
  "VIEW", "SEND", "CONNECT", "SPEAK", "BYPASS_SLOWMODE", "ADD_REACTIONS", "MANAGE_EMOJI",
  "MENTION_EVERYONE",
];
export const UI_OVERWRITE_BITS = ["VIEW", "SEND", "CONNECT", "SPEAK", "ADD_REACTIONS"];
export const UI_VERIFICATION_LEVELS = [0, 1, 2, 3, 4];
export const UI_MAX_CHANNELS_PER_SERVER = 500;
export const UI_CATEGORIES_MAX_PER_SERVER = 50;
export const UI_ROLES_MAX = 250; // incl. @everyone, never raised by boosts
export const UI_RULES_MAX = 20000;

// The gear affordance lives where the bits say so: the server's membership
// role, or any channel's effectivePermissions carrying a manage bit.
export function serverAdminRights(server) {
  if (!server) return false;
  if (server.role === "owner" || server.role === "admin") return true;
  return (server.channels || []).some((channel) => (channel.effectivePermissions || [])
    .some((bit) => bit === "MANAGE_CHANNELS" || bit === "MANAGE_ROLES" || bit === "MANAGE_INVITES"));
}

function serverOf(serverId) {
  const serverId_ = Number(serverId);
  return (store.get("servers") || []).find((server) => server.id === serverId_) || null;
}

function inlineError() {
  return h("p", { class: "form-error", role: "alert", "aria-live": "polite" });
}

// The one confirm idiom (G-6: deletions and other irreversible commits).
function confirmDialog(title, bodyText, label, fn) {
  openDialog(document, {
    heading: title,
    body: h("p", { class: "gate-copy", text: bodyText }),
    modalOnly: true,
    actions: [
      { class: "button button-danger", text: label, onPress: fn },
      { class: "button button-quiet", text: "Keep" },
    ],
  });
}

function taskPane(serverId, heading, ...nodes) {
  return h("section", { class: "pane-main task-main" },
    h("div", { class: "pane-body" },
      h("section", { class: "task-page" },
        h("header", { class: "task-header" },
          h("a", { class: "back-link", href: `/s/${serverId}`, text: "← Back" }),
          h("h2", { class: "page-heading", text: heading })),
        h("nav", { class: "manage-nav", "aria-label": "Manage sections" },
          h("a", { href: `/s/${serverId}/settings`, text: "Server" }),
          h("a", { href: `/s/${serverId}/channels`, text: "Channels" }),
          h("a", { href: `/s/${serverId}/roles`, text: "Roles" }),
          h("a", { href: `/s/${serverId}/invites`, text: "Invites" }),
          h("a", { href: `/s/${serverId}/expressions`, text: "Expressions" }),
          h("a", { href: `/s/${serverId}/mod`, text: "Mod desk" })),
        ...nodes)));
}

function shellWrap(pane) {
  return renderShell(null, pane);
}

// manageGate(serverId, renderTask) — every manage route starts here: the
// viewer without rights sees the shared 403 string inline (G-3), never a
// fabricated form.
function manageGate(mount, serverId, title, build) {
  const server = serverOf(serverId);
  if (!server) {
    refreshServers().then(() => {
      if (serverOf(serverId)) manageGate(mount, serverId, title, build);
      else mount.append(renderShell(null, taskPane(serverId, title,
        h("p", { class: "empty-state", text: "You do not have permission to do that." }))));
    }).catch(() => {
      mount.append(renderShell(null, taskPane(serverId, title,
        h("p", { class: "empty-state", text: "You do not have permission to do that." }))));
    });
    return;
  }
  if (!serverAdminRights(server)) {
    mount.append(renderShell(null, taskPane(serverId, title,
      h("p", { class: "empty-state", text: "You do not have permission to do that." }))));
    return;
  }
  mount.append(shellWrap(taskPane(serverId, title, ...build(server))));
}

// --- E1: the server settings page ---------------------------------------------

export function renderServerSettings(route, mount) {
  const serverId = Number(route.params.serverId);
  manageGate(mount, serverId, "Server settings", (server) => {
    const nodes = [settingsForm(serverId, server), rulesPanel(serverId)];
    if (server.role === "owner") nodes.push(deletePanel(serverId));
    return nodes;
  });
}

function settingsForm(serverId, server) {
  const errorLine = inlineError();
  const nameField = createInput(document, {
    id: "server-name", label: "Server name", maxLength: 100, value: server.name,
  });
  const visibility = createSelect(document, {
    id: "server-visibility", label: "Discovery",
    options: [
      { value: "private", label: "Private (invite only)" },
      { value: "public", label: "Public (listed in discover)" },
    ],
  });
  visibility.querySelector("select").value = server.isPublic ? "public" : "private";
  const verification = createSelect(document, {
    id: "server-verification", label: "Verification level",
    description: "0–4: higher levels ask newer accounts and members to verify.",
    options: UI_VERIFICATION_LEVELS.map((level) => ({ value: String(level), label: String(level) })),
  });
  verification.querySelector("select").value = String(server.verificationLevel ?? 0);
  const form = createForm(document, "server-settings", [nameField, visibility, verification], "Save settings");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = form.querySelector("#server-name").value.trim();
    const isPublic = form.querySelector("#server-visibility").value === "public";
    const verificationLevel = Number(form.querySelector("#server-verification").value);
    const body = {};
    if (name !== server.name) body.name = name;
    if (isPublic !== server.isPublic) body.is_public = isPublic;
    if (verificationLevel !== (server.verificationLevel ?? 0)) body.verification_level = verificationLevel;
    if (Object.keys(body).length === 0) return; // zero-changes is the server's own 403 — send nothing
    try {
      await api(`/api/servers/${serverId}`, { method: "PATCH", body });
      await refreshServers();
      errorLine.textContent = "";
    } catch (error) {
      // The rules gate rides this route's writes too: accept, then re-offer.
      if (!guardRulesGate(document, error, () =>
        api(`/api/servers/${serverId}`, { method: "PATCH", body }).then(() => refreshServers()))) {
        errorLine.textContent = error.message;
      }
    }
  });
  return h("div", { class: "panel" }, h("h3", { text: "General" }), form, errorLine);
}

function rulesPanel(serverId) {
  const errorLine = inlineError();
  const counter = h("p", { class: "muted", text: "" });
  const docBox = h("textarea", {
    id: "rules-doc", rows: "8", maxlength: String(UI_RULES_MAX),
    "aria-label": "Rules document", placeholder: "Leave empty to keep the gate off.",
  });
  docBox.addEventListener("input", () => {
    if (docBox.value.length > UI_RULES_MAX) docBox.value = docBox.value.slice(0, UI_RULES_MAX);
    counter.textContent = docBox.value.length
      ? `${docBox.value.length} / ${UI_RULES_MAX} characters — clearing saves with the gate off.`
      : "Empty saves with the gate off.";
  });
  const form = createForm(document, "rules-doc", [h("div", { class: "form-field" },
    h("label", { for: "rules-doc", text: "Rules document" }), docBox, counter)], "Save rules");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = docBox.value;
    try {
      await api(`/api/servers/${serverId}`, {
        method: "PATCH", body: { rules_text: text.trim() === "" ? null : text },
      });
      await refreshServers();
      errorLine.textContent = "";
    } catch (error) {
      errorLine.textContent = error.message; // word-filter 400 keeps the text (input intact)
    }
  });
  // The doc reads back via the GET (PATCH never echoes rules_text).
  api(`/api/servers/${serverId}/rules`).then((payload) => {
    if (payload?.rules) {
      docBox.value = payload.rules;
      docBox.dispatchEvent(new Event("input"));
    }
  }).catch(() => { /* an unread doc leaves the editor empty */ });
  return h("div", { class: "panel" }, h("h3", { text: "Rules gate" }), form, errorLine);
}

function deletePanel(serverId) {
  return h("div", { class: "panel panel-danger" },
    h("h3", { text: "Delete this server" }),
    h("button", {
      class: "button button-danger", type: "button", text: "Delete server",
      onclick: () => confirmDialog("Delete this server?",
        "Everything goes: messages, channels, roles, invites. This cannot be undone.",
        "Delete", async () => {
          try {
            const result = await api(`/api/servers/${serverId}`, { method: "DELETE" });
            await refreshServers();
            router.navigate("/");
            // The echoed deletion counts render once as the consequence (G-6).
            const counts = result?.deleted || {};
            openDialog(document, {
              heading: "Server deleted",
              body: h("p", { class: "gate-copy",
                text: "Removed: " + Object.entries(counts)
                  .map(([key, count]) => `${key} ${count}`).join(", ") }),
              actions: [{ class: "button button-quiet", text: "Done" }],
            });
          } catch (error) {
            openDialog(document, {
              heading: "Could not delete",
              body: h("p", { class: "gate-copy", text: error.message }),
              actions: [{ class: "button button-quiet", text: "Done" }],
            });
          }
        }),
    }));
}

// --- E2: channels + categories -------------------------------------------------

export function renderServerChannels(route, mount) {
  const serverId = Number(route.params.serverId);
  manageGate(mount, serverId, "Channels", (server) => {
    const counts = (server.channels || []).length + (server.categories || []).length;
    return [
      channelForm(serverId, counts),
      categoriesPanel(serverId, server),
      channelsList(serverId, server),
    ];
  });
}

function channelForm(serverId, counts) {
  const errorLine = inlineError();
  const atCap = counts >= UI_MAX_CHANNELS_PER_SERVER;
  const kind = createSelect(document, {
    id: "channel-kind", label: "Kind",
    options: [{ value: "text", label: "Text" }, { value: "voice", label: "Voice" }],
  });
  const name = createInput(document, {
    id: "channel-name", label: "Name", maxLength: 100, required: true,
  });
  const slowmode = createSelect(document, {
    id: "channel-slowmode", label: "Slowmode",
    options: UI_SLOWMODE_CHOICES.map((seconds) => ({
      value: String(seconds), label: seconds === 0 ? "Off" : `${seconds}s`,
    })),
  });
  const form = createForm(document, "channel-create", [kind, name, slowmode],
    "Create channel");
  if (atCap) {
    for (const control of form.querySelectorAll("button[type=submit]")) control.disabled = true;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api(`/api/servers/${serverId}/channels`, {
        method: "POST",
        body: {
          kind: form.querySelector("#channel-kind").value,
          name: form.querySelector("#channel-name").value.trim(),
          slowmode_seconds: Number(form.querySelector("#channel-slowmode").value),
        },
      });
      await refreshServers();
      router.renderCurrent();
    } catch (error) {
      errorLine.textContent = error.message;
    }
  });
  return h("div", { class: "panel" },
    h("h3", { text: "Create a channel" }),
    atCap ? h("p", {
      class: "empty-state",
      text: `That server has reached its channel limit. (${counts} of ${UI_MAX_CHANNELS_PER_SERVER} — the one pool counts text, voice, and categories.)`,
    }) : null,
    form, errorLine);
}

function categoriesPanel(serverId, server) {
  const panel = h("div", { class: "panel" },
    h("h3", { text: "Categories" }),
    h("p", {
      class: "muted",
      text: `${(server.categories || []).length} of ${UI_CATEGORIES_MAX_PER_SERVER}`,
    }));
  const nameField = createInput(document, { id: "category-name", label: "New category", maxLength: 100 });
  const form = createForm(document, "category-create", [nameField], "Create");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api(`/api/servers/${serverId}/categories`, {
        method: "POST", body: { name: form.querySelector("#category-name").value.trim() },
      });
      await refreshServers();
      router.renderCurrent();
    } catch (error) {
      panel.append(h("p", { class: "form-error", text: error.message }));
    }
  });
  panel.append(form);
  // Category rows: rename offers itself; delete is the single confirmation.
  panel.append(h("div", { class: "manage-list" },
    ...(server.categories || []).map((category) => {
      return h("div", { class: "manage-row" },
        h("span", { class: "manage-name", text: category.name }),
        h("span", { class: "row-controls" },
          h("button", {
            class: "row-quiet-control", type: "button", text: "Rename",
            onclick: () => {
              openDialog(document, {
                heading: "Rename category",
                body: createInput(document, {
                  id: "category-rename", label: "Name", value: category.name, maxLength: 100,
                }),
                actions: [{
                  class: "button button-primary", text: "Save",
                  onPress: async () => {
                    try {
                      await api(`/api/servers/${serverId}/categories/${category.id}`, {
                        method: "PATCH",
                        body: { name: document.getElementById("category-rename").value.trim() },
                      });
                      await refreshServers();
                    } catch { /* the fresh list shows the failure's absence */ }
                  },
                }, { class: "button button-quiet", text: "Keep" }],
              });
            },
          }),
          h("button", {
            class: "row-quiet-control row-quiet-danger", type: "button", text: "Delete",
            onclick: () => confirmDialog("Delete this category?",
              "Its channels un-file; they are not deleted.", "Delete", async () => {
                try {
                  await api(`/api/servers/${serverId}/categories/${category.id}`, { method: "DELETE" });
                  await refreshServers();
                  router.renderCurrent();
                } catch (error) {
                  openDialog(document, {
                    heading: "Could not delete",
                    body: h("p", { class: "gate-copy", text: error.message }),
                    actions: [{ class: "button button-quiet", text: "Done" }],
                  });
                }
              }),
          })));
    })));
  return panel;
}

function channelsList(serverId, server) {
  const categories = server.categories || [];
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const panel = h("div", { class: "panel" }, h("h3", { text: "Channel rows" }));
  const rows = (channel) => h("div", { class: "manage-row" },
    h("span", { class: "manage-name", text: channel.name },
      h("span", { class: "mark-muted", text: ` · ${channel.kind}` +
        (channel.categoryId ? ` · ${categoryNames.get(channel.categoryId) || ""}` : "") +
        (channel.slowmodeSeconds ? ` · ${channel.slowmodeSeconds}s` : "") +
        (channel.isSpoiler ? " · spoiler" : "") })),
    h("span", { class: "row-controls" },
      h("a", {
        class: "row-quiet-control", text: "Edit",
        href: `/s/${serverId}/channels/${channel.id}/overwrites`,
      }),
      h("button", {
        class: "row-quiet-control row-quiet-danger", type: "button", text: "Delete",
        onclick: () => confirmDialog(`Delete #${channel.name}?`,
          "Its messages, attachments, and read states go with it.", "Delete",
          async () => {
            try {
              await api(`/api/servers/${serverId}/channels/${channel.id}`, { method: "DELETE" });
              await refreshServers();
              router.renderCurrent();
            } catch { /* the fresh list tells the rest */ }
          }),
      })));

  panel.append(h("div", { class: "manage-list" },
    ...(server.channels || []).map((channel) => rows(channel))));
  return panel;
}

// Overwrites editor (E4) — the resolution order is copy, not machinery.
export function renderOverwrites(route, mount) {
  const serverId = Number(route.params.serverId);
  const channelId = Number(route.params.channelId);
  const server = serverOf(serverId);
  if (!server || !serverAdminRights(server)) {
    mount.append(shellWrap(taskPane(serverId, "Overwrites",
      h("p", { class: "empty-state", text: "You do not have permission to do that." }))));
    return;
  }
  api(`/api/servers/${serverId}/channels/${channelId}/overwrites`).then((payload) => {
    const pane = taskPane(serverId, "Overwrites",
      h("p", {
        class: "muted",
        text: "Resolution order: server mask → @everyone deny then allow → category role deny then allow → channel role deny then allow. A layer's deny applies before its allow.",
      }),
      overwritesEditor(serverId, channelId, payload));
    mount.replaceChildren(shellWrap(pane));
  }).catch((error) => {
    mount.append(shellWrap(taskPane(serverId, "Overwrites",
      h("p", { class: "empty-state", text: error.message }))));
  });
}

function bitGrid(row, readOnly) {
  const existing = row ? { allow: new Set(row.allow || []), deny: new Set(row.deny || []) } : null;
  return h("div", { class: "bit-grid" },
    ...UI_OVERWRITE_BITS.flatMap((bit) => [
      h("label", { class: "check-inline" },
        h("input", {
          type: "checkbox", "data-bit": bit, "data-kind": "allow",
          checked: existing?.allow.has(bit) ? true : undefined,
          disabled: readOnly ? true : undefined,
        }), `allow ${bit}`),
      h("label", { class: "check-inline" },
        h("input", {
          type: "checkbox", "data-bit": bit, "data-kind": "deny",
          checked: existing?.deny.has(bit) ? true : undefined,
          disabled: readOnly ? true : undefined,
        }), `deny ${bit}`),
    ]));
}

// Role-targeted rows the viewer cannot write render READ-ONLY — a disabled
// control is a lie about affordance, but hiding them hides the truth (G-7).
function overwritesEditor(serverId, channelId, payload) {
  const viewerTop = payload.viewer?.topPosition ?? 0;
  const roles = new Map(payload.roles.map((role) => [role.id, role]));
  const existing = new Map(payload.overwrites.map((row) => [row.roleId ?? "everyone", row]));
  const rows = [{ id: "everyone", name: "@everyone", position: Infinity }, ...payload.roles];
  const canWriteRoles = (payload.viewer?.permissions || []).includes("MANAGE_ROLES")
    || payload.viewer?.owner === true;
  const panels = [];
  for (const role of rows) {
    const row = existing.get(role.id);
    const readOnly = role.id !== "everyone" && !canWriteRoles && role.position > viewerTop;
    const panel = h("div", { class: "panel overwrite-panel" },
      h("h3", { text: role.name + (readOnly ? " (read-only — above your position)" : "") }),
      bitGrid(row, readOnly));
    if (row && !readOnly) {
      panel.append(h("button", {
        class: "row-quiet-control row-quiet-danger", type: "button", text: "Clear overwrite",
        onclick: () => confirmDialog("Clear this overwrite?",
          "The role falls back to the layer underneath it.", "Clear", async () => {
            try {
              await api(`/api/servers/${serverId}/channels/${channelId}/overwrites/${role.id}`,
                { method: "DELETE" });
              router.renderCurrent();
            } catch { /* the fresh pull tells the rest */ }
          }),
      }));
    }
    if (!readOnly) {
      panel.append(h("button", {
        class: "button button-primary", type: "button", text: "Save overwrite",
        onclick: async () => {
          const allow = [...panel.querySelectorAll('input[data-kind="allow"][data-bit]:checked')]
            .map((box) => box.dataset.bit);
          const deny = [...panel.querySelectorAll('input[data-kind="deny"][data-bit]:checked')]
            .map((box) => box.dataset.bit);
          try {
            await api(`/api/servers/${serverId}/channels/${channelId}/overwrites/${role.id}`, {
              method: "PUT", body: { allow_mask: allow, deny_mask: deny },
            });
            router.renderCurrent();
          } catch (error) {
            panel.append(h("p", { class: "form-error", text: error.message }));
          }
        },
      }));
    }
    panels.push(panel);
  }
  return h("div", {}, ...panels);
}

// --- E3: roles -----------------------------------------------------------------

export function renderServerRoles(route, mount) {
  const serverId = Number(route.params.serverId);
  manageGate(mount, serverId, "Roles", (server) => [rolesPanel(serverId)]);
}

function rolesPanel(serverId) {
  const panel = h("div", { class: "panel" }, h("h3", { text: "Roles" }), inlineError());
  const errorLine = panel.querySelector(".form-error");
  const form = createForm(document, "role-create", [
    createInput(document, { id: "role-name", label: "Name", maxLength: 100 }),
  ], "Create role");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api(`/api/servers/${serverId}/roles`, {
        method: "POST",
        body: { name: form.querySelector("#role-name").value.trim() },
      });
      router.renderCurrent();
    } catch (error) {
      errorLine.textContent = error.message;
    }
  });
  // Roles ride a separate read (§3 Roles) with its authoritative list.
  api(`/api/servers/${serverId}/roles`).then((payload) => {
    const list = payload?.roles || [];
    panel.append(h("p", {
      class: "muted",
      text: `${list.length} of ${UI_ROLES_MAX} (the parity cap includes @everyone and is never raised by boosts).`,
    }));
    for (const role of list) {
      panel.append(h("a", {
        class: "manage-row", href: `/s/${serverId}/roles/${role.id}`,
        style: role.color ? `--member-color:${role.color}` : undefined,
      },
      h("span", { class: "manage-name", text: role.name }),
      h("span", { class: "mark-muted", text: ` · position ${role.position}` })));
    }
  }).catch((error) => {
    errorLine.textContent = error.message;
  });
  panel.append(h("div", { class: "panel" }, h("h3", { text: "New role" }), form));
  return panel;
}

export function renderServerRole(route, mount) {
  const serverId = Number(route.params.serverId);
  const roleId = Number(route.params.roleId);
  manageGate(mount, serverId, "Role", () => [roleEditor(serverId, roleId)]);
}

function roleEditor(serverId, roleId) {
  const wrap = h("div", {}, h("p", { class: "empty-state", text: "Fetching the roster…" }));
  Promise.all([
    api(`/api/servers/${serverId}/roles`),
    rosterOf(serverId) ? Promise.resolve(rosterOf(serverId)) : loadRoster(serverId),
  ]).then(([rolesPayload, rosterPayload]) => {
    const role = (rolesPayload?.roles || []).find((entry) => entry.id === roleId);
    if (!role) {
      wrap.replaceChildren(h("p", { class: "empty-state", text: "That role does not exist." }));
      return;
    }
    wrap.replaceChildren(roleEditPanels(serverId, role, rosterPayload));
  }).catch((error) => {
    wrap.replaceChildren(h("p", { class: "empty-state", text: error.message }));
  });
  return wrap;
}

function roleEditPanels(serverId, role, rosterPayload) {
  const errorLine = inlineError();
  const nameField = createInput(document, {
    id: "role-edit-name", label: "Name", maxLength: 100, value: role.name,
  });
  const colorField = createInput(document, {
    id: "role-edit-color", label: "Color (#rrggbb, empty = none)",
    value: role.color || "", description: "Lowercase #rrggbb, or empty for no color.",
  });
  const positionField = createInput(document, {
    id: "role-edit-position", label: "Position", type: "number", value: String(role.position),
    description: "Moving onto an occupied position swaps the two roles.",
  });
  const bits = h("div", { class: "bit-grid" },
    ...UI_SERVER_PERMISSIONS.map((bit) => h("label", { class: "check-inline" },
      h("input", {
        type: "checkbox", "data-bit": bit,
        checked: (role.permissions || []).includes(bit) ? true : undefined,
      }), bit)));
  const form = createForm(document, "role-edit", [nameField, colorField, positionField, bits],
    "Save role");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = form.querySelector("#role-edit-name").value.trim();
    const colorRaw = form.querySelector("#role-edit-color").value.trim();
    const position = Number(form.querySelector("#role-edit-position").value);
    const body = { name, color: colorRaw === "" ? null : colorRaw.toLowerCase(), position };
    body.permissions = [...form.querySelectorAll("input[data-bit]:checked")].map((box) => box.dataset.bit);
    try {
      await api(`/api/servers/${serverId}/roles/${role.id}`, { method: "PATCH", body });
      errorLine.textContent = "";
      router.renderCurrent();
    } catch (error) {
      errorLine.textContent = error.message;
    }
  });
  const panels = [h("div", { class: "panel" }, h("h3", { text: role.name }), form, errorLine),
    deleteRolePanel(serverId, role)];
  if (rosterPayload) {
    panels.push(roleAssignPanel(serverId, role, rosterPayload));
  }
  return panels;
}

function deleteRolePanel(serverId, role) {
  return h("div", { class: "panel panel-danger" },
    h("button", {
      class: "row-quiet-control row-quiet-danger", type: "button", text: "Delete role",
      onclick: () => confirmDialog(`Delete ${role.name}?`,
        "Members holding it lose it; assignments go with the row.", "Delete", async () => {
          try {
            await api(`/api/servers/${serverId}/roles/${role.id}`, { method: "DELETE" });
            router.navigate(`/s/${serverId}/roles`);
          } catch { /* the fresh list tells the rest */ }
        }),
    }));
}

function roleAssignPanel(serverId, role, rosterPayload) {
  const me = store.get("user");
  const panel = h("div", { class: "panel" }, h("h3", { text: "Members holding this role" }));
  const held = new Set(rosterPayload.members
    .filter((member) => member.roleIds.includes(role.id)).map((member) => member.id));
  // Owner rows are immune; the viewer's own row too (never a self-target).
  for (const member of rosterPayload.members) {
    const ownerRow = member.membershipRole === "owner";
    const isSelf = me?.id === member.id;
    if (ownerRow || isSelf) {
      // Owner rows immune; the viewer's own row too (never a self-target).
      panel.append(h("a", { class: "manage-row", href: `/s/${serverId}/member/${member.id}` },
        h("span", { class: "manage-name", text: member.nickname || member.username }),
        h("span", { class: "mark-muted", text: ownedLabel(isSelf, ownerRow) })));
      continue;
    }
    panel.append(h("div", { class: "manage-row" },
      h("a", { class: "manage-name", href: `/s/${serverId}/member/${member.id}`, text: member.nickname || member.username }),
      h("span", { class: "row-controls" },
        held.has(member.id)
          ? h("button", {
            class: "row-quiet-control row-quiet-danger", type: "button", text: "Remove",
            onclick: async (event) => {
              event.target.disabled = true;
              try {
                await api(`/api/servers/${serverId}/roles/${role.id}/members/${member.id}`,
                  { method: "DELETE" });
                await loadRoster(serverId);
                router.renderCurrent();
              } catch (error) {
                event.target.textContent = error.message;
              }
            },
          })
          : h("button", {
            class: "row-quiet-control", type: "button", text: "Assign",
            onclick: async (event) => {
              event.target.disabled = true;
              try {
                await api(`/api/servers/${serverId}/roles/${role.id}/members/${member.id}`,
                  { method: "PUT" });
                await loadRoster(serverId);
                router.renderCurrent();
              } catch (error) {
                event.target.textContent = error.message; // verbatim
              }
            },
          }))));
  }
  return panel;
}

function ownedLabel(isSelf, ownerRow) {
  if (isSelf && ownerRow) return " · you (owner, immune)";
  if (isSelf) return " · you";
  if (ownerRow) return " · owner";
  return " · held";
}

// --- E5: invites ------------------------------------------------------------------

const INVITE_EXPIRY_CHOICES = [
  { value: "", label: "Never expires" },
  { value: "3600", label: "1 hour" },
  { value: "86400", label: "1 day" },
  { value: "604800", label: "7 days" },
  { value: "2592000", label: "30 days" },
];
const INVITE_USE_CHOICES = [
  { value: "", label: "Unlimited uses" },
  { value: "1", label: "1 use" },
  { value: "5", label: "5 uses" },
  { value: "25", label: "25 uses" },
  { value: "100", label: "100 uses" },
];

export function renderServerInvites(route, mount) {
  const serverId = Number(route.params.serverId);
  manageGate(mount, serverId, "Invites", () => [invitesPanel(serverId)]);
}

function invitesPanel(serverId) {
  const panel = h("div", { class: "panel" }, h("h3", { text: "Invites" }), inlineError());
  const errorLine = panel.querySelector(".form-error");
  const fresh = h("p", { class: "muted", "aria-live": "polite" });
  const expiry = createSelect(document, {
    id: "invite-expiry", label: "Expiry",
    description: "Empty selects never — the server treats empty, 0 and absent alike as never.",
    options: INVITE_EXPIRY_CHOICES,
  });
  const uses = createSelect(document, {
    id: "invite-uses", label: "Use cap", description: "Empty selects unlimited.", options: INVITE_USE_CHOICES,
  });
  const form = createForm(document, "invite-create", [expiry, uses], "Mint invite");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const maxAge = form.querySelector("#invite-expiry").value;
    const maxUses = form.querySelector("#invite-uses").value;
    const body = {};
    if (maxAge !== "") body.maxAgeSeconds = Number(maxAge);
    if (maxUses !== "") body.maxUses = Number(maxUses);
    try {
      const result = await api(`/api/servers/${serverId}/invites`, { method: "POST", body });
      fresh.textContent = "Fresh invite: " + result.code;
      router.renderCurrent();
    } catch (error) {
      errorLine.textContent = error.message;
    }
  });
  panel.append(form, fresh);
  api(`/api/servers/${serverId}/invites`).then((payload) => {
    for (const invite of payload?.invites || []) {
      panel.append(h("div", { class: "manage-row" },
        h("span", { class: "manage-name manage-code", text: invite.code },
          h("span", { class: "mark-muted", text: inviteRowMeta(invite) })),
        invite.active || invite.revokedAt === null ? h("span", { class: "row-controls" },
          h("button", {
            class: "row-quiet-control row-quiet-danger", type: "button", text: "Revoke",
            onclick: () => confirmDialog(`Revoke ${invite.code}?`,
              "New joins stop immediately; past uses stay counted.", "Revoke", async () => {
                try {
                  await api(`/api/servers/${serverId}/invites/${invite.code}`, { method: "DELETE" });
                  router.renderCurrent();
                } catch (error) {
                  openDialog(document, {
                    heading: "Could not revoke",
                    body: h("p", { class: "gate-copy", text: error.message }),
                    actions: [{ class: "button button-quiet", text: "Done" }],
                  });
                }
              }),
          })) : null));
    }
  }).catch((error) => {
    errorLine.textContent = error.message;
  });
  return panel;
}

function inviteRowMeta(invite) {
  const expiry = invite.expiresAt
    ? " expires " + new Date(invite.expiresAt * 1000).toLocaleString() : " never expires";
  const uses = invite.maxUses ? ` ${invite.uses}/${invite.maxUses} uses` : ` ${invite.uses} uses`;
  const by = invite.createdByName ? ` by ${invite.createdByName}` : "";
  const revoked = invite.revokedAt ? " · REVOKED" : "";
  return expiry + uses + by + revoked;
}

// --- the member-facing door: /join ---------------------------------------------------

export function renderJoin(route, mount) {
  const pane = h("section", { class: "pane-main task-main" },
    h("div", { class: "pane-body" },
      h("section", { class: "task-page" },
        h("header", { class: "task-header" },
          h("a", { class: "back-link", href: "/", text: "← Back" }),
          h("h2", { class: "page-heading", text: "Join a server" })),
        joinByCode(), discoverPanel())));
  mount.append(renderShell(null, pane));
}

function joinByCode() {
  const errorLine = inlineError();
  const codeField = createInput(document, {
    id: "invite-code", label: "Invite code or link",
    description: "Paste the code, or a full invite link — the last path segment is the code.",
  });
  const form = createForm(document, "invite-join", [codeField], "Join");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const raw = form.querySelector("#invite-code").value.trim();
    const match = /([A-Za-z0-9_-]{8})\s*$/.exec(raw);
    if (!match) {
      errorLine.textContent = "That invite is no longer valid."; // shape miss = the route's own text
      return;
    }
    try {
      const result = await api(`/api/invites/${match[1]}/join`, { method: "POST" });
      await refreshServers();
      if (result?.joined === false) {
        errorLine.textContent = "You are already in that server.";
        return;
      }
      navigateJoinedServer(result.serverId);
    } catch (error) {
      errorLine.textContent = error.message; // lapsed/maxed/revoked/banned, verbatim
    }
  });
  return h("div", { class: "panel" }, h("h3", { text: "With an invite" }), form, errorLine);
}

function navigateJoinedServer(serverId) {
  const server = (store.get("servers") || []).find((entry) => entry.id === serverId);
  const first = server?.channels?.[0];
  router.navigate(first ? `/s/${serverId}/${first.id}` : `/s/${serverId}`);
}

// Discover (GET /api/discover, public, own memberships excluded server-side):
// each row IS the commit (label carries it) — a button-per-row of pills would
// be icon-soup, a commit-shaped row is not.
function discoverPanel() {
  const panel = h("div", { class: "panel" }, h("h3", { text: "Open for discovery" }),
    h("p", { class: "empty-state", text: "Fetching open servers…" }));
  api("/api/discover").then((payload) => {
    const list = h("div", { class: "manage-list" });
    for (const server of payload?.servers || []) {
      list.append(h("button", {
        class: "discover-row", type: "button",
        text: `Join ${server.name} (${server.memberCount} members)`,
        onclick: async (event) => {
          event.currentTarget.disabled = true;
          try {
            const result = await api(`/api/discover/${server.id}/join`, { method: "POST" });
            await refreshServers();
            if (result?.joined === false) {
              router.navigate(`/s/${server.id}`);
              return;
            }
            navigateJoinedServer(server.id);
          } catch (error) {
            event.currentTarget.disabled = false;
            event.currentTarget.textContent = error.message; // verbatim, the row becomes the error line
          }
        },
      }));
    }
    panel.replaceChildren(h("h3", { text: "Open for discovery" }),
      list.children.length ? list
        : h("p", { class: "empty-state", text: "Nothing open right now — an invite link still works." }));
  }).catch((error) => {
    panel.append(h("p", { class: "empty-state", text: error.message }));
  });
  return panel;
}

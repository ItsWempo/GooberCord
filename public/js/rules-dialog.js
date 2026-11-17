// Copyright 2026 YourLocalGoober
//
// This file is part of GooberCord.
//
// GooberCord is free software: you can redistribute it and/or modify it
// under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the
// GNU Affero General Public License along with this program.  If not,
// see <https://www.gnu.org/licenses/>

// The server rules gate's dialog (0012). The gate itself is server-side —
// the shared enforceMemberGates answers every gated send and voice join with
// the ONE 403 whose body carries the pointer ({ error, serverId, rules }) —
// and this module is the client's half: it detects that 403 (on the REST
// error and on the DO's relayed send_failed frame) and opens ONE rules
// dialog. The dialog shows the owner's rules document (textContent only, the
// house CSP discipline) with an Accept button until the member accepted;
// closing without accepting is the "not yet" state and never a dismissal
// penalty. Every dialog self-removes on close like every other GC dialog.
//
// Pure helpers (rulesGateFromError / rulesGateFromFrame / rulesGatePending)
// are exported for the unit tests; the dialog openers build DOM through
// el() only — no innerHTML, no inline styles.
import { el } from "./dom.js";
import { api } from "./api.js";

// The stable copy — the same string api/core's RULES_GATE_MESSAGE carries;
// duplicated here because the client never imports server modules.
export const RULES_GATE_COPY = "You must accept this server's rules before doing that.";

// rulesGateFromError(caught) -> { serverId, rules } | null. The shared 403's
// body fields are copied onto the thrown Error by api() (the additive-field
// rule), so a gated send is recognizable WITHOUT reading anything but the
// shape: a 403 carrying a non-empty rules string. Pure — junk in, null out.
export function rulesGateFromError(caught) {
  if (!caught || Number(caught.status) !== 403) return null;
  const rules = typeof caught.rules === "string" ? caught.rules : "";
  if (rules.trim() === "") return null;
  return { serverId: Number(caught.serverId), rules };
}

// rulesGateFromFrame(frame) -> { serverId, rules } | null. The DO relays the
// gate pointer on its send_failed frame ({ ..., rules, serverId }); any other
// frame (or a send_failed without the pointer — an older deploys mix) is not
// a gate dialog. Pure.
export function rulesGateFromFrame(frame) {
  if (!frame || frame.type !== "error" || frame.code !== "send_failed") return null;
  const rules = typeof frame.rules === "string" ? frame.rules : "";
  if (rules.trim() === "") return null;
  return { serverId: Number(frame.serverId), rules };
}

// rulesGatePending(state) -> { serverId, rules } | null. The rules read
// route's shape ({ serverId, rules, acceptedAt }): a gate is PENDING (needs
// the dialog with its Accept button) exactly when a non-empty document is on
// and the member holds no accepted_at yet. A null document is the OFF gate;
// an already-accepted state reads again fine. Pure.
export function rulesGatePending(state) {
  const rules = state && typeof state.rules === "string" ? state.rules : "";
  if (rules.trim() === "" || state.acceptedAt !== null) return null;
  return { serverId: Number(state.serverId), rules };
}

// The one dialog. `accepted` is whether the member ALREADY accepted (the
// re-read case: the Accept button then hides and the copy says so). Opens at
// most one instance; returns true when a dialog opened this call, false when
// one was already up (callers use that to fall through to the plain failure
// path instead of leaving a pending send hanging behind an invisible dialog).
export function openRulesDialog(doc, { serverId, rules, accepted = false, onAccepted = null, onDismiss = null } = {}) {
  if (doc.getElementById("gc-rules-dialog")) return false;
  let acceptedNow = false;

  const error = el("p", { class: "error-strip", role: "alert" });

  const handleAccept = async () => {
    error.textContent = "";
    try {
      await api("/api/servers/" + Number(serverId) + "/rules/accept", { method: "POST" });
      acceptedNow = true;
      dialog.close();
      if (typeof onAccepted === "function") onAccepted();
    } catch (caught) {
      error.textContent = caught?.message || "The rules could not be accepted just now.";
    }
  };

  const dialog = el("dialog", { id: "gc-rules-dialog" },
    el("h2", { text: "Server rules" }),
    el("p", {
      class: "muted list-note",
      text: accepted
        ? "You accepted these rules — read them again anytime."
        : "Accept these rules to keep sending, reacting, and joining voice here.",
    }),
    // The owner's document rides textContent only — a rules page is prose,
    // never markup.
    el("div", { class: "rules-body", text: String(rules ?? "") }),
    error,
    el("div", { class: "form-actions" },
      ...(accepted ? [] : [el("button", {
        class: "button button-primary",
        type: "button",
        text: "Accept",
        onclick: () => void handleAccept(),
      })]),
      el("button", { class: "button button-quiet", type: "button", text: "Close", onclick: () => dialog.close() }),
    ),
  );
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (typeof onDismiss === "function") onDismiss(acceptedNow);
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  doc.body.append(dialog);
  dialog.showModal();
  return true;
}

// The rules read (member-only): null on a refusal (non-member / rate-limited
// — the gate dialogs then simply never open; the server re-asserts the gate
// on every door anyway). The voice preflight and the sidebar menu both ride
// this ONE read.
export async function readServerRules(serverId) {
  try {
    return await api("/api/servers/" + Number(serverId) + "/rules");
  } catch {
    return null;
  }
}

// The menu entry: re-read anytime. Returns true when it opened A dialog (the
// gate's pending dialog, or the accepted re-read), false when the gate is off
// (or the read was refused) and only a toast makes sense.
export async function openServerRulesMenu(doc, serverId, { onAccepted = null } = {}) {
  const state = await readServerRules(serverId);
  const pending = rulesGatePending(state);
  if (pending) {
    return openRulesDialog(doc, { serverId: pending.serverId, rules: pending.rules, onAccepted });
  }
  const rules = state && typeof state.rules === "string" ? state.rules : "";
  if (rules.trim() === "") return false; // gate off — nothing to show
  return openRulesDialog(doc, { serverId, rules: state.rules, accepted: true, onAccepted });
}

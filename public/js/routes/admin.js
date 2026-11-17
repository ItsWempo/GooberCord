
// The staff review strip (Task 13 scope, carried by this shell): the pending
// attachment queue with approve/reject. Entry is the shield button in the
// user panel (owner/admin only — the route itself re-checks the role from
// /api/me and bounces non-staff back to #/ before its first fetch).
import { api } from "../api.js";
import { el, formatTimestamp } from "../dom.js";
import { state } from "../state.js";
import { mascotMoment } from "../mascot.js";

export function renderReviewPage(doc, win) {
  const app = doc.getElementById("app");

  const staff = state.currentUser?.role === "owner" || state.currentUser?.role === "admin";
  if (!staff) {
    win.location.replace("#/");
    return;
  }

  const back = el("button", {
    class: "button button-quiet",
    type: "button",
    text: "← Back to GooberCord",
  });
  back.addEventListener("click", () => {
    win.location.hash = "#/";
  });

  const list = el("div", {});
  const error = el("p", { class: "error-strip", role: "alert" });
  const status = el("p", { class: "success-copy", role: "status" });

  const panel = el("section", { class: "panel review-panel" },
    el("h1", { class: "review-heading", text: "Attachment review desk" }),
    el("p", {
      class: "muted",
      text: "Pending images await a staff decision. Approving publishes the attachment to everyone; rejecting removes its bytes.",
    }),
    error,
    status,
    list,
  );

  const screen = el("div", { class: "auth-screen place-start-center" },
    el("div", { class: "review-screen" },
      el("div", { class: "form-actions review-back-row" }, back),
      panel,
    ),
  );

  app.replaceChildren(screen);

  const load = async () => {
    list.replaceChildren(el("p", { class: "muted", text: "Loading the queue…" }));
    try {
      const queue = await api("/api/admin/attachments");
      const rows = queue?.attachments || [];

      if (rows.length === 0) {
        list.replaceChildren(
          mascotMoment(null, {
            mood: "idle",
            size: "mid",
            text: "The review queue is empty. Everything is settled — Blaxel approves.",
          }),
        );
        return;
      }

      list.replaceChildren(...rows.map((row) => reviewItem(doc, win, row, load, error, status)));
    } catch (caught) {
      list.replaceChildren();
      error.textContent = caught?.message || "The queue could not be loaded.";
    }
  };

  void load();
}

function reviewItem(doc, win, row, reload, error, status) {
  const item = el("div", { class: "panel review-item" });

  // The gated serve admits staff for pending rows, so the preview loads.
  item.append(el("img", { src: "/api/attachments/" + row.id, alt: "Pending attachment" }));

  item.append(
    el("div", { class: "meta" },
      el("span", { class: "name", text: "from " + (row.uploaderName || "unknown") }),
      el("span", { class: "presence-status", text: sizeLabel(row.sizeBytes) + " · " + formatTimestamp(row.createdAt) }),
    ),
  );

  const approve = el("button", { class: "button button-primary", type: "button", text: "Approve" });
  approve.addEventListener("click", () => moderate(doc, "approve", row, reload, error, status));

  const reject = el("button", { class: "button button-danger", type: "button", text: "Reject" });
  reject.addEventListener("click", () => moderate(doc, "reject", row, reload, error, status));

  item.append(el("div", { class: "actions" }, approve, reject));
  return item;
}

async function moderate(doc, action, row, reload, error, status) {
  error.textContent = "";
  try {
    await api("/api/admin/attachments/" + row.id + "/" + action, { method: "POST" });
    status.textContent =
      action === "approve"
        ? "Attachment #" + row.id + " approved."
        : "Attachment #" + row.id + " rejected.";
    void reload();
  } catch (caught) {
    error.textContent = caught?.message || "The decision could not be saved.";
  }
}

function sizeLabel(bytes) {
  if (!Number.isFinite(Number(bytes)) || Number(bytes) <= 0) return "0 B";
  const kb = Number(bytes) / 1024;
  return kb >= 1024 ? (kb / 1024).toFixed(1) + " MiB" : Math.round(kb) + " KiB";
}

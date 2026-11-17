// The expression manage dialog (the W-F1 wave): the emoji/sticker
// PATCH/DELETE route families finally gain their client callers, riding
// EXACTLY the soundboard dialog's idiom — row affordances gated on the
// manage right the caller passes, the upload form's honest pre-errors
// ahead of any byte, mutations rerendering in place, the server's own
// copies (the grammar 400, the 409 taken name, the over-slot cap) surfacing
// verbatim. The name grammar is the SAME one the soundboard mirrors (the
// gc_sounds/gc_emoji CHECKs spell it once server-side).
//
// The caps: the list payload's caps rider (W-B0) carries the slot caps the
// server's resolver answers PER SERVER — the manage dialog's counters read
// THAT field only and an absent field renders no counter; no slot number
// is ever invented client-side — the over-cap copy stays the server's own 400.
import { el } from "./dom.js";
import { api } from "./api.js";
import { iconButton } from "./icons.js";
import { MAX_ATTACHMENT_BYTES, ATTACHMENT_TOO_LARGE_ERROR } from "./attachments.js";

// The shared grammar (the emoji lane's CHECK, spelled once server-side —
// the soundboard module mirrors the same constants; both copies are pinned
// identical in their tests).
export const EXPRESSION_NAME_MIN = 2;
export const EXPRESSION_NAME_MAX = 16;
export const EXPRESSION_NAME_PATTERN = /^[A-Za-z0-9_]{2,16}$/;
export const EXPRESSION_NAME_ERROR =
  "Use a " + EXPRESSION_NAME_MIN + "-" + EXPRESSION_NAME_MAX +
  " character name of letters, numbers and underscores.";

// The image intake's client mirror: the four magic-sniffed formats, and the
// cap riding attachments.js — the intake cap's SINGLE client mirror (the
// backend's MAX_ATTACHMENT_BYTES in constants.mjs is the authority behind
// it; the refusal copy is that file's re-derivation of it).
export const EXPRESSION_IMAGE_MAX_BYTES = MAX_ATTACHMENT_BYTES;
export const EXPRESSION_IMAGE_TOO_LARGE_ERROR = ATTACHMENT_TOO_LARGE_ERROR;
export const EXPRESSION_IMAGE_FORMAT_ERROR =
  "Only JPEG, PNG, WebP, and GIF images can be attached.";

export function expressionNameValid(value) {
  return typeof value === "string" && EXPRESSION_NAME_PATTERN.test(value);
}

// expressionImageOk(file): the honest pre-error before the intake reads
// the bytes — the cap and the four admitted formats (the magic sniff's
// list; the extension check admits the type-less OS picks). The server
// re-sniffs the bytes (and re-runs the sanitizer), never trusting these.
export function expressionImageOk(file) {
  if (!(file instanceof File)) return false;
  if (file.size < 1 || file.size > EXPRESSION_IMAGE_MAX_BYTES) return false;
  const mime = file.type || "";
  if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime)) return true;
  if (mime.startsWith("image/")) return false;
  return /\.(jpe?g|png|webp|gif)$/i.test(file.name || "");
}

// The read: GET /api/servers/:id/emojis|stickers — the per-kind payloads
// the routes answer ({ emojis, caps } / { stickers, caps }). The caps rider
// (W-B0) carries the slot caps the resolver answers PER SERVER; the manage
// dialog's counters read THIS field only — an absent field renders no
// counter, and no cap number is ever invented client-side.
export const CAPS_KEY = { emojis: "emoji", stickers: "stickers" };

export async function loadExpressionKind(serverId, kind) {
  const payload = await api("/api/servers/" + Number(serverId) + "/" + kind);
  const rows = Array.isArray(payload?.[kind]) ? payload[kind] : [];
  return {
    rows: rows.filter((row) => row && row.url),
    caps: payload?.caps || null,
  };
}

const KIND_WORDS = { emojis: "emoji", stickers: "sticker" };

// The manage dialog: one dialog, a section per kind, each with its row
// list (thumbnail + name, pen/trash when the gate rides), an upload form,
// and the shared strip for the server's copies. onMutated(syncs) notifies
// the caller after any successful write so the caches stay true.
export function openExpressionManageDialog(doc, win, serverId, onMutated) {
  const error = el("p", { class: "error-strip", role: "alert" });
  const sections = { emojis: null, stickers: null };
  const lists = { emojis: [], stickers: [] };
  // The slot counters' payload truth (W-B0's rider): each read's caps field,
  // held per kind — renderLists reads these ONLY, never a local constant.
  const capsSeen = { emojis: null, stickers: null };

  // The write callback: every successful mutation notifies the caller's
  // cache sync AND rerenders the dialog's own lists — rename/delete open
  // over this dialog, so a stale row can never sit behind them.
  const onWrite = () => {
    if (typeof onMutated === "function") void onMutated();
    void rerender();
  };

  const rowNode = (kind, row) => {
    const node = el("div", {
      class: "expression-manage-row",
      dataset: { expressionId: String(Number(row.id)) },
    });
    const name = String(row.name ?? "");
    const image = el("img", {
      class: "expression-manage-thumb",
      src: String(row.url),
      alt: ":" + name + ":",
      loading: "lazy",
      draggable: false,
    });
    const rename = iconButton(doc, "pen", {
      ariaLabel: "Rename :" + name + ":",
      className: "icon-button button-quiet expression-rename",
    });
    rename.addEventListener("click", () =>
      openExpressionRenameDialog(doc, win, serverId, kind, row, onWrite));
    const remove = iconButton(doc, "trash", {
      ariaLabel: "Delete :" + name + ":",
      className: "icon-button button-quiet expression-delete",
    });
    remove.addEventListener("click", () =>
      openExpressionDeleteDialog(doc, win, serverId, kind, row, onWrite));
    node.append(image, el("span", { class: "expression-manage-name", text: name }), rename, remove);
    return node;
  };

  const uploadForm = (kind) => {
    const fileInput = el("input", {
      type: "file",
      accept: "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif",
      class: "expression-file-input",
    });
    fileInput.hidden = true;
    const fileName = el("span", { class: "muted expression-file-name", text: "" });
    let picked = null;
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      picked = null;
      fileName.textContent = "";
      if (!file) return;
      if (!expressionImageOk(file)) {
        error.textContent = file.size > EXPRESSION_IMAGE_MAX_BYTES
          ? EXPRESSION_IMAGE_TOO_LARGE_ERROR
          : EXPRESSION_IMAGE_FORMAT_ERROR;
        return;
      }
      picked = file;
      fileName.textContent = file.name;
    });
    const nameInput = el("input", {
      type: "text",
      maxlength: String(EXPRESSION_NAME_MAX),
      placeholder: "Name (2-16 letters, numbers, _)",
      "aria-label": "The new " + KIND_WORDS[kind] + " name",
      class: "composer-input expression-name-input",
    });
    const pick = iconButton(doc, "paperclip", {
      ariaLabel: "Choose the image (JPEG, PNG, WebP, or GIF)",
      className: "icon-button expression-pick",
    });
    pick.addEventListener("click", () => fileInput.click());
    const form = el("form", { novalidate: "", class: "expression-upload" },
      pick, nameInput,
      el("button", { class: "button button-quiet expression-add", type: "submit", text: "Add" }));
    form.append(fileInput, fileName);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = String(nameInput.value || "").trim();
      if (!expressionNameValid(name)) {
        error.textContent = EXPRESSION_NAME_ERROR;
        return;
      }
      if (picked === null) {
        error.textContent = KIND_WORDS[kind] === "emoji"
          ? "Attach the image for this emoji."
          : "Attach the image for this sticker.";
        return;
      }
      const data = new FormData();
      data.append("name", name);
      data.append("image", picked, picked.name || "image.png");
      error.textContent = "";
      try {
        await api("/api/servers/" + Number(serverId) + "/" + kind, {
          method: "POST",
          body: data,
        });
        picked = null;
        nameInput.value = "";
        fileName.textContent = "";
        void onWrite();
        await rerender();
      } catch (caught) {
        // The server's copies verbatim: the grammar 400, the 409 taken
        // name, the over-slot cap ("This server already has N emoji.").
        error.textContent = caught?.message || "The expression could not be saved. Please try again.";
      }
    });
    return form;
  };

  const sectionNode = (kind) => {
    const list = el("div", { class: "expression-manage-list" });
    const word = KIND_WORDS[kind];
    // The slot counter (W-B0's rider): a span the render pass fills from the
    // payload's own caps field — with no field, it stays empty.
    const counter = el("span", { class: "expression-slot-count" });
    sections[kind] = { list, counter };
    const node = el("div", { class: "expression-manage-section" },
      el("p", { class: "muted expression-grid-label" },
        word === "emoji" ? "Emoji" : "Stickers", counter),
      list,
      uploadForm(kind),
    );
    return node;
  };

  const renderLists = () => {
    for (const kind of Object.keys(sections)) {
      const { list, counter } = sections[kind];
      const word = KIND_WORDS[kind];
      const emptyCopy = kind === "emojis"
        ? "This server has no emoji yet."
        : "This server has no stickers yet.";
      // The counter reads the payload's own field ONLY: no field, no
      // counter — the client never invents a slot number.
      const capField = Number(capsSeen[kind]?.[CAPS_KEY[kind]]);
      counter.textContent = Number.isFinite(capField)
        ? lists[kind].length + " / " + capField
        : "";
      list.replaceChildren();
      if (lists[kind].length === 0) {
        list.append(el("p", { class: "muted expression-manage-empty", text: emptyCopy }));
        continue;
      }
      for (const row of lists[kind]) list.append(rowNode(kind, row));
    }
  };

  const rerender = async () => {
    try {
      // Both kinds in parallel; a list failure leaves its section at the
      // stale copy and rides the strip (the member-gate 404's shared copy).
      const reads = await Promise.allSettled([
        loadExpressionKind(serverId, "emojis"),
        loadExpressionKind(serverId, "stickers"),
      ]);
      if (reads[0].status === "fulfilled") {
        lists.emojis = reads[0].value.rows;
        capsSeen.emojis = reads[0].value.caps;
      }
      if (reads[1].status === "fulfilled") {
        lists.stickers = reads[1].value.rows;
        capsSeen.stickers = reads[1].value.caps;
      }
      renderLists();
      const failure = reads.find((read) => read.status === "rejected");
      if (failure) throw failure.reason;
    } catch (caught) {
      error.textContent = caught?.message || "That server does not exist or you are not in it.";
    }
  };

  const dialog = el("dialog", { class: "gc-dialog expression-manage-dialog" },
    el("h2", { text: "Manage expressions" }),
    el("p", { class: "muted expression-manage-note", text: "Upload, rename, or remove this server's emoji and stickers." }),
    sectionNode("emojis"),
    sectionNode("stickers"),
    error,
    el("div", { class: "form-actions" },
      el("button", { class: "button button-quiet", type: "button", text: "Close" })),
  );
  dialog.querySelector(".form-actions button").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  doc.body.append(dialog);
  dialog.showModal();
  void rerender();
}

// The rename dialog (the soundboard idiom): the grammar's honest pre-error,
// the save on PATCH, the server's copies in the strip.
export function openExpressionRenameDialog(doc, win, serverId, kind, row, onMutated) {
  void win;
  const word = KIND_WORDS[kind];
  const error = el("p", { class: "error-strip", role: "alert" });
  const input = el("input", {
    type: "text",
    maxlength: String(EXPRESSION_NAME_MAX),
    value: String(row.name ?? ""),
    "aria-label": "Rename :" + String(row.name ?? word) + ":",
    class: "composer-input expression-rename-input",
    id: "expression-rename-input",
  });
  const dialog = el("dialog", { class: "gc-dialog expression-rename-dialog" },
    el("h2", { text: "Rename " + word }),
    el("p", { class: "muted", text: EXPRESSION_NAME_ERROR }),
    input,
    el("div", { class: "form-actions" },
      el("button", { class: "button button-quiet", type: "button", text: "Close" }),
      el("button", { class: "button button-primary expression-rename-save", type: "button", text: "Save" })),
    error,
  );
  const save = async () => {
    const name = String(input.value || "").trim();
    if (!expressionNameValid(name)) {
      error.textContent = EXPRESSION_NAME_ERROR;
      return;
    }
    try {
      await api("/api/servers/" + Number(serverId) + "/" + kind + "/" + Number(row.id), {
        method: "PATCH",
        body: { name },
      });
      dialog.close();
      if (typeof onMutated === "function") void onMutated();
    } catch (caught) {
      error.textContent = caught?.message || "The expression could not be saved. Please try again.";
    }
  };
  dialog.querySelector(".expression-rename-save").addEventListener("click", save);
  dialog.querySelector(".form-actions button").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  doc.body.append(dialog);
  dialog.showModal();
  input.focus();
}

// The delete dialog: the shared confirm discipline — the wire tokens ride
// the name, so the copy warns that a delete breaks nobody's tokens (the
// unknown-id rule turns them into text, never an empty hole).
export function openExpressionDeleteDialog(doc, win, serverId, kind, row, onMutated) {
  void win;
  const word = KIND_WORDS[kind];
  const error = el("p", { class: "error-strip", role: "alert" });
  const dialog = el("dialog", { class: "gc-dialog expression-delete-dialog" },
    el("h2", { text: "Delete " + word }),
    el("p", { class: "muted", text: "This removes :" + String(row.name ?? word) +
      ": from this server. Messages that already used it keep showing it as text — nothing breaks." }),
    el("div", { class: "form-actions" },
      el("button", { class: "button button-quiet expression-delete-cancel", type: "button", text: "Cancel" }),
      el("button", { class: "button button-primary expression-delete-confirm", type: "button", text: "Delete" })),
    error,
  );
  dialog.querySelector(".expression-delete-cancel").addEventListener("click", () => dialog.close());
  dialog.querySelector(".expression-delete-confirm").addEventListener("click", async () => {
    try {
      await api("/api/servers/" + Number(serverId) + "/" + kind + "/" + Number(row.id), {
        method: "DELETE",
      });
      dialog.close();
      if (typeof onMutated === "function") void onMutated();
    } catch (caught) {
      error.textContent = caught?.message || "The expression could not be deleted.";
    }
  });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  doc.body.append(dialog);
  dialog.showModal();
}

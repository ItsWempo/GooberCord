
// Composer image-attachment flow (Task 13 scope, folded into this shell per
// the Task 11 brief): file-picker only (paste support is a follow-up), a
// client-side 5 MiB pre-check (the server is the authority —
// MAX_ATTACHMENT_BYTES in constants.mjs), an <object-URL> preview, and the
// multipart send. The preview URL is revoked once the send settles.
import { api } from "./api.js";

export const MAX_ATTACHMENT_BYTES = 5_242_880;

export function attachmentTooLarge(size) {
  return size > MAX_ATTACHMENT_BYTES;
}

export function isImageFile(file) {
  return file instanceof File && /^image\//.test(file.type || "");
}

// Reads the picked file and returns { file, url, size } with a blob: URL
// for the composer preview. Callers must revoke the URL when the send
// settles (revokePreview).
export function createPreview(file) {
  return { file, url: URL.createObjectURL(file), size: file.size };
}

export function revokePreview(preview) {
  if (preview?.url) {
    try {
      URL.revokeObjectURL(preview.url);
    } catch {
      // Revoke is best-effort.
    }
  }
}

// The send-with-image variant: POST /api/channels/:id/messages as
// multipart/form-data — the same payload shape the REST send accepts
// (handleSendMessageWithImageRoute reads `image`, `body`,
// `clientMessageId`). Returns { message, created }.
export function sendMessageWithImage(channelId, body, clientMessageId, file) {
  const form = new FormData();
  form.append("body", body);
  form.append("clientMessageId", clientMessageId);
  form.append("image", file, file.name || "image.png");
  return api("/api/channels/" + channelId + "/messages", {
    method: "POST",
    body: form,
  });
}

// A message's attachments render as gated <img src="/api/attachments/:id">;
// a 404 (pending review as a non-viewer, or rejected+removed) swaps the node
// for a chip — for the uploader only when `ownMessage`, otherwise the node
// is removed entirely (the never-confirm-existence rule, client side).
export function renderAttachmentNode(doc, attachmentId, ownMessage) {
  const wrap = doc.createElement("div");
  wrap.className = "icon-inline";

  const img = doc.createElement("img");
  img.src = "/api/attachments/" + attachmentId;
  img.alt = "Attached image";
  img.loading = "lazy";
  img.setAttribute("class", "message-attachment");

  img.addEventListener("error", () => {
    if (ownMessage) {
      const chip = doc.createElement("span");
      chip.className = "attachment-review-chip";
      chip.textContent = "Attachment pending review";
      img.replaceWith(chip);
    } else {
      img.remove();
    }
  });

  wrap.append(img);
  return wrap;
}

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

// The GIF picker (the Tenor lane, the backend contract 47c7ea3 shipped +
// the pick ruling): the composer's GIF button opens the search dialog, its
// grid rides /api/gifs/search (the picker's page: 12 by default), and every
// <img> — tile preview AND rendered panel — points at the SAME-ORIGIN media
// proxy (/api/gifs/image?u=<encoded media url>), never a raw cross-origin
// src. The site CSP admits only 'self' image bytes, so the route IS the
// image path. A pick pastes the media URL into the composer as TEXT (the
// paste pattern, no send grammar): the embed panel is a RENDER-side pass,
// and moderation reads the body's URL exactly as it reads every body.
import { el } from "./dom.js";
import { api } from "./api.js";

export const GIF_PAGE_LIMIT = 12;

// The embed panel bound: a body with more Tenor URLs unfurls the first
// three (Discord's own unfurl counting) — the rest stay text.
export const MAX_GIF_PANELS = 3;

// tenorMediaUrl(raw): the client mirror of api/gifs.mjs's allowlist rule —
// one rule, https plus tenor.com or a subdomain of it. Nothing else unwruls;
// a rejected reference never becomes a panel (and the server's proxy 400
// stays behind it as the authority). The media path keeps its own path +
// search (the Tenor-signed query), never a fragment.
export function tenorMediaUrl(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname;
  if (host !== "tenor.com" && !host.endsWith(".tenor.com")) return null;
  return parsed.pathname + parsed.search;
}

// gifProxySrc(mediaUrl): the ONLY image path a Tenor URL renders through —
// the proxy allowlist (backend rule mirrored above) plus 'img-src self'
// both hold behind this single function.
export function gifProxySrc(mediaUrl) {
  return "/api/gifs/image?u=" + encodeURIComponent(mediaUrl);
}

// tenorUrlsInBody(body): the embed pass's finder over a message's plain
// text — every Tenor URL in order, deduped, with the trailing sentence
// punctuation a pasted URL picks up stripped. The picker pastes media URLs;
// a hand-pasted PAGE url (tenor.com/view/…) is admitted by the same
// allowlist but fails the proxy's image content-type check — its panel
// quietly removes itself on load error, the text stays.
const TENOR_URL_RE = /https:\/\/[A-Za-z0-9.-]*tenor\.com\/[^\s"'<>]+/gi;
const TAIL_PUNCT = /[.,;:!?)\]}'"]+$/u;

export function tenorUrlsInBody(body) {
  const text = typeof body === "string" ? body : "";
  const found = [];
  const seen = new Set();
  for (const match of text.matchAll(TENOR_URL_RE)) {
    const candidate = match[0].replace(TAIL_PUNCT, "");
    if (seen.has(candidate) || tenorMediaUrl(candidate) === null) continue;
    seen.add(candidate);
    found.push(candidate);
  }
  return found;
}

// insertGifUrl(textarea, url): the paste pattern — setRangeText at the
// caret, then the input event so the counter and any draft listeners see
// the draft they will send. CSP-safe, no event synthesis beyond the input
// notify.
function insertGifUrl(textarea, url) {
  const start = typeof textarea.selectionStart === "number" ? textarea.selectionStart : textarea.value.length;
  const end = typeof textarea.selectionEnd === "number" ? textarea.selectionEnd : start;
  // A paste-shaped seam: unless the caret already sits after whitespace
  // (or an empty box), the URL gets its own space — it never glues onto
  // the sentence it follows.
  const before = textarea.value.slice(0, start);
  const seam = start === 0 || /\s$/.test(before) ? "" : " ";
  textarea.setRangeText(seam + url, start, end, "end");
  textarea.focus();
  textarea.dispatchEvent(new Event("input"));
}

// openGifPicker(doc, win, textarea): the search dialog — q rides the form,
// the grid feeds off /api/gifs/search, Load-more follows the opaque
// position cursor until it runs out. The shared 503/502/400 copies surface
// in the dialog's error strip exactly as the server words them.
export function openGifPicker(doc, win, textarea) {
  const error = el("p", { class: "error-strip", role: "alert" });
  const status = el("p", { class: "muted gif-picker-status" });
  const grid = el("div", {
    class: "gif-picker-grid",
    role: "listbox",
    "aria-label": "GIF search results",
  });
  const input = el("input", {
    type: "search",
    maxlength: "64",
    placeholder: "Search GIFs",
    "aria-label": "GIF search",
  });
  const more = el("button", {
    class: "button button-quiet gif-picker-more",
    type: "button",
    text: "Load more GIFs",
    hidden: "",
  });

  let query = "";
  let position = null;

  const tileFor = (row) => {
    const mediaUrl = typeof row?.url === "string" && row.url ? row.url : null;
    if (mediaUrl === null) return null;
    const media = { url: mediaUrl, previewUrl: typeof row.previewUrl === "string" && row.previewUrl ? row.previewUrl : mediaUrl };
    const label = (typeof row.description === "string" && row.description) || "GIF from Tenor";
    const tile = el("button", {
      class: "gif-tile",
      type: "button",
      "aria-label": "Insert the GIF " + label,
      title: label,
    }, el("img", {
      src: gifProxySrc(media.previewUrl),
      alt: label,
      loading: "lazy",
      draggable: false,
    }));
    tile.addEventListener("click", () => {
      insertGifUrl(textarea, media.url);
      dialog.close();
    });
    tile.dataset.gifUrl = media.url;
    return tile;
  };

  const renderRows = (payload) => {
    const rows = Array.isArray(payload?.gifs) ? payload.gifs : [];
    let added = 0;
    for (const row of rows) {
      const tile = tileFor(row);
      if (tile === null) continue;
      grid.append(tile);
      added += 1;
    }
    position = typeof payload?.position === "string" && payload.position ? payload.position : null;
    if (position !== null && added > 0) more.removeAttribute("hidden");
    else more.setAttribute("hidden", "");
    if (grid.children.length === 0) status.textContent = "Nothing found for that search.";
    else status.textContent = "";
  };

  const search = async (nextPosition) => {
    const params = new URLSearchParams({ q: query, limit: String(GIF_PAGE_LIMIT) });
    if (typeof nextPosition === "string" && nextPosition) params.set("position", nextPosition);
    more.setAttribute("hidden", "");
    status.textContent = "";
    more.disabled = true;
    try {
      renderRows(await api("/api/gifs/search?" + params.toString()));
    } catch (caught) {
      // The shared copies ride the caught error's message verbatim —
      // the 503 (not configured), 502 (unavailable), 400 (shape) alike.
      error.textContent = caught?.message || "GIF search is unavailable right now.";
      status.textContent = "";
    } finally {
      more.disabled = false;
    }
  };

  const form = el("form", { novalidate: "", class: "gif-picker-form" }, input,
    el("button", { class: "button button-quiet", type: "submit", text: "Search" }));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    query = String(input.value || "").trim();
    grid.replaceChildren();
    position = null;
    if (query.length < 1 || query.length > 64) {
      error.textContent = "Search for something between 1 and 64 characters.";
      return;
    }
    void search(null);
  });

  more.addEventListener("click", () => {
    if (position !== null && query) void search(position);
  });

  const dialog = el("dialog", { class: "gc-dialog gif-picker" },
    el("h2", { text: "GIF picker" }),
    el("p", { class: "muted gif-picker-note", text: "Search GIF, then pick one — its link pastes into the message." }),
    form,
    status,
    grid,
    more,
    error,
    el("div", { class: "form-actions" },
      el("button", { class: "button button-quiet", type: "button", text: "Close" })),
  );
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.querySelector(".form-actions button").addEventListener("click", () => dialog.close());
  doc.body.append(dialog);
  dialog.showModal();
  input.focus();
}

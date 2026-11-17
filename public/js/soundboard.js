// The soundboard (the 0023 wave's client half): the board dialog opens from
// the composer's expression-chrome family (the soundboard button beside the
// emoji picker), the tiles ride the board read (every member sees it), and
// the management side — upload, rename, delete — rides the caller's manage
// gate (the same two-step client mirror the composer's permission checks
// run: the tier or the merged MANAGE_EMOJI bit; the server's 403 stays the
// authority). Audio plays on CLICK, one at a time; the bytes ride the
// /api/attachments/:id path the payload carries (same-origin under the
// CSP's default-src 'self').
//
// The wire tokens (<b:name:id>) are a LATER wave — this pass owns the
// board + management only.
import { el } from "./dom.js";
import { api } from "./api.js";
import { iconButton } from "./icons.js";

// The intake's client mirrors (backend authority stays behind each):
// 512 KiB bytes cap, MP3/OGG formats, the same name grammar the emoji
// lane spells (GC_EMOJI_NAME_* in constants.mjs).
export const SOUND_MAX_BYTES = 524_288;
export const SOUND_NAME_MIN = 2;
export const SOUND_NAME_MAX = 16;
export const SOUND_NAME_PATTERN = /^[A-Za-z0-9_]{2,16}$/;

export const SOUND_NAME_ERROR =
  "Use a " + SOUND_NAME_MIN + "-" + SOUND_NAME_MAX +
  " character name of letters, numbers and underscores.";
export const SOUND_TOO_LARGE_ERROR = "Sounds must be 512 KB or smaller.";
export const SOUND_FORMAT_ERROR = "Only MP3 and OGG sounds are accepted.";
// The refused play's quiet copy (the tile's pending/moderated bytes are
// never servable to members — the click is heard, never silently dead).
export const SOUND_PLAY_ERROR = "That sound could not be played.";

export function soundNameValid(value) {
  return typeof value === "string" && SOUND_NAME_PATTERN.test(value);
}

// soundFileOk(file): the honest pre-error before any upload byte moves —
// the size cap and the two accepted formats (the magic sniff's admitted
// pair; the extension check admits the type-less OS picks). The server
// re-reads both from the bytes.
export function soundFileOk(file) {
  if (!(file instanceof File)) return false;
  if (file.size < 1 || file.size > SOUND_MAX_BYTES) return false;
  const mime = file.type || "";
  if (mime === "audio/mpeg" || mime === "audio/ogg") return true;
  if (mime.startsWith("audio/")) return false;
  return /\.(mp3|ogg|oga)$/i.test(file.name || "");
}

// createSoundForm({name}, file): the multipart POST exactly the intake's
// contract — the "sound" field carrying the file, the name field beside it.
export function createSoundForm(form, file) {
  const data = new FormData();
  data.append("name", form.name);
  data.append("sound", file, file.name || "sound");
  return data;
}

// The one-player discipline: a click on another tile stops the playing one;
// a second click on the same tile is the toggle-off. The audio element is
// created through the caller's window so the harness can stub Audio.
let currentSound = null;

export function currentSoundUrl() {
  return currentSound === null ? null : currentSound.url;
}

export function stopPlayingSound() {
  if (currentSound !== null) {
    try {
      currentSound.audio.pause();
    } catch {
      // A stopping player never throws its way into a render.
    }
    currentSound = null;
  }
}

// playSound(win, url, onPlayError): the click-to-play entry. Returns
// "on" | "off". The play promise is never unhandled: a refused play (a
// pending or moderated row's bytes serve 403/404, not audio) clears the
// one-player state and reports through onPlayError — silence would be a
// broken tile, not a state.
export function playSound(win, url, onPlayError) {
  if (currentSound !== null) {
    if (currentSound.url === url) {
      stopPlayingSound();
      return "off";
    }
    stopPlayingSound();
  }
  const audio = new win.Audio(url);
  currentSound = { url, audio };
  audio.addEventListener("ended", () => {
    if (currentSound !== null && currentSound.url === url) currentSound = null;
  });
  const played = audio.play();
  if (played && typeof played.catch === "function") {
    played.catch(() => {
      // The url check keeps a NEWER player's failure from clearing the
      // wrong tile (a stale catch riding an already-stopped row).
      if (currentSound !== null && currentSound.url === url) {
        currentSound = null;
        if (typeof onPlayError === "function") onPlayError();
      }
    });
  }
  return "on";
}

// The read: GET /api/servers/:id/sounds → rows of
// { id, serverId, name, url, createdAt }. A refusal throws; the caller
// surfaces the shared copy.
export async function loadSounds(serverId) {
  const payload = await api("/api/servers/" + Number(serverId) + "/sounds");
  return {
    // The rows are the payload's, never assumed.
    rows: Array.isArray(payload?.sounds) ? payload.sounds : [],
    // The caps rider (W-B0): the resolve-per-server slot cap the board's
    // own counter reads — an absent field renders no counter.
    caps: payload?.caps || null,
  };
}

// openSoundboardDialog(doc, win, serverId, canManageSounds): the board —
// the tiles, the click-to-play, and where the manage gate rides, the
// upload form + the per-row rename/delete affordances. Mutations rerender
// the board in place; the server's own copies (the name grammar, the 409
// taken name, the over-slot cap) surface verbatim in the dialog's strip.
export function openSoundboardDialog(doc, win, serverId, canManageSounds = false) {
  const error = el("p", { class: "error-strip", role: "alert" });
  // The board's slot counter (W-B0's rider): a span the render pass fills
  // from the list payload's caps field — with no field, it stays empty.
  const counter = el("span", { class: "soundboard-slot-count" });
  const board = el("div", { class: "soundboard-board" });
  const rows = [];
  let capsPayload = null;

  const rowNode = (sound) => {
    const row = el("div", {
      class: "sound-row",
      dataset: { soundId: String(Number(sound.id)) },
    });
    const name = String(sound.name ?? "");
    const play = iconButton(doc, "speaker", {
      ariaLabel: "Play " + name,
      className: "icon-button button-quiet sound-play",
    });
    play.addEventListener("click", () => {
      // The one-player rule, visibly: only the playing row carries the
      // class — every other row's marker clears with the stop, and a row
      // the player refused clears its own error state with a new try.
      for (const other of dialog.querySelectorAll(
        ".sound-row.sound-playing, .sound-row.sound-play-error"
      )) {
        other.classList.remove("sound-playing");
        other.classList.remove("sound-play-error");
      }
      const state = playSound(win, String(sound.url), () => {
        // The tile-side error state: the marker clears (nothing plays)
        // and the row carries the refusal while the strip says the copy.
        row.classList.remove("sound-playing");
        row.classList.add("sound-play-error");
        error.textContent = SOUND_PLAY_ERROR;
      });
      if (state === "on") row.classList.add("sound-playing");
    });
    row.append(play, el("span", { class: "sound-name", text: name }));
    if (canManageSounds) {
      const rename = iconButton(doc, "pen", {
        ariaLabel: "Rename " + name,
        className: "icon-button button-quiet sound-rename",
      });
      rename.addEventListener("click", () => openRenameDialog(doc, win, serverId, sound, () => void rerender()));
      const remove = iconButton(doc, "trash", {
        ariaLabel: "Delete " + name,
        className: "icon-button button-quiet sound-delete",
      });
      remove.addEventListener("click", () => openDeleteDialog(doc, win, serverId, sound, () => void rerender()));
      row.append(rename, remove);
    }
    return row;
  };

  const renderBoard = () => {
    // The counter reads the payload's own field ONLY: no field, no counter —
    // the client never invents a slot number.
    const capField = Number(capsPayload?.sounds);
    counter.textContent = Number.isFinite(capField)
      ? rows.length + " / " + capField
      : "";
    board.replaceChildren();
    if (rows.length === 0) {
      board.append(el("p", { class: "muted soundboard-empty", text: "This server has no sounds yet." }));
      return;
    }
    for (const sound of rows) board.append(rowNode(sound));
  };

  const rerender = async () => {
    try {
      const read = await loadSounds(serverId);
      rows.length = 0;
      rows.push(...read.rows);
      capsPayload = read.caps;
      renderBoard();
    } catch (caught) {
      error.textContent = caught?.message || "That server does not exist or you are not in it.";
    }
  };

  // The upload entry (the manage gate): the file pick + the name field, the
  // honest pre-errors ahead of any byte, the multipart POST exactly the
  // intake's contract ("sound" + "name").
  const fileInput = el("input", {
    type: "file",
    accept: "audio/mpeg,audio/ogg,.mp3,.ogg,.oga",
    class: "soundboard-file-input",
  });
  fileInput.hidden = true;
  const nameInput = el("input", {
    type: "text",
    maxlength: String(SOUND_NAME_MAX),
    placeholder: "Name (2-16 letters, numbers, _)",
    "aria-label": "Sound name",
    class: "composer-input soundboard-name-input",
  });
  const fileName = el("span", { class: "muted soundboard-file-name", text: "" });
  let pickedFile = null;
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    pickedFile = null;
    fileName.textContent = "";
    if (!file) return;
    if (!soundFileOk(file)) {
      error.textContent = file.size > SOUND_MAX_BYTES
        ? SOUND_TOO_LARGE_ERROR
        : SOUND_FORMAT_ERROR;
      return;
    }
    pickedFile = file;
    fileName.textContent = file.name;
  });
  const pick = iconButton(doc, "paperclip", {
    ariaLabel: "Choose the sound file (MP3 or OGG)",
    className: "icon-button sound-pick",
  });
  pick.addEventListener("click", () => fileInput.click());
  const addForm = el("form", { novalidate: "", class: "soundboard-upload" },
    pick, nameInput,
    el("button", { class: "button button-quiet sound-add", type: "submit", text: "Add" }));
  addForm.append(fileInput, fileName);
  addForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = String(nameInput.value || "").trim();
    if (!soundNameValid(name)) {
      error.textContent = SOUND_NAME_ERROR;
      return;
    }
    if (pickedFile === null) {
      error.textContent = "Choose the sound file first.";
      return;
    }
    error.textContent = "";
    try {
      await api("/api/servers/" + Number(serverId) + "/sounds", {
        method: "POST",
        body: createSoundForm({ name }, pickedFile),
      });
      pickedFile = null;
      nameInput.value = "";
      fileName.textContent = "";
      await rerender();
    } catch (caught) {
      // The server's own copies verbatim: the grammar 400, the 409 taken
      // name, the over-slot cap ("This server already has N sounds.").
      error.textContent = caught?.message || "The sound could not be saved. Please try again.";
    }
  });

  const dialog = el("dialog", { class: "gc-dialog soundboard-dialog" },
    el("h2", { text: "Soundboard" }),
    el("p", { class: "muted soundboard-note", text: "Click a sound to play it — one at a time." }, counter),
    board,
    ...(canManageSounds ? [el("p", {
      class: "muted soundboard-manage-note",
      text: "Manage the board below — upload, rename, remove.",
    }), addForm] : []),
    error,
    el("div", { class: "form-actions" },
      el("button", { class: "button button-quiet", type: "button", text: "Close" })),
  );
  dialog.querySelector(".form-actions button").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    stopPlayingSound();
    dialog.remove();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  board.replaceChildren(el("p", { class: "muted soundboard-empty", text: "Loading the board…" }));
  void rerender();
  doc.body.append(dialog);
  dialog.showModal();
}

// The rename dialog: the grammar's honest pre-error, the save on PATCH,
// the 409's own copy in the strip.
export function openRenameDialog(doc, win, serverId, sound, onDone) {
  void win;
  const error = el("p", { class: "error-strip", role: "alert" });
  const input = el("input", {
    type: "text",
    maxlength: String(SOUND_NAME_MAX),
    value: String(sound.name ?? ""),
    "aria-label": "Rename " + String(sound.name ?? "sound"),
    class: "composer-input sound-rename-input",
    id: "sound-rename-input",
  });
  const dialog = el("dialog", { class: "gc-dialog sound-rename-dialog" },
    el("h2", { text: "Rename sound" }),
    el("p", { class: "muted", text: SOUND_NAME_ERROR }),
    input,
    el("div", { class: "form-actions" },
      el("button", { class: "button button-quiet", type: "button", text: "Close" }),
      el("button", { class: "button button-primary sound-rename-save", type: "button", text: "Save" })),
    error,
  );
  const save = async () => {
    const name = String(input.value || "").trim();
    if (!soundNameValid(name)) {
      error.textContent = SOUND_NAME_ERROR;
      return;
    }
    try {
      await api("/api/servers/" + Number(serverId) + "/sounds/" + Number(sound.id), {
        method: "PATCH",
        body: { name },
      });
      dialog.close();
      if (typeof onDone === "function") void onDone();
    } catch (caught) {
      error.textContent = caught?.message || "The sound could not be saved. Please try again.";
    }
  };
  dialog.querySelector(".sound-rename-save").addEventListener("click", save);
  dialog.querySelector(".form-actions button").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  doc.body.append(dialog);
  dialog.showModal();
  input.focus();
}

// The delete dialog: the confirm affordance, then the route's own DELETE
// batch. No typed-check this small — one click of doubt only.
export function openDeleteDialog(doc, win, serverId, sound, onDone) {
  void win;
  const error = el("p", { class: "error-strip", role: "alert" });
  const dialog = el("dialog", { class: "gc-dialog sound-delete-dialog" },
    el("h2", { text: "Delete sound" }),
    el("p", { class: "muted", text: "This removes " + String(sound.name ?? "the sound") +
      " from this server's board. Nobody's messages change." }),
    el("div", { class: "form-actions" },
      el("button", { class: "button button-quiet sound-delete-cancel", type: "button", text: "Cancel" }),
      el("button", { class: "button button-primary sound-delete-confirm", type: "button", text: "Delete" })),
    error,
  );
  dialog.querySelector(".sound-delete-cancel").addEventListener("click", () => dialog.close());
  dialog.querySelector(".sound-delete-confirm").addEventListener("click", async () => {
    try {
      await api("/api/servers/" + Number(serverId) + "/sounds/" + Number(sound.id), {
        method: "DELETE",
      });
      dialog.close();
      if (typeof onDone === "function") void onDone();
    } catch (caught) {
      error.textContent = caught?.message || "The sound could not be deleted.";
    }
  });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  doc.body.append(dialog);
  dialog.showModal();
}

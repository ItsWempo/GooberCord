// Inline SVG icon kit (ported verbatim from the forum's public/js/icons.js —
// the GooberCord carry list). Same single-stroke geometric family, drawn via
// createElementNS — CSP-safe (no library, no innerHTML) and token-colored
// through `currentColor`. Every icon is decorative inside an accessible
// button: the BUTTON carries the aria-label, the SVG gets aria-hidden.
// GooberCord additions (server rail, voice pane, DM list) extend the same
// ICON_PATHS map in the same stroke style/size — no foreign icon sets.
const SVG_NS = "http://www.w3.org/2000/svg";

const ICON_PATHS = {
  // door + arrow: log out
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
  bell: ["M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9", "M13.7 21a2 2 0 0 1-3.4 0"],
  // Subscriptions (C1): the bell with a checkmark — the subscribed state.
  "bell-check": ["M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9", "M13.7 21a2 2 0 0 1-3.4 0", "M9.5 7.5l2 2 3.5-3.5"],
  person: ["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"],
  magnifier: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M21 21l-4.35-4.35"],
  archive: ["M21 8v13H3V8", "M1 3h22v5H1z", "M10 12h4"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
  sun: ["M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z", "M12 1v2", "M12 21v2", "M4.22 4.22l1.42 1.42", "M18.36 18.36l1.42 1.42", "M1 12h2", "M21 12h2", "M4.22 19.78l1.42-1.42", "M18.36 5.64l1.42-1.42"],
  moon: ["M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"],
  chat: ["M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5 8.38 8.38 0 0 1 8.5 8.5z"],
  image: ["M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M3 15l5-5 6 6", "M12.5 14.5l3.5-3.5 5 5", "M9 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"],
  eye: ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  lightbulb: ["M9 18h6", "M10 22h4", "M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z"],
  // Pinning (C5): the pushpin — pinned threads.
  pin: ["M12 17v5", "M9 10.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6.5l2.5 2.5H6.5z", "M6.5 13h11"],
  // Polls (C3): a bar chart — the composer's Poll button.
  poll: ["M5 20V11", "M12 20V4", "M19 20v-5", "M2 20h20"],
  // Bookmarks (C4): the ribbon — save/unsave a post.
  bookmark: ["M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"],
  trophy: ["M8 21h8", "M12 17v4", "M17 4h3v1a4 4 0 0 1-4 4V8a4 4 0 0 0-3-4h-4a4 4 0 0 0-3 4v1a4 4 0 0 1-4-4V4h3", "M7 4h10v4a5 5 0 0 1-10 0z"],
  thumbUp: ["M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3m0 11V9l5.5-7A2.5 2.5 0 0 1 15 4.5L14 10h5a2 2 0 0 1 2 2.5l-1.5 7A2.5 2.5 0 0 1 17 22h-7a3 3 0 0 1-3-3z"],
  thumbDown: ["M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3m0-11v11l-5.5 7A2.5 2.5 0 0 1 9 19.5L10 14H5a2 2 0 0 1-2-2.5l1.5-7A2.5 2.5 0 0 1 7 2h7a3 3 0 0 1 3 3z"],
  flag: ["M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z", "M4 22V4"],
  trash: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6", "M10 11v6", "M14 11v6"],
  pen: ["M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"],
  open: ["M15 3h6v6", "M9 21H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2z", "M21 3l-9 9"],
  scroll: ["M4 19.5A2.5 2.5 0 0 1 6.5 17H20", "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"],

  // Saved list (C4): the bookmark with a line set — list of saves.
  bookmarks: ["M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z", "M9 7h6"],
  // GooberCord additions (same family, same 24×24 single-stroke style):
  // text channels: the hash.
  hash: ["M4 9h16", "M4 15h16", "M10 3L8 21", "M16 3l-2 18"],
  // channel categories (phase-3 layers): the folder.
  folder: ["M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"],
  // voice channels: the speaker with sound arcs.
  speaker: ["M11 5L6 9H2v6h4l5 4V5z", "M15.54 8.46a5 5 0 0 1 0 7.07", "M18.5 5.5a9 9 0 0 1 0 13"],
  // voice pane: the microphone and its muted cross, same stroke family.
  mic: ["M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z", "M19 10v2a7 7 0 0 1-14 0v-2", "M12 19v3"],
  "mic-off": ["M3 3l18 18", "M9 9.5V4a3 3 0 0 1 5.9-.6", "M15 9.7V12a3 3 0 0 1-4.6 2.6", "M19 10v2a7 7 0 0 1-1.4 4.2", "M5 12V10", "M12 19v3"],
  // direct messages: the at-sign.
  "at-sign": ["M12 3a9 9 0 1 0 0 18c2 0 3-1.2 3-2.5S13.9 16 12 16", "M15 12a3 3 0 1 1-3-3 3 3 0 0 1 3 3z", "M21 12v1"],
  // group conversations: the two-person group.
  users: ["M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M23 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  // send: the paper plane (composer submit).
  send: ["M22 2L11 13", "M22 2l-7 20-4-9-9-4z"],
  // server settings: the gear around a hub — owner-only settings dialog.
  gear: [
    "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  ],
  // attach image: the paperclip (composer attach button).
  paperclip: ["M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 1 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"],
  plus: ["M12 5v14", "M5 12h14"],
  x: ["M18 6L6 18", "M6 6l12 12"],
  check: ["M20 6L9 17l-5-5"],
  home: ["M3 10.5L12 3l9 7.5", "M5 9.5V21h5v-6h4v6h5V9.5"],
  // presence / custom status: the speech-bubble lightbulb pair is the
  // forum's; GooberCord's status chip uses the pencil-line.
  status: ["M21 12a9 9 0 1 1-4.4-7.8", "M12 8v4l2.5 1.5", "M17 3v4"],
  // UI redo (owner structure): the painter's palette — skin switcher
  // (brand <-> Discord); headphones stand in for the deafen control.
  palette: [
    "M12 21a9 9 0 1 1 9-9c0 2.2-1.6 3.2-3.2 3.2h-1.3a1.6 1.6 0 0 0-1.2 2.6c.7.8.4 2-.6 2.4a9 9 0 0 1-2.7.8z",
    "M7.5 11.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
    "M11 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
    "M15.5 9.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  ],
  headphones: [
    "M3 18v-6a9 9 0 0 1 18 0v6",
    "M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3v5z",
    "M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3v5z",
  ],
  "caret-down": ["M6 9l6 6 6-6"],
  sparkles: [
    "M12 4l1.6 5.4L19 11l-5.4 1.6L12 18l-1.6-5.4L5 11l5.4-1.6z",
    "M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z",
    "M5.5 15l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z",
  ],
  // Backup codes (v4.8.1): the key — the one-time sign-in codes dialog.
  key: [
    "M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3",
  ],
  // Goober Coins (0011): the coin — earned only by activity; the shop tile in
  // the rail and the footer's balance chip use it.
  coin: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z"],
  // Gifting Goober+: the ribbon-wrapped box — the shop page's gift form.
  gift: ["M20 12v9H4v-9", "M2 7h20v5H2z", "M12 22V7", "M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z", "M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z"],
  // Reply-to-status shaver: the return arrow — the member-list status hover.
  reply: ["M9 14l-5-5 5-5", "M4 9h10a6 6 0 0 1 6 6v4"],
};

const ICON_ARIA = {
  logout: "Log out",
  bell: "Notifications",
  person: "Profile",
  magnifier: "Search",
  archive: "Archive",
  // The rules page's scroll icon (account-actions nav).
  scroll: "Rules",
  shield: "Moderation",
  lightbulb: "Suggestions",
  bookmarks: "Save",
  trophy: "Leaderboard",
  image: "Attach image",
  paperclip: "Attach image",
  pen: "Edit",
  trash: "Delete",
  plus: "Add",
  x: "Close",
  check: "Confirm",
  send: "Send message",
  gear: "Server settings",
  home: "Home",
  speaker: "Voice",
  mic: "Mute microphone",
  "mic-off": "Unmute microphone",
  hash: "Text channel",
  "at-sign": "Direct message",
  users: "Group conversation",
  status: "Set status",
  palette: "Switch skin",
  headphones: "Deafen",
  "caret-down": "Collapse",
  folder: "Add a category",
  sparkles: "Perks",
  key: "Backup codes",
  reply: "Reply to status",
};

export const ICON_NAMES = Object.keys(ICON_PATHS);

// A 24×24 stroke icon; stroke uses currentColor so CSS tokens (ink) apply in
// every theme. `name` must not be interpolated from user input — callers pass
// ICON_NAMES keys only.
export function createIcon(document, name) {
  const paths = ICON_PATHS[name];
  if (!paths) throw new Error("No such icon: " + name);
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  // The whole family is single-stroke — say so ON the svg, so a bare icon
  // that a stylesheet never sized-and-stroked (the rank shield riding a
  // member's name) keeps the stroke contract instead of defaulting to a
  // black-filled blob. Every consumer stylesheet may still override.
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  for (const d of paths) {
    const shape = document.createElementNS(SVG_NS, "path");
    shape.setAttribute("d", d);
    svg.append(shape);
  }
  return svg;
}

// An icon-only button inheriting the quiet-button look. The actionable label
// lives in aria-label (from ICON_ARIA or the caller), never as visible text.
export function iconButton(document, name, { className, ariaLabel, dataset, tagName } = {}) {
  const element = document.createElement(tagName || "button");
  if (tagName === "a") element.href = dataset?.href || "#";
  element.type = tagName === "a" ? undefined : "button";
  element.className = className || "icon-button";
  const label = ariaLabel || ICON_ARIA[name];
  if (label) {
    element.setAttribute("aria-label", label);
    // Native hover tooltip: the button's name, per the owner's ask.
    element.title = label;
  }
  if (dataset) {
    for (const [key, value] of Object.entries(dataset)) {
      if (key !== "href") element.dataset[key] = value;
    }
  }
  element.append(createIcon(document, name));
  return element;
}

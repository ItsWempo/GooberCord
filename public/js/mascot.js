
// blaxel — GooberCord's WUMPUS (the decoration side of the persona split;
// Wempo the Clyde speaks in app.js's system moments). He is the app's brand
// face at every decorative-ish
// moment — loading/skeleton idles (a breathing bob + spring entrance), empty
// states (no servers, no DMs, no presence), error states (send_failed,
// connection lost, load failures — blaxel drooping, sheepish), the voice pane
// placeholder (blaxel swaying, waiting in the room with you), and
// onboarding/welcome moments (hero mascot with the starfish twinkle). One
// size treatment everywhere (.mascot-mini/.mascot-mid/.mascot-hero),
// forum-palette rounding, CSS-only animation; never decorative sticker spam.
const MASCOT_SRC = "/assets/blaxel.png";

// moods: "idle" (breathing + spring in), "sheepish" (slow droop),
// "waiting" (voice pane sway). `sparkle` adds the welcome twinkle;
// `voice` marks the voice-pane variant.
export function createMascot(doc, { mood = "idle", size = "mid", alt = "", sparkle = false, voice = false } = {}) {
  doc = doc || globalThis.document;
  const img = doc.createElement("img");
  img.src = MASCOT_SRC;
  img.alt = alt;
  img.draggable = false;
  img.className = [
    "mascot",
    "mascot-" + (["mini", "mid", "hero"].includes(size) ? size : "mid"),
    "mascot-" + (["idle", "sheepish", "waiting"].includes(mood) ? mood : "idle"),
    sparkle ? "mascot-sparkle" : "",
    voice ? "mascot-voice" : "",
  ].filter(Boolean).join(" ");
  return img;
}

// A complete mascot moment: the mascot above one friendly line, springing in.
export function mascotMoment(doc, { mood, size, text, sparkle, voice, error = false } = {}) {
  if (!doc) doc = globalThis.document;
  const wrap = doc.createElement("div");
  wrap.className = "mascot-moment" + (error ? " error-moment" : "");
  if (mood || size !== undefined) {
    wrap.append(createMascot(doc, { mood, size, sparkle, voice }));
  }
  if (text) {
    const line = doc.createElement("p");
    line.className = "mascot-line";
    line.textContent = text;
    wrap.append(line);
  }
  return wrap;
}

// --- Wempo: the CLYDE portrait (the persona split, owner ruling) -------------
// The duo is settled: blaxel is GooberCord's WUMPUS (decoration — the
// contents above), WEMPO is GooberCord's CLYDE — the system-persona bot. He
// marks the DOOR (the rail's home button carries his face, exactly
// Discord's Clyde) and speaks in system messages (the care strip rides his
// portrait). The owner-supplied Roblox avatar is public/assets/wempo.png,
// committed as-is: 460×460 square, ALREADY fully transparent (28% opaque,
// antialiased edges — the white-background report was stale, no flood-fill
// needed), which is why the round surfaces render him contain, not cover.
export function createWempo(doc, { size = "mini", alt = "Wempo" } = {}) {
  doc = doc || globalThis.document;
  const img = doc.createElement("img");
  img.src = "/assets/wempo.png";
  img.alt = alt;
  img.draggable = false;
  img.className = "wempo-portrait wempo-" + (["mini", "mid"].includes(size) ? size : "mini");
  return img;
}

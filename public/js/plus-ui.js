// Goober+ badge + flair (the Nitro lane's member-name adornments). These
// render STRAIGHT off the payload flags the backend contract blessed — no
// extra fetches: `isPlus` (boolean, false for guests, never null) on /api/me
// and every user-shaped payload, and the plus-gated cosmetics riding the
// same user objects as `{ banner, flair }` (banner is a color token only
// when a render accepts one; flair here is the ≤16-char text chip).
//
// CSP discipline is structural, never accidental: createElement +
// textContent/class only. A flair arrives from user input, so it is NEVER
// inlined as HTML and the chip's text is bounded by the backend's own
// validator (api/plus.mjs's FLAIR_PATTERN); anything overlong or invalid is
// simply not shipped by the payload shaping.
import { createIcon } from "./icons.js";

// plusBadge(doc): the little Goober+ sparkle badge that sits beside member
// names (chat headers, member rows, the own-name footer line). Icon-only by
// design — a chunky chip next to EVERY name turns the perk into noise; the
// native tooltip + the aria-label carry the meaning.
export function plusBadge(doc, { className = "plus-badge" } = {}) {
  const badge = doc.createElement("span");
  badge.className = className;
  badge.setAttribute("role", "img");
  badge.setAttribute("aria-label", "Goober+ member");
  badge.title = "Goober+ member";
  badge.append(createIcon(doc, "sparkles"));
  return badge;
}

// flairChip(doc, text): the member's flair text beside their badge — the
// forum's small rounded chip idiom, textContent only.
export function flairChip(doc, text) {
  const chip = doc.createElement("span");
  chip.className = "plus-flair";
  chip.textContent = String(text);
  return chip;
}

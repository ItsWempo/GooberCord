// wempo-friend-gag.js — the friend-Wempo egg (the owner's direct ask): the
// moment a member TRIES to befriend Wempo, their coin chip reads
// -1,000,000,000. Display-only: the API state, the caches, and the shop all
// keep the real number, and any real /api/coins read unwinds the gag — the
// truth returns on the next coins render. The gag does not block the friend
// request itself: app.js sends the genuine POST first, and the egg rides
// after it. One self-contained module; a plain boolean of view state.
import { coinBalanceLabel } from "./ui-helpers.js";

const WEMPO_USERNAME = "wempo";
const DEBT_LABEL = "-1,000,000,000";
let gagged = false;

// The match is exact-username, case-insensitive: "Wempo", "WEMPO", "wempo".
export function isWempoUsername(username) {
  return String(username || "").trim().toLowerCase() === WEMPO_USERNAME;
}

export function armCoinsGag() {
  gagged = true;
}

// Any real coins read clears the gag — the chip returns to the truth even
// though nothing ever touched it.
export function clearCoinsGag() {
  gagged = false;
}

export function coinsGagActive() {
  return gagged;
}

// The chip's label: while armed, the debt; otherwise the honest thousands-
// separated label. coinBalanceLabel itself clamps non-positives to "0" (the
// API can never send a negative), so the gag renders its own string.
export function coinChipLabel(balance) {
  return gagged ? DEBT_LABEL : coinBalanceLabel(balance);
}

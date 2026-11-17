// petting.js — the blaxel egg (the owner's direct ask): clicking blaxel pets
// him — a squish-wiggle loop with floating hearts, several seconds, and
// another click dismisses it. One delegated document listener (installed
// once, so route re-renders never stack it): the petting is pure display on
// top of wherever he renders, and the event is NEVER blocked, so a click
// that also means a real action (a tile, a toast row) still does that thing.
// Mechanically it rides the stylesheet: the class carries the keyframes, the
// two fixed-position vars carry the heart origins (CSSOM writes of round
// numbers only), and the timer's teardown removes the class and the hearts.
// prefers-reduced-motion: the site's mascot block already zeroes mascot
// animation, and the hearts fall back to the calm dissolve (styles.css).
const PET_MS = 2600;

let installed = false;

export function installPetting(doc, win) {
  // Once per page: renderAppPage re-renders on every route change, and a
  // stack of click listeners would pet several times over.
  if (installed) return;
  installed = true;

  let petTimer = 0;
  let hearts = null;

  function endPetting() {
    if (petTimer) win.clearTimeout(petTimer);
    petTimer = 0;
    const liveHeart = hearts;
    hearts = null;
    for (const petted of doc.querySelectorAll(".blaxel-petted")) {
      petted.classList.remove("blaxel-petted");
    }
    if (liveHeart) liveHeart.remove();
  }

  function pet(mascot) {
    endPetting();
    mascot.classList.add("blaxel-petted");
    // The hearts float near his head, in screen space (fixed), so the span
    // never takes layout space beside whatever render he sits in.
    const rect = mascot.getBoundingClientRect();
    hearts = doc.createElement("span");
    hearts.className = "pet-hearts";
    hearts.setAttribute("aria-hidden", "true");
    hearts.textContent = "♥";
    hearts.style.setProperty("--pet-x", String(Math.round(rect.left + rect.width / 2)) + "px");
    hearts.style.setProperty("--pet-y", String(Math.round(rect.top - 6)) + "px");
    mascot.parentElement.append(hearts);
    petTimer = win.setTimeout(endPetting, PET_MS);
  }

  doc.addEventListener("click", (event) => {
    const target = event.target;
    if (!target || typeof target.closest !== "function") return;
    const mascot = target.closest(".mascot");
    if (!mascot) return;
    // Dismissible: a click on an already-petted blaxel ends it early.
    if (mascot.classList.contains("blaxel-petted")) {
      endPetting();
      return;
    }
    pet(mascot);
  });
}

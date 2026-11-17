// konami.js — the shatter egg (the owner's direct ask): the code
// (↑ ↑ ↓ ↓ ← → ← → B A) breaks the WHOLE SITE into pieces that fly apart and
// fall for a few seconds, then reassemble cleanly. One self-contained module,
// installed ONCE on window so route re-renders never stack listeners.
//
// The mechanics are the mascot kit's idiom: a stylesheet keyframe does the
// motion, and each piece's trajectory arrives as CSS custom properties set
// through CSSOM (validated numbers + units only — never a style string), so
// the CSP rules hold and nothing user-supplied can ever reach a style. The
// reassembly is automatic: the animation is on the CLASS, so removing the
// class (and the vars) returns every piece to its exact resting place.
// prefers-reduced-motion swaps the flight for a calm dissolve in CSS.

// The code, one `key` value per press (e.repeat ignored).
const CODE = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
  "b", "a",
];
const FLIGHT_MS = 2400;
// The piece cap: every candidate element would thrash the animation queue;
// a stride sample keeps the shatter dense but cheap.
const PIECE_CAP = 140;

let installed = false;

export function installKonami(doc, win) {
  // Once per page: renderAppPage re-renders on every route change, and a
  // stack of code listeners would fire the shatter many times over.
  if (installed) return;
  installed = true;

  let progress = 0;
  let flight = 0;

  const reset = () => {
    progress = 0;
  };

  function shatter() {
    // One flight at a time: a second completed code mid-flight is a no-op.
    if (flight) return;
    const root = doc.querySelector(".gc-app");
    if (!root) return;

    const candidates = [...root.querySelectorAll("*"), root].filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 8 && rect.height > 8 && rect.bottom > 0 &&
        rect.top < win.innerHeight && node.children.length === 0;
    });
    const stride = Math.max(1, Math.ceil(candidates.length / PIECE_CAP));
    const pieces = candidates.filter((node, index) => index % stride === 0);

    for (const piece of pieces) {
      piece.classList.add("konami-piece");
      // The trajectory vars: validated numbers the stylesheet wraps in units.
      piece.style.setProperty("--konami-dx", String(Math.round(Math.random() * 640 - 320)) + "px");
      piece.style.setProperty("--konami-dy", String(Math.round(240 + Math.random() * 640)) + "px");
      piece.style.setProperty("--konami-rot", String(Math.round(Math.random() * 720 - 360)) + "deg");
      piece.style.setProperty("--konami-delay", String(Math.round(Math.random() * 300)) + "ms");
    }

    flight = win.setTimeout(() => {
      flight = 0;
      for (const piece of pieces) {
        piece.classList.remove("konami-piece");
        piece.style.removeProperty("--konami-dx");
        piece.style.removeProperty("--konami-dy");
        piece.style.removeProperty("--konami-rot");
        piece.style.removeProperty("--konami-delay");
      }
    }, FLIGHT_MS + 400);
  }

  win.addEventListener("keydown", (event) => {
    // A modifier press (the quick switcher, the OS) is never code input; the
    // event is never blocked — the code only ever rides a clean keyboard.
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) {
      reset();
      return;
    }
    const key = String(event.key).toLowerCase();
    if (key === CODE[progress].toLowerCase()) {
      progress += 1;
      if (progress === CODE.length) {
        reset();
        shatter();
      }
    } else {
      // A step forward (the doubled arrows share the same key) or restart.
      progress = key === CODE[0].toLowerCase() ? 1 : 0;
    }
  });
}

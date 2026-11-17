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

// konami.js — the shatter egg (the owner's direct ask, rebuilt to their
// "JUST SHATTER AND FALL INTO PIECES LIKE GLASS" spec): the code
// (↑ ↑ ↓ ↓ ← → ← → B A) breaks the WHOLE SCREEN like glass —
//   a white flash + a crack web that spiderwebs out from the viewport’s
//   center (an SVG of jagged polylines drawn in with stroke-dashoffset),
//   then ~16 wedge shards clipped from full-screen divs, each painted with
//   the REAL screen surface found under its centroid (computed background
//   of the topmost element at that point, walked up to an opaque one), that
//   sit one beat and then FALL with gravity and tumble while the real
//   .gc-app fades to 15% — then everything tears down and the app fades
//   back to 100% (the reassembly).
// One self-contained module, installed ONCE on window so route re-renders
// never stack listeners. Everything is CSP-safe: geometry via DOM/SVG
// attributes, paint/motion via CSSOM property writes and element.animate —
// never a style-attribute string. prefers-reduced-motion: flash + crack +
// a cross-fade dissolve, no flight.
const CODE = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
  "b", "a",
];
// The glass timetable (ms): flash + crack immediately, the shards sit
// through the fracture beat, then fall; teardown is the reassembly.
const SHARD_COUNT = 16;
const FRACTURE_AT = 100;
const FLIGHT_AT = 700;
const FLIGHT_MS = 1500;
const TEARDOWN_MS = 2500;
const CALM_MS = 650;

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
    // One glass break at a time: a second completed code mid-flight is a no-op.
    if (flight) return;
    const app = doc.querySelector(".gc-app");
    if (!app) return;

    // The reduced lane: flash + crack + a cross-fade dissolve, no flight.
    const reduced = Boolean(win.matchMedia) && win.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const w = win.innerWidth;
    const h = win.innerHeight;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = (Math.hypot(w, h) / 2) * 1.1;

    // The rays: SHARD_COUNT jagged spokes from the center, uneven on both
    // angle and reach, sorted so consecutive rays always bound one wedge.
    const rays = [];
    for (let i = 0; i < SHARD_COUNT; i++) {
      const angle = (Math.PI * 2 * (i + 0.2 + Math.random() * 0.8)) / SHARD_COUNT;
      rays.push({ angle, reach: maxR * (0.55 + Math.random() * 0.55) });
    }
    rays.sort((a, b) => a.angle - b.angle);
    const pointOf = (ray, reach) => ({
      x: cx + Math.cos(ray.angle) * reach,
      y: cy + Math.sin(ray.angle) * reach,
    });

    // --- FRACTURE: sample the real screen first, then cut the shards ------
    const nodes = [];
    const flightKeyframes = [];
    for (let i = 0; i < SHARD_COUNT; i++) {
      const a = rays[i];
      const b = rays[(i + 1) % SHARD_COUNT];
      const pa = pointOf(a, a.reach);
      const pb = pointOf(b, b.reach);
      const polygon = [cx, cy, pa.x, pa.y, pb.x, pb.y];
      const centroid = {
        x: (cx + pa.x + pb.x) / 3,
        y: (cy + pa.y + pb.y) / 3,
      };
      if (!reduced) {
        const shard = doc.createElement("div");
        shard.className = "konami-shard";
        shard.style.setProperty("clip-path",
          "polygon(" + polygon[0] + "px " + polygon[1] + "px, " +
          polygon[2] + "px " + polygon[3] + "px, " +
          polygon[4] + "px " + polygon[5] + "px)");
        shard.style.setProperty("z-index", String(2147483000 + i));
        // The shard wears the real surface it is cut from.
        const paint = paintAt(doc, centroid.x, centroid.y);
        if (paint.image) shard.style.setProperty("background-image", paint.image);
        shard.style.setProperty("background-color", paint.color);
        doc.body.append(shard);
        nodes.push(shard);
        // The fall: outward drift, gravity, and a tumble — out of view.
        const dist = Math.hypot(centroid.x - cx, centroid.y - cy) || 1;
        const outward = (centroid.x - cx) / dist;
        const downward = (centroid.y - cy) / dist;
        const drift = 140 + Math.random() * 260;
        const spin = (Math.random() * 160 - 80) * (outward < 0 ? -1 : 1);
        flightKeyframes.push({
          node: shard,
          delay: FLIGHT_AT + Math.round((dist / maxR) * 260),
          drift,
          dx: outward * drift * 1.7,
          dy: downward * drift,
          spin,
        });
      }
    }

    // --- the crack web: jagged polylines down every ray --------------------
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "konami-crack");
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.style.setProperty("z-index", String(2147483100));
    doc.body.append(svg);
    nodes.push(svg);
    for (const ray of rays) {
      for (const line of crackLines(cx, cy, ray, maxR)) {
        const points = line.points.map((p) => Math.round(p.x) + "," + Math.round(p.y)).join(" ");
        const stroke = doc.createElementNS("http://www.w3.org/2000/svg", "polyline");
        stroke.setAttribute("points", points);
        svg.append(stroke);
        const len = stroke.getTotalLength ? stroke.getTotalLength() : maxR;
        stroke.style.setProperty("stroke-dasharray", String(len));
        // The spiderweb draws itself fast through the dashoffset.
        stroke.animate(
          [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
          { duration: reduced ? 260 : 420, delay: 30, easing: "ease-out", fill: "both" },
        );
      }
    }

    // --- the impact flash --------------------------------------------------
    const flash = doc.createElement("div");
    flash.className = "konami-flash";
    flash.style.setProperty("z-index", String(2147483200));
    doc.body.append(flash);
    nodes.push(flash);
    flash.animate(
      [{ opacity: 0 }, { opacity: 0.85, offset: 0.2 }, { opacity: 0 }],
      { duration: reduced ? 260 : 300, fill: "both" },
    );

    // --- FLIGHT: the shards lift and fall; the real app fades to 15% -------
    if (reduced) {
      app.animate(
        [{ opacity: 1 }, { opacity: 0.15, offset: 0.5 }, { opacity: 1 }],
        { duration: CALM_MS, fill: "both" },
      );
      flight = win.setTimeout(() => {
        flight = 0;
        for (const node of nodes) node.remove();
      }, CALM_MS + 120);
      return;
    }
    app.animate(
      [{ opacity: "1" }, { opacity: "0.15" }],
      { duration: 900, delay: FRACTURE_AT + 200, fill: "both" },
    );
    for (const shard of flightKeyframes) {
      shard.node.animate(
        [
          { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
          {
            transform: "translate(" + Math.round(shard.dx * 0.4) + "px, " + Math.round(shard.dy * 0.4) + "px) rotate(" + Math.round(shard.spin * 0.5) + "deg)",
            opacity: 1,
            offset: 0.4,
          },
          {
            transform: "translate(" + Math.round(shard.dx) + "px, " + Math.round(shard.dy + shard.drift * 1.3) + "px) rotate(" + Math.round(shard.spin) + "deg)",
            opacity: 0.85,
            offset: 0.85,
          },
          {
            transform: "translate(" + Math.round(shard.dx * 1.15) + "px, " + Math.round(shard.dy + shard.drift * 3.4) + "px) rotate(" + Math.round(shard.spin * 1.15) + "deg)",
            opacity: 0,
          },
        ],
        { duration: FLIGHT_MS, delay: Math.round(shard.delay), easing: "ease-in", fill: "both" },
      );
    }

    flight = win.setTimeout(() => {
      flight = 0;
      for (const node of nodes) node.remove();
      // The reassembly: the real app — untouched the whole time — fades back.
      app.animate([{ opacity: "0.15" }, { opacity: "1" }], { duration: 450, fill: "both" });
    }, TEARDOWN_MS);
  }

  // The crack web: each ray is a polyline with perpendicular jags, plus a
  // couple of short branches (the web's twigs).
  function crackLines(cx, cy, ray, maxR) {
    const lines = [];
    const points = [{ x: cx, y: cy }];
    for (const step of [0.35, 0.65, 1]) {
      const reach = maxR * (ray.reach / maxR) * step;
      const base = { x: cx + Math.cos(ray.angle) * reach, y: cy + Math.sin(ray.angle) * reach };
      points.push({
        x: base.x + Math.cos(ray.angle + Math.PI / 2) * (Math.random() * 26 - 13),
        y: base.y + Math.sin(ray.angle + Math.PI / 2) * (Math.random() * 26 - 13),
      });
    }
    lines.push({ points });
    if (Math.random() < 0.5) {
      const from = points[2];
      const branch = [from, {
        x: from.x + Math.cos(ray.angle - Math.PI / 3) * (maxR * 0.14 + Math.random() * 30),
        y: from.y + Math.sin(ray.angle - Math.PI / 3) * (maxR * 0.14 + Math.random() * 30),
      }];
      lines.push({ points: branch });
    }
    return lines;
  }

  function paintAt(doc, x, y) {
    // The topmost element at the point owns the paint; transparent layers
    // fall through to the first opaque one (body's surface is the floor).
    let node = doc.elementFromPoint(x, y);
    while (node) {
      const style = win.getComputedStyle(node);
      if (style.backgroundColor && !style.backgroundColor.startsWith("rgba(0, 0, 0, 0)")) {
        return { color: style.backgroundColor, image: style.backgroundImage !== "none" ? style.backgroundImage : null };
      }
      node = node.parentElement;
    }
    return { color: "rgba(0, 0, 0, 0)", image: null };
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

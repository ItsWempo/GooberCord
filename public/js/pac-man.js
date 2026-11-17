// pac-man.js — the Wempo easter egg (the owner's direct ask): clicking the
// rail's Clyde portrait MANY times (FIVE inside the four-second window — the
// wiring lives in app.js's home button) opens a WORKING game of Pac-Man in a
// dialog. One self-contained module: canvas render, grid stepping, pellet
// economy, lives, and ghost AI at the sane depth (scatter/chase scheduling,
// per-ghost targeting, the no-reverse rule, and a frightened flee mode).
//
// House rules carried: CSP-safe DOM only (el(), never innerHTML), ESC and a
// backdrop click close it, every timer/animation-frame is cancelled on close,
// and the REAL action never breaks — a fast clicker still lands on #/ five
// times; the egg rides on top. Palette reads the theme tokens off :root so
// the maze renders in whatever skin is live; ghost colors are gameplay
// semantics (the classic quartet, named colors).
import { el } from "./dom.js";

// The maze: 13x13, three vertical lanes (cols 1/6/11) over three open rows
// (1/4/8) plus the half row 6 — every corridor cell is reachable (the test
// BFS-pins it). '#' walls, '.' pellets, 'o' power pellets, ' ' eaten lanes.
const MAZE = [
  "#############",
  "#o.........o#",
  "#.####.####.#",
  "#.####.####.#",
  "#o.........o#",
  "#.####.####.#",
  "#.....#.....#",
  "#.####.####.#",
  "#o.........o#",
  "#.####.####.#",
  "#.####.####.#",
  "#.....#.....#",
  "#############",
];

const DIRECTIONS = [
  { name: "up", dx: 0, dy: -1 },
  { name: "down", dx: 0, dy: 1 },
  { name: "left", dx: -1, dy: 0 },
  { name: "right", dx: 1, dy: 0 },
];

const PAC_START = { x: 1, y: 6 };
// Ghost home cells: the open lanes well away from the start.
const GHOSTS = [
  { x: 6, y: 1, color: "crimson", corner: { x: 11, y: 1 }, scatterTicks: 26 },
  { x: 6, y: 4, color: "hotpink", corner: { x: 1, y: 11 }, scatterTicks: 22 },
  { x: 11, y: 6, color: "darkcyan", corner: { x: 11, y: 11 }, scatterTicks: 18 },
];
const FRIGHTENED_TICKS = 40;
const TICK_MS = 130;

// The AI's one steering rule, pure: at an intersection choose the open
// neighbor NEAREST the target, never reversing (a dead end may).
function chooseGhostDir(ghost, target, walkable) {
  const options = DIRECTIONS.filter((dir) => {
    const x = ghost.x + dir.dx;
    const y = ghost.y + dir.dy;
    return walkable(x, y);
  });
  const nonReverse = options.filter(
    (dir) => !(ghost.dx === -dir.dx && ghost.dy === -dir.dy) ||
      options.length === 1,
  );
  const pool = nonReverse.length > 0 ? nonReverse : options;
  if (pool.length === 0) return null;
  let best = pool[0];
  let bestDist = Infinity;
  for (const dir of pool) {
    const dist = Math.abs(ghost.x + dir.dx - target.x) + Math.abs(ghost.y + dir.dy - target.y);
    if (dist < bestDist) {
      best = dir;
      bestDist = dist;
    }
  }
  return best;
}

// The frightened ghost steers AWAY (max distance), same no-reverse rule.
function chooseFleeDir(ghost, threat, walkable) {
  const options = DIRECTIONS.filter((dir) => walkable(ghost.x + dir.dx, ghost.y + dir.dy));
  const nonReverse = options.filter(
    (dir) => !(ghost.dx === -dir.dx && ghost.dy === -dir.dy) || options.length === 1,
  );
  const pool = nonReverse.length > 0 ? nonReverse : options;
  if (pool.length === 0) return null;
  let best = pool[0];
  let bestDist = -1;
  for (const dir of pool) {
    const dist = Math.abs(ghost.x + dir.dx - threat.x) + Math.abs(ghost.y + dir.dy - threat.y);
    if (dist > bestDist) {
      best = dir;
      bestDist = dist;
    }
  }
  return best;
}

function pelletsLeft(grid) {
  let left = 0;
  for (const row of grid) for (const cell of row) if (cell === "." || cell === "o") left += 1;
  return left;
}

function freshGrid() {
  return MAZE.map((row) => row.split(""));
}

// The palette: gameplay tokens read off the live :root so the maze renders
// in whichever skin the tab wears.
function readPalette(doc) {
  const root = doc.documentElement;
  const tokens = getComputedStyle(root);
  const read = (name, fallback) => (tokens.getPropertyValue(name) || "").trim() || fallback;
  return {
    wall: read("--line", "gray"),
    ink: read("--ink", "black"),
    pellet: read("--muted", "gray"),
  };
}

export function openPacMan(doc, win) {
  doc = doc || document;

  const grid = freshGrid();
  const state = {
    pac: { ...PAC_START, dx: 0, dy: 0, wanted: DIRECTIONS[3], mouth: 0 },
    ghosts: GHOSTS.map((ghost) => ({ ...ghost, dx: 0, dy: 0, frightened: 0 })),
    score: 0,
    lives: 3,
    tick: 0,
    message: "Eat the pellets. The arrows steer — 5 quick door clicks reopened this.",
    over: false,
  };

  const CELL = 26;
  const canvas = doc.createElement("canvas");
  canvas.width = MAZE[0].length * CELL;
  canvas.height = MAZE.length * CELL;
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Pac-Man. Arrow keys or W A S D steer. Escape closes.");
  const scoreLine = el("p", { class: "pac-score", role: "status" });
  const hint = el("p", { class: "muted pac-hint", text: state.message });

  const dialog = el("dialog", { class: "gc-dialog pac-man-dialog" },
    el("h2", { text: "Wempo's arcade" }),
    scoreLine,
    canvas,
    hint,
    el("div", { class: "form-actions" },
      el("button", { class: "button button-quiet", type: "button", text: "Close" })),
  );
  dialog.querySelector(".form-actions button").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", stop);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  doc.body.append(dialog);
  dialog.showModal();
  canvas.focus();

  // --- keyboard ---------------------------------------------------------------
  const KEYS = {
    ArrowUp: DIRECTIONS[0], w: DIRECTIONS[0], W: DIRECTIONS[0],
    ArrowDown: DIRECTIONS[1], s: DIRECTIONS[1], S: DIRECTIONS[1],
    ArrowLeft: DIRECTIONS[2], a: DIRECTIONS[2], A: DIRECTIONS[2],
    ArrowRight: DIRECTIONS[3], d: DIRECTIONS[3], D: DIRECTIONS[3],
  };
  canvas.addEventListener("keydown", (event) => {
    const dir = KEYS[event.key];
    if (!dir) return;
    event.preventDefault(); // the arrows must never scroll the page behind it
    state.pac.wanted = dir;
  });

  // --- tick -------------------------------------------------------------------
  const walkable = (x, y) => {
    const row = MAZE[y];
    return Boolean(row) && MAZE[y][x] !== undefined && grid[y][x] !== "#";
  };

  function stepEntity(entity) {
    if (walkable(entity.x + entity.dx, entity.y + entity.dy)) {
      entity.x += entity.dx;
      entity.y += entity.dy;
    }
  }

  function pacStep() {
    const pac = state.pac;
    if (walkable(pac.x + pac.wanted.dx, pac.y + pac.wanted.dy)) {
      pac.dx = pac.wanted.dx;
      pac.dy = pac.wanted.dy;
    }
    stepEntity(pac);
    const cell = grid[pac.y][pac.x];
    if (cell === ".") {
      grid[pac.y][pac.x] = " ";
      state.score += 10;
    } else if (cell === "o") {
      grid[pac.y][pac.x] = " ";
      state.score += 50;
      for (const ghost of state.ghosts) {
        ghost.frightened = FRIGHTENED_TICKS;
        ghost.dx = -ghost.dx;
        ghost.dy = -ghost.dy;
      }
    }
    pac.mouth += 1;
  }

  function ghostStep(ghost) {
    if (ghost.frightened > 0) ghost.frightened -= 1;
    const frightened = ghost.frightened > 0;
    // Scatter/chase alternation: each ghost begins scattering to its corner
    // and then chases; the per-ghost phase keeps the pack from clumping.
    const scatter = !frightened && state.tick % 90 < ghost.scatterTicks;
    let target;
    if (frightened) {
      ghost.dx = ghost.dy = 0; // the flee pick supplies the move directly
      const flee = chooseFleeDir(ghost, state.pac, walkable);
      if (flee) {
        ghost.dx = flee.dx;
        ghost.dy = flee.dy;
      }
      stepEntity(ghost);
      return;
    }
    if (scatter) target = ghost.corner;
    else if (ghost.color === "crimson") target = { x: state.pac.x, y: state.pac.y };
    else if (ghost.color === "hotpink") {
      target = {
        x: state.pac.x + state.pac.wanted.dx * 2,
        y: state.pac.y + state.pac.wanted.dy * 2,
      };
    } else {
      // The cyan cut-off: close ghosts charge, distant ones hold the corner.
      const far = Math.abs(ghost.x - state.pac.x) + Math.abs(ghost.y - state.pac.y) > 6;
      target = far
        ? { x: state.pac.x, y: state.pac.y }
        : { x: ghost.corner.x - (ghost.corner.x - state.pac.x) * 2, y: ghost.corner.y - (ghost.corner.y - state.pac.y) * 2 };
    }
    const dir = chooseGhostDir(ghost, target, walkable);
    if (dir) {
      ghost.dx = dir.dx;
      ghost.dy = dir.dy;
      stepEntity(ghost);
    }
  }

  function ghostTouches(ghost) {
    return ghost.x === state.pac.x && ghost.y === state.pac.y;
  }

  function resetEaters() {
    state.pac.x = PAC_START.x;
    state.pac.y = PAC_START.y;
    state.pac.dx = state.pac.dy = 0;
    for (let i = 0; i < state.ghosts.length; i++) {
      state.ghosts[i].x = GHOSTS[i].x;
      state.ghosts[i].y = GHOSTS[i].y;
      state.ghosts[i].frightened = 0;
    }
  }

  // --- render -----------------------------------------------------------------
  function draw() {
    const palette = readPalette(doc);
    const brush = canvas.getContext("2d");
    brush.fillStyle = palette.wall;
    brush.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const cell = grid[y][x];
        const px = x * CELL;
        const py = y * CELL;
        if (cell === "#") {
          brush.fillStyle = palette.wall;
          brush.fillRect(px, py, CELL, CELL);
        }
        if (cell === ".") {
          brush.fillStyle = palette.pellet;
          brush.beginPath();
          brush.arc(px + CELL / 2, py + CELL / 2, 3, 0, Math.PI * 2);
          brush.fill();
        }
        if (cell === "o") {
          brush.fillStyle = palette.ink;
          brush.beginPath();
          brush.arc(px + CELL / 2, py + CELL / 2, 6, 0, Math.PI * 2);
          brush.fill();
        }
      }
    }
    // Pac: the open mouth turns with each step.
    const pac = state.pac;
    const px = pac.x * CELL + CELL / 2;
    const py = pac.y * CELL + CELL / 2;
    const heading = pac.mouth % 2 === 0 ? 0 : 0.8;
    brush.fillStyle = "gold";
    brush.beginPath();
    const facing = Math.atan2(pac.dy || (pac.wanted ? pac.wanted.dy : 0), pac.dx || (pac.wanted ? pac.wanted.dx : 1));
    brush.moveTo(px, py);
    brush.arc(px, py, CELL * 0.42, facing + heading, facing - heading + Math.PI * 2);
    brush.fill();
    // Ghosts: the dome body + eyes; frightened bodies go blue and blink white.
    for (const ghost of state.ghosts) {
      const gx = ghost.x * CELL;
      const gy = ghost.y * CELL;
      const blink = ghost.frightened > 0 && ghost.frightened < 10 && state.tick % 2 === 0;
      brush.fillStyle = ghost.frightened > 0 ? (blink ? "white" : "royalblue") : ghost.color;
      brush.beginPath();
      brush.arc(gx + CELL / 2, gy + CELL * 0.42, CELL * 0.4, Math.PI, 0);
      brush.lineTo(gx + CELL * 0.9, gy + CELL * 0.96);
      brush.lineTo(gx + CELL * 0.1, gy + CELL * 0.96);
      brush.closePath();
      brush.fill();
      brush.fillStyle = blink ? "red" : "white";
      brush.fillRect(gx + CELL * 0.22, gy + CELL * 0.28, 5, 5);
      brush.fillRect(gx + CELL * 0.62, gy + CELL * 0.28, 5, 5);
    }
  }

  function afterMove() {
    // Contact resolution: swap-through is caught by the NEXT tick's same-cell
    // check (grid speed makes the swap case rare and harmless either way).
    for (const ghost of state.ghosts) {
      if (!ghostTouches(ghost)) continue;
      if (ghost.frightened > 0) {
        ghost.frightened = 0;
        ghost.x = GHOSTS.find((home) => home.color === ghost.color).x;
        ghost.y = GHOSTS.find((home) => home.color === ghost.color).y;
        state.score += 200;
      } else {
        state.lives -= 1;
        if (state.lives > 0) {
          state.message = "Caught! " + state.lives + " left.";
          resetEaters();
        } else {
          state.over = true;
          state.message = "Game over — score " + state.score + ". Close to try again.";
        }
      }
    }
    if (pelletsLeft(grid) === 0) {
      state.over = true;
      state.message = "Maze cleared — score " + state.score + ". Wempo is impressed.";
    }
  }

  function syncDialog() {
    scoreLine.textContent = "Score " + state.score + " — lives " + state.lives;
    hint.textContent = state.message;
  }

  // --- the loop ---------------------------------------------------------------
  let timer = 0;
  function tick() {
    timer = 0;
    if (state.over) return;
    state.tick += 1;
    pacStep();
    for (const ghost of state.ghosts) ghostStep(ghost);
    afterMove();
    draw();
    syncDialog();
    if (!state.over) timer = win.setTimeout(tick, TICK_MS);
  }

  function stop() {
    if (timer) win.clearTimeout(timer);
    timer = 0;
  }

  timer = win.setTimeout(tick, TICK_MS);
  draw();
  syncDialog();
  return dialog;
}

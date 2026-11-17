// pac-man.js — Wempo's arcade (the owner's ruling: "A ACTUAL EMBED … WITH THE
// REAL DEAL"): a faithful arcade Pac-Man on ONE canvas, no dependencies.
// - the classic 28x31 tile board: the real maze shape, exactly 240 pellets
//   plus the 4 corner energizers, and the row-14 side tunnels with wrap;
// - the four ghosts with their actual targeting — Blinky chases Pac-Man's
//   tile, Pinky aims four tiles ahead, Inky aims Blinky-mirrored through the
//   two-ahead pivot, Clyde chases only when farther than eight tiles — plus
//   the scatter/chase wave schedule, the ghost-house release order (Pinky
//   immediately, Inky at 30 dots, Clyde at 60), and Blinky's Cruise Elroy
//   push at 20 dots left;
// - score, three lives, a READY! beat, a real death animation (the wedge
//   opens until he vanishes), ghost-eating chains 200-1600, tunnel slowdown,
//   the fruit at 70 and 170 dots, and a level flash + advance on a clear.
// Same trigger and export as before (FIVE Wempo rail clicks -> openPacMan),
// so the door wiring in routes/app.js holds unchanged.
//
// House rules carried: CSP-safe DOM only (el(), never innerHTML), ESC and a
// backdrop click close it, every timer is cancelled on close, the palette
// reads the theme tokens off :root, and gameplay semantics (the classic
// ghost colors) are named colors. prefers-reduced-motion calms the chomp,
// the blink, and the maze flash — the game stays fully playable.
import { el } from "./dom.js";

// The classic board, one string per row. '#' wall, '.' pellet, 'o' power
// pellet, ' ' open path (the tunnel row and the house ring carry no dots),
// '-' the ghost-house door (ghosts pass, Pac-Man cannot). 31 rows x 28
// cols, horizontally mirrored.
const MAZE = [
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o####.#####.##.#####.####o#",
  "#.####.#####.##.#####.####.#",
  "#..........................#",
  "#.####.##.########.##.####.#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "######.#####.##.#####.######",
  "######.##### ## #####.######",
  "######.##          ##.######",
  "######.## ###--### ##.######",
  "######.## #      # ##.######",
  "          #      #          ",
  "######.## #      # ##.######",
  "######.## ######## ##.######",
  "######.##          ##.######",
  "######.##############.######",
  "######.##############.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#.####.#####.##.#####.####.#",
  "#o..##.......  .......##..o#",
  "###.##.##.########.##.##.###",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################",
];

const COLS = 28;
const ROWS = MAZE.length;
const CELL = 16; // px per tile — the board is 448x496, arcade proportioned
const HUD_TOP = 48;
const HUD_BOTTOM = 64;

// Pacing (tiles per second), arcade-feel: Pac-Man slightly outruns the
// ghosts except in the tunnels, the flee is much slower, and the eaten
// ghost's eyes fly home fast.
const PAC_SPEED = 9.0;
const GHOST_SPEED = 8.5;
const FRIGHT_SPEED = 5.0;
const TUNNEL_SPEED = 4.0;
const EYES_SPEED = 16.0;
// Blinky's Cruise Elroy: the last pellets push him past Pac speed.
const ELROY_DOTS = 20;

// The scatter/chase wave schedule, level 1, in seconds — the arcade's own:
// alternating waves that end in a permanent chase.
const WAVES = [[7, "scatter"], [20, "chase"], [7, "scatter"], [20, "chase"], [5, "scatter"], [20, "chase"], [5, "chase"]];
// Ghost-house release (level 1 dot counters, per life): Pinky never waits,
// Inky waits 30 dots, Clyde 60.
const RELEASE_DOTS = [0, 30, 60];
// The frightened window shrinks a second per level, floor 1s.
const frightSeconds = (level) => Math.max(1, 6 - (level - 1));
const FRUIT_DOTS = [70, 170];
const FRUIT_MS = 9000;
const READY_MS = 2000;
const READY_AFTER_DEATH_MS = 1500;
const DIE_MS = 1400;
const FLASH_MS = 1800;

// Geometry: the door lane is column 13's center; Blinky (already out)
// stands on the house ring; the other three ride the house floor. Pac-Man
// starts dead center of row 23.
const DOOR_X = 13.5;
const DOOR_RING_Y = 11.5;
const HOUSE_FLOOR_Y = 14.5;
const PAC_START = { x: 14.0, y: 23.5 };
// Scatter corners — the arcade's own: Blinky top right, Pinky top left,
// Inky bottom right, Clyde bottom left.
const CORNERS = { blinky: { x: 25, y: 0 }, pinky: { x: 2, y: 0 }, inky: { x: 27, y: 30 }, clyde: { x: 0, y: 30 } };

const DIRS = { up: { dx: 0, dy: -1 }, left: { dx: -1, dy: 0 }, down: { dx: 0, dy: 1 }, right: { dx: 1, dy: 0 } };
const TICK_MS = 16;

function readPalette(doc) {
  const tokens = getComputedStyle(doc.documentElement);
  const read = (name, fallback) => (tokens.getPropertyValue(name) || "").trim() || fallback;
  return {
    wallLine: read("--focus", "#2121de"),
    wallFill: read("--panel", "#04040f"),
    ink: read("--ink", "white"),
    muted: read("--muted", "#b5bac1"),
    pellet: read("--yellow", "#ffe08a"),
  };
}

function tileAt(grid, x, y) {
  if (y < 0 || y >= ROWS) return "#";
  if (x < 0 || x >= COLS) return y === 14 ? " " : "#"; // the side tunnels
  return grid[y][x];
}

// Walls and the door stop Pac-Man.
function pacPassable(grid, x, y) {
  const cell = tileAt(grid, x, y);
  return cell !== "#" && cell !== "-";
}

// One forward move across tile centers, so turns and steering decisions
// happen EXACTLY at centers: Pac's buffered corner turns apply the moment a
// center is crossed, the ghost's next direction is chosen there, and dots
// are eaten there. A boundary-exact position belongs to the tile it is
// ENTERING, so the next center reads ahead in the direction of travel.
function advance(e, step, atCenter) {
  let remaining = step;
  for (let guard = 0; guard < 12; guard++) {
    if (remaining <= 1e-6 || (e.dx === 0 && e.dy === 0)) return;
    const horizontal = e.dx !== 0;
    const sign = e.dx + e.dy;
    const pos = horizontal ? e.fx : e.fy;
    const enterTile = sign > 0 ? Math.floor(pos) : Math.ceil(pos - 1e-9) - 1;
    const ahead = (enterTile + 0.5 - pos) * sign; // >0 → the center lies ahead
    if (ahead > 1e-6) {
      const move = Math.min(remaining, ahead);
      if (horizontal) e.fx += move * sign;
      else e.fy += move * sign;
      remaining -= move;
      if (move < ahead - 1e-9) return; // mid-tile; the center comes next tick
    } else {
      // At or past the center: the boundary is the next decision-free span.
      const rel = pos - enterTile; // in [0, 1) measured from the tile's left
      const move = Math.min(remaining, sign > 0 ? 1 - rel : rel);
      if (horizontal) e.fx += move * sign;
      else e.fy += move * sign;
      remaining -= move;
    }
    // The tunnel wrap: row 14 leaves one edge and enters the other.
    if (e.fx < -0.5) e.fx += COLS;
    else if (e.fx >= COLS + 0.5) e.fx -= COLS;
    if (Math.abs(Math.floor(e.fx) + 0.5 - e.fx) < 0.0001 && Math.abs(Math.floor(e.fy) + 0.5 - e.fy) < 0.0001) {
      atCenter(e);
    }
  }
}

// The ghost steering rule, faithful: at a center, take the passage whose
// next tile is nearest the target, never reversing (a dead end may).
// Frightened ghosts instead take a random open passage.
function chooseGhostDir(ghost, target, grid) {
  const options = Object.entries(DIRS).filter(([, dir]) => {
    const x = Math.floor(ghost.fx) + dir.dx;
    const y = Math.floor(ghost.fy) + dir.dy;
    const cell = tileAt(grid, x, y);
    return cell !== "#" && (cell !== "-" || ghost.mode === "eyes");
  });
  const noReverse = options.filter(([, dir]) => !(ghost.dx === -dir.dx && ghost.dy === -dir.dy));
  const pool = noReverse.length > 0 ? noReverse : options;
  if (pool.length === 0) return null;
  if (ghost.frightened > 0) return pool[Math.floor(Math.random() * pool.length)][1];
  let best = null;
  let bestDist = Infinity;
  for (const [, dir] of pool) {
    const gx = Math.floor(ghost.fx) + dir.dx;
    const gy = Math.floor(ghost.fy) + dir.dy;
    const dist = (gx - target.x) * (gx - target.x) + (gy - target.y) * (gy - target.y);
    if (dist < bestDist) {
      best = dir;
      bestDist = dist;
    }
  }
  return best;
}

export function openPacMan(doc, win) {
  doc = doc || document;
  const reduced = Boolean(win.matchMedia) && win.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- chrome first: the dialog, the canvas, and its brush exist up top ----
  const canvas = doc.createElement("canvas");
  canvas.width = COLS * CELL;
  canvas.height = HUD_TOP + ROWS * CELL + HUD_BOTTOM;
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Pac-Man — the real arcade board, all four ghosts, tunnels and fruit. Arrows or W A S D steer. Escape closes.");
  const brush = canvas.getContext("2d");

  const scoreLine = el("p", { class: "pac-score", role: "status" });
  const hint = el("p", { class: "muted pac-hint", text: "The real board. Five door clicks brought it back." });

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

  // The mutable dot layer + game state.
  const grid = MAZE.map((row) => row.split(""));

  function readHigh() {
    try {
      return Number(win.localStorage.getItem("pacman-high")) || 0;
    } catch {
      return 0;
    }
  }

  function saveHigh() {
    try {
      win.localStorage.setItem("pacman-high", String(game.high));
    } catch {
      // Per-viewer convenience only; a blocked store just skips the save.
    }
  }

  function countDots() {
    let count = 0;
    for (const row of grid) for (const cell of row) if (cell === "." || cell === "o") count += 1;
    return count;
  }

  const game = {
    score: 0,
    high: readHigh(),
    lives: 3,
    level: 1,
    mode: "ready", // ready | play | dying | flash | over
    modeMs: 0,
    dotsLeft: countDots(),
    dotsThisLife: 0,
    fright: 0, // ms left in the energizer window
    wave: 0,
    waveMs: 0,
    fruit: null,
    fruitsShown: 0,
    chain: 0,
    floaties: [],
  };

  const pac = { fx: PAC_START.x, fy: PAC_START.y, dx: 0, dy: 0, wanted: null, mouth: 0 };
  let ghosts = [];

  function spawnActors() {
    pac.fx = PAC_START.x;
    pac.fy = PAC_START.y;
    pac.dx = 0;
    pac.dy = 0;
    pac.wanted = null;
    pac.mouth = 0;
    game.dotsThisLife = 0;
    game.fright = 0;
    game.wave = 0;
    game.waveMs = 0;
    game.fruit = null;
    game.fruitsShown = 0;
    game.chain = 0;
    // Blinky is already out on the ring; the other three wait in the house
    // behind their dot counters (Pinky 0, Inky 30, Clyde 60).
    ghosts = [
      { name: "blinky", color: "crimson", corner: CORNERS.blinky, release: 0, seat: DOOR_X, fx: DOOR_X, fy: DOOR_RING_Y, mode: "roam", dx: -1, dy: 0, frightened: 0, bob: 0 },
      { name: "pinky", color: "hotpink", corner: CORNERS.pinky, release: RELEASE_DOTS[0], seat: 14.0, fx: 14.0, fy: HOUSE_FLOOR_Y, mode: "house", dx: 0, dy: 0, frightened: 0, bob: 0 },
      { name: "inky", color: "darkcyan", corner: CORNERS.inky, release: RELEASE_DOTS[1], seat: 12.0, fx: 12.0, fy: HOUSE_FLOOR_Y, mode: "house", dx: 0, dy: 0, frightened: 0, bob: 0 },
      { name: "clyde", color: "orange", corner: CORNERS.clyde, release: RELEASE_DOTS[2], seat: 16.0, fx: 16.0, fy: HOUSE_FLOOR_Y, mode: "house", dx: 0, dy: 0, frightened: 0, bob: 0 },
    ];
  }

  function startGame() {
    game.score = 0;
    game.lives = 3;
    game.level = 1;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) grid[y][x] = MAZE[y][x];
    game.dotsLeft = countDots();
    spawnActors();
    game.mode = "ready";
    game.modeMs = READY_MS;
  }

  function startFright() {
    game.fright = frightSeconds(game.level) * 1000;
    game.chain = 0;
    for (const ghost of ghosts) {
      const wasRoam = ghost.mode === "roam";
      ghost.mode = wasRoam ? "roam" : ghost.mode;
      if (ghost.mode === "eyes" || ghost.mode === "entering") continue;
      ghost.frightened = 1;
      if (wasRoam) {
        // The energizer's forced reversal — the arcade's own panic beat.
        ghost.dx = -ghost.dx;
        ghost.dy = -ghost.dy;
      }
    }
  }

  // --- targeting --------------------------------------------------------------
  function targetFor(ghost) {
    if (ghost.mode === "eyes") return { x: 13, y: 11 }; // the house door
    if (WAVES[Math.min(game.wave, WAVES.length - 1)][1] === "scatter") return ghost.corner;
    const px = Math.floor(pac.fx);
    const py = Math.floor(pac.fy);
    if (ghost.name === "blinky") return { x: px, y: py }; // directly at Pac-Man
    if (ghost.name === "pinky") {
      // Four tiles ahead of Pac-Man — the shadow ambush (no up-bug).
      return { x: px + pac.dx * 4, y: py + pac.dy * 4 };
    }
    if (ghost.name === "inky") {
      const blinky = ghosts[0];
      const pivot = { x: px + pac.dx * 2, y: py + pac.dy * 2 };
      // Two tiles past the pivot, mirrored through Blinky.
      return { x: pivot.x * 2 - Math.floor(blinky.fx), y: pivot.y * 2 - Math.floor(blinky.fy) };
    }
    // Clyde: the eight-tile shyness — chase when far, scatter corner when close.
    const dist = Math.abs(Math.floor(ghost.fx) - px) + Math.abs(Math.floor(ghost.fy) - py);
    return dist > 8 ? { x: px, y: py } : ghost.corner;
  }

  function ghostSpeed(ghost) {
    if (ghost.mode === "eyes") return EYES_SPEED;
    if (ghost.frightened > 0) return FRIGHT_SPEED;
    if (Math.floor(ghost.fy) === 14 && (ghost.fx < 5.5 || ghost.fx > 22.5)) return TUNNEL_SPEED;
    if (ghost.name === "blinky" && game.dotsLeft <= ELROY_DOTS) return PAC_SPEED + 0.5;
    return GHOST_SPEED + (game.level - 1) * 0.25;
  }

  // --- one simulation tick ----------------------------------------------------
  let timer = 0;
  function stop() {
    if (timer) win.clearTimeout(timer);
    timer = 0;
  }

  function tick() {
    timer = win.setTimeout(tick, TICK_MS);
    const dt = TICK_MS / 1000;

    // The bookend modes just count down (up) and redraw.
    if (game.mode === "ready" || game.mode === "flash") {
      game.modeMs -= TICK_MS;
      if (game.modeMs <= 0) {
        if (game.mode === "ready") {
          game.mode = "play";
        } else {
          // Next board: dots restored, a touch faster, a touch braver ghosts.
          game.level += 1;
          for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) grid[y][x] = MAZE[y][x];
          game.dotsLeft = countDots();
          spawnActors();
          game.mode = "ready";
          game.modeMs = READY_MS;
        }
      }
      draw();
      return;
    }
    if (game.mode === "over") {
      draw();
      return;
    }

    if (game.mode === "dying") {
      game.modeMs += TICK_MS;
      if (game.modeMs >= DIE_MS) {
        game.lives -= 1;
        if (game.lives > 0) {
          spawnActors();
          game.mode = "ready";
          game.modeMs = READY_AFTER_DEATH_MS;
        } else {
          game.mode = "over";
          saveHigh();
        }
      }
      draw();
      return;
    }

    // --- play ---
    if (game.fright > 0) {
      game.fright = Math.max(0, game.fright - TICK_MS);
      if (game.fright === 0) {
        for (const ghost of ghosts) ghost.frightened = 0;
      }
    } else {
      // The scatter/chase clock only runs un-frightened — the arcade's own.
      game.waveMs += TICK_MS;
      const waveLen = WAVES[Math.min(game.wave, WAVES.length - 1)];
      if (game.waveMs >= waveLen[0] * 1000 && game.wave < WAVES.length - 1) {
        game.wave += 1;
        game.waveMs = 0;
        for (const ghost of ghosts) {
          if (ghost.mode === "roam") {
            ghost.dx = -ghost.dx;
            ghost.dy = -ghost.dy; // every mode flip forces the reversal
          }
        }
      }
    }

    // The fruit window.
    if (game.fruit) {
      game.fruit.t -= TICK_MS;
      if (game.fruit.t <= 0) game.fruit = null;
    }

    updatePac(dt);
    for (const ghost of ghosts) updateGhost(ghost, dt);
    resolveContacts();
    for (const floaty of game.floaties) floaty.t -= TICK_MS;
    game.floaties = game.floaties.filter((floaty) => floaty.t > 0);
    draw();
  }

  function updatePac(dt) {
    if (pac.dx === 0 && pac.dy === 0) return; // stopped; the buffered turn waits
    advance(pac, PAC_SPEED * dt, (e) => {
      const cx = Math.floor(e.fx);
      const cy = Math.floor(e.fy);
      e.fx = cx + 0.5;
      e.fy = cy + 0.5;
      // The dot under the center is eaten the moment he crosses it.
      if (cx >= 0 && cx < COLS) {
        const cell = grid[cy][cx];
        if (cell === "." || cell === "o") {
          grid[cy][cx] = " ";
          game.dotsLeft -= 1;
          game.dotsThisLife += 1;
          game.score += cell === "o" ? 50 : 10;
          if (cell === "o") startFright();
          if (game.fruitsShown < FRUIT_DOTS.length && game.dotsThisLife >= FRUIT_DOTS[game.fruitsShown]) {
            game.fruitsShown += 1;
            game.fruit = { t: FRUIT_MS };
          }
          if (game.score > game.high) game.high = game.score;
          if (game.dotsLeft === 0) {
            game.mode = "flash";
            game.modeMs = FLASH_MS;
            saveHigh();
          }
        }
      }
      // Steering at the center: the buffered corner turn, then the wall stop.
      if (e.wanted && pacPassable(grid, cx + e.wanted.dx, cy + e.wanted.dy)) {
        e.dx = e.wanted.dx;
        e.dy = e.wanted.dy;
        e.wanted = null;
        return;
      }
      if (!pacPassable(grid, cx + e.dx, cy + e.dy)) {
        e.dx = 0; // the wall ahead: stop dead on the center, keep the buffer
        e.dy = 0;
      }
    });
    if (pac.dx !== 0 || pac.dy !== 0) pac.mouth += dt * 10;
  }

  function updateGhost(ghost, dt) {
    if (ghost.mode === "house") {
      if (game.dotsThisLife >= ghost.release) {
        ghost.mode = "leaving";
        return;
      }
      ghost.bob += dt;
      ghost.fy = HOUSE_FLOOR_Y + 0.2 * Math.sin(ghost.bob * 3.5);
      return;
    }
    if (ghost.mode === "leaving") {
      // Scripted exit: slide to the door lane, rise to the ring, then roam.
      const speed = GHOST_SPEED * dt;
      if (Math.abs(ghost.fx - DOOR_X) > 0.02) {
        ghost.fx += Math.sign(DOOR_X - ghost.fx) * Math.min(speed, Math.abs(DOOR_X - ghost.fx));
        return;
      }
      ghost.fx = DOOR_X;
      if (ghost.fy > DOOR_RING_Y) {
        ghost.fy = Math.max(DOOR_RING_Y, ghost.fy - speed);
        return;
      }
      ghost.fy = DOOR_RING_Y;
      ghost.mode = "roam";
      ghost.dx = -1;
      ghost.dy = 0;
      return;
    }
    if (ghost.mode === "entering") {
      const speed = EYES_SPEED * dt;
      ghost.fy = Math.min(HOUSE_FLOOR_Y, ghost.fy + speed);
      if (ghost.fy >= HOUSE_FLOOR_Y) {
        // Revived at the floor: straight back out as himself.
        ghost.frightened = 0;
        ghost.mode = "leaving";
      }
      return;
    }
    // roam + eyes share one mover; the only difference is the target (and
    // the eyes' speed).
    advance(ghost, ghostSpeed(ghost) * dt, (e) => {
      const cx = Math.floor(e.fx);
      const cy = Math.floor(e.fy);
      e.fx = cx + 0.5;
      e.fy = cy + 0.5;
      if (e.mode === "eyes" && cx === 13 && cy === 11) {
        e.mode = "entering"; // the descent is scripted from here
        e.dx = 0;
        e.dy = 0;
        return;
      }
      const dir = chooseGhostDir(e, targetFor(e), grid);
      if (dir) {
        e.dx = dir.dx;
        e.dy = dir.dy;
      } else {
        e.dx = -e.dx; // boxed in (only in the wrap seam): turn around
        e.dy = -e.dy;
      }
    });
  }

  function resolveContacts() {
    if (game.mode !== "play") return;
    for (const ghost of ghosts) {
      if (ghost.mode !== "roam") continue;
      const dist = Math.abs(ghost.fx - pac.fx) + Math.abs(ghost.fy - pac.fy);
      if (dist > 0.65) continue;
      if (ghost.frightened > 0) {
        // The eating chain doubles per ghost within one energizer.
        game.chain = Math.min(3, game.chain + 1);
        const points = 100 * Math.pow(2, game.chain);
        game.score += points;
        if (game.score > game.high) game.high = game.score;
        game.floaties.push({ fx: ghost.fx, fy: ghost.fy, text: String(points), t: 1000 });
        ghost.mode = "eyes";
        ghost.frightened = 0;
        ghost.dx = -ghost.dx;
        ghost.dy = -ghost.dy;
      } else {
        game.mode = "dying";
        game.modeMs = 0;
        return;
      }
    }
  }

  // --- drawing ------------------------------------------------------------------

  function centered(px, py) {
    return { x: px * CELL, y: HUD_TOP + py * CELL };
  }

  function draw() {
    const palette = readPalette(doc);
    const blink = !reduced && Math.floor(performance.now() / 250) % 2 === 0;

    brush.fillStyle = palette.wallFill;
    brush.fillRect(0, 0, canvas.width, canvas.height);

    // The maze: the corridor-facing wall edges draw the classic blue lattice.
    brush.lineWidth = 2;
    brush.lineCap = "round";
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = grid[y][x];
        if (cell === "#") drawWallTile(x, y, palette);
        if (cell === ".") {
          brush.fillStyle = palette.pellet;
          brush.beginPath();
          brush.arc((x + 0.5) * CELL, HUD_TOP + (y + 0.5) * CELL, 2, 0, Math.PI * 2);
          brush.fill();
        }
        if (cell === "o" && (blink || reduced)) {
          brush.fillStyle = palette.pellet;
          brush.beginPath();
          brush.arc((x + 0.5) * CELL, HUD_TOP + (y + 0.5) * CELL, CELL * 0.3, 0, Math.PI * 2);
          brush.fill();
        }
      }
    }
    // The door: the pale bar ghosts glide through.
    brush.fillStyle = "pink";
    brush.fillRect(13 * CELL, HUD_TOP + (12 + 0.35) * CELL, 2 * CELL, 3);

    if (game.fruit) drawFruit(14.0 * CELL, HUD_TOP + 17.5 * CELL);

    if (game.mode === "dying") drawPacDying();
    else drawPac();
    for (const ghost of ghosts) drawGhost(ghost, palette, blink);

    brush.font = "700 13px monospace";
    brush.textAlign = "center";
    for (const floaty of game.floaties) {
      brush.fillStyle = "white";
      brush.fillText(floaty.text, floaty.fx * CELL, HUD_TOP + (floaty.fy - 0.6) * CELL);
    }

    drawHud(palette, blink);
  }

  function drawWallTile(x, y, palette) {
    brush.fillStyle = palette.wallFill;
    brush.fillRect(x * CELL, HUD_TOP + y * CELL, CELL, CELL);
    brush.strokeStyle = palette.wallLine;
    brush.beginPath();
    const px = x * CELL;
    const py = HUD_TOP + y * CELL;
    if (pacPassable(grid, x, y - 1)) {
      brush.moveTo(px, py);
      brush.lineTo(px + CELL, py);
    }
    if (pacPassable(grid, x, y + 1)) {
      brush.moveTo(px, py + CELL);
      brush.lineTo(px + CELL, py + CELL);
    }
    if (pacPassable(grid, x - 1, y)) {
      brush.moveTo(px, py);
      brush.lineTo(px, py + CELL);
    }
    if (pacPassable(grid, x + 1, y)) {
      brush.moveTo(px + CELL, py);
      brush.lineTo(px + CELL, py + CELL);
    }
    brush.stroke();
  }

  function drawFruit(cx, cy) {
    brush.fillStyle = "red";
    brush.beginPath();
    brush.arc(cx - 4, cy, 4, 0, Math.PI * 2);
    brush.arc(cx + 4, cy, 4, 0, Math.PI * 2);
    brush.fill();
    brush.strokeStyle = "green";
    brush.lineWidth = 2;
    brush.beginPath();
    brush.moveTo(cx, cy - 4);
    brush.quadraticCurveTo(cx + 2, cy - 11, cx + 8, cy - 12);
    brush.stroke();
  }

  function drawPac() {
    const { x, y } = centered(pac.fx, pac.fy);
    const r = CELL * 0.45;
    const facing = Math.atan2(pac.dy, pac.dx);
    const wide = reduced ? 0.35 : 0.06 + 0.29 * Math.abs(Math.sin(pac.mouth));
    brush.fillStyle = "gold";
    brush.beginPath();
    brush.moveTo(x, y);
    brush.arc(x, y, r, facing + wide * Math.PI, facing - wide * Math.PI + Math.PI * 2);
    brush.fill();
  }

  function drawPacDying() {
    const { x, y } = centered(pac.fx, pac.fy);
    const t = Math.min(1, game.modeMs / (DIE_MS * 0.8));
    // The wedge opens from a chomp to a full circle, then he is gone.
    const angle = Math.PI * Math.min(1, t * 1.25);
    const r = CELL * 0.45 * (t < 0.8 ? 1 : Math.max(0.02, 1 - (t - 0.8) / 0.2));
    if (t >= 0.8 && r <= 0.05) return;
    brush.fillStyle = "gold";
    brush.beginPath();
    brush.moveTo(x, y);
    brush.arc(x, y, r, angle, -angle + Math.PI * 2);
    brush.fill();
  }

  function drawGhost(ghost, palette, blink) {
    const x = ghost.fx * CELL;
    const y = HUD_TOP + ghost.fy * CELL;
    const r = CELL * 0.45;
    if (ghost.mode === "eyes" || ghost.mode === "entering") {
      drawGhostEyes(x, y, ghost);
      return;
    }
    const frightened = ghost.frightened > 0;
    const flashWhite = frightened && game.fright < 2000 && blink;
    brush.fillStyle = flashWhite ? "#eaeaff" : (frightened ? "royalblue" : ghost.color);
    brush.beginPath();
    brush.arc(x, y - r * 0.1, r, Math.PI, 0);
    const skirt = reduced ? 2 : 3;
    const wave = Math.floor(performance.now() / 120) % 2 === 0;
    brush.lineTo(x + r, wave ? y + r * 0.9 : y + r * 0.7);
    for (let i = skirt - 1; i >= 0; i--) {
      const waveX = x - r + (2 * r * i) / skirt;
      brush.lineTo(waveX, (i % 2 === 0) === wave ? y + r * 0.9 : y + r * 0.5);
    }
    brush.closePath();
    brush.fill();
    if (frightened) {
      // The frightened face: pale dot eyes and the flat worried mouth.
      brush.fillStyle = flashWhite ? "red" : "white";
      for (const off of [-4.5, 4.5]) {
        brush.beginPath();
        brush.arc(x + off, y - 3, 1.8, 0, Math.PI * 2);
        brush.fill();
      }
      brush.fillStyle = flashWhite ? "red" : "white";
      brush.fillRect(x - 5, y + 2, 10, 2);
    } else {
      drawGhostEyes(x, y, ghost);
    }
  }

  function drawGhostEyes(x, y, ghost) {
    brush.fillStyle = "white";
    for (const off of [-4, 4]) {
      brush.beginPath();
      brush.ellipse(x + off, y - 2, 3.4, 4.2, 0, 0, Math.PI * 2);
      brush.fill();
    }
    brush.fillStyle = "royalblue";
    for (const off of [-4, 4]) {
      brush.beginPath();
      brush.arc(x + off + (ghost.dx || 0) * 2, y - 2 + (ghost.dy || 0) * 2, 1.8, 0, Math.PI * 2);
      brush.fill();
    }
  }

  function drawHud(palette, blink) {
    brush.fillStyle = palette.ink;
    brush.textAlign = "left";
    brush.font = "700 14px monospace";
    brush.fillText("SCORE", 8, 22);
    brush.fillText(String(game.score), 8, 42);
    brush.textAlign = "center";
    brush.fillText("HIGH SCORE", canvas.width / 2, 22);
    brush.fillText(String(game.high), canvas.width / 2, 42);
    brush.textAlign = "right";
    brush.fillText("LEVEL " + game.level, canvas.width - 8, 22);

    // Lives ride the bottom strip as little wedges; the fruit tally beside.
    for (let i = 0; i < game.lives; i++) {
      const lx = 22 + i * 28;
      const ly = HUD_TOP + ROWS * CELL + 30;
      brush.fillStyle = "gold";
      brush.beginPath();
      brush.moveTo(lx, ly);
      brush.arc(lx, ly, 9, Math.PI * 0.25, -Math.PI * 0.25 + Math.PI * 2);
      brush.fill();
    }
    drawFruit(canvas.width - 16, HUD_TOP + ROWS * CELL + 30);

    brush.textAlign = "center";
    brush.fillStyle = palette.pellet;
    brush.font = "700 16px monospace";
    if (game.mode === "ready") {
      brush.fillText("READY!", canvas.width / 2, HUD_TOP + 17.5 * CELL);
      hint.textContent = "Arrows or W A S D steer. The tunnels wrap and the ghosts have real brains.";
    } else if (game.mode === "over") {
      brush.fillStyle = "pink";
      brush.fillText("GAME OVER", canvas.width / 2, HUD_TOP + 17.5 * CELL);
      hint.textContent = "Game over — score " + game.score + ". Press Enter for a new game.";
    } else if (game.mode === "flash") {
      if (blink) {
        brush.fillStyle = "rgba(255, 255, 255, 0.2)";
        brush.fillRect(0, HUD_TOP, canvas.width, ROWS * CELL);
      }
      hint.textContent = "Maze cleared — level " + (game.level + 1) + " incoming.";
    } else if (game.fright > 0) {
      hint.textContent = "They turned blue — EAT THEM.";
    } else {
      hint.textContent = "Blinky hunts, Pinky ambushes, Inky flanks, Clyde shys at eight tiles.";
    }
    scoreLine.textContent = "Score " + game.score + " — lives " + game.lives + " — dots left " + game.dotsLeft;
  }

  // --- keyboard: the arrows and W A S D steer; Enter restarts after a loss --
  const KEYS = {
    ArrowUp: DIRS.up, w: DIRS.up, W: DIRS.up,
    ArrowDown: DIRS.down, s: DIRS.down, S: DIRS.down,
    ArrowLeft: DIRS.left, a: DIRS.left, A: DIRS.left,
    ArrowRight: DIRS.right, d: DIRS.right, D: DIRS.right,
  };
  canvas.addEventListener("keydown", (event) => {
    if (game.mode === "over" && event.key === "Enter") {
      startGame();
      return;
    }
    const dir = KEYS[event.key];
    if (!dir) return;
    event.preventDefault(); // the arrows must never scroll the page behind it
    pac.wanted = dir;
    if (pac.dx === 0 && pac.dy === 0) {
      // Standing still (fresh spawn): the buffered turn starts him the
      // moment it is legal.
      const cx = Math.floor(pac.fx);
      const cy = Math.floor(pac.fy);
      if (pacPassable(grid, cx + dir.dx, cy + dir.dy)) {
        pac.dx = dir.dx;
        pac.dy = dir.dy;
        pac.wanted = null;
      }
    }
  });

  startGame();
  timer = win.setTimeout(tick, TICK_MS);
  draw();
  return dialog;
}

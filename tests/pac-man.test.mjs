// The Wempo egg (owner's direct ask): FIVE door clicks inside the window
// open a WORKING game of Pac-Man out of public/js/pac-man.js — canvas render,
// arrow/WASD steering, pellet economy, lives, and ghost AI at the sane depth.
// House rules pinned: no innerHTML anywhere, the real action never breaks
// (the hash lands on #/ on EVERY click), and every timer dies on close.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const js = (p) => readFileSync(path.join(ROOT, p), "utf8");
const GAME = js("public/js/pac-man.js");
const APP = js("public/js/routes/app.js");
const CSS = js("public/styles.css");

const MAZE_SRC = GAME.slice(GAME.indexOf("const MAZE = ["), GAME.indexOf("];", GAME.indexOf("const MAZE = [")));
const MAZE = [...MAZE_SRC.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

test("the maze is playable: uniform rows, walled border, every corridor reachable", () => {
  assert.equal(MAZE.length, 13, "13 rows");
  for (const row of MAZE) assert.equal(row.length, 13, "every row is 13 wide");
  for (const cell of MAZE[0] + MAZE[12]) assert.equal(cell, "#", "the top and bottom rails are solid wall");
  for (const row of MAZE) {
    assert.equal(row[0], "#", "left wall");
    assert.equal(row[12], "#", "right wall");
  }
  // Reachability (BFS from the start cell): every '.' and 'o' must be
  // walkable FROM Pac's start — an unreachable pellet can never be eaten and
  // the maze can never be cleared.
  const start = [1, 6]; // [y, x] — MAZE[6][1] is Pac's cell
  const seen = new Set(["1,6"]);
  const queue = [[1, 6]];
  while (queue.length > 0) {
    const [y, x] = queue.shift();
    for (const [dy, dx] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const ny = y + dy;
      const nx = x + dx;
      const key = ny + "," + nx;
      if (seen.has(key) || ny < 0 || ny >= MAZE.length || nx < 0 || nx >= 13) continue;
      if (MAZE[ny][nx] === "#") continue;
      seen.add(key);
      queue.push([ny, nx]);
    }
  }
  for (let y = 0; y < MAZE.length; y++) {
    for (let x = 0; x < 13; x++) {
      if (MAZE[y][x] === "." || MAZE[y][x] === "o") {
        assert.ok(seen.has(y + "," + x), "the pellet at row " + y + " col " + x + " is reachable (seen: " + seen.has(y + "," + x) + ")");
      }
    }
  }
  assert.ok(MAZE.some((row) => row.includes("o")), "power pellets exist");
  // Ghost homes are reachable open lanes, never inside a wall pocket.
  for (const [gx, gy] of [[6, 1], [6, 4], [11, 6]]) {
    assert.ok(MAZE[gy][gx] !== "#", "ghost home at col " + gx + " row " + gy + " is open");
    assert.ok(seen.has(gy + "," + gx), "ghost home at col " + gx + " row " + gy + " is reachable");
  }
});

test("the AI is the sane depth: targeting, the no-reverse rule, and a real flee", () => {
  assert.match(GAME, /function chooseGhostDir\(ghost, target, walkable\) \{[\s\S]*?Math\.abs\(ghost\.x \+ dir\.dx - target\.x\)/,
    "chase steers to the nearest open neighbor of the target");
  assert.match(GAME, /!\(ghost\.dx === -dir\.dx && ghost\.dy === -dir\.dy\) \|\|\s*options\.length === 1/,
    "no reverse at an intersection; a dead end may");
  assert.match(GAME, /function chooseFleeDir\(ghost, threat, walkable\) \{[\s\S]*?dist > bestDist/,
    "frightened ghosts maximize distance — the flee is real");
  assert.match(GAME, /scatterTicks: 26/, "the scatter schedule is per-ghost, so the pack doesn't clump");
  assert.match(GAME, /state\.tick % 90 < ghost\.scatterTicks/, "scatter alternates with chase");
  assert.match(GAME, /FRIGHTENED_TICKS = 40/, "the power pellet buys a window, not a permanent flee");
});

test("the game loop: pellet economy, lives, and the frame is torn down on close", () => {
  assert.doesNotMatch(GAME, /\.innerHTML/, "CSP-safe DOM only");
  assert.match(GAME, /import \{ el \} from "\.\/dom\.js";/);
  assert.match(GAME, /state\.score \+= 10;/, "the pellet");
  assert.match(GAME, /state\.score \+= 50;/, "the power pellet");
  assert.match(GAME, /state\.score \+= 200;/, "the ghost");
  assert.match(GAME, /state\.lives -= 1;/, "contact costs a life");
  assert.match(GAME, /ghost\.frightened > 0\)[\s\S]*?ghost\.x = GHOSTS\.find\(\(home\) => home\.color === ghost\.color\)\.x;/,
    "an eaten ghost respawns at home");
  assert.match(GAME, /event\.preventDefault\(\); \/\/ the arrows must never scroll the page behind it/,
    "the arrows are captured on the canvas keydown");
  assert.match(GAME, /dialog\.addEventListener\("close", stop\);/, "the close event stops the loop");
  assert.match(GAME, /if \(timer\) win\.clearTimeout\(timer\);\s*timer = 0;/, "the teardown is real");
  assert.match(GAME, /event\.target === dialog\) dialog\.close\(\);/, "a backdrop click closes");
  assert.match(GAME, /Maze cleared/, "a clear ends the game with a message");
  assert.match(GAME, /Game over/, "a last life ends it too");
});

test("the door wiring: FIVE clicks opens the arcade, the hash lands on #/ on EVERY click", () => {
  const counters = APP.slice(
    APP.indexOf("const EGG_CLICKS = 5;"),
    APP.indexOf("let eggTimer = 0;") + 20,
  );
  assert.match(counters, /EGG_CLICKS = 5;/);
  assert.match(counters, /EGG_WINDOW_MS = 4000;/);
  const wiring = APP.slice(
    APP.indexOf("if (eggClicks >= EGG_CLICKS) {"),
    APP.indexOf("openPacMan(doc, win);", APP.indexOf("if (eggClicks >= EGG_CLICKS) {")) + 30,
  );
  assert.match(wiring, /eggClicks = 0;/, "the rush resets");
  assert.match(wiring, /win\.clearTimeout\(eggTimer\);/, "the window timer cancels");
  const click = APP.slice(
    APP.indexOf("home.addEventListener(\"click\", () => {"),
    APP.indexOf("eggClicks += 1;") + 20,
  );
  assert.ok(
    click.includes("win.location.hash") && click.indexOf("win.location.hash") < click.indexOf("eggClicks += 1"),
    "the real navigation happens BEFORE the egg count — a slow clicker just lands home",
  );
  assert.match(APP, /import \{ openPacMan \} from "\.\.\/pac-man\.js";/);
});

test("the arcade chrome rides the dialog idiom, tokens only", () => {
  const block = CSS.slice(CSS.indexOf(".pac-man-dialog {"));
  assert.match(block, /border: 2px solid var\(--line\);/, "the canvas keeps the panel border idiom");
  assert.doesNotMatch(
    CSS.slice(CSS.indexOf("/* The Pac-Man egg"), CSS.indexOf(".composer .composer-actions {")),
    /#[0-9a-fA-F]{3,8}\b/, "no raw hex");
  assert.match(GAME.slice(GAME.indexOf("function readPalette")), /getPropertyValue\(name/,
    "the maze palette reads the live theme tokens — the game renders in any skin");
  assert.match(GAME.slice(GAME.indexOf("function readPalette")), /read\("--line", "gray"\)/);
});

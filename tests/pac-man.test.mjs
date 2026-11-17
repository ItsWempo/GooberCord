// The Wempo egg (owner's ruling: "A ACTUAL EMBED … WITH THE REAL DEAL"):
// public/js/pac-man.js is a faithful arcade Pac-Man — the classic 28x31
// board (exactly 240 pellets + 4 corner energizers, tunnels at row 14 with
// wrap), the four ghosts with their actual targeting and the scatter/chase
// wave schedule, the house release order, Blinky's Elroy push, the fruit,
// and the score/lives/READY!/death machinery. House rules pinned: no
// innerHTML anywhere, the five-click door wiring never breaks, and every
// timer dies on close.
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

const MAZE_SRC = GAME.slice(GAME.indexOf("const MAZE = ["), GAME.indexOf('];', GAME.indexOf("const MAZE = [")));
const MAZE = [...MAZE_SRC.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

test("the board is the classic 28x31: mirrored, exactly 240 pellets + 4 corner energizers", () => {
  assert.equal(MAZE.length, 31, "31 rows");
  for (const row of MAZE) assert.equal(row.length, 28, "every row is 28 wide");
  // The horizontally mirrored board: row r equals its own reverse.
  for (const row of MAZE) assert.equal(row, [...row].reverse().join(""), "the board mirrors");
  let dots = 0;
  let energizers = 0;
  for (const row of MAZE) for (const cell of row) {
    if (cell === ".") dots += 1;
    if (cell === "o") energizers += 1;
  }
  assert.equal(dots, 240, "the arcade's exact pellet count");
  assert.equal(energizers, 4, "one energizer in each corner pocket");
  for (const row of [MAZE[3], MAZE[23]]) {
    assert.equal(row[1], "o", "a left-edge energizer");
    assert.equal(row[26], "o", "a right-edge energizer");
  }
  // Tunnels: row 14 is open at BOTH edges and carries no dots.
  assert.equal(MAZE[14][0], " ", "the left tunnel mouth is open");
  assert.equal(MAZE[14][27], " ", "the right tunnel mouth is open");
  assert.ok(!MAZE[14].includes("."), "the tunnel row is pellet-free");
  // The ghost house: walls with the two-tile door at row 12, cols 13-14.
  assert.equal(MAZE[12][13], "-", "the door's left tile");
  assert.equal(MAZE[12][14], "-", "the door's right tile");
  const house = MAZE.slice(12, 17).map((row) => row.slice(10, 18));
  assert.ok(house.every((row) => row[0] === "#" || row[1] === "#"), "the house's left wall holds");
  for (const row of [MAZE[13], MAZE[14], MAZE[15]]) assert.equal(row[10], "#", "house side wall");
});

test("every pellet is reachable from Pac-Man's start, the house stays sealed", () => {
  const passable = (x, y) =>
    y >= 0 && y < MAZE.length && x >= 0 && x < 28 && MAZE[y][x] !== "#" && MAZE[y][x] !== "-";
  const seen = new Set(["14,23"]);
  const queue = [[14, 23]];
  while (queue.length > 0) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = nx + "," + ny;
      if (seen.has(key) || !passable(nx, ny)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  for (let y = 0; y < MAZE.length; y++) {
    for (let x = 0; x < 28; x++) {
      if (MAZE[y][x] === "." || MAZE[y][x] === "o") {
        assert.ok(seen.has(x + "," + y), "the pellet at col " + x + " row " + y + " is reachable");
      }
    }
  }
  // And the reverse: the house interior (the ghosts' seats) is sealed from
  // Pac-Man — only the door lane (which he cannot pass) leads in.
  for (const [hx, hy] of [[12, 14], [16, 14], [14, 13]]) {
    assert.ok(!seen.has(hx + "," + hy), "the house interior at col " + hx + " row " + hy + " is not Pac-walkable");
  }
  assert.ok(seen.has("13,11"), "the house ring above the door IS walkable");
});

test("the four ghosts have their actual arcade targeting", () => {
  assert.match(GAME, /if \(ghost\.name === "blinky"\) return \{ x: px, y: py \}; \/\/ directly at Pac-Man/,
    "Blinky: Pac-Man's tile");
  assert.match(GAME, /if \(ghost\.name === "pinky"\) \{[\s\S]*?x: px \+ pac\.dx \* 4, y: py \+ pac\.dy \* 4/,
    "Pinky: four tiles ahead of Pac-Man");
  assert.match(GAME, /const pivot = \{ x: px \+ pac\.dx \* 2, y: py \+ pac\.dy \* 2 \};[\s\S]*?pivot\.x \* 2 - Math\.floor\(blinky\.fx\)/,
    "Inky: Blinky mirrored through the two-ahead pivot");
  assert.match(GAME, /dist > 8 \? \{ x: px, y: py \} : ghost\.corner/,
    "Clyde: chase when far, scatter corner within eight tiles");
  assert.match(GAME, /if \(ghost\.frightened > 0\) return pool\[Math\.floor\(Math\.random\(\) \* pool\.length\)\]\[1\];/,
    "frightened ghosts take a random open passage");
  assert.match(GAME, /const noReverse = options\.filter\(\(\[, dir\]\) => !\(ghost\.dx === -dir\.dx && ghost\.dy === -dir\.dy\)\);/,
    "the no-reverse steering rule");
});

test("the wave schedule, the release order, and the Cruise Elroy are the arcade's numbers", () => {
  assert.match(GAME, /\[\[7, "scatter"\], \[20, "chase"\], \[7, "scatter"\], \[20, "chase"\], \[5, "scatter"\], \[20, "chase"\], \[5, "chase"\]\]/,
    "the level-1 scatter/chase waves");
  assert.match(GAME, /const RELEASE_DOTS = \[0, 30, 60\];/, "Pinky immediately, Inky at 30, Clyde at 60");
  assert.match(GAME, /if \(game\.dotsThisLife >= ghost\.release\)/, "the release rides the per-life dot counter");
  assert.match(GAME, /const ELROY_DOTS = 20;/);
  assert.match(GAME, /ghost\.name === "blinky" && game\.dotsLeft <= ELROY_DOTS/,
    "Blinky pushes past Pac speed on the last pellets");
  assert.match(GAME, /Math\.floor\(ghost\.fy\) === 14 && \(ghost\.fx < 5\.5 \|\| ghost\.fx > 22\.5\)/,
    "the tunnel-half slowdown zone");
  assert.match(GAME, /if \(ghost\.mode !== "roam"\) continue;[\s\S]*?ghost\.dx = -ghost\.dx;/,
    "mode flips force the reversal");
});

test("score, lives, and the machine: READY!, the death wedge, tunnels, buffer, and fruit", () => {
  assert.doesNotMatch(GAME, /\.innerHTML/, "CSP-safe module");
  assert.doesNotMatch(GAME, /\.cssText|setAttribute\("style"/, "no style-attribute strings");
  assert.match(GAME, /import \{ el \} from "\.\/dom\.js";/);
  assert.match(GAME, /game\.score \+= cell === "o" \? 50 : 10;/, "the pellet economy");
  assert.match(GAME, /100 \* Math\.pow\(2, game\.chain\)/, "the eating chain doubles: 200-1600");
  assert.match(GAME, /Math\.pow\(2, game\.chain\)[\s\S]{0,200}ghost\.mode = "eyes";/,
    "an eaten ghost leaves as eyes");
  assert.match(GAME, /e\.mode === "eyes" && cx === 13 && cy === 11/, "the eyes find the door");
  assert.match(GAME, /e\.mode = "entering"; \/\/ the descent is scripted from here/);
  assert.match(GAME, /game\.lives -= 1;/, "contact costs a life");
  assert.match(GAME, /const READY_MS = 2000;/, "the READY! beat");
  assert.match(GAME, /brush\.fillText\("READY!"/, "the READY! text renders");
  assert.match(GAME, /brush\.fillText\("GAME OVER"/, "game over renders");
  assert.match(GAME, /const DIE_MS = 1400;/, "the death animation beat");
  assert.match(GAME, /if \(e\.fx < -0\.5\) e\.fx \+= COLS;/, "the tunnel wrap");
  assert.match(GAME, /pac\.wanted = dir;/, "the buffered turn input");
  assert.match(GAME, /game\.mode === "over" && event\.key === "Enter"/, "Enter restarts a lost game");
  assert.match(GAME, /const FRUIT_DOTS = \[70, 170\];/, "the fruit shows at 70 and 170 dots");
  assert.match(GAME, /event\.preventDefault\(\); \/\/ the arrows must never scroll the page behind it/);
  assert.match(GAME, /dialog\.addEventListener\("close", stop\);/, "the close event stops the loop");
  assert.match(GAME, /if \(timer\) win\.clearTimeout\(timer\);[\s\S]*?timer = 0;/, "the teardown is real");
  assert.match(GAME, /event\.target === dialog\) dialog\.close\(\);/, "a backdrop click closes");
  assert.match(GAME, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/,
    "reduced motion is read once — the game stays playable, calmed only");
  assert.match(GAME, /getPropertyValue\(name/, "the palette reads the live theme tokens");
  assert.match(GAME, /read\("--focus", "#2121de"\)/, "the wall line rides --focus");
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
  assert.match(GAME, /export function openPacMan\(doc, win\)/, "the wiring contract holds");
});

test("the arcade chrome rides the dialog idiom, tokens only", () => {
  assert.doesNotMatch(
    CSS_BLOCK(),
    /#[0-9a-fA-F]{3,8}\b/, "no raw hex in the arcade dialog block");
  assert.match(CSS_BLOCK(), /border: 2px solid var\(--line\);/, "the canvas keeps the panel border idiom");
});

function CSS_BLOCK() {
  const css = readFileSync(path.join(ROOT, "public/styles.css"), "utf8");
  return css.slice(css.indexOf(".pac-man-dialog {"), css.indexOf(".konami-piece {"));
}

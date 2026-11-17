// The Discord skin fidelity pass (the owner's "AND DISCORD DOESNT LOOK LIKE
// DISCORD"): the chrome surfaces re-skin by token, and the dark palette is
// Discord's documented values with teeth — rail #1e1f22, sidebar + member
// panel #2b2d31, chat #313338, composer bar #383a40, muted #b5bac1.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const CSS = readFileSync(path.join(ROOT, "public/styles.css"), "utf8");

function blockOf(selector, from = 0) {
  const start = CSS.indexOf(selector, from);
  if (start < 0) return "";
  const open = CSS.indexOf("{", start);
  return CSS.slice(open + 1, CSS.indexOf("}", open));
}

// The BASE surface block (the first occurrence of .gc-aside/.gc-main sits in
// the mobile grid query, which carries no background): walk to the occurrence
// whose block actually declares a background.
function surfaceBlock(selector) {
  let from = 0;
  for (let i = 0; i < 8; i++) {
    const block = blockOf(selector, from);
    if (block.includes("background:")) return block;
    from = CSS.indexOf(selector, from) + 1;
    if (from <= 0) return "";
  }
  return "";
}

const brandDark = CSS.indexOf(':root[data-theme="dark"]');
const brandAuto = CSS.indexOf('@media (prefers-color-scheme: dark)');
const skinLight = CSS.indexOf(':root[data-skin="discord"] {');
const skinDark = CSS.indexOf(':root[data-skin="discord"][data-theme="dark"]');
const skinAuto = CSS.indexOf(':root[data-skin="discord"]:not([data-theme="light"])');

test("the chrome surfaces are tokens, and every theme block carries them", () => {
  // Light brand keeps the literal look the components rode before the pass.
  const lightRoot = CSS.slice(CSS.indexOf(":root {"), CSS.indexOf(':root[data-theme="dark"]'));
  for (const [token, light] of [
    ["--rail-bg", "#e5d7bc"], ["--sidebar-bg", "#fffaf0"],
    ["--chat-bg", "#f7efdc"], ["--composer-bg", "#fffaf0"],
  ]) {
    assert.ok(lightRoot.includes(token + ": " + light),
      token + " opens the :root block with the brand light literal " + light);
  }
  for (const at of [brandDark, brandAuto, skinDark, skinAuto]) {
    assert.ok(at > 0, "the block exists");
  }
  for (const at of [brandDark, brandAuto]) {
    const block = blockOf(":root", at);
    for (const [token, dark] of [["--rail-bg", "#0c1219"], ["--sidebar-bg", "#1d2836"],
      ["--chat-bg", "#131b27"], ["--composer-bg", "#1d2836"]]) {
      assert.ok(block.includes(token + ": " + dark), "brand dark carries " + token + " = " + dark);
    }
  }
  for (const at of [skinDark, skinAuto]) {
    const block = blockOf(":root", at);
    for (const [token, value] of [["--rail-bg", "#1e1f22"], ["--sidebar-bg", "#2b2d31"],
      ["--chat-bg", "#313338"], ["--composer-bg", "#383a40"], ["--muted", "#b5bac1"]]) {
      assert.ok(block.includes(token + ": " + value), "discord dark carries " + token + " = " + value);
    }
  }
  const light = blockOf(":root", skinLight);
  for (const [token, value] of [["--rail-bg", "#e3e5e8"], ["--sidebar-bg", "#f2f3f5"],
    ["--chat-bg", "#ffffff"], ["--composer-bg", "#ebedef"]]) {
    assert.ok(light.includes(token + ": " + value), "discord light carries " + token + " = " + value);
  }
});

test("the surfaces consume the tokens (brand values unchanged, skin values Discord's)", () => {
  assert.match(blockOf(".gc-rail {"), /background: var\(--rail-bg\);/);
  assert.match(surfaceBlock(".gc-sidebar {"), /background: var\(--sidebar-bg\);/);
  assert.match(surfaceBlock(".gc-main {"), /background: var\(--chat-bg\);/);
  assert.match(surfaceBlock(".gc-aside {"), /background: var\(--sidebar-bg\);/,
    "the member panel layers with the channel sidebar, Discord's #2b2d31 pair");
  assert.match(surfaceBlock(".composer-box {"), /background: var\(--composer-bg\);/);
});

test("the skin's chrome idiom: color steps not rings, one borderless composer bar", () => {
  const idiom = CSS.slice(CSS.indexOf("The Discord skin's chrome idiom"), CSS.indexOf("/* Brand skin token"));
  for (const sel of [".gc-rail", ".gc-sidebar", ".gc-aside"]) {
    assert.match(idiom, new RegExp(":root\\[data-skin=\"discord\"\\] " + sel.replace(".", "\\.") + ",?"),
      sel + " drops its brand ring in the skin");
  }
  assert.match(idiom, /border-color:\s*transparent;/);
  assert.match(idiom, /\.server-button \{[\s\S]*?border-color: transparent;/,
    "the server tiles are borderless circles at rest");
  assert.match(idiom, /\.server-button\[aria-current="true"\],[\s\S]*?border-color: var\(--blue\);/,
    "selection keeps the border-color idiom (blurple in-skin) — the tripwire idiom survives");
  const box = blockOf(':root[data-skin="discord"] .composer-box {');
  assert.match(box, /border-color:\s*transparent;/);
  assert.match(box, /box-shadow:\s*none;/, "the offset plate dies in the skin");
  assert.match(box, /border-radius:\s*0\.5rem;/, "one uniform Discord bar");
  assert.match(blockOf(':root[data-skin="discord"] .composer-box > .composer-input {'), /background:\s*transparent;/,
    "the bar IS the input — no sunken field inside it");
});

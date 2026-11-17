// The stylesheet lint: public/styles.css must keep its braces balanced.
// The social/coins batch merge once dropped a block's closing `}` (the
// .shop-ledger-date rule), which nested EVERY following rule inside it —
// the friends-hub, reactions, visibility, and later sections silently
// stopped applying. Parsing never failed and no test caught it, so the
// balance is now structural: one open must have exactly one close.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const stylesheet = path.join(here, "..", "public", "styles.css");

test("styles.css braces balance — a dropped close must never swallow whole sections again", async () => {
  const css = await readFile(stylesheet, "utf8");
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutStrings = withoutComments.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, "");
  let depth = 0;
  let line = 1;
  for (const character of withoutStrings) {
    if (character === "\n") line++;
    if (character === "{") depth++;
    if (character === "}") {
      depth--;
      assert.ok(depth >= 0, `extra } at line ${line}`);
    }
  }
  assert.equal(depth, 0, "unclosed { — blocks after it are swallowed");
});

test("mobile app shell keeps the chat pane out of the narrow server-rail column", async () => {
  const css = await readFile(stylesheet, "utf8");
  const start = css.indexOf("@media (max-width: 719px)");
  const end = css.indexOf("/* --- aside:", start);
  assert.ok(start >= 0 && end > start, "mobile app-shell breakpoint exists");
  const mobile = css.slice(start, end);

  assert.match(mobile, /\.gc-rail\s*\{[^}]*grid-column:\s*1/s);
  assert.match(mobile, /\.gc-rail\s*\{[^}]*grid-row:\s*1/s);
  assert.match(mobile, /\.gc-main\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(mobile, /\.gc-main\s*\{[^}]*grid-row:\s*2/s);
  assert.match(mobile, /\.gc-aside\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(mobile, /\.gc-aside\s*\{[^}]*grid-row:\s*3/s);
});

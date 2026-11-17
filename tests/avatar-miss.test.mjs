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

// The avatar 404 book (the owner's live-log ride-along): a 404 avatar settles
// into the placeholder and STOPS refetching — the miss is remembered for the
// session, so the presence re-renders that rebuild the user panel keep the
// initials instead of re-firing the same failing request.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const js = (p) => readFileSync(path.join(ROOT, p), "utf8");
const HELPERS = js("public/js/ui-helpers.js");
const APP = js("public/js/routes/app.js");

test("the miss book: a remembered 404 is answered for the session, a fresh run starts empty", () => {
  const block = HELPERS.slice(
    HELPERS.indexOf("export function createAvatarMisses"),
    HELPERS.indexOf("// --- phase-3: spoiler-channel"),
  );
  assert.ok(block.includes("export function createAvatarMisses"), "the factory exists");
  assert.match(block, /const misses = new Set\(\);/);
  assert.match(block, /missed\(url\) \{[\s\S]*?misses\.has\(String\(url\)\)/,
    "reads coerce through the same String() the writes use");
  assert.match(block, /remember\(url\) \{[\s\S]*?misses\.add\(String\(url\)\)/,
    "writes keep the session-local Set");
});

test("the user panel consults the book BEFORE building the <img>", () => {
  const panel = APP.slice(
    APP.indexOf("function renderUserPanel(doc, win, userPanel) {"),
    APP.indexOf("const identity = el(\"button\", {"),
  );
  assert.match(panel, /if \(me\.avatarUrl && !avatarMisses\.missed\(me\.avatarUrl\)\) \{/,
    "the gate: an already-404ed URL never builds the failing <img> again");
  assert.match(panel, /shot\.addEventListener\("error", \(\) => \{\s*avatarMisses\.remember\(me\.avatarUrl\);\s*avatar\.textContent = initials\(me\.username\);\s*\}\);/,
    "the error settles the avatar into the initials at the same moment it's remembered");
});

test("the book is ONE session-scoped instance beside the app caches", () => {
  const tail = APP.slice(APP.indexOf("// App-scoped caches"), APP.indexOf("// viewerCan(viewer, name)"));
  assert.match(tail, /const avatarMisses = createAvatarMisses\(\);/,
    "module-level so route re-renders share the book (like the other app caches)");
  assert.match(tail, /One per app run|one per app run/, "the fresh-run reset is said where the reader looks");
  assert.match(
    APP.slice(APP.indexOf("import {\n  BLOCKED_VISITOR_ACK_KEY"), APP.indexOf("} from \"../ui-helpers.js\";")),
    /createAvatarMisses/,
    "the import rides the helpers' alphabetized list",
  );
});

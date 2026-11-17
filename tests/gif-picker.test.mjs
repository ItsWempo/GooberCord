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

// The GIF picker (the Tenor lane, the wave's pick ruling): the pick pastes
// the media URL as TEXT, the render side unfurls a panel under the text,
// and every image byte — tile AND panel — rides the same-origin proxy
// route (img-src 'self' admits only self; the src can never be raw). This
// file pins the allowlist mirror, the body finder, the dialog's contract,
// and the app.js integration: the Goober+ button gate and the embed pass.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  GIF_PAGE_LIMIT,
  MAX_GIF_PANELS,
  tenorMediaUrl,
  gifProxySrc,
  tenorUrlsInBody,
} from "../public/js/gifs.js";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const APP = readFileSync(path.join(ROOT, "public/js/routes/app.js"), "utf8");
const MODULE = readFileSync(path.join(ROOT, "public/js/gifs.js"), "utf8");

test("the allowlist mirror: https + tenor.com or a subdomain, exactly the backend rule", () => {
  // The backend's api/gifs.mjs tenorMediaUrl is the authority; the client
  // mirror decides only what a body UNFURLS. Same rule, same refusals.
  for (const good of [
    "https://media.tenor.com/aBcD/word.gif",
    "https://media1.tenor.com/aBcD/pic.png",
    "https://tenor.com/view/clip-1234567890",
    "https://media.tenor.com/view/x.gif",
  ]) {
    assert.ok(tenorMediaUrl(good) !== null, "admits " + good);
  }
  for (const bad of [
    "http://media.tenor.com/aBcD/x.gif", // not https
    "ftp://media.tenor.com/x.gif", // not https
    "https://tenor.com.evil.com/x.gif", // a lookalike apex, not a subdomain
    "https://faketenor.com/x.gif", // contains, but is not, tenor.com
    "https://evil.com/redirect?url=https://media.tenor.com/x.gif", // arbitrary host
    "", // empty
    "https://media.tenor.com/" + "x".repeat(2100) + ".gif", // the 2048 cap
    null,
    42,
  ]) {
    assert.equal(tenorMediaUrl(bad), null, "refuses " + String(bad).slice(0, 48));
  }
});

test("gifProxySrc is the only image path: encoded, same-origin, no raw cross-origin src", () => {
  assert.equal(gifProxySrc("https://media.tenor.com/aB/word.gif"), "/api/gifs/image?u=https%3A%2F%2Fmedia.tenor.com%2FaB%2Fword.gif");
  // Neither module ever sets an img src to a Tenor URL directly.
  for (const source of [MODULE, APP]) {
    assert.ok(!/src:\s*["']https/.test(source),
      "no raw cross-origin src literal");
    assert.ok(!/src:\s*mediaUrl\b/.test(source),
      "no src bound straight to the tenor reference");
  }
  assert.match(APP, /src: gifProxySrc\(mediaUrl\)/, "the panel rides the proxy");
  assert.match(MODULE, /src: gifProxySrc\(media\.previewUrl\)/, "the tile rides the proxy");
});

test("the body finder: tenor URLs in order, deduped, pasted punctuation stripped", () => {
  const MEDIA = "https://media.tenor.com/aBcD/word.gif";
  assert.deepEqual(tenorUrlsInBody("look " + MEDIA + " go"), [MEDIA]);
  assert.deepEqual(tenorUrlsInBody(MEDIA + "."), [MEDIA], "trailing period");
  assert.deepEqual(tenorUrlsInBody(MEDIA + ","), [MEDIA], "trailing comma");
  assert.deepEqual(tenorUrlsInBody(MEDIA + ")"), [MEDIA], "trailing paren");
  assert.deepEqual(tenorUrlsInBody("a " + MEDIA + " b " + MEDIA + " c"), [MEDIA], "deduped");
  assert.deepEqual(tenorUrlsInBody(MEDIA + "\nhttps://media1.tenor.com/z/w.gif"),
    [MEDIA, "https://media1.tenor.com/z/w.gif"], "multiple, in order");
  assert.deepEqual(tenorUrlsInBody("https://media.giphy.com/x.gif"), [], "non-tenor hosts stay text");
  assert.deepEqual(tenorUrlsInBody("http://media.tenor.com/x.gif"), [], "http stays text");
  assert.deepEqual(tenorUrlsInBody("https://evil.com/at/tenor.com/x.gif"), [], "arbitrary-host references stay text");
  assert.deepEqual(tenorUrlsInBody("no links here"), []);
  assert.deepEqual(tenorUrlsInBody(null), []);
  assert.deepEqual(tenorUrlsInBody(undefined), []);
});

test("the picker contract: page 12, the position cursor, the paste-shaped pick", () => {
  assert.equal(GIF_PAGE_LIMIT, 12);
 	assert.match(MODULE, /\/api\/gifs\/search\?"/, "the search route rides the shared api");
  assert.match(MODULE, /params\.set\("position", nextPosition\)/, "the opaque cursor rides the URL");
  // The pick is a paste: setRangeText at the caret, then the input event
  // so the counter and draft listeners see what will send.
  assert.match(MODULE, /setRangeText\(seam \+ url, start, end, "end"\)/);
  assert.match(MODULE, /dispatchEvent\(new Event\("input"\)\)/);
  assert.match(MODULE, /const seam = start === 0 \|\| \/\\s\$\/\.test\(before\) \? "" : " ";/,
    "a URL never glues onto the sentence it follows");
  // The inserted URL is the media url itself (text, not the proxy re-encode).
  assert.match(MODULE, /insertGifUrl\(textarea, media\.url\)/);
  assert.ok(!/insertGifUrl\(textarea, gifProxySrc/.test(MODULE),
    "the body carries the tenor url, moderation reads it plainly");
});

test("the dialog surfaces the shared copies verbatim and keeps its own house shape", () => {
  assert.match(MODULE, /caught\?\.message \|\| "GIF search is unavailable right now\."/,
    "the 503/502/400 copies surface exactly as the server words them");
  assert.match(MODULE, /"Nothing found for that search\."/);
  assert.match(MODULE, /text: "Load more GIFs"/);
  assert.match(MODULE, /"Search for something between 1 and 64 characters\."/, "the shape clamp client mirror");
  assert.match(MODULE, /"GIF picker"/);
  // CSP-safe DOM: the factory + textContent only, never a markup parser.
  assert.ok(!/innerHTML/.test(MODULE));
  assert.match(MODULE, /import \{ el \} from "\.\/dom\.js";/);
  assert.match(MODULE, /import \{ api \} from "\.\/api\.js";/);
});

test("the composer's GIF button is the creative-bundle gate: Goober+ server channels only", () => {
  assert.match(APP, /import \{ openGifPicker, tenorUrlsInBody, gifProxySrc, MAX_GIF_PANELS \} from "\.\.\/gifs\.js";/);
  assert.match(APP, /if \(pickerServerId && state\.currentUser\?\.isPlus\) \{/,
    "the same plus-status check the 0021 counter bound reads");
  assert.match(APP, /= iconButton\(doc, "image", \{[\s\S]?[\s\S]*?ariaLabel: "Open the GIF picker"/);
  assert.match(APP, /void openGifPicker\(doc, win, textarea\)/);
});

test("the embed pass: under the text, bounded at three, error panels remove themselves", () => {
  assert.match(APP, /const gifPanelUrls = tenorUrlsInBody\(message\.body\)\.slice\(0, MAX_GIF_PANELS\);/);
  assert.equal(MAX_GIF_PANELS, 3, "the unfurl counting bound");
  assert.match(APP, /embed\.addEventListener\("error", \(\) => embed\.remove\(\)\);/,
    "a dead link (a pasted page url) drops its panel quietly");
  assert.match(APP, /class: "message-gif-row"/);
  assert.match(APP, /alt: "GIF from Tenor"/);
});

test("the house selectors the CSS must meet the markup on", () => {
  assert.match(readFileSync(path.join(ROOT, "public/styles.css"), "utf8"), /\.gif-picker-grid \{/);
  assert.match(readFileSync(path.join(ROOT, "public/styles.css"), "utf8"), /\.message-gif-row \{/);
});

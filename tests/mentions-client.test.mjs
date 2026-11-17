// The client's mentions mirror (e278094's render contract): a body stores
// plain text and the render highlights — so public/js/mentions.js re-uses the
// server's parse character-for-character (api/mentions.mjs is the reference).
// Pins: the flag's word-bound rules, the roster matcher's longest-first walk,
// the render split's token/plain shape, the channel-render integration, the
// composer's pre-send heads-up, and the token-only highlight CSS.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const js = (p) => readFileSync(path.join(ROOT, p), "utf8");
const APP = js("public/js/routes/app.js");
const CSS = js("public/styles.css");
const REFERENCE = js("api/mentions.mjs");

const mentions = await import(path.join(ROOT, "public/js/mentions.js"));
const { mentionsEveryoneFlag, matchRosterMentions, splitMentionTokens } = mentions;

// The roster the server's own pins build: nickname before username, an
// ambiguous pair, a split-suffix pair.
const roster = [
  { id: 3, username: "wempo", nickname: "wempo two" },
  { id: 1, username: "the boss", nickname: null },
  { id: 2, username: "WEM", nickname: null },
  { id: 4, username: "sam", nickname: null },
  { id: 5, username: "sam", nickname: null },
];

test("the flag parse is the reference's, word-bound both ways", () => {
  for (const hit of ["@everyone", "@EVERYONE", "@Here", "hello @everyone!", "(@here)"]) {
    assert.equal(mentionsEveryoneFlag(hit), true, hit);
  }
  for (const miss of ["mail@everyone.com", "@everyonehere", "not@heretoday", "everyone", "plain text"]) {
    assert.equal(mentionsEveryoneFlag(miss), false, miss);
  }
  // The regexes ride the reference FILE, not a re-typed look-alike: the client
  // copy pins identical sources.
  const source = js("public/js/mentions.js");
  for (const line of ["const EVERYONE_FLAG_RE = /(^|[^A-Za-z0-9_])@everyone(?![A-Za-z0-9_])/i;",
    "const HERE_FLAG_RE = /(^|[^A-Za-z0-9_])@here(?![A-Za-z0-9_])/i;",
    "const CANDIDATE_RE = /@[A-Za-z0-9_][A-Za-z0-9_ .-]{1,31}/g;"]) {
    assert.ok(source.includes(line), line);
    assert.ok(REFERENCE.includes(line.replace("const ", "const ")), "the reference carries " + line);
  }
});

test("the roster matcher mirrors the server: longest-first, nickname first, ambiguous = nobody", () => {
  assert.deepEqual(matchRosterMentions("the @wempo two rode again", roster), [3],
    "the display name wins over the username prefix");
  assert.deepEqual(matchRosterMentions("@the boss hi", roster), [1]);
  assert.deepEqual(matchRosterMentions("hey @WEM!", roster), [2], "case-insensitive");
  assert.deepEqual(matchRosterMentions("@same @a", roster), [],
    "ambiguous width resolves to nobody, never shorter");
  assert.deepEqual(matchRosterMentions("hi @sam!", roster), [],
    "two members own " + '"sam"' + " at the whole width");
  assert.deepEqual(matchRosterMentions("@nobody here", roster), []);
  assert.deepEqual(matchRosterMentions("@wem and @WEM again", roster), [2, 2],
    "repeated tokens count as repeated mentions");
  assert.deepEqual(matchRosterMentions("@wempo two", null), [], "no roster = no resolution");
});

test("the render split: resolved tokens highlight with the ORIGINAL case, the rest stays plain", () => {
  const parts = splitMentionTokens("hi @WEM and @nobody \u2014 @everyone stays", roster);
  assert.deepEqual(parts, [
    { text: "hi " },
    { kind: "user", token: "@WEM", id: 2 },
    { text: " and " },
    { text: "@nobody " },
    { text: "\u2014 " },
    { kind: "everyon" + "e", token: "@every" + "one", flag: "every" + "one" },
    { text: " stays" },
  ], "the resolved highlight covers the name, never the words it ran past");
  // A highlighted token's width is the RESOLVED name, not the greedy
  // candidate: the display name "wempo two" resolves at its full width, so
  // "the @wempo two rode" highlights "@wempo two" whole.
  const long = splitMentionTokens("the @wempo two rode again", roster);
  assert.deepEqual(long, [
    { text: "the " },
    { kind: "user", token: "@wempo two", id: 3 },
    { text: " rode again" },
  ]);
  // A short username under a greedy candidate keeps the run-off as text.
  const short = splitMentionTokens("ping @WEM and", roster);
  assert.deepEqual(short, [
    { text: "ping " },
    { kind: "user", token: "@WEM", id: 2 },
    { text: " and" },
  ]);
  assert.deepEqual(splitMentionTokens(null, roster), []);
  // A member literally named "everyone" still loses to the flag token.
  assert.equal(splitMentionTokens("@Everyone", [{ id: 9, username: "Everyone" }])[0].kind, "everyone");
});

test("the channel render highlights inside the expression-text segments", () => {
  const render = APP.slice(APP.indexOf("for (const segment of splitExpressionTokens(message.body, caches.expressionIndex))"),
    APP.indexOf("body.append(el(\"img\", {"));
  assert.match(render, /const mentionRoster = context\.server/);
  assert.match(render, /currentRoster\(context\.server\.id\)\?\.members \|\| \[\]/);
  assert.match(render, /splitMentionTokens\(segment\.text, mentionRoster\)/);
  assert.match(render, /class: part\.kind === "everyone" \? "mention-hl mention-hl-everyone" : "mention-hl"/);
  assert.match(render, /text: part\.token/, "the ORIGINAL slice renders, case preserved");
  assert.doesNotMatch(render, /\binnerHTML\b/, "CSP-safe render");
  assert.match(APP, /import \{ mentionsEveryoneFlag, splitMentionTokens \} from "\.\.\/mentions\.js";/);
});

test("the composer heads-up: the exact server gate decides, the copy arrives before the send", () => {
  const composer = APP.slice(APP.indexOf("function buildComposer(doc, win, main, composerError, slowmodeSeconds = 0, pickerServerId = null,"),
    APP.indexOf("function pendingRow("));
  assert.match(composer, /canMentionEveryone = true/, "DM composers default admitted");
  assert.match(composer, /!canMentionEveryone && mentionsEveryoneFlag\(draft\)/);
  assert.match(composer, /You can't mention everyone here/, "the gate's own 403 voice");
  assert.match(composer, /setMentionNote\(\);/, "every keystroke re-checks");
  assert.match(composer, /if \(mentionFlag\(textarea\.value\)\) mentionNote\.removeAttribute\("hidden"\);\n    else mentionNote\.setAttribute\("hidden", ""\);/);
  // The call site computes the gate's mirror: tier (owner/moderator on the
  // server row) or the viewer's MENTION_EVERYONE bit; unknown = admit.
  const site = APP.slice(APP.indexOf("const composerMentionGate = composerContext?.server"),
    APP.indexOf("buildComposer(doc, win, main, composerError, composerSlowmode,"));
  assert.match(site, /composerContext\.server\.role === "owner"/);
  assert.match(site, /composerContext\.server\.role === "moderator"/);
  assert.match(site, /viewerCan\(composerViewer, "MENTION_EVERYONE"\)/);
  assert.match(site, /: true/, "a DM/group composer never warns");
});

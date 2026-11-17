# Holding keys — realigned to gc en.json (rewrite 0e5c344 @425), 2026-11-17

Realign protocol (team-lead directive): wave-1 commit = the exact en.json-matching
subset. This file holds everything NOT in the wave-1 commit, keyed to future
sweep commits. One realign per frontend sweep push: promote held keys into
es.json/de.json with the en.json key names as the canon — never the
inventory-built skeleton names.

## Wave-1 committed subset

- 277 / 277 en.json keys translated in BOTH public/locales/es.json and de.json
  (gc-rewrite); flat dotted keys verbatim from en.json; {{var}} token parity
  verified key-by-key (4 token-name fixes applied: {{n}}→{{max}} ×3,
  {{username}}→{{name}}).
- 0 en.json keys unmatched ⇒ keys held: 0 from en's set; keys dropped: the old
  skeleton's server-class section (~90 keys) PERMANENTLY (server never
  localizes — en.json pins their absence).

## Held for future sweep commits (attach with each module's en.json growth)

| held key (skeleton name) | proposed en key name | es/de value ready | source row |
|---|---|---|---|
| mod.banLine | `gc.mod.bans.line` | "{{reason}} · {{at}}" rekey at attach | mod.js:340 fragment |
| common.search | `gc.common.search` (needs a sweep home) | "Buscar"/"Suchen" | speculative |

(common.save's row is closed: the save-dedupe ruling — gc-rewrite a22f62a —
seated the shared `gc.controls.save` in the gc.controls.* area; no synonym
ships, the per-file twin families collapse at their own modules' swept
commits.)

## gc-rewrite sweep ledger (es/de riding)

- wave-1 (44051b5): 277/277 committed.
- sweep #4 chat.js (a22f62a + 881242d): en 336; the localizer's 336/336 pair
  (es.json + de.json: tokens mirrored, markup-free, no plural rows) committed
  as 7021e3a. The pair's seeded VALUES were swapped (the bundles followed the
  swapped seed, so 7021e3a mirrored the inversion); a0ec50b owns the fix
  value-side on all three locales (pinned rows offer row.unpin per the
  chat.js:655 call site) and its ledger row carries the correction — current
  seat: pin "Pin"/"Fijar"/"Anheften", unpin "Unpin"/"Quitar el fijado"/"Lösen",
  coherent at HEAD, suite-pinned in tests/ui-chat.test.mjs.
- next sweep seats: settings/mod/members/expressions/economy/rules-gate/landing.
- sweep COMPLETE (f8240cd, 12 module commits, en 417): the batch realign
  committed as 01863bb — 88 rides, the full 7-seed drop list, fresh's
  {{code}} reshape, es/de rebuilt in en.json's exact key order
  (417/417/417, order-matched, tokens mirrored, 1106 pass). The pin/unpin
  inversion's final seat stays as a0ec50b set it. NOTE the team-lead's
  rider named gc.mod.rules.boundNote as an orphan drop, but the disk en
  carries it — the DISK en.json law kept it; if the realigner's drop is
  re-filed it arrives as a future en removal and es/de follow then.

Plural seats: es/de demand no `_few` branches for the 277-key set (count nouns
"monedas"/"Münzen" invariant; no `_one/_other` split in copy) — verified
against the loader's rule table shape per protocol rule (2).

## Wave-2 staged (fr/pt/ru, 2026-11-17)

- THREE bundles staged for the 420-key canon @ en@7e2ca20 (fr.json, pt.json,
  ru.json — uncommitted, batch on the team-lead's cadence call):
  fr 434 keys, pt 434 keys, ru 440 keys — each = the 420 base rows (keyset
  AND order matched to en) + the language's plural branches on the
  noun-binding count rows (claim.button/items.cost/invites.uses/usesOf/
  prune.confirm/prune.result/join.serverRow for fr/pt; ru skips
  prune.result + serverRow as numeral-safe/reworded count-flat, carries
  only claim.button, items.cost, uses, usesOf, prune.confirm).
- The branches rode the loader seats as 1bcfa9e set them: fr/pt two-branch
  (one = 0..1), ru one/few/many + _other = many. Every branch base equals
  its _other form; token parity verified branch-by-branch.
- Register picks held: fr = tu, pt = você, ru = ты (glossary rows filed).
- Suite 1111/1111 green over the staged tree.

## Wave-3 staged (ja/zh, 2026-11-17) + the es/de `_one` rider

- Landed while staging: the es plural arm (b663405 — es one = exactly 1, 0→
  other, round-million many) and the en grammar ride (cd378e1 — SIX seats
  adjudicated, FIVE flexed, usesOf declined numeral-safe; en 420→425).
- es/de rider realign STAGED: the five `_one` singular rows mirrored beside
  their bare keys (es/de rebuilt in en order incl. the branch rows), plus
  ONE es-grammar rider seat — gc.mod.prune.result_one "{{count}} expulsado."
  (en "kicked" never flexes; es "expulsados" does — an es-only branch,
  lawful under the widened scheme law). de leaves prune.result flat
  ("1 rausgeworfen." is invariant German). es 426 keys, de 425.
- ja.json + zh.json STAGED: 420 bare rows each, byte-order matched to the
  en base, numeral-safe count composition, NO branch rows — the wave-3
  ruling line: en `_one` rows stay en-side legal-form copy, never ja/zh
  mirrors; the en fallback mis-routing count 1 to "one" is harmless (no
  branch data exists in these bundles). ja = です・ます politeness, held;
  zh = Simplified (zh-Hans), declared.
- fr/pt/ru need nothing on the five flexed seats: the wave-2 staged branch
  rows already answer (fr/pt 14 branches each, ru 4 — ru rewords
  join.serverRow numeral-safe, consistent with its ruled restructures).
- Suite 1112/1112 green over the staged tree. ALL staged, batch on the
  team-lead's cadence call.

## The realign ensemble (rewritten to 18b4b47, 2026-11-17)

CORRECTION on 18b4b47's tree (2026-11-17, team-lead's disk read): the
commit's TEN es/de `_one` rows landed ENGLISH-verbatim, not flexed —
the rebuild loop iterated en's full 425 keys and cd378e1 seats each
`_one` row AFTER its base, so the row's own pass overwrote the flex
with the en fallback. The commit message's flex text was written ahead
of its tree. FIXED by the addendum 06fd626 (pushed, suite 1112/1112 in
the sibling worktree): only the ten rows' bytes move to the enumerated
flexed values — es "Reclamar {{count}} moneda"/"{{count}} moneda"/
"¿Podar {{count}} miembro?"/"{{count}} uso"/"Unirse a {{name}}
({{count}} miembro)", de "{{count}} Münze abholen"/"{{count}}
Münze"/"{{count}} Mitglied beschneiden?"/"{{count}} Nutzung"/
"{{name}} beitreten ({{count}} Mitglied)". Lesson recorded: never
iterate the full en keyset for a branch-row rebuild — iterate bases,
seat branches beside them; and token-parity + branch-count checks
cannot catch values-as-en, so the lane's intake proposal to the
reviewer is a new-key value≠en spot rule with a reviewer-adjudicated
cognate list (legitimate shared-word rows like es "Server"/"General",
de "Timeout"/"Text"/"Position", the GIF/emoji/epoch/ellipsis seats —
grandfathered; everything else byte-equal to en fails intake).
SHIPPED: addendum 06fd626 (suite 1112/1112 sibling-worktree), then the
riders' empty-tree ledger commit 2c41d75 — the ten rows 1:1, the
ledger-184 attribution correction (the scheme-law widening rode
b663405, NOT cd378e1), and the DECLARED ja/zh CARVE LIST (sharpened
value-gate discipline, reviewer grandfathering replaced by named
carves: ja — "…" only; zh — "…" + the two "Emoji" rows; "Sticker"/
"GIF" not byte-equal, no carve). Sequencing note: 06fd626 was already
published when the riders arrived, so the riders rode FORWARD as a
separate paper commit — no force-push. The value≠en gate and the
rebuild-loop ordering note are LAW going forward; the ja/zh batch is
their first test subject, and de uses_one "Nutzung" stands as the
reviewer judged it (stiffness its own call).

- es/de + the five _one singulars (cd378e1's rider fulfilled) + ONE
  es-grammar rider (gc.mod.prune.result_one "{{count}} expulsado." — es
  "expulsados" flexes where en "kicked" doesn't; de flat, "1
  rausgeworfen." invariant German) — es 426 / de 425 (shape; the ten
  row values corrected as above).
- The usesOf rider accepted and landed: the wave-2 trio's branched
  usesOf rows DROPPED under the same flexed-noun-attaches-to-the-set
  logic the reviewer ruled on en's decline (fr −2, pt −2 → 432; ru −4 →
  436 — "1 из 5 употребление" was ungrammatical at its own firing
  count); the bare rows stay, correct at every count. CONFIRMED on
  disk @18b4b47 (team-lead ground truth).
- Parity after: bare 420 everywhere, tokens row-by-row and
  branch-by-branch across all five translated bundles; suite 1112/1112;
  pushed as 18b4b47 (with the ten-row correction staged behind it).
  The reviewer's verdict line: after this rider the i18n lane holds
  ZERO open items from its seat.
- es phrasing calls kept against the brief's direction: ¿Podar… (the
  prune register = the bare row's own word) over ¿Expulsar…; Unirse…
  matches the bare serverRow.
- ja/zh (wave-3) remain STAGED for their own batch commit — bare-420
  canon mirrored only, branch-free ever, the ruling line to be stated
  in their commit message.

## Polish notes (discretionary, reviewer round-2 — fold into next touch, not blockers)

- de "der eine Teich" (gc.settings.channels.full's "one pool") carries the en
  pond metaphor literally — judge German idiom at the next touch.
- the emoji panel label rides "Emojis" in both locales — panel headers often
  read better singular ("Emoji") — discretionary at the next touch.

## Candidates (server-class strings that reach user eyes in-page — promote client-side)

Per the ratified rule, these stay OUT of the locale files until frontend
promotes them; listed from the rewrite ledger's render-verbatim seats:

- coins claim's shared 409 ("Already claimed today. Come back tomorrow.") — renders verbatim in the coin shop (W-R3).
- coins gift/generic "You already have full Goober+." 409 (shop).
- The remaining server-class strings render as toasts via the response's own
  message body; when the server gains `error_code` keys (catalog-design's
  migration shape), each gets `gc.error.<code>` here first.

## Forum pair

forum-5.0/public/locales/es.json + de.json stay HELD ENTIRELY (product's
loader not built; base = forum-5.0's own loader commit when it lands, same
protocol).

## Wave-3 SHIPPED (5e0140e, 2026-11-17)

- ja.json + zh.json committed as ONE batch, ordered to the en base,
  420 bare rows each — en's five _one rows deliberately absent per the
  ruling line (en-side legal-form copy, never ja/zh mirrors; ja/zh
  cardinals other-only; the en fallback count-1 mis-route inert). The
  declared carve list rode IN the commit under the 0e5c344 gate with
  classes named: composed-symbol ("…" both bundles), ruled-cognate
  (zh "Emoji" ×2). The pair is the value≠en gate's first test
  subject — 0 undeclared byte-equal rows. Suite 1113/1113 in the
  detached sibling worktree; pushed 0e5c344..5e0140e. gc-rewrite tree
  fully clean.
- Next on the wave-plan tail: ar RTL — brief requested, awaiting the
  team-lead's dispatch decision.

## Wave-4 STAGED (ar, 2026-11-17)

- ar.json on disk (gc-rewrite, uncommitted — stage-only until cadence):
  430 keys = 420 bare + 5 branch families × (`_few` + `_other`, the `_other`
  byte-equal to base per the ru base==_other convention). Byte-order to
  en@0e5c344's bare order with each pair seated beside its base; en's five
  `_one` rows absent (en-side legal-form copy, never ar mirrors).
- The five branched families (the count-noun set the brief named —
  claim.button, items.cost, prune.confirm, invites.uses, join.serverRow)
  each carry Arabic's one visible flex: the 3–10 `_few` noun plural.
  Under Latin digits zero/one/two/many/other collapse onto the
  numeral+singular shape (declared route table in the glossary; every seat
  route lands), so they ride base rather than mint redundant arms.
- Composed numeral-safe (no branches, rulings per-row like ru's):
  usesOf ("الاستخدامات: {{count}} من {{max}}" — the usesOf noun-owns-the-set
  law), prune.result (colon-label, ru precedent), timeout.choice
  ("{{count}} د" minute abbreviation), ears, slowmode.wait ("ث"
  abbreviation), rules.count + channels.full + roles.count +
  categories.count + automod.full (من-composition, invariant genitive
  plural) — plus the five count-baked static rows set to their exact
  Arabic shapes (uses1/5/25/100, expiry chips, days7/days30).
- Declared carve list under the 0e5c344 gate, classes named:
  composed-symbol — gc.shell.mentions.loading "…" (language-invariant
  type, as in ja/zh); ruled-cognate — gc.chat.gif.short "GIFs" (the Latin
  script-technical tab label stands uninflected, the settled type).
  Nothing else sits byte-equal to en; the scan is row-by-row and the
  count-token census pre-adjudicated every {{count}}-bearing bare row.
- Register lines for the commit: MSA declared and held; Latin digits kept
  by ruling (the loader does not localize numerals); RTL is data-only —
  no bidi control characters anywhere (scanned), dir wiring is frontend's
  rider, the bundle ships inert under BUNDLE_LANGS.
- Programmatic gates all green: bare keyset both-direction equality,
  token parity row-by-row AND branch-row-vs-parent, base==_other
  invariant, markup scan, bidi scan, brand/technical-verbatim parity
  both directions, banned-word scan. Suite verify at cadence in the
  detached sibling worktree per protocol. The reviewer's BRANCH-SET
  audit gets the per-family route table + the ten branch rows' values
  in the batch commit's ruling line.

## Wave-4 riders folded into the cadence (2026-11-17)

- zh @everyone restore rides the ar batch (byte-surgical patch on
  public/locales/zh.json, two rows: settings.roles.count,
  settings.overwrites.order — "@所有人" → "@everyone"; 0 occurrences
  remain; diff = 2 insertions/2 deletions, file otherwise byte-stable).
  The generalizing law is on the glossary: PLATFORM NOUNS
  (@everyone/@here/epoch/permission-bit names) stay technical-verbatim in
  every locale; the ar staging had already held it from row one (verified
  by the @ census — ja/ar the only other bundles with the row, both
  verbatim; @here has zero en rows; bit names ride {{bit}} interpolation).
- The carve-gate pin extension (ja/zh lists) closed upstream by the
  reviewer as 93fd6b2 — gate binds all seven existing bundles; the ar
  batch's commit will carry its declared carve list in the message and
  the gate's pattern wakes for ar when the reviewer extends the pin
  (their BRANCH-SET audit seat, not this lane's file).
- Reviewer pre-requisites confirmed honored in the staged ar.json:
  (1) no dir= markup / bidi control characters anywhere (scanned —
  zero hits); (2) platform nouns verbatim from day one; (3) carve list
  declared with classes in the commit; (4) the commit's ruling states
  ar stages WITH branch rows (the six-category seat) and enumerates
  per-family route tables — not a carry of the ja/zh other-only ruling.

## Wave-4 SHIPPED (212c883, 2026-11-17)

- ONE realign-shape batch: ar.json (new, 430 keys) + the zh platform-noun
  restore (2 rows, byte-surgical) — pushed 93fd6b2..212c883. The batch
  landed on the extended pin (93fd6b2 was tests-only, 11 insertions, zero
  bundle bytes; the branch advanced mid-staging and the suite was
  re-verified at 93fd6b2 WITH the staged bytes because the pin's
  set-equality scan widened). Suite 1113/1113, detached sibling worktree,
  worktree removed.
- The commit carries the full audit package: branch decision (ar stages
  WITH branch rows under the six-category seat, NOT the ja/zh carry),
  route table per family, the "explicit _other rows per the ru
  convention, not fallback gaps" phrasing the audit wants, all ten branch
  rows 1:1, the composed-row rulings, the three register ruling lines,
  the declared carve list, and the platform-noun law.
- gc-rewrite tree clean after the batch; all seven translated bundles
  now ship beside en (es/de/fr/pt/ru/ja/zh/ar).
- The wave-plan tail stands: ar was the final major bundle on the plan's
  list — this lane holds for the reviewer's BRANCH-SET audit, the pin
  extension for ar (reviewer's seat), and whatever cadence en.json's
  next move calls.

## §13 Source seat — standalone mirror (c396585, 2026-11-17)

- gc.shell.user.source ("Source (AGPLv3)" @1b9eaa8, en.json 426) mirrored
  into all EIGHT non-en bundles (the lead's count-slip corrected: es/de/
  fr/pt/ru/ja/zh/ar) as a STANDALONE cadence — idle staging shouldn't hold
  a legal §13 mirror behind an uncertain future batch. One commit, 8 files,
  8 insertions, 0 deletions; each row seated right after
  gc.shell.user.signOut; AGPLv3 verbatim everywhere (license name never
  localizes); register picks: es "Código fuente", de "Quelle", fr
  "Code source", pt "Código-fonte", ru "Исходный код", ja "ソースコード"
  (all-halfwidth convention), zh "源码", ar "الكود المصدري".
- THE REALIGN MACHINE'S EVOLUTION (stated law, replacing wave-1's strict
  en-keyset+order equality): the check is now the SUBSEQUENCE WALK —
  bare-skeleton byte-order to en's non-suffixed rows + surgical
  diff-scope (each realign's whole-file git diff enumerates its delta) +
  the lawful miss/extra classes: en-side `_one` rows only per the
  en-side-legal-form-copy law (ja/zh/ar never mirror them), ru's
  serverRow_one absent by its composition ruling, bundles shipping their
  own branch/_other/rider rows en lacks, ru seating branch families at
  the file tail per the wave-2 append convention (loader-inert — JSON
  map order doesn't function).
- Suite verification honesty at this cadence: 1114/1108/6 — the six fails
  exactly the disclosed env-coupled contract-parity twins (wempos-forum
  path gone, stash-run-proven identical in 1b9eaa8's own message, the
  ONLY excluded class); the i18n lane 15/15 green in the same run.
- The lane IDLES with everything closed: en canon stable at 426, all
  eight locales mirror-complete and gate-visible, no staged residue.

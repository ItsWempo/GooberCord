# Holding keys — realigned to gc en.json (rewrite 1bcfa9e @420), 2026-11-17

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

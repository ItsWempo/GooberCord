# Holding keys — realigned to gc en.json (80278d4), 2026-11-17

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
| common.save | `gc.common.save` (needs a sweep home) | "Guardar"/"Speichern" | speculative |

Plural seats: es/de demand no `_few` branches for the 277-key set (count nouns
"monedas"/"Münzen" invariant; no `_one/_other` split in copy) — verified
against the loader's rule table shape per protocol rule (2).

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

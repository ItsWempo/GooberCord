# Wave plan — localization order across the fleet

Source counts from the inventories in this directory (unique client rows +
server-class strings, per `inventory-<repo>.md`).

## Baseline counts

| product | repo / path | unique client strings | server-class strings | total keys proposed |
|---|---|---|---|---|
| gc (legacy) | /Users/itswempo/GooberCord (main — being replaced) | ~708 | 321 | ~1,000 (NOT swept — see ordering law) |
| **gc (rewrite)** | /Users/itswempo/gc-rewrite @ `rewrite` | ~297 | 314 | ~611 |
| forum | /Users/itswempo/forum-5.0 | ~455 | 276 | ~731 |
| acct | /Users/itswempo/wempo-accounts | ~58 | 38 | ~96 |

Fleet total (sweepable products): ~1,438 proposed keys.

## Ordering law

The legacy GooberCord client is being REPLACED by the rewrite branch — **its
~708 client strings are NOT swept**; its `inventory-gc-main.md` stays as the
archaeology record only. All client-side i18n effort lands in `gc-rewrite`
first (it is the future client), then forum, then accounts.

## Wave 0 — kit (no languages)

- frontend-dev lands `public/js/i18n.js` + `public/locales/en.json` per
  catalog-design.md; en.json keyed from `inventory-gc-rewrite.md`.
- Deliverable: the loader module + `t()` sweep of the rewrite client
  (~297 keys, en-only). Nothing user-visible changes in English.
- Server strings stay English-answered (client maps them by key).

## Wave 1 — Spanish (es) + German (de)

- **es**: largest reachable growth base in the plan, and the lowest-cost
  first-language proof (Latin script, CLDR two-branch plurals, right-to-left
  machinery untouched). Scope: gc-rewrite (~611 keys incl. the server-mapped
  error set) + accounts (~96 keys — small product, full fleet "all products"
  proof in one wave).
- **de**: second language ships in the same wave to prove the fallback chain,
  the plural-branch table, and a non-`es` bundle shape (compound-word lengths
  stress the layout/CSS harder than es).
- Count per wave-1 product: es = 611 + 96 = **707 keys**; de same.

## Wave 2 — fr, pt, ru

- fr adds ~460 keys (forum ~455 client rows wave: forum localization starts
  here). pt follows fr (shared Latin-script pipeline, two-branch plurals).
- ru is the wave's stress test: `_few/_many` plural branches + Cyrillic + the
  relative-time stamp rewrites.

## Wave 3 — ja, zh-cn, zh-tw

- CJK: no plural branches (cheap), but the composer/username-length copies
  that say "12–128 characters" need script-aware phrasing; zh-cn and zh-tw are
  two bundles, not one with a script flag (glossary rows separate).

## Wave 4 — right-to-left wave: ar

- First RTL. Only wave that touches layout CSS (`dir="rtl"` pass), so it is
  deliberately alone and late; the glossary's ar rows gate it.

## Wave 5+ — hi, tr, then the ~50-language long tail

- hi, tr ride wave 5 with the wave-1 lessons applied; the remaining target
  languages fan out after the loader has proven itself through 4 scripts
  (Latin, Cyrillic, CJK, RTL) — each new language is a bundle file plus a
  glossary rows update, no code.

## Per-wave gates (every wave)

1. glossary rows updated for the wave's languages FIRST.
2. bundle complete against its inventory (zero `en`-fallback keys in the
   product's core flows: auth, composer, errors).
3. axe pass unchanged, layout rechecked at the wave-1 length stress level.
4. fallback chain proven: delete 3 random keys from the bundle → page still
   renders, dev console logs the misses.

## Sweep ledger — gc-rewrite (reviewer riders, Nov 17)

The dedicated review pass on the loader (commit 80278d4) ruled SHIP and left
three riders which live here:

1. **Painter rider** — if a sweep commit touches a surface where the
   one-paint first-paint window becomes visible (a slow en force-cache fetch
   leaving bound `data-i18n` nodes humanized for a paint), that commit adds
   the `applyDom()` call at en-bundle resolution. Never preempted across
   modules — each surface's commit carries its own painter call.
2. **Count keys** — when a sweep commit adds its FIRST plural/count key to
   `en.json`, that commit's en.json gains the `_one`/`_other` branches there
   (the first in-bundle exercise of the plural seat) and pins the pick in
   its test file.
3. **fr plural rule (before any fr bundle ships)** — fr's CLDR one-branch
   includes 0, but the loader currently maps every non-listed language to
   the en two-branch rule. The commit that first ships a `BUNDLE_LANGS`
   entry for fr must add the fr rule in `i18n.js`. No code change until
   then; noted so wave 2 cannot skip it.

## Sweep ledger — committerows (frontend-dev)

| commit | module | pin conversions (literal-pinned → key-pinned) | new keys |
|---|---|---|---|
| 726fe5f | main.js | tests/main-build.test.mjs: the strip copy + the Reload pin primed to the en bundle; literals assert now via `t()` seats + en.json values ("the sweep carries no copy" test added) | gc.boot.stale.reload |
| f189b24 | shell.js | tests/ui-shell.test.mjs: the first-run heading + next-action pins re-seat to `t("gc.shell.home.heading"/"body")`; tests/ui-ws.test.mjs: the G-9 strip paint stub made locale-aware + initI18n prime (the copy is "Reconnecting…" through `t("gc.shell.reconnecting")`) | 11 chrome keys (nav.short seats, fallback titles, Reconnecting…, loading …) |
| (sweep #3) | social.js | tests/ui-social.test.mjs: the null-username `member ${block.userId}` pin re-seats to `t("gc.social.blocks.member", { id })` | 22 keys (row labels, presence pair split, gc.controls.* back/set/keep/save/leave/stay/rename — shared seats later modules reuse) |
| a22f62a + 881242d | chat.js | tests/ui-chat.test.mjs: three literal pins re-seat to keys — the pending seat (`t("gc.chat.attach.pending")`), the attach refusal (`t("gc.chat.attach.one")`), the slowmode meter (`t("gc.chat.slowmode.wait", { seconds: left })`) | 25 keys (row labels, reactions heading, voice join/leave/mute/unmute, riders' titles, gc.controls.* done/more/send/retry/remove/search/fetching + back) |

### Dedupe ruling (lead's save rider, confirmed in sweep #4)

- `gc.controls.save` has NO twin — it is the only bare-"Save" key; the
  context-typed saves ("Save rule", "Save role", "Save settings", "Save
  status", "Save nickname") are different strings, not synonyms. Nothing to
  merge.
- The remaining twin families came from the inventory's per-FILE rows and
  collapse per the same law as each module's sweep lands, reusing the
  first-swept key: chat.js already reuses `gc.shell.nav.dm` ("Direct
  messages"), `gc.chat.history.older` sits as the canon for economy's
  "Load earlier", `gc.chat.search.placeholder` is the "Search this server"
  heading's seat too. The permission trio (expressions/mod/settings), the
  "Mod desk" pair, "Friends & DMs" pair, "member {{id}}" pair and the dm
  placeholder pair collapse at THEIR modules' swept commits — en.json ends
  smaller, localizer realigns per its protocol.
- Symbol-only glyph seats deliberately stay code-side (the riders' 🖼/☺/▣/♪,
  the dialog hold's "…") — punctuation and pictographs, not translated copy.

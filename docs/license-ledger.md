# License pass ledger — GooberCord

The per-repo record of the AGPLv3 program: COPYING/README landings, per-file
notice passes, and the ruled coordinated pairs. Rows carry the SHAs the
reviewer (and every future audit) traces back through. The forum twin of this
file carries the same pair row with both SHAs.

## GooberCord main

| SHA | Step | Verification |
| --- | --- | --- |
| f39bebd | COPYING (rename of the hand-wrap-drifted LICENSE) + README born with the section 13 line | gnu.org canonical diff-clean |
| 23ffd72 | COPYING's canonical bytes actually land (the rename-before-replace slip shipped the old tail) | `git show HEAD:COPYING` cmp gnu.org 661 lines / 34523 bytes |
| 6b9deed | 143-file per-file notice pass (worker, constants, api, api/core, tests), +18 insert-only | suite failure set = the 4 pre-existing WIP-fixture failures only |
| 027fc28 | Ruled allow-list extension, GC side: FORUM_PROJECT/GOOBER_PROJECT named constants in vendorize(), the once-per-file token bound asserted, the filter pin made substitution-aware | full suite at the 4-failure baseline |
| a04a96b | GC twin-header: the five parity-locked files noticed (partner = forum 54c52a5) | contract-parity + messages-module gates green post-pair |

## The ruled coordinated twin-header pair

| Side | Twin files | SHA | Named partner |
| --- | --- | --- | --- |
| wempos-forum | api/core/auth.mjs, passwords.mjs, totp.mjs, images.mjs, api/filter.mjs | 54c52a5 | GooberCord a04a96b |
| GooberCord | api/core/auth.mjs, passwords.mjs, totp.mjs, images.mjs, api/filter.mjs | a04a96b | wempos-forum 54c52a5 |

Law of the pair: the substitution allow-list carries the project-name pair as
named constants (forum: "Wempo's Forum", GC: "GooberCord" — the tokens come
from each repo's own COPYING/README wording, never invented); the notices are
byte-identical across the twin copies except each repo's own project-token
line; each twin carries its own token exactly once per file, asserted in the
extension commits (GC 027fc28, forum c8df23b) while tokens were absent
(no-op) and forever after (red on duplication or rebrand); exactly one repo's
gate held transient-red between the two header commits (GC's).

## Already-noticed strays (recorded, legal, no gate change)

GC-side api/core/crypto.mjs, api/core/http.mjs, api/core/cursors.mjs carry
notices since 6b9deed; no whole-file parity gate covers them (their twin
lineage is comment-only). Recorded here per the ruling.

## Straddling copies

wempo-accounts api/filter.mjs (third twin of the same body) took its notice
in 3102c49 with its own project token; its body remains byte-identical to GC's.

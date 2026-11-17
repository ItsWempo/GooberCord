# QA accepted-exception list — GooberCord

The fleet's canonical register of test failures accepted as baseline exceptions,
named exactly, with the evidence each one carries. Maintained by qa-dev; every
future suite run cites this file rather than re-litigating its rows.

## The GC-main 4 WIP-fixture failures (the 4-failure baseline)

Registered: 2026-11-17. Cited in the license ledger at 6b9deed/027fc28 as
"the 4 pre-existing WIP-fixture failures only". All four were failures of the
_dirty working tree_ at the 11:49 baseline — at 6b9deed no committed file was
red; the tree's frontend-WIP state (the pins/read-markers arc's un-committed
insertions into public/js/routes/app.js + styles.css, and the un-committed
tests/pins-client.test.mjs scratch) produced exactly these four:

| # | File | Test name (exact) | Failure class at the baseline | Disposition at HEAD |
| --- | --- | --- | --- | --- |
| 1 | tests/pins-client.test.mjs | "the cap NEVER lives client-side: no slot counts, no restated refusal copy" | HARNESS bug — the refusal-copy scan rode the raw module text; the module header CITES the server's wire copy as documentation, and only code may not restate it | fixed 7fecafb: scan now rides comment-stripped code |
| 2 | tests/pins-client.test.mjs | "the real dialog ride: rows mount, the mirror gates the unpins, the DELETE rerenders" | HARNESS bug — the element stub's replaceChildren was a no-op, so the rerender-after-DELETE assert counted double | fixed 7fecafb: stub clears kids like the real DOM |
| 3 | tests/emoji-client.test.mjs | "the inventory rides the history loads through ONE write point" | BYTE-WINDOW drift — window was function-head-anchored; the pins wave lands an earlier findChannelContext read (the pinned dialog's own) that cut the window before the asserted remembered-expressions line | fixed 7fecafb: end bound re-anchored at the history GET |
| 4 | tests/group-manage-panel.test.mjs | "the entry points: a hidden head gear that answers a group, the row's menu + gear" | BYTE-WINDOW drift — the head-through-gear span, 6000, no longer held loadChannel's lengthened tail after the pins/read-marker wave | fixed 7fecafb: window widened 6000 → 9000, assertions unchanged |

Evidence rules for rows 3-4: reproduced post-hoc by running the 6b9deed-era
committed versions of the two byte-window tests against the pins-waved
tree (12 tests, 10 pass, 2 fail — the two exactly as named above), then the
same tests at their realigned HEAD windows run green. Rows 1-2 are named by
7fecafb's commit record verbatim ("its two failures were HARNESS bugs, not
module bugs") and run green in the shipped file, pins-client 7/7.

## Status: CLOSED (all four resolved)

Suite at HEAD 6568635+ (post 7fecafb, 6568635): 1412/1412 pass, fail 0,
executed 2026-11-17. The 4-failure baseline no longer exists in the working
tree; this register records the accepted exceptions so historical audit rows
citing the baseline trace to named, dispositioned failures — not to a mystery
number.

Exception-policy law going forward: an exception is only registered with
(1) exact test name and file, (2) the failure class (harness vs module vs
window), (3) a disposition or an owner-gated expiry. A suite failure set that
matches this register exactly (closed rows = none) never blocks a landing.

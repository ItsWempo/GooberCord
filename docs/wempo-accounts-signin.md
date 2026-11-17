# The §4b door-swap: GooberCord signs in through Wempo Accounts

(owner-approved end state, shipped in GC as of 2026-11-16 — see the
accounts design doc in wempo-accounts for the sign-off itself)

GooberCord has NO sign-in page. Every sign-in / make-account flow starts
at `accounts.itswempo.workers.dev` (Wempo Accounts), which carries the
sign-in form (username + password, Turnstile, optional TOTP step), a
"Make a Wempo Account" lane, and auto-tickets the browser back once it has
the member. GC keeps `/api/auth/login` + `/api/auth/register` only as
internal plumbing (no pages, no links).

The ticket handoff, as GC's boot runs it:

1. A signed-out open (unless it carries a `?wt=` ticket) redirects
   silently to Accounts with `?return=` GC's exact origin. An invite link
   stashes its code first (10-min TTL) so the join route can auto-join
   after the return.
2. Accounts answers with `<GC origin>/?wt=<code>` — a ONE-TIME 64-character
   hex ticket, at most 60 seconds old (only its hash is stored on the
   Accounts side).
3. Boot redeems the ticket BEFORE the router mounts: one POST to
   `/api/auth/sso/redeem` over the service-binding lane, then GC mints its
   OWN session with the same machinery the login route used (same cookie,
   same CSRF token, same /api/me shape; ban screen included). A refusal —
   expired, already-redeemed, degraded relay — redirects back to Accounts
   for a fresh ticket. `?wt=` is stripped from the address bar either way,
   so a reload or back-button can never re-post a spent code.

Sign-out posts GC's logout, then assigns
`accounts.itswempo.workers.dev/?signout=1` — no `return` param on purpose,
so the arrival can't ticket straight back in and the member actually
leaves. What this is NOT: signing out of Accounts does not retroactively
clear GC's session, and signing out of GC (or the forum) leaves the other
site's session minted.

Trust lanes (design level): one shared D1 — GC, the forum, and Accounts all
read the same `users` rows, and GC + the forum mint sessions in the same
`sessions` table. The password pepper lives only on the forum worker;
Accounts never sees a hash's derivable material and answers every
password question through the forum's token-gated credential relay. GC's
redeem rides the RELAY_TOKEN shared secret (env-only, never logged) at
`https://sso.internal/api/sso/redeem` — the accounts worker never writes
GC's tables; the redeeming side re-reads the member row and mints the
session itself.

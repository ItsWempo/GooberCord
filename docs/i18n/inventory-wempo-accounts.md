# String inventory - Wempo Accounts client

Repo: /Users/itswempo/wempo-accounts

Method: all string literals + template literals extracted from public/js/** (vendor excluded), machine-filtered for CSS-class/selector/internal-identifier junk (documented below). Each row: source file:line + the string. Server-class strings (HttpError / json message strings that render as client toasts) are the last section - catalogued only, nothing edited.

## public/js/accounts.js

| lines | string |
|---|---|
| 19 | s return target: a member who arrived from a site |
| 20 | Sign in with Wempo Accounts |
| 32 | Wempo Forum |
| 104, 212 | Wempo Account username |
| 119, 122 | Two-factor code |
| 123, 192 | Sign in |
| 126 | One login for Wempo's projects — use the credentials you already have. |
| 132, 316 | Wempo Accounts |
| 133, 317 | One login for Wempo's projects. |
| 162, 192 | Signing in… |
| 176 | Verify code |
| 183 | Something went wrong. |
| 183 | The username or password is incorrect. |
| 187 | The login service could not be reached. Try again. |
| 223, 285 | Make Account |
| 226 | 12–128 characters. The same Wempo Account signs you into every Wempo project. |
| 231 | Already have a Wempo Account? Sign in |
| 235 | Make a Wempo Account |
| 236 | One account for Wempo's projects. |
| 264, 285 | Making your account… |
| 276 | Account creation failed. |
| 280, 397, 597 | The account service could not be reached. Try again. |
| 295 | new account management |
| 318 | Signed in as |
| 336, 357 | Current password |
| 344, 358 | New password |
| 348 | 12–128 characters. Every Wempo site signs in with it. |
| 350, 356, 401 | Change password |
| 370 | Password must be 12–128 characters long. |
| 386 | Password changed. |
| 393 | That didn't go through. Nothing was changed — try again. |
| 414 | Loading your sessions… |
| 418, 451, 527 | Sign out everywhere |
| 422 | Signs you out of Wempo Accounts AND every member site — this browser included. |
| 424, 542, 545 | Sign out |
| 437 | sessions |
| 442 | The session list could not be loaded. Try again. |
| 458 | No other active sessions. |
| 464 | Signed in |
| 464 | — this browser |
| 468 | This browser |
| 482 | That session is signed out. |
| 499 | Tap again to sign out everywhere |
| 504, 534 | Signing out… |
| 519 | That didn't go through. Nothing was signed out — try again. |
| 522 | The account service could not be reached. Nothing was signed out. |
| 554 | Active sessions |
| 563 | Sign out signs you out of Wempo Accounts only. Use Sign out everywhere to leave the member sites too. |
| 576 | Continue to |
| 594 | The sign-in hand-off did not go through. Try again. |
| 609 | Continue back |
| 609 | Back to |
| 610 | You are already signed in here. |
| 632 | New here? Make a Wempo Account |
| 639, 648, 657 | Switch theme |

## public/js/turnstile.js

| lines | string |
|---|---|
| 25 | The human-verification widget failed to load. Refresh the page and try again. |
| 80 | Human verification is not configured yet. The owner mints the widget and pastes its sitekey. |
| 123 | Please complete the human-verification step first. |

## Server class (HTTP error strings rendered to users - not edited, catalogued only)

| source | status | string |
|---|---|---|
| worker.mjs:41 | 503 | The accounts database is not configured. |
| worker.mjs:51 | 404 | That API endpoint does not exist. |
| worker.mjs:52 | 404 | Not found. |
| api/accounts.mjs:57 | 400 | Enter your username and password. |
| api/accounts.mjs:71 | 401 | The username or password is incorrect. |
| api/accounts.mjs:77 | 401 | The username or password is incorrect. |
| api/accounts.mjs:91 | 401 | That code is not correct. |
| api/accounts.mjs:104 | 401 | Please sign in to do that. |
| api/core/auth.mjs:105 | 403 | This request was blocked because its origin could not be verified. |
| api/core/auth.mjs:112 | 401 | Your session has expired. Reload the page and sign in again. |
| api/core/auth.mjs:115 | 403 | Your security token is out of date. Reload the page and try again. |
| api/core/http.mjs:52 | 503 | Rate limiting is not configured for this endpoint. |
| api/core/http.mjs:59 | 429 | Too many requests. Please wait a little and try again. |
| api/core/http.mjs:78 | 403 | Human verification is required. |
| api/core/http.mjs:97 | 403 | Human verification could not be completed. Please try again. |
| api/core/http.mjs:109 | 403 | Human verification failed. Please try again. |
| api/core/http.mjs:115 | 413 | That upload is too large. |
| api/core/http.mjs:133 | 413 | That upload is too large. |
| api/core/http.mjs:149 | 415 | Send this form as JSON. |
| api/core/http.mjs:156 | 400 | The request body is not valid JSON. |
| api/core/http.mjs:159 | 400 | The request body must be a JSON object. |
| api/manage.mjs:90 | 400 | Enter your current and new password. |
| api/manage.mjs:93 | 400 | Password must be 12–128 characters long. |
| api/manage.mjs:100 | 401 | Please sign in to do that. |
| api/manage.mjs:116 | 403 | The current password is incorrect. |
| api/manage.mjs:132 | 401 | Please sign in to do that. |
| api/manage.mjs:157 | 401 | Please sign in to do that. |
| api/manage.mjs:161 | 400 | That session is not valid. |
| api/manage.mjs:169 | 404 | That session is already gone. |
| api/manage.mjs:189 | 401 | Please sign in to do that. |
| api/register.mjs:86 | 400 | Username must be 3–24 characters and use only letters, numbers, and underscores. |
| api/register.mjs:90 | 400 | Password must be 12–128 characters long. |
| api/register.mjs:118 | 409 | That username is already taken. |
| api/register.mjs:137 | 503 | Account creation is temporarily unavailable. Try again in a moment. |
| api/sso.mjs:65 | 401 | Please sign in to do that. |
| api/sso.mjs:71 | 403 | This sign-in destination is not allowed. |
| api/sso.mjs:95 | 401 | Relay refused. |
| api/sso.mjs:114 | 400 | That sign-in ticket is not valid. |

**Server strings:** 38
**Junk filter exclusions:** className strings and lowercase multi-token identifiers, URLs/data URIs, icon selectors, state/boolean literals, content-type names - internal identifiers, not user copy.

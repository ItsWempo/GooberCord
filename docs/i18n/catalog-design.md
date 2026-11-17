# Translation catalog design — kit stack i18n module

Status: PROPOSAL (frontend-dev builds the loader; this doc only pins the contract).
Law compliance: vanilla imperative ES modules, no bundler, no dependencies, no framework — same style as the rest of public/js.

## One module: `public/js/i18n.js` (per repo), one data shape: `public/locales/<lang>.json`

```
public/js/i18n.js        ~120 lines, zero deps
public/locales/en.json   English source of truth (default, always complete)
public/locales/es.json   fr.json  de.json  pt.json  ru.json ...
```

JSON (not .js) so translations are pure data — a translator (human or agent) never
edits code, and a Worker route can serve/merge a single missing key later without
a script eval. JSON parses in one `Response.json()`; no `new Function`, no eval.

## Loading

```js
// i18n.js — imperative, import side-effect free
import { initI18n, t, applyDom } from "./i18n.js";
await initI18n();            // resolved from localStorage("lang") ?? navigator.language ?? "en"
t("gc.shell.nav.members");                        // "Members"
t("gc.compose.remaining", { n: 150 });           // interpolation
applyDom(document); // scans [data-i18n], [data-i18n-placeholder], [data-i18n-aria]
```

- `initI18n()` fetches `<lang>.json` with `{ cache: "force-cache" }`; on any failure
  (404, network) it silently continues with the `en` bundle — **fail-open to English**,
  never to a broken page. First paint never waits for the translation: `en.json` is
  fetched in parallel, and non-`en` is applied on resolve (locale swap is progressive,
  matching the theme-preload pattern).
- `applyDom()` is idempotent and re-called by each route render (same call sites
  that already re-run `render.js`-style painters). Attributes covered:
  - `data-i18n="gc.key"` → `textContent`
  - `data-i18n-placeholder="gc.key"` → `placeholder`
  - `data-i18n-aria="gc.key"` → `aria-label`
  `title`/`aria-label` set imperatively in modules use `t()` at render time.

## Key naming convention

`<product>.<area>.<topic>.<element>` — dotted, all-lowercase, no spaces:

| product | repo |
|---|---|
| `gc` | GooberCord rewrite client (the future client) |
| `forum` | Wempo forum |
| `acct` | Wempo Accounts |

Areas follow the existing client routes/shell:
`shell.*` (nav, sidebar, memberlist), `chat.*` (composer, messages, typing, pins),
`voice.*`, `auth.*` (login/2FA/register/password), `settings.*`, `mod.*`,
`economy.*`, `errors.*` (toast copy), `time.*` (relative stamps).

Examples from the inventories:
- `Sign in with Wempo Accounts` → `acct.auth.heading`
- `Account creation failed.` → `acct.errors.createFailed`
- `Nothing pinned in this channel yet.` → `gc.chat.pins.empty`
- `someone is typing…` → `gc.chat.typing` (template: `"{{user}} is typing…"`)
- `Search this server` → `gc.chat.search.placeholder`

Keys are stable names; the English string lives ONLY in `en.json`. Code never
carries copy after the sweep — the string inventories in this directory are the
sweep's worklist, one row = one proposed key.

## Interpolation + pluralization (minimal)

- Interpolation: `t(key, { user, n })` over `{{var}}` placeholders. No nested
  expressions, no HTML in messages (values are HTML-escaped by the setter).
- Pluralization, the minimal honest set: `t(key, {n})` looks up
  `"key", "key_one", "key_other"` — exactly the two-branch CLDR shape shared by
  en/es/fr/de/pt/ru for the ranges our copy uses. Russian and Arabic need their
  extra branches (`_few`, `_many`, `_zero`): the convention is **add the branch
  suffixed key in the language file when that language's plural rule demands it**;
  `t()` picks `key_<rule for n>` falling back `key_other` → `key`. No CLDR
  dependency; a ~20-line rule table covers the ~50 target languages.
- Dates/numbers: `Intl.DateTimeFormat` / `Intl.NumberFormat` (built into every
  shipping browser — zero cost). Only relative stamps get keys: `time.moments`,
  `time.minutesAgo` ... and the plural branches above. The client's
  `"just now"`/`"2m ago"` copy is centralized on this path.

## Fallback chain

`<lang>` → `<lang>`'s base script (`zh-cn` → `zh`) → `en` → the key's last segment
(literally `key.split('.').pop()` humanized) — so a missing key is *visible
garbage*, never silent, in dev; `en.json` is the only bundle that must be complete.
`gc`/`forum`/`acct` products do NOT inherit each other's bundles — one chain, one
product (shared terms re-declared per product via the glossary, not via lookup).

## Language selection + storage

- Stored per-viewer in `localStorage("lang")` (per-viewer convenience storage —
  the browser-storage law says per-viewer only, correct here).
- Default: `navigator.language` tag matched against the bundle list with the
  base-script fallback; unsupported tags fall to `en`.
- A `<html lang>` update rides the same swap (a11y requires it).

## Hard copy laws the catalog must carry (glossary.md is the rulebook)

- free (libre) software — never "open source"/"FOSS"; never "intellectual property".
- AGPLv3 stays verbatim-English in every locale (license names are not translated).
- No "cloud", no "piracy"/"protect" framing; DM/upload copy says "stored on our
  own infrastructure" / "your messages, our hardware, your control".

## Migration shape (per product)

1. frontend-dev lands `i18n.js` + `en.json` keyed from `inventory-<repo>.md`.
2. The sweep replaces literal copy with `t()` / `data-i18n` one module at a
   time (diff-scope law: each module its own commit).
3. Server-class strings (the `-server` sections of the inventories) stay
   English-answered in the Workers for this wave; the client maps the few
   rendered ones (`errors.<status>` / `errors.<key>`) — server never
   localizes; the client localizes what the server returns by key. Error
   responses gain a machine-parallel `error_code` when the sweep touches them.

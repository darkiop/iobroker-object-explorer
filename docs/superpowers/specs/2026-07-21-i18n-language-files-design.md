# i18n: Translations in Language Files

**Date:** 2026-07-21
**Status:** Approved, ready for planning

## Problem

UI translations live inline in the code. The pattern is:

```tsx
const isEn = language === 'en';
// ...
{isEn ? 'Optimize' : 'Optimieren'}
```

Current state, measured:

| Metric | Count |
|---|---|
| `isEn ?` occurrences | 1008 |
| Files containing `isEn` | 52 |
| Simple quoted pairs (`isEn ? 'A' : 'B'`) | 936 |
| Unique simple pairs | 628 |
| Components declaring a `language` prop | 54 |
| `language={language}` pass-through sites | 66 |

Hotspots: `SettingsModal` (85), `DpValuesModal` (79), `HelpModal` (65), `DbOverviewModal` (51), `StateListToolbar` (39), `HistoryChart` (37).

Secondary pattern: sibling keys in data structures — `labelEn`/`labelDe`, `shortEn`/`shortDe` in the `CHECKS` array in `OptimizeModal`.

`src/utils/i18n.ts` is unrelated. It localizes ioBroker *object names* (`common.name` as `Record<lang, string>`) and stays as is.

## Goals

1. **Support more languages.** Adding FR/IT must not mean touching 52 component files.
2. **Maintainability.** Strings scattered through JSX are hard to edit, review, and audit for coverage.

Explicitly not goals: bundle-size reduction, lazy-loading locales, external translator tooling (weblate/crowdin). JSON as the source format keeps those doors open.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Migration | Big bang | One branch, all 52 files. No dual-system period where new code copies the old pattern. |
| Source format | JSON, key union inferred via `resolveJsonModule` | Translator-friendly source plus compile-time key checking, with no generated artifact. |
| Runtime | Hand-rolled (~60 lines) | Needs are lookup + interpolation + one/other plurals + fallback. `i18next` is ~45 kB gz for CLDR plural rules no supported language requires. Swapping to it later is mechanical — the key shape is identical. |
| Key shape | Flat, dot-namespaced | Greppable (`grep -r "optimize\."`). A flat union is trivial to generate; nested needs recursive type gymnastics. |
| `language` prop | Deleted | `useT()` reads context directly. Big bang opens every file anyway — deleting it later means touching all 52 twice. |

## Architecture

```
src/i18n/
  locales/
    en.json          # source of truth, flat keys
    de.json
  index.ts           # t(), useT(), setLanguage()
  index.test.ts
scripts/
  check-i18n.mjs     # validates en.json <-> de.json
```

`tsconfig.app.json` gains `"resolveJsonModule": true` so `en.json` imports as a typed object literal. The key union is then inferred directly — no generated `.d.ts`, no build-order dependency between codegen and `tsc`.

### Locale file format

```json
{
  "common.cancel": "Cancel",
  "common.save": "Save",
  "optimize.title": "Optimize",
  "optimize.noRoom": "— no room —",
  "rename.exists": "\"{id}\" already exists.",
  "alias.created_one": "{count} alias created successfully.",
  "alias.created_other": "{count} aliases created successfully."
}
```

Namespace prefix mirrors the component area (`settings.`, `help.`, `dbOverview.`). `common.*` holds strings shared by three or more files.

### Public API

```ts
import en from './locales/en.json';

type TKey = keyof typeof en;
type TParams = Record<string, string | number>;

function t(key: TKey, params?: TParams): string;
function useT(): { t: (key: TKey, params?: TParams) => string; lang: 'en' | 'de' };
function setLanguage(lang: 'en' | 'de'): void;
```

- **`useT()`** — React hook. Reads `language` from `AppSettingsCtx`, the stable half of the UIContext split, so it adds no re-renders. Returns a memoized `t`.
- **`t()`** — standalone, for non-React callers (`utils/`, `api/`, toast helpers). Reads a module-level `currentLang` kept in sync by the provider via `setLanguage()`.

Identical signatures, so a string moves between a component and a util without a rewrite.

### Interpolation

`{name}` placeholders, replaced with `String(params[name])`. An unknown placeholder is left verbatim and warns in dev. No expression evaluation, no HTML — `t()` always returns a plain string, so no value can inject markup.

### Plurals

Caller passes `count`; the resolver picks the `_one` or `_other` variant:

```ts
t('alias.created', { count: n })
```

`count === 1` selects `_one`, anything else `_other`. If neither suffixed key exists, the bare key is used, so non-plural keys that happen to take a `count` param still work. This replaces the current fake plurals (`alias(es)`, `error(s)`) in `AutoCreateAliasModal`.

### Loading

Both locale JSONs are statically imported and bundled. EN+DE is roughly 40 kB raw / 10 kB gzipped; lazy-loading would buy little and cost a loading state plus a flash of untranslated content. Revisit past four languages.

### Fallback chain

requested language → `en` → the key string itself. A missing key warns via `console.warn` in dev, silent in prod.

### Rules

- **No markup in translation values.** Strings that currently wrap a `<strong>` or `<code>` mid-sentence get restructured into two composed keys, or accept losing that inline styling. No `<Trans>`-style component. This preserves the "`t` always returns a string" invariant that makes the module testable and injection-safe. Expect 10–15 such sites.
- **Sibling-key data structures** collapse to a single `labelKey: TKey` field, resolved at render via `t(c.labelKey)`.
- **`HelpModal` prose** uses one key per paragraph, same as everything else. Multi-sentence values in flat JSON are slightly awkward, but a second mechanism for one file costs more than it saves.

## Validation: `scripts/check-i18n.mjs`

The key union comes from TypeScript itself via `resolveJsonModule`, so nothing is generated. The script only validates what types cannot see:

- Every key in `de.json` exists in `en.json`, and the reverse.
- The `{placeholder}` set of each key matches across languages.

A mismatch exits non-zero. Wired as `npm run i18n:check` and run in CI. The same assertions also run as a Vitest test, so `npm test` catches drift without a separate command.

Net effect: a missing German translation, or `{count}` typo'd as `{cont}` in `de.json`, fails the build rather than the UI.

## Migration

Extraction is scripted, not hand-typed. Hand-migrating 52 files would produce inconsistent key names and silently dropped strings.

1. **Build `src/i18n/`** — module, tests, codegen script. Green with nothing else touched.
2. **Extract** — a throwaway `scripts/extract-i18n.mjs` walks the AST, finds `isEn ? A : B`, and emits a report of file, line, EN, DE, and a proposed key. The proposed key is `<namespace from file path>.<camelCase of EN>`; pairs appearing in three or more files are proposed as `common.*`. **The report is reviewed and corrected by hand before any rewrite** — key naming is a judgement call the script makes badly. The reviewed map generates `en.json` and `de.json`.
3. **Rewrite** — mechanically apply the map across all 52 files: `isEn ? …` becomes `t('…')`, `const isEn` is dropped, `useT()` is added. One commit per logical group.
4. **Drop the `language` prop** from 54 components and 66 pass-through sites.
5. **Dedup pass** — collapse the ~308 repeated pairs into `common.*` (`Cancel` alone appears 28×).
6. **Cleanup** — delete the throwaway extract script, run lint, `tsc`, tests.

Steps 3 and 4 are separately committed, so a bad rewrite reverts without losing step 1.

## Verification

| Check | Catches |
|---|---|
| `grep -r "isEn" src` returns zero | Incomplete migration. This is the completion criterion. |
| `tsc --noEmit` clean | Every invalid key — keys are a typed union. |
| `check-i18n.mjs` | EN/DE key-set divergence, placeholder mismatches. |
| Existing test suite | Behavioural regressions. |
| Dead-key test | Keys present in `en.json` but never referenced by a `t()` call. |

**What none of these catch:** a German value in an English slot, or a key wired to a wrong-but-valid string (`common.save` where `common.saveFailed` was meant). Types and greps see structure, not semantics. Mitigation is the hand-review of the key map in step 2 — the point at which every pair is read once — plus a manual click-through of the app in both languages before merge. That pass needs real time budgeted; the build does not guard it.

## Risks

- **Codemod syntax errors.** `{isEn ? 'a' : 'b'}` appears both as a JSX attribute value and as a JSX child; the rewrite must handle both. `tsc` fails loudly on a mistake, so the failure mode is safe rather than silent.
- **Markup-in-string sites.** The 10–15 cases from the rules above surface as the codemod's skip list and need hand restructuring.
- **Review burden.** The big-bang diff is large by construction. Per-group commits in steps 3–4 keep individual reviews tractable.

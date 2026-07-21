# Code Review — `fix/baseline-lint-tsc-test`

**Date:** 2026-07-21
**Range:** `6d9dc61..2bb2a34` (13 commits, 32 files, +2325/−330 vs `master`)
**Verdict:** Ready to merge **with fixes** — no Critical issues.

## Scope reviewed

1. Baseline repair: lint, `tsc --noEmit`, test failures (`08a2093`)
2. Pause mode — `src/utils/commPause.ts` + tests
3. Value validation against `common.min`/`common.max` — `src/utils/validation.ts`
4. Alias: copy `min`/`max`/`step`/`states`/`desc` from source object
5. `DpValuesModal`: purge values older than 3 months, row count + oldest value in header
6. `DbOverviewModal`: per-column filters, orphan scan, dedupe, history buttons; gap-probe perf change
7. New `OrphanValuesModal`: scan for `ts_*` rows whose numeric id is gone from `datapoints`, per-group delete with SQL preview
8. Docs refresh

## Verification

| Command | Result |
|---|---|
| `npm run lint` | Pass — 51 problems (0 errors, 51 warnings). All pre-existing `react-refresh/only-export-components` on context files, 3 `react-hooks/exhaustive-deps`, 2 unused-disable-directive in `FilterContext.tsx`. No warnings from new files. |
| `npx tsc --noEmit` | Pass — exit 0, no output. |
| `npm test` | Pass — 20 files, 207 tests, 0 failures, 5.95s. (`SelectionContext.test.tsx` prints a React error stack to stderr; that's a deliberately-thrown context error inside a passing assertion.) |

## Strengths

- **`buildOrphanDeleteSql` (`src/api/iobroker.ts:1195`)** re-checks orphan status at delete time via
  `NOT EXISTS (SELECT 1 FROM datapoints d WHERE d.id = n.id)`. A stale or false-positive scan result
  becomes a no-op DELETE rather than data loss. This one line downgrades the whole "can the perf
  optimization report a false orphan?" question from data-loss risk to cosmetic.
- **`deleteOrphanValueRows` (`src/api/iobroker.ts:868`)** validates the table name against a
  `TS_TABLES` whitelist *before* any string interpolation, and floors/`isFinite`-checks the id.
  Covered at `src/api/iobroker.test.ts:376`, including a `'ts_number; DROP TABLE datapoints'` case
  asserting `fetch` was never called.
- **Destructive actions verify instead of trusting the adapter.** `purgeOld` re-counts after
  `deleteHistoryRange`; `runDedupe` re-scans. The code comment — "The sql adapter answers
  `{success:true}` unconditionally — even when it discarded the request" — reflects real
  investigation, not assumption.
- **`deleteHistoryRange` clamping start to `>= 1` (`src/api/iobroker.ts:717`)**, traced in a comment
  to the adapter's `if (message.start)` truthiness gate. Subtle upstream bug caught.
- **The gap-probe optimization is logically equivalent to the full LEFT JOIN, not an approximation.**
  An orphan id is by definition absent from `datapoints`, and any orphan row's id is `<= MAX(id)`
  across the `ts_*` tables — so deriving candidates from gaps in `[1, maxId]` is exact.
  `ORPHAN_MAX_CANDIDATES` fails loudly rather than degrading silently. `buildOrphanValuesSql` is
  retained as the copyable reference form with a comment stating the live scan does *not* run it.
- **Testable logic extracted from I/O.** `pickDuplicateTs` (`src/api/iobroker.ts:1015`) is pure,
  separated from `findConsecutiveDuplicateTs`'s paging loop, with 10 tests covering runs, cross-chunk
  carry, type coercion (`0`/`false`, `1.5`/`'1.5'`), case-sensitive strings. `commPause.ts` follows
  the same pattern (11 tests).
- **Every destructive dialog previews its SQL** before confirming; both `DbOverviewModal` and
  `DpValuesModal` carry a persistent irreversibility banner. Backdrop clicks suppressed while an
  operation is in flight (`OrphanValuesModal.tsx:94`, and the `DpValuesModal` purge/add/dedupe
  dialogs); Escape unwinds one layer at a time.

## Issues

### Critical (Must Fix)

None. The SQL and delete paths were probed specifically for escaping, id handling, confirmation
gating, and false orphans — no data-loss defect found.

### Important (Should Fix)

#### 1. `sqlQuote` does not escape backslashes — `src/api/iobroker.ts:731`

```js
function sqlQuote(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}
```

Under MySQL/MariaDB defaults (`NO_BACKSLASH_ESCAPES` off) backslash is an escape character, so
doubling single quotes alone is insufficient. An id ending in `\` produces `'...\'`, where the `\'`
escapes the closing quote and the remainder of the statement becomes attacker-controlled — against a
`query` sendTo that runs arbitrary SQL.

The function is pre-existing, but this branch substantially expands its blast radius: it now feeds
`buildDpPurgeSql`, `buildDpInsertSql`, `buildDpDedupeSql`, `getDpValueSpan`, and `dpValueSql` — and
`dpValueSql` quotes arbitrary user-entered *string values*, a far wider input surface than ids ever
were. Exploitability is low (ioBroker ids rarely contain backslashes, and `isValidIoBrokerId` rejects
them), but the string-value path in `insertDpValue`/`updateDpValue` accepts anything typed.

**Fix:** `v.replace(/\\/g, '\\\\').replace(/'/g, "''")`

#### 2. Pause mode does not stop the connectivity poll — `src/hooks/useApiConnectivity.ts:60`

Commit intent is "globally stop all live communication", and `commPause.ts`'s header claims "Single
source of truth so 'pause = stop all live traffic' stays consistent". But `useApiConnectivity` keeps
a `setInterval` firing `fetch(.../objects?pattern=system.config)` regardless of `paused` — it is not
wired to the flag at all. Pause silences the object poll, state poll, and both push transports, but
leaves a periodic health request running.

Likely deliberate (keeps the header badge accurate while paused), but nothing records that. Either
gate it or add a comment in `commPause.ts` documenting the exception.

#### 3. No tests for the riskiest new code

`pickDuplicateTs` and the SQL *builders* are well covered; the code that decides what actually gets
deleted is not:

- `getOrphanValueRows` — gap-probe candidate derivation, the `maxId` bound, the
  `ORPHAN_MAX_CANDIDATES` throw. Most consequential new algorithm, zero tests, pure enough to test
  with a mocked `querySql`.
- `findConsecutiveDuplicateTs` — the paging/carry loop around the tested pure helper.
- `insertDpValue` duplicate-timestamp pre-check; `buildDpPurgeSql` / `buildDpInsertSql` /
  `buildDpDedupeSql`.
- `matchesTsFilter` and `isTsColumn` (`DbOverviewModal.tsx:701,720`) — module-level pure functions,
  trivially testable, currently unexported and untested.

#### 4. `findConsecutiveDuplicateTs` uses OFFSET paging — `src/api/iobroker.ts:1063`

`LIMIT 50000 OFFSET n` makes MySQL walk and discard the first `n` rows on every chunk, so a datapoint
with 1M stored values does roughly 20x the index work it needs. The query already sorts
`ORDER BY n.ts ASC` on the `(id, ts)` PK, so keyset paging (`AND n.ts > lastSeenTs`) is a one-line
change turning each chunk into an index seek. Matters because dedupe targets exactly the bloated
datapoints where this is slowest.

### Minor (Nice to Have)

5. **Two meanings of "orphan" in adjacent UI.** `DbOverviewModal`'s `DpStatus = 'orphan'`
   (`DbOverviewModal.tsx:25`) means *a `datapoints` row whose ioBroker object is gone*;
   `OrphanValuesModal` means *`ts_*` rows whose id is missing from `datapoints`*. Opposite directions
   of the same join, both reachable from the same toolbar, both labeled "Orphan"/"Verwaist". Tooltips
   disambiguate; the column header and button do not. Consider "Orphan value rows" vs "Object
   missing".
6. **Candidate scan starts at id 1.** `getOrphanValueRows` iterates `for (let id = 1; id <= maxId; id++)`,
   so orphan rows with id `0` or negative are invisible. Safe for AUTO_INCREMENT in practice; worth a
   one-line comment stating the assumption.
7. **Non-numeric `datapoints.id` yields a phantom candidate.** `live.add(Number(r.id))`
   (`src/api/iobroker.ts:809`) — a row whose id fails to parse becomes `NaN` in the set, so its real
   id is never matched and gets probed. Harmless thanks to the `NOT EXISTS` guard, but surfaces as a
   confusing false row.
8. **Boolean "add row" accepts an empty value.** `addValValid` (`DpValuesModal.tsx`) short-circuits
   `true` for `boolean`, and `addVal` initializes to `''`. The select renders `''` as `false` and
   `dpValueSql` coerces `''` → `0`, so behavior matches the display — but implicitly. Initializing
   `addVal` to `'false'` in `startAdd()` would make it explicit.
9. **`useDpValueSpan` / `useDpNumericId` bypass the query key factory.** `useObjectQueries.ts:184,195`
   use inline `['history', 'dpValueSpan', ...]` literals rather than `queryKeys`, against the
   CLAUDE.md convention. Consistent with the pre-existing `useDpValues` (line 166) directly above, so
   this follows local precedent rather than introducing the deviation.
10. **`useDpNumericId` uses `staleTime: Infinity`** with the comment "immutable for a given name".
    Not strictly true — deleting a datapoint's history and re-logging mints a new `datapoints.id`.
    Only the header badge is affected (mutation paths call `resolveDpNumericId` directly), so impact
    is cosmetic.
11. **CLAUDE.md says state values refresh "every 30s"** but `STATES_POLL_MS = 10_000` matches actual
    prior behavior. Pre-existing staleness; this branch touched both the doc and the polling
    constant, so it was the natural moment to fix it.

## Recommendations

1. Fix `sqlQuote` backslash escaping (one line) — cheapest high-value hardening, protects every path
   this branch added.
2. Add tests for `getOrphanValueRows` with a mocked `querySql`: a `datapoints` set with a known gap,
   an orphan above `max(datapoints.id)`, and the `ORPHAN_MAX_CANDIDATES` throw. Export and test
   `matchesTsFilter` / `isTsColumn` at the same time — both cheap.
3. Decide and document the pause / connectivity-poll question either way.
4. Switch dedupe paging to keyset before anyone runs it on a million-row datapoint.

## Assessment

**Ready to merge?** With fixes.

**Reasoning:** The data-deleting paths — the part that carries actual risk — are carefully built:
whitelisted table names, floored numeric ids, a `NOT EXISTS` re-check that makes stale scan results
harmless, post-delete verification rather than trusting the adapter, and SQL preview before every
confirm. The gap-probe optimization is logically equivalent to the full scan, not an approximation.
What's missing is hardening (`sqlQuote` backslashes) and tests for the orphan scan itself; neither
blocks correctness of what exists, but item 1 is small enough that it should not ship without it.

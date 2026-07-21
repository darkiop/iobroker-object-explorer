# Optimization Plan Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the three remaining *small/medium* items from `docs/OPTIMIZATION_PLAN.md` (M-03, M-07, M-08) that are still actionable as scoped, verified against the current codebase (2026-07-05).

**Architecture:** No architectural change. Three independent, surgical fixes: (1) real code-splitting for heavy modal chunks that are currently defeated by a duplicate static import path, (2) O(n) tokenizer instead of per-ID regex compilation for script-usage detection, (3) full parallelization of bulk object delete.

**Tech Stack:** React 18 lazy/Suspense, Vitest, existing `src/api/iobroker.ts` helpers.

---

## Context: what changed since the original plan (2026-06-12)

Re-verified against current code on 2026-07-05:

- **M-01** (redundant `/objects` requests): stays reverted, correctly documented already. Not in scope here.
- **M-02** (enum cache-bypass): done. Not in scope.
- **M-04** (search index): done. Not in scope.
- **M-05** (split `StateList.tsx`): largely already done — file is 1554 lines with only 2 raw `useState` calls left (state extracted into `useStateListModals`/`useStateListView`). Not worth a bite-sized plan right now; re-assess only if the file grows again.
- **M-06** (module-level promise singletons in `src/api/iobroker.ts`): still open, but larger than it looks — there are now *three* separate cache-checked-flag singletons (`_stateObjectsFastCacheChecked`, `_allObjectsCacheChecked`, `_scriptSourcesCacheChecked`) plus the original four. Any fix needs its own design pass (shared cache-invalidation helper) — **out of scope for this plan**, needs a dedicated spec first.
- **M-09** (virtualize `StateTree`): confirmed still fully unaddressed (`@tanstack/react-virtual` not imported in `StateTree.tsx`; tree renders every expanded node as a real DOM node via recursive `.map()`). This is a real rewrite of `TreeNodeComponent`'s expand-state model (each node currently owns its own `useState` for `expanded` — a flat virtualized list needs expand-state lifted to a single `Set<string>` in the parent). That redesign is **out of scope for this plan** — needs its own plan with the state-lifting design worked out first.
- **M-03** (lazy-load modals): the original plan's fix was already applied in `src/App.tsx` (7 modals wrapped in `lazy()`), **but it doesn't work** — see Task 3 below, this is actually a *new*, more precise finding.
- **M-07** (`getScriptUsedIds` regex loop): batching + localStorage caching already added since the original plan, but the actual perf complaint (fresh `RegExp` compiled per ID per call) is still present. Scoped down accordingly in Task 1.
- **M-08** (`deleteObjectsMany` sequential chunks): unchanged, exactly as originally documented. Task 2 below.

This plan covers **Task 1 (M-07), Task 2 (M-08), Task 3 (M-03)** only, in that order (independent, can be done in any order or split across subagents).

---

### Task 1: Replace per-ID regex compilation in `getScriptUsedIds` with a tokenizer

**Files:**
- Modify: `src/api/iobroker.ts:992-1016` (`getScriptUsedIds`)
- Test: `src/api/iobroker.test.ts`

**Current implementation** (`src/api/iobroker.ts:992-1016`):

```ts
export async function getScriptUsedIds(allObjectIds: string[], forceRefresh = false): Promise<Set<string>> {
  if (!forceRefresh) {
    const ts = localStorage.getItem(LS_SCRIPT_IDS_TS_KEY);
    if (ts && Date.now() - parseInt(ts) < SCRIPT_IDS_TTL) {
      const raw = localStorage.getItem(LS_SCRIPT_IDS_KEY);
      if (raw) {
        try { return new Set<string>(JSON.parse(raw)); } catch { /* fallthrough */ }
      }
    }
  }
  const sources = await fetchScriptSources();
  const used: string[] = [];
  const BATCH = 200;
  for (let i = 0; i < allObjectIds.length; i += BATCH) {
    for (const id of allObjectIds.slice(i, i + BATCH)) {
      if (new RegExp('\\b' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(sources)) used.push(id);
    }
    if (i + BATCH < allObjectIds.length) await new Promise<void>(r => setTimeout(r, 0));
  }
  try {
    localStorage.setItem(LS_SCRIPT_IDS_KEY, JSON.stringify(used));
    localStorage.setItem(LS_SCRIPT_IDS_TS_KEY, String(Date.now()));
  } catch { /* ignore storage quota errors */ }
  return new Set<string>(used);
}
```

This compiles one `RegExp` object per object ID, every call. At 5000 IDs against a ~1MB source string, that's 5000 regex compilations + 5000 full-string scans.

**Approach:** tokenize `sources` once into a `Set<string>` of `[\w.]+` runs, then test membership per ID. Not 100% equivalent to `\b`-anchored regex (e.g. an ID that appears as a substring of a longer dotted token won't match, which is actually *more* correct than the old `\b` behavior for dotted IDs — `\b` does not treat `.` as a word boundary the way people expect, so `foo.bar.baz` would already match the old regex for id `bar.baz` because `\b` sits at the `r`→`.` transition... actually `\b` is between word-char and non-word-char, and `.` is non-word, so behavior is equivalent for our real ID charset `[a-zA-Z0-9_.]`). Verify equivalence with a test that mixes both a real match and a false-positive-prone case (id as substring of a longer token) before relying on it.

- [ ] **Step 1: Write failing tests for tokenizer-based matching**

Add to `src/api/iobroker.test.ts` (append at end of file, reusing the existing `describe`/`it`/`expect` imports already at the top):

```ts
import { getScriptUsedIds, clearScriptUsedIdsCache } from './iobroker'

describe('getScriptUsedIds', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('finds an id that appears as a whole dotted token in script source', async () => {
    const scriptObj = {
      _id: 'script.js.test',
      type: 'script',
      common: { source: 'if (getState("javascript.0.myVar").val) { setState("javascript.0.other", 1); }' },
      native: {},
    }
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ 'script.js.test': scriptObj }),
    })
    const used = await getScriptUsedIds(['javascript.0.myVar', 'javascript.0.other', 'javascript.0.unused'])
    expect(used.has('javascript.0.myVar')).toBe(true)
    expect(used.has('javascript.0.other')).toBe(true)
    expect(used.has('javascript.0.unused')).toBe(false)
  })

  it('does not false-positive on an id that is a substring of a longer token', async () => {
    const scriptObj = {
      _id: 'script.js.test',
      type: 'script',
      common: { source: 'getState("javascript.0.myVarExtended")' },
      native: {},
    }
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ 'script.js.test': scriptObj }),
    })
    const used = await getScriptUsedIds(['javascript.0.myVar'])
    expect(used.has('javascript.0.myVar')).toBe(false)
  })

  it('caches result in localStorage and skips refetch within TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })
    vi.stubGlobal('fetch', fetchMock)
    await getScriptUsedIds(['javascript.0.a'])
    await getScriptUsedIds(['javascript.0.a'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('forceRefresh bypasses cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })
    vi.stubGlobal('fetch', fetchMock)
    await getScriptUsedIds(['javascript.0.a'])
    await getScriptUsedIds(['javascript.0.a'], true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
```

Also add `vi` to the existing top-of-file import: change

```ts
import { describe, it, expect } from 'vitest'
```

to

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
```

- [ ] **Step 2: Run tests to verify they fail (or pass trivially against old impl)**

Run: `npx vitest run src/api/iobroker.test.ts -t getScriptUsedIds`
Expected: the new tests run against the *current* regex-based implementation. They should already PASS (the old impl is functionally correct, just slow) — this is a refactor, not a bugfix, so there is no red step here. Confirm all 4 new tests pass before touching the implementation, so any later failure is attributable to the refactor.

- [ ] **Step 3: Replace implementation with tokenizer**

Edit `src/api/iobroker.ts:992-1016`:

```ts
export async function getScriptUsedIds(allObjectIds: string[], forceRefresh = false): Promise<Set<string>> {
  if (!forceRefresh) {
    const ts = localStorage.getItem(LS_SCRIPT_IDS_TS_KEY);
    if (ts && Date.now() - parseInt(ts) < SCRIPT_IDS_TTL) {
      const raw = localStorage.getItem(LS_SCRIPT_IDS_KEY);
      if (raw) {
        try { return new Set<string>(JSON.parse(raw)); } catch { /* fallthrough */ }
      }
    }
  }
  const sources = await fetchScriptSources();
  const tokens = new Set(sources.match(/[\w.]+/g) ?? []);
  const used = allObjectIds.filter((id) => tokens.has(id));
  try {
    localStorage.setItem(LS_SCRIPT_IDS_KEY, JSON.stringify(used));
    localStorage.setItem(LS_SCRIPT_IDS_TS_KEY, String(Date.now()));
  } catch { /* ignore storage quota errors */ }
  return new Set<string>(used);
}
```

Note: the `BATCH`/`setTimeout(r, 0)` yield loop is removed — the tokenizer does one regex `.match()` over the full source plus a `Set` build and a filter, all synchronous but O(n), no per-ID compilation. If this ever proves to block the main thread on very large script sets, revisit with a Web Worker; not needed for the current scale (thousands of IDs, low-MB source).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/api/iobroker.test.ts -t getScriptUsedIds`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `npm test`
Expected: all existing tests still pass (no other test references `getScriptUsedIds`'s old batching behavior).

- [ ] **Step 6: Commit**

```bash
git add src/api/iobroker.ts src/api/iobroker.test.ts
git commit -m "perf(api): tokenize script sources once instead of per-id regex in getScriptUsedIds"
```

---

### Task 2: Fully parallelize `deleteObjectsMany`

**Files:**
- Modify: `src/api/iobroker.ts:759-771` (`deleteObjectsMany`)
- Test: `src/api/iobroker.test.ts`

**Current implementation** (`src/api/iobroker.ts:759-771`):

```ts
export async function deleteObjectsMany(ids: string[]): Promise<void> {
  const CHUNK = 8;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const results = await Promise.all(
      ids.slice(i, i + CHUNK).map(id =>
        fetch(`${getBaseUrl()}/object/${encodeURIComponent(id)}`, { method: 'DELETE' })
      )
    );
    for (const res of results) {
      if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
    }
  }
}
```

100 IDs → 13 sequential round trips of 8. Target use is a local/home-network ioBroker instance (per project's documented LAN-only design), so full parallelization is safe.

- [ ] **Step 1: Write failing test for parallel dispatch**

Add to `src/api/iobroker.test.ts`:

```ts
import { deleteObjectsMany } from './iobroker'

describe('deleteObjectsMany', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fires all DELETE requests concurrently, not in chunks of 8', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' })
    vi.stubGlobal('fetch', fetchMock)
    const ids = Array.from({ length: 20 }, (_, i) => `test.0.item${i}`)
    await deleteObjectsMany(ids)
    expect(fetchMock).toHaveBeenCalledTimes(20)
    // all calls must have been issued before any awaited a response —
    // i.e. Promise.all across the full id list, not chunked awaits.
    // Verified indirectly: with the old CHUNK=8 loop this test still passes
    // (equivalent call count), so the real assertion is the timing test below.
  })

  it('issues every request before waiting on any response (no chunk barrier)', async () => {
    let resolveFns: Array<() => void> = []
    const fetchMock = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveFns.push(() => resolve({ ok: true, status: 200, statusText: 'OK' }))
    }))
    vi.stubGlobal('fetch', fetchMock)
    const ids = Array.from({ length: 20 }, (_, i) => `test.0.item${i}`)
    const done = deleteObjectsMany(ids)
    await Promise.resolve() // flush microtask queue once
    expect(fetchMock).toHaveBeenCalledTimes(20) // all 20 dispatched immediately, not just first 8
    resolveFns.forEach((fn) => fn())
    await done
  })

  it('throws if any delete fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' })
    vi.stubGlobal('fetch', fetchMock)
    await expect(deleteObjectsMany(['test.0.a'])).rejects.toThrow('API error: 500 Server Error')
  })
})
```

- [ ] **Step 2: Run test to verify the timing test fails against current chunked implementation**

Run: `npx vitest run src/api/iobroker.test.ts -t "issues every request before waiting"`
Expected: FAIL — with `CHUNK = 8`, only 8 calls happen before the first `await Promise.all(...)` in the loop blocks on those 8 unresolved promises, so `fetchMock` call count is 8, not 20.

- [ ] **Step 3: Rewrite to full parallelization**

Edit `src/api/iobroker.ts:759-771`:

```ts
export async function deleteObjectsMany(ids: string[]): Promise<void> {
  const results = await Promise.all(
    ids.map(id =>
      fetch(`${getBaseUrl()}/object/${encodeURIComponent(id)}`, { method: 'DELETE' })
    )
  );
  for (const res of results) {
    if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/api/iobroker.test.ts -t deleteObjectsMany`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/api/iobroker.ts src/api/iobroker.test.ts
git commit -m "perf(api): fully parallelize deleteObjectsMany instead of chunking by 8"
```

---

### Task 3: Fix defeated code-splitting for heavy modals

**Files:**
- Modify: `src/components/modals/StateListModals.tsx:1-25` (imports), `:196-224`, `:436` (render sites)
- Verify: production build output in `dist/assets/`

**Root cause:** `src/App.tsx:15-24` wraps `HistoryModal`, `NewDatapointModal`, `EnumManagerModal`, `AliasReplaceModal`, `AutoCreateAliasModal`, `CreateAliasModal`, `SettingsModal` in `lazy()` — but every one of these (except `EnumManagerModal`/`AliasReplaceModal`/`SettingsModal`) is *also* statically imported in `src/components/modals/StateListModals.tsx:4-16`, which is itself statically imported by `src/components/statelist/StateList.tsx:9`, which is statically imported by `App.tsx:12`. Rollup/Vite resolves a module into the main chunk if there is *any* static import path to it, regardless of the `lazy()` wrapper elsewhere — so `HistoryModal` (pulls in Recharts) and `NewDatapointModal`/`CreateAliasModal` still ship in the initial bundle today. This matches the `// NOTE: also statically imported...` comments already left in `App.tsx:14,16,22`.

The fix belongs in `StateListModals.tsx`, the file with the actual static imports. Scope this task to the two heaviest offenders: `HistoryModal` (Recharts — the biggest single dependency) and `OptimizeModal`/`TreeStatsModal`/`ImportDatapointsModal` (rarely opened, no reason to be eager). Leave `ObjectEditModal`, `ConfirmDialog`, `ValueEditModal`, `MultiDeleteDialog`, `CopyDatapointModal`, `RenameDatapointModal`, `MoveDatapointModal` as static imports — they're opened via the primary row-click flow often enough that lazy-loading them would trade bundle size for click latency with little payoff, and `ObjectEditModal` is also used synchronously elsewhere (`StateTree.tsx:4`).

**Current relevant imports** (`src/components/modals/StateListModals.tsx:4-16`):

```ts
import NewDatapointModal from './NewDatapointModal';
import ImportDatapointsModal from './ImportDatapointsModal';
import OptimizeModal from './OptimizeModal';
import ObjectEditModal from './ObjectEditModal';
import CreateAliasModal from './CreateAliasModal';
import CopyDatapointModal from './CopyDatapointModal';
import RenameDatapointModal from './RenameDatapointModal';
import MoveDatapointModal from './MoveDatapointModal';
import HistoryModal from './HistoryModal';
import ConfirmDialog from './ConfirmDialog';
import MultiDeleteDialog from './MultiDeleteDialog';
import ValueEditModal from './ValueEditModal';
import TreeStatsModal from './TreeStatsModal';
```

**Current render sites** (`src/components/modals/StateListModals.tsx:195-224` and `:436`):

```tsx
      {importOpen && (
        <ImportDatapointsModal
          onClose={onCloseImport}
          language={language}
          existingIds={allObjectIds}
        />
      )}
      {optimizeOpen && (
        <OptimizeModal
          onClose={onCloseOptimize}
          language={language}
          allObjects={allObjects}
          roomMap={Object.fromEntries(roomEnums.map(r => [r.id, r.name]))}
          functionMap={Object.fromEntries(fnEnums.map(f => [f.id, f.name]))}
          roomEnums={roomEnums}
          fnEnums={fnEnums}
          initialPath={optimizePath}
          onOpenEdit={onOpenEditFromOptimize}
        />
      )}
      {historyModalId && (
        <HistoryModal
          stateId={historyModalId}
          unit={objects[historyModalId]?.common?.unit}
          objects={objects}
          language={language}
          initialExtraSeries={historyInitialExtra.length > 0 ? historyInitialExtra : undefined}
          onClose={onCloseHistory}
        />
      )}
```

(`TreeStatsModal` render site is at line 436 — same `{flag && <Modal .../>}` shape, confirm exact props by reading that line before editing since it wasn't included in this excerpt.)

- [ ] **Step 1: Read the TreeStatsModal render site to capture its exact props**

Run: `sed -n '430,445p' src/components/modals/StateListModals.tsx`

Copy its current JSX verbatim before editing so no props are dropped in Step 3.

- [ ] **Step 2: Write a build-output test (manual verification script, not vitest)**

This is a bundle-shape change, not a logic change — Vitest can't assert on Rollup chunk output. Instead, capture a *before* baseline:

Run: `npm run build && ls -la dist/assets/*.js | sort -k5 -n`

Save this output (paste into a scratch file or just note the largest JS chunk's size in KB — this is `index-*.js`, the main entry chunk). This is the number Step 6 must reduce.

- [ ] **Step 3: Convert the four imports to `lazy()`**

Edit `src/components/modals/StateListModals.tsx:4-16` — remove these four static imports:

```ts
import NewDatapointModal from './NewDatapointModal';
import ImportDatapointsModal from './ImportDatapointsModal';
import OptimizeModal from './OptimizeModal';
import HistoryModal from './HistoryModal';
```
(keep `TreeStatsModal`'s static import line for now, converted separately below since it's imported once, used once — same mechanics)

Add near the top of the file, after the existing imports, using React's `lazy`:

```ts
import { lazy, Suspense } from 'react';

const NewDatapointModal = lazy(() => import('./NewDatapointModal'));
const ImportDatapointsModal = lazy(() => import('./ImportDatapointsModal'));
const OptimizeModal = lazy(() => import('./OptimizeModal'));
const HistoryModal = lazy(() => import('./HistoryModal'));
const TreeStatsModal = lazy(() => import('./TreeStatsModal'));
```

Remove the old `import TreeStatsModal from './TreeStatsModal';` line.

- [ ] **Step 4: Wrap each lazy modal's render site in its own `<Suspense fallback={null}>`**

Edit `src/components/modals/StateListModals.tsx:195-224` (and the `NewDatapointModal` render site — search for `newDatapointOpen &&` or equivalent flag, and the `TreeStatsModal` site found in Step 1):

```tsx
      {importOpen && (
        <Suspense fallback={null}>
          <ImportDatapointsModal
            onClose={onCloseImport}
            language={language}
            existingIds={allObjectIds}
          />
        </Suspense>
      )}
      {optimizeOpen && (
        <Suspense fallback={null}>
          <OptimizeModal
            onClose={onCloseOptimize}
            language={language}
            allObjects={allObjects}
            roomMap={Object.fromEntries(roomEnums.map(r => [r.id, r.name]))}
            functionMap={Object.fromEntries(fnEnums.map(f => [f.id, f.name]))}
            roomEnums={roomEnums}
            fnEnums={fnEnums}
            initialPath={optimizePath}
            onOpenEdit={onOpenEditFromOptimize}
          />
        </Suspense>
      )}
      {historyModalId && (
        <Suspense fallback={null}>
          <HistoryModal
            stateId={historyModalId}
            unit={objects[historyModalId]?.common?.unit}
            objects={objects}
            language={language}
            initialExtraSeries={historyInitialExtra.length > 0 ? historyInitialExtra : undefined}
            onClose={onCloseHistory}
          />
        </Suspense>
      )}
```

For `NewDatapointModal` and `TreeStatsModal`, apply the identical `<Suspense fallback={null}>{flag && <Modal .../>}</Suspense>` wrap using the exact props captured in Step 1 / found via `grep -n "NewDatapointModal" src/components/modals/StateListModals.tsx`.

- [ ] **Step 5: Reconcile with `App.tsx`'s now-redundant `lazy()` wrappers**

`App.tsx:15,17,23` (`HistoryModal`, `NewDatapointModal`, `CreateAliasModal`) already declare `lazy()` versions used by `App.tsx` directly (not through `StateListModals.tsx`). Since `CreateAliasModal` is out of scope for this task (left static in `StateListModals.tsx` per the scoping decision above), leave `App.tsx`'s `CreateAliasModal` lazy wrapper as-is — it now correctly creates its own chunk since no other static import path remains, so double check that after this change `CreateAliasModal` has no other static importer:

Run: `grep -rn "from '.*CreateAliasModal'" src/ --include=*.tsx --include=*.ts | grep -v "lazy("`

Expected: no remaining non-lazy static import of `CreateAliasModal` outside `App.tsx`'s own `lazy()` line. If `StateTree.tsx` or elsewhere still imports it statically, note it but do not fix in this task (out of scope — flag for a follow-up).

Remove the stale `// NOTE: also statically imported in StateListModals.tsx — not a real split chunk yet` comments on `App.tsx:14,16,22` for `HistoryModal` and `NewDatapointModal` (now true lazy chunks), but leave the `CreateAliasModal` note only if Step 5's grep still finds a static importer.

- [ ] **Step 6: Rebuild and confirm chunk split**

Run: `npm run build && ls -la dist/assets/*.js | sort -k5 -n`

Expected: several new smaller chunk files appear (one per lazy component, Vite names them like `HistoryModal-<hash>.js`), and the main `index-*.js` entry chunk is measurably smaller than the Step 2 baseline (Recharts alone is typically 100-150KB minified — expect at least that much off the main chunk).

- [ ] **Step 7: Manually verify the app still works**

Run: `npm run dev`, open the app in a browser, and exercise:
- Click a history icon on a row → HistoryModal opens (confirms lazy chunk loads correctly)
- Toolbar → "New" → NewDatapointModal opens
- Toolbar → "Import" → ImportDatapointsModal opens
- Toolbar → "Optimize" → OptimizeModal opens
- Toolbar/menu → tree stats action → TreeStatsModal opens

Expected: no console errors, no blank/frozen UI on open (Suspense fallback is `null` so there may be a brief flash — acceptable for a modal).

- [ ] **Step 8: Run full test suite**

Run: `npm test`
Expected: all tests pass (no test directly imports these modals in a way that breaks under `lazy()` — if any test does `import HistoryModal from './HistoryModal'` directly for shallow rendering, that's unaffected since the test imports the component file directly, not through `StateListModals.tsx`).

- [ ] **Step 9: Commit**

```bash
git add src/components/modals/StateListModals.tsx src/App.tsx
git commit -m "perf(modals): lazy-load HistoryModal/OptimizeModal/ImportDatapointsModal/TreeStatsModal/NewDatapointModal at their actual static-import site"
```

---

## Self-Review

**Spec coverage:** M-07 → Task 1. M-08 → Task 2. M-03 → Task 3 (rescoped to the real defect: duplicate static-import path defeating `lazy()`, not "add lazy() somewhere"). M-01/M-02/M-04 already done, confirmed unchanged. M-05 confirmed already largely resolved, no task needed. M-06 and M-09 explicitly deferred with reasoning (both need their own design pass before a bite-sized plan can be written without placeholders).

**Placeholder scan:** no TBD/TODO, all code blocks are complete, all file:line references verified against the current tree on 2026-07-05.

**Type consistency:** `getScriptUsedIds(allObjectIds: string[], forceRefresh = false): Promise<Set<string>>` signature unchanged across Task 1 test and implementation. `deleteObjectsMany(ids: string[]): Promise<void>` unchanged across Task 2. Task 3 introduces no new exported symbols, only changes import style — prop shapes copied verbatim from current render sites.

---

## Out of scope (needs its own plan)

- **M-06** — consolidate `_objectsFetchPromise`, `_fastObjectsPromise`, `_bulkStatesSupported`, `_commandStatesSupported`, `_stateObjectsFastCacheChecked`, `_allObjectsCacheChecked`, `_scriptSourcesCacheChecked` into one cache-invalidation mechanism (or drop in favor of TanStack Query's own dedup, per the original plan's recommendation). Needs a design decision first: keep custom promise-caching or fully delegate to `staleTime: Infinity` query hooks.
- **M-09** — virtualize `StateTree`. Needs the per-node `expanded` state (`useState` inside `TreeNodeComponent`, `StateTree.tsx:80`) lifted to a single `Set<string>` owned by the parent before a flat virtualized list is possible — that's a behavior-preserving refactor that deserves its own TDD plan given how much context-menu/drag-drop/filter logic is interleaved in `TreeNodeComponent` (`StateTree.tsx:28-497`).

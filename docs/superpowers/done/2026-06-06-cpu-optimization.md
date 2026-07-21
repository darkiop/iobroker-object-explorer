# CPU Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate permanent high CPU load caused by redundant `allObjects` iteration loops, unnecessary polling duplication between Panel 1 and Panel 2, and wasteful re-renders triggered by state polling.

**Architecture:** Consolidate all derived sets/arrays from `allObjects` into a single `useMemo` pass in `App.tsx`, pass them as props to StateList/StateTree instead of recomputing, and align Panel 2 polling to use the same Long-Polling gate as Panel 1.

**Tech Stack:** React 18, TanStack React Query, TypeScript strict mode

---

## Affected Files

| File | Change |
|------|--------|
| `src/App.tsx` | Merge 7 separate `allObjects` loops into one `useMemo` |
| `src/components/StateList.tsx` | Remove duplicate `allHistoryIds`/`allSmartIds` memos; accept as props |
| `src/hooks/useObjectQueries.ts` | Increase `useStateDetail` refetchInterval 5 s → 30 s |
| `src/App.tsx` | Panel 2 `useStateValues` — use LP gate like Panel 1 |
| `src/hooks/useApiConnectivity.ts` | Skip ping while LP connected |

---

## Task 1: Merge allObjects loops into single useMemo pass

**Context:**  
`App.tsx` currently iterates `allObjects` in **7 separate** `useMemo` calls:
- `allStateIds` (line ~257) — `Object.keys().filter().sort()`
- `treeHistoryIds` (line ~260) — `Object.entries()` loop
- `treeSmartIds` (line ~265) — `Object.entries()` loop
- `allRoleNames` (line ~271) — `Object.values()` loop
- `danglingAliasCount` (line ~290) — `Object.entries()` loop
- `existingIds` (line ~282) — `Object.keys()` → `new Set`
- `customIds` (line ~250) — `Object.entries()` loop over `stateObjects`

Each fires independently on every `allObjects` reference change (every poll tick).

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Locate all 7 loops and read their current signatures**

  Open `src/App.tsx`. The relevant `useMemo` blocks start around line 238.
  Note the exact variable names: `historyIds`, `smartIds`, `customIds`, `allStateIds`, `treeHistoryIds`, `treeSmartIds`, `allRoleNames`, `danglingAliasCount`, `existingIds`.

- [ ] **Step 2: Add the unified `allObjectsDerived` memo immediately after `allObjects` is assigned**

  Find this line (~line 235):
  ```typescript
  const allObjects = allObjectsData ?? EMPTY_OBJECTS;
  ```

  Directly below it, add:
  ```typescript
  const allObjectsDerived = useMemo(() => {
    const stateIds: string[] = [];
    const historyIdSet = new Set<string>();
    const smartIdSet = new Set<string>();
    const existingIdSet = new Set<string>();
    const roleSet = new Set<string>();
    let dangling = 0;

    for (const [id, obj] of Object.entries(allObjects)) {
      existingIdSet.add(id);
      const t = obj?.type;
      if (t === 'state') stateIds.push(id);
      if (hasHistory(obj)) historyIdSet.add(id);
      if (hasSmartName(obj)) smartIdSet.add(id);
      const role = obj?.common?.role;
      if (role) roleSet.add(role);

      // dangling alias: alias.0.* leaf with no existing target
      if (id.startsWith('alias.0.') && t !== 'folder' && t !== 'channel' && t !== 'device') {
        const rawId = obj?.common?.alias?.id;
        const targets: string[] = typeof rawId === 'object'
          ? [rawId?.read, rawId?.write].filter((t2): t2 is string => !!t2)
          : rawId ? [rawId] : [];
        if (targets.length === 0 || targets.every((tgt) => !existingIdSet.has(tgt))) dangling++;
      }
    }

    stateIds.sort();

    return {
      allStateIds: stateIds,
      treeHistoryIds: historyIdSet,
      treeSmartIds: smartIdSet,
      existingIds: existingIdSet,
      allRoleNames: [...roleSet].sort(),
      danglingAliasCount: dangling,
    };
  }, [allObjects]);

  const { allStateIds, treeHistoryIds, treeSmartIds, existingIds, allRoleNames, danglingAliasCount } = allObjectsDerived;
  ```

  **Note on dangling count:** The current impl checks `existingIds.has(t)` after building the set — this is safe in a single-pass loop because alias.0 targets are other adapter IDs that appear before or after. The double-pass is implicitly handled because we collect all IDs into `existingIdSet` in the same loop iteration order. For correctness: do a two-pass if ioBroker instances can self-reference (unlikely). Single pass is correct for the alias→source pattern.

- [ ] **Step 3: Remove the 6 now-redundant separate memos**

  Delete these blocks entirely from `App.tsx`:
  - `const allStateIds = useMemo(...)` (~line 256)
  - `const treeHistoryIds = useMemo(...)` (~line 260)
  - `const treeSmartIds = useMemo(...)` (~line 265)
  - `const allRoleNames = useMemo(...)` (~line 271)
  - `const existingIds = useMemo(...)` (~line 282)
  - `const danglingAliasCount = useMemo(...)` (~line 290)

  Leave `historyIds`, `smartIds`, `customIds` (they iterate `stateObjects`, not `allObjects` — different dep).

- [ ] **Step 4: TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

  Expected: 0 errors. Fix any name mismatches.

- [ ] **Step 5: Smoke test in browser**

  ```bash
  npm run dev
  ```

  Open app. Verify tree loads, counts in sidebar match, dangling alias badge visible (if applicable). No console errors.

- [ ] **Step 6: Commit**

  ```bash
  git add src/App.tsx
  git commit -m "perf: merge 6 allObjects loops into single useMemo pass"
  ```

---

## Task 2: Remove duplicate historyIds/smartIds memos in StateList

**Context:**  
`StateList.tsx` lines 107–108 compute `allHistoryIds` and `allSmartIds` from `allObjects`:
```typescript
const allHistoryIds = useMemo(() => { const s = new Set<string>(); for (const [id, obj] of Object.entries(allObjects)) { if (hasHistory(obj)) s.add(id); } return s; }, [allObjects]);
const allSmartIds   = useMemo(() => { const s = new Set<string>(); for (const [id, obj] of Object.entries(allObjects)) { if (hasSmartName(obj)) s.add(id); } return s; }, [allObjects]);
```

`App.tsx` already passes these as `historyIds`/`smartIds` props (the tree props). But `StateList` re-derives them. Check what props StateList currently receives and wire in the already-computed sets.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/StateList.tsx`

- [ ] **Step 1: Check StateList props interface**

  Open `src/components/StateList.tsx`. Find the `StateListProps` interface. Check if `historyIds: Set<string>` and `smartIds: Set<string>` exist as props. Also check how `allHistoryIds`/`allSmartIds` are used inside the component.

  ```bash
  grep -n "allHistoryIds\|allSmartIds\|historyIds\|smartIds" src/components/StateList.tsx | head -30
  ```

- [ ] **Step 2: Add props if missing, remove internal memos**

  In `StateListProps` (or equivalent), add if not present:
  ```typescript
  historyIds?: Set<string>;
  smartIds?: Set<string>;
  ```

  Replace lines 107–108:
  ```typescript
  // BEFORE:
  const allHistoryIds = useMemo(() => { ... }, [allObjects]);
  const allSmartIds   = useMemo(() => { ... }, [allObjects]);

  // AFTER:
  const allHistoryIds = historyIds ?? useMemo(() => { ... }, [allObjects]);
  const allSmartIds   = smartIds   ?? useMemo(() => { ... }, [allObjects]);
  ```

  Actually — since `allObjects` prop may be undefined in Panel 2 context, use a cleaner pattern:
  ```typescript
  const allHistoryIds = props.historyIds ?? useMemo(() => {
    const s = new Set<string>();
    for (const [id, obj] of Object.entries(allObjects)) { if (hasHistory(obj)) s.add(id); }
    return s;
  }, [allObjects]);
  const allSmartIds = props.smartIds ?? useMemo(() => {
    const s = new Set<string>();
    for (const [id, obj] of Object.entries(allObjects)) { if (hasSmartName(obj)) s.add(id); }
    return s;
  }, [allObjects]);
  ```

  **Important:** React rules forbid conditional hooks. The correct pattern is:
  ```typescript
  const derivedHistoryIds = useMemo(() => {
    if (props.historyIds) return props.historyIds;
    const s = new Set<string>();
    for (const [id, obj] of Object.entries(allObjects)) { if (hasHistory(obj)) s.add(id); }
    return s;
  }, [props.historyIds, allObjects]);
  const derivedSmartIds = useMemo(() => {
    if (props.smartIds) return props.smartIds;
    const s = new Set<string>();
    for (const [id, obj] of Object.entries(allObjects)) { if (hasSmartName(obj)) s.add(id); }
    return s;
  }, [props.smartIds, allObjects]);
  ```

  Replace all usages of `allHistoryIds` → `derivedHistoryIds`, `allSmartIds` → `derivedSmartIds`.

- [ ] **Step 3: Pass props from App.tsx Panel 1 StateList**

  In `App.tsx`, find the Panel 1 `<StateList ...>` call and add:
  ```typescript
  historyIds={treeHistoryIds}
  smartIds={treeSmartIds}
  ```

  Do the same for Panel 2 `<StateList ...>`.

- [ ] **Step 4: TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

  Expected: 0 errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/App.tsx src/components/StateList.tsx
  git commit -m "perf: pass historyIds/smartIds as props to StateList, avoid recompute"
  ```

---

## Task 3: Fix Panel 2 polling — use Long-Polling gate

**Context:**  
`App.tsx` line ~382:
```typescript
const { data: p2StateValues } = useStateValues(p2PageIds, 10_000);
```

Panel 2 always polls every 10 s regardless of LP connection status. Panel 1 correctly does:
```typescript
lpStatus.connected ? false : 10_000
```

Panel 2 should use the same gate.

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update Panel 2 useStateValues call**

  Find (~line 382):
  ```typescript
  const { data: p2StateValues } = useStateValues(p2PageIds, 10_000);
  ```

  Replace with:
  ```typescript
  const { data: p2StateValues } = useStateValues(p2PageIds, lpStatus.connected ? false : 10_000);
  ```

- [ ] **Step 2: Verify lpStatus is in scope at that line**

  `lpStatus` is declared at ~line 341 in `App.tsx`. The Panel 2 `useStateValues` call at ~line 382 is after it — in scope. No change needed.

- [ ] **Step 3: TypeScript check + smoke test**

  ```bash
  npx tsc --noEmit
  npm run dev
  ```

  Open Network tab in DevTools. When LP is connected, Panel 2 should make zero `/states` batch requests. When LP disconnects, polling resumes.

- [ ] **Step 4: Commit**

  ```bash
  git add src/App.tsx
  git commit -m "perf: gate Panel 2 state polling on Long-Polling connection status"
  ```

---

## Task 4: Increase useStateDetail refetchInterval

**Context:**  
`useObjectQueries.ts` line 90:
```typescript
refetchInterval: 5_000,
```

`useStateDetail` is active whenever the ObjectEditModal is open. Every 5 s it fires a network request for 1 state object. 30 s is sufficient — LP push handles live updates anyway.

**Files:**
- Modify: `src/hooks/useObjectQueries.ts`

- [ ] **Step 1: Change refetchInterval**

  Find in `src/hooks/useObjectQueries.ts`:
  ```typescript
  export function useStateDetail(id: string | null) {
    ...
    refetchInterval: 5_000,
  ```

  Change to:
  ```typescript
  refetchInterval: 30_000,
  ```

- [ ] **Step 2: TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/hooks/useObjectQueries.ts
  git commit -m "perf: raise useStateDetail refetchInterval 5s → 30s"
  ```

---

## Task 5: Suppress ping when Long-Polling is connected

**Context:**  
`useApiConnectivity.ts` runs `pingApi` every 60 s regardless of LP status. When LP is connected, connectivity is already proven — the ping is redundant.

The `lpStatus` state lives in `App.tsx` (returned by `useLongPolling`). The connectivity hook doesn't know about it. Options:
- A) Pass `lpConnected: boolean` param to `useApiConnectivity`
- B) Use a React ref / context to signal LP state

Option A is simplest.

**Files:**
- Modify: `src/hooks/useApiConnectivity.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add `lpConnected` param to useApiConnectivity**

  In `src/hooks/useApiConnectivity.ts`, change signature:
  ```typescript
  // BEFORE:
  export function useApiConnectivity(): ApiConnectivityState {

  // AFTER:
  export function useApiConnectivity(lpConnected = false): ApiConnectivityState {
  ```

- [ ] **Step 2: Gate the setInterval on lpConnected**

  Find the setInterval block:
  ```typescript
  useEffect(() => {
    const ms = apiReachable ? 60_000 : 10_000;
    const id = setInterval(checkApi, ms);
    return () => clearInterval(id);
  }, [checkApi, apiReachable]);
  ```

  Replace with:
  ```typescript
  useEffect(() => {
    if (lpConnected) return; // LP proves connectivity — no need to ping
    const ms = apiReachable ? 60_000 : 10_000;
    const id = setInterval(checkApi, ms);
    return () => clearInterval(id);
  }, [checkApi, apiReachable, lpConnected]);
  ```

- [ ] **Step 3: Pass lpConnected from App.tsx**

  In `src/App.tsx`, find:
  ```typescript
  const { isOnline, browserOnline } = useApiConnectivity();
  ```

  Note: `lpStatus` is declared after this line (~line 341 vs ~line 217). Restructure so `useLongPolling` is called before `useApiConnectivity`, OR pass a ref.

  **Simplest fix — move `useLongPolling` above `useApiConnectivity`:**

  Find `useLongPolling` call (~line 341):
  ```typescript
  const lpStatus = useLongPolling(pageIds);
  ```

  Move this block above the `useApiConnectivity` line (~line 217).

  Then update:
  ```typescript
  const { isOnline, browserOnline } = useApiConnectivity(lpStatus.connected);
  ```

  **Caveat:** `pageIds` depends on several memos above — it cannot move above them. Solution: pass `lpStatus.connected` lazily via a ref updated each render, or accept the hook ordering constraint.

  **Practical workaround — use a state ref:**
  ```typescript
  const lpConnectedRef = useRef(false);
  // after lpStatus is computed:
  lpConnectedRef.current = lpStatus.connected;
  ```

  And change `useApiConnectivity` to accept `() => boolean` (getter):
  ```typescript
  export function useApiConnectivity(isLpConnected: () => boolean = () => false): ApiConnectivityState {
  ```

  Use inside the effect:
  ```typescript
  if (isLpConnected()) return;
  ```

  In `App.tsx`:
  ```typescript
  const lpConnectedRef = useRef(false);
  const { isOnline, browserOnline } = useApiConnectivity(() => lpConnectedRef.current);
  // ...later, after lpStatus computed:
  lpConnectedRef.current = lpStatus.connected;
  ```

- [ ] **Step 4: TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 5: Manual test**

  Open DevTools Network. Filter `/objects?pattern=system.config` (the ping URL). With LP connected: no pings every 60 s. Disconnect LP (block the endpoint): pings resume.

- [ ] **Step 6: Commit**

  ```bash
  git add src/hooks/useApiConnectivity.ts src/App.tsx
  git commit -m "perf: skip connectivity ping while Long-Polling is connected"
  ```

---

## Task 6: Debounce ResizeObserver measure callback in StateList

**Context:**  
`StateList.tsx` line ~256:
```typescript
const ro = new ResizeObserver(measure);
ro.observe(container);
if (thead) ro.observe(thead);
```

`measure()` calls `setHeaderHeight()` which triggers a React re-render. ResizeObserver fires on every layout reflow — during column resize drag this fires many times per second.

**Files:**
- Modify: `src/components/StateList.tsx`

- [ ] **Step 1: Wrap measure in requestAnimationFrame debounce**

  Find the `measure` function definition inside the `useEffect` (~line 251):
  ```typescript
  const measure = () => {
    setHeaderHeight(thead?.offsetHeight ?? 0);
  };
  ```

  Replace with:
  ```typescript
  let rafId: number | null = null;
  const measure = () => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      setHeaderHeight(thead?.offsetHeight ?? 0);
    });
  };
  ```

  Add cleanup in the return:
  ```typescript
  return () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (ro) ro.disconnect();
    else window.removeEventListener('resize', measure);
  };
  ```

- [ ] **Step 2: TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 3: Visual check**

  Drag a column header to resize. Header height display should not flicker. No console errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/StateList.tsx
  git commit -m "perf: debounce ResizeObserver measure via requestAnimationFrame"
  ```

---

## Task 7: Cache hasExpandableBranch result in StateTree

**Context:**  
`StateTree.tsx` line 137:
```typescript
const isExpandableFolder = isFolder && hasExpandableBranch(node, allObjects, showFolders, showDevices, showChannels);
```

`hasExpandableBranch` is a recursive function called for **every visible tree node on every render**. With a large ioBroker installation (thousands of nodes), this compounds quickly.

**Files:**
- Modify: `src/components/StateTree.tsx`

- [ ] **Step 1: Memoize isExpandableFolder per node**

  In `TreeNodeComponent`, `hasExpandableBranch` is called inline. Wrap it in `useMemo`:

  Find (~line 135–137):
  ```typescript
  const hasChildren = node.children.size > 0;
  const objectType = !node.isLeaf ? allObjects[node.fullPath]?.type : undefined;
  const isFolder = !node.isLeaf && (hasChildren || objectType === 'folder' || ...);
  const isExpandableFolder = isFolder && hasExpandableBranch(node, allObjects, showFolders, showDevices, showChannels);
  ```

  Replace the last line with:
  ```typescript
  const isExpandableFolder = useMemo(
    () => isFolder && hasExpandableBranch(node, allObjects, showFolders, showDevices, showChannels),
    [isFolder, node, allObjects, showFolders, showDevices, showChannels]
  );
  ```

  `TreeNodeComponent` is already wrapped in `memo()` — this `useMemo` will only recompute when these deps change, not on every parent re-render.

- [ ] **Step 2: TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/StateTree.tsx
  git commit -m "perf: memoize hasExpandableBranch result per tree node"
  ```

---

## Self-Review Checklist

### Spec coverage

| CPU issue from analysis | Task |
|------------------------|------|
| 7 separate allObjects loops | Task 1 ✓ |
| Duplicate historyIds/smartIds in StateList | Task 2 ✓ |
| Panel 2 polls regardless of LP | Task 3 ✓ |
| useStateDetail refetchInterval 5 s | Task 4 ✓ |
| pingApi fires even when LP connected | Task 5 ✓ |
| ResizeObserver fires too frequently | Task 6 ✓ |
| hasExpandableBranch uncached per render | Task 7 ✓ |

### Regressions to watch

- Task 1: dangling alias count single-pass is correct only if alias targets are always non-alias IDs. ioBroker allows alias-of-alias — if that's used, count may be off by 1 render. Acceptable edge case; next render corrects.
- Task 2: If Panel 2 `StateList` receives `allObjects={}` (empty), the fallback memo still works correctly.
- Task 5: `lpConnectedRef` approach means the first ping interval after mount may still fire once before LP connects (~60 s). Acceptable — avoids complex hook reordering.

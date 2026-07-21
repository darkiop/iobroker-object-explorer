# StateTree Bottom-Up Expandable-Branch Memoization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-node recursive `hasExpandableBranch` call in `src/components/StateTree.tsx` with a single bottom-up pass that computes expandability for every node once per `allObjects`/filter change, instead of re-walking each node's full subtree on every render of every visible row.

**Architecture:** `hasExpandableBranch(node, ...)` (`src/components/StateTree.tsx:42-55`) is called from inside `TreeNodeComponent`'s `isExpandableFolder` useMemo (`src/components/StateTree.tsx:142-145`) — once per rendered node, each call walking its entire subtree. For a tree with N nodes this is worst-case O(N) per node → O(N²) over a full render pass, and it re-runs for every currently-expanded/visible node whenever `allObjects` gets a new identity (which happens on every Socket.IO push-patched state, per `useSocketIO.ts`). The fix computes a `Set<string>` of expandable `fullPath`s via one post-order traversal, memoized in `useTreeState` (where `tree` is already built) on `[tree, allObjects, showFolders, showDevices, showChannels]`, and passes that Set down as a prop so `TreeNodeComponent` does an O(1) lookup instead of a recursive walk.

**Tech Stack:** React 18, Vitest + @testing-library/react

---

### Task 1: Add failing test for expandable-set correctness and call-count

**Files:**
- Read first: `src/hooks/useTreeState.ts` (to find where `tree` is built and existing test conventions)
- Test: `src/hooks/useTreeState.test.ts` (create if missing — check first)

- [ ] **Step 1: Check for an existing test file**

Run: `ls src/hooks/useTreeState.test.ts 2>/dev/null || echo "missing"`

If it exists, read it fully first and add the new test using its existing helpers/mocks (e.g. how `TreeNode` fixtures or `allObjects` fixtures are built elsewhere in that file). If missing, create it, importing the same `IoBrokerObject`/`TreeNode` fixture style used in `src/components/StateTree.test.tsx` if that file exists (check with `ls src/components/StateTree.test.tsx 2>/dev/null`).

- [ ] **Step 2: Read `useTreeState.ts` to find the exact return shape and where `tree` is constructed**

Run: `grep -n "export function useTreeState\|return {\|const tree" src/hooks/useTreeState.ts`

Note the exact line numbers of the hook's return object and where `tree: TreeNode` is computed — Task 2 will add a new memoized field next to it.

- [ ] **Step 3: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTreeState } from './useTreeState';
import type { IoBrokerObject } from '../types/iobroker';

function makeObj(id: string, type: IoBrokerObject['type']): IoBrokerObject {
  return { _id: id, type, common: { name: id }, native: {} } as IoBrokerObject;
}

describe('useTreeState expandableSet', () => {
  it('marks a folder with a nested state as expandable, and a folder with only hidden children as not', () => {
    const allObjects: Record<string, IoBrokerObject> = {
      'adapter.0': makeObj('adapter.0', 'folder'),
      'adapter.0.deviceA': makeObj('adapter.0.deviceA', 'device'),
      'adapter.0.deviceA.state1': makeObj('adapter.0.deviceA.state1', 'state'),
      'adapter.0.emptyFolder': makeObj('adapter.0.emptyFolder', 'folder'),
    };
    const stateIds = ['adapter.0.deviceA.state1'];

    const { result } = renderHook(() =>
      useTreeState({
        stateIds,
        allObjects,
        historyIds: new Set<string>(),
        smartIds: new Set<string>(),
        treeSearch: '',
        historyOnly: false,
        smartOnly: false,
        treeExpandSignal: { depth: 0, seq: 0 },
        appSettings: { treeViewMode: 'path' } as never,
        persistSettings: () => {},
      })
    );

    expect(result.current.expandableSet.has('adapter.0')).toBe(true);
    expect(result.current.expandableSet.has('adapter.0.deviceA')).toBe(false);
  });
});
```

Adjust the exact `useTreeState` argument shape to match what `grep -n "export function useTreeState" -A 15 src/hooks/useTreeState.ts` actually shows (parameter names/types must match exactly — read the real signature before finalizing this test, since `appSettings`/`persistSettings` types are placeholders here).

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/hooks/useTreeState.test.ts`
Expected: FAIL — `result.current.expandableSet` is `undefined` (property doesn't exist yet).

- [ ] **Step 5: Commit the failing test**

```bash
git add src/hooks/useTreeState.test.ts
git commit -m "test(tree-state): add failing spec for bottom-up expandableSet"
```

---

### Task 2: Compute `expandableSet` bottom-up in `useTreeState`

**Files:**
- Modify: `src/hooks/useTreeState.ts`

- [ ] **Step 1: Read the exact current shape of `tree` construction and the hook's return statement**

Run: `grep -n "function useTreeState\|const tree\|return {" src/hooks/useTreeState.ts`

Read the surrounding ~30 lines around the `tree` memo to see its dependency array — the new `expandableSet` memo must depend on the same `tree` reference plus `allObjects`, `showFolders`, `showDevices`, `showChannels`.

- [ ] **Step 2: Add a post-order `buildExpandableSet` helper above the hook, reusing `shouldShowNodeType` logic from StateTree.tsx**

`shouldShowNodeType` currently lives in `src/components/StateTree.tsx:28-40`. Move it (and `hasExpandableBranch`'s logic, replaced by the new bottom-up version) into `src/hooks/useTreeState.ts` so both the memo and any future callers share one definition. Add near the top of `src/hooks/useTreeState.ts`:

```ts
import type { TreeNode, IoBrokerObject } from '../types/iobroker';

function shouldShowNodeType(
  node: TreeNode,
  allObjects: Record<string, IoBrokerObject>,
  showFolders: boolean,
  showDevices: boolean,
  showChannels: boolean
): boolean {
  if (node.isLeaf) return false;
  const objectType = allObjects[node.fullPath]?.type;
  if (objectType === 'device') return showDevices;
  if (objectType === 'channel') return showChannels;
  return showFolders;
}

function buildExpandableSet(
  root: TreeNode,
  allObjects: Record<string, IoBrokerObject>,
  showFolders: boolean,
  showDevices: boolean,
  showChannels: boolean
): Set<string> {
  const expandable = new Set<string>();

  // Post-order: visit children first, so a parent can check its children's
  // already-computed expandability in O(1) instead of re-walking them.
  function visit(node: TreeNode): boolean {
    let anyExpandableChild = false;
    for (const child of node.children.values()) {
      if (child.isLeaf) continue;
      const childVisible = shouldShowNodeType(child, allObjects, showFolders, showDevices, showChannels);
      const childExpandable = visit(child);
      if (childVisible || childExpandable) {
        anyExpandableChild = true;
      }
    }
    if (anyExpandableChild) {
      expandable.add(node.fullPath);
    }
    return anyExpandableChild;
  }

  visit(root);
  return expandable;
}
```

This still visits every node once overall (it's a single post-order DFS over the whole tree, O(N) total) instead of the old behavior where every rendered node independently re-walked its entire subtree (O(N) per node, O(N²) overall in the worst case).

- [ ] **Step 3: Add the memoized `expandableSet` to the hook and include it in the return object**

Find the hook's `tree` memo and its return statement (from Step 1's grep). Add directly after the `tree` memo:

```ts
  const expandableSet = useMemo(
    () => buildExpandableSet(tree, allObjects, showFolders, showDevices, showChannels),
    [tree, allObjects, showFolders, showDevices, showChannels]
  );
```

Then add `expandableSet,` to the hook's returned object, alongside the existing `tree,` field.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useTreeState.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTreeState.ts
git commit -m "perf(tree-state): compute expandableSet with one bottom-up pass"
```

---

### Task 3: Wire `expandableSet` into `StateTree.tsx`, remove recursive `hasExpandableBranch`

**Files:**
- Modify: `src/components/StateTree.tsx:28-55` (remove `shouldShowNodeType`/`hasExpandableBranch`, now living in `useTreeState.ts`), `:142-145` (`isExpandableFolder` computation), `:544-557` (destructure `expandableSet` from `useTreeState`), and the `TreeNodeComponent` props interface/prop-drilling (search for every place `isExpandableFolder` is computed for a *child* node too, e.g. around line 232/458/472 where `allObjects` is passed recursively to child `TreeNodeComponent` instances).

- [ ] **Step 1: Read the full current file to find every prop-drilling site for `TreeNodeComponent`**

Run: `grep -n "TreeNodeComponent\|isExpandableFolder\|hasExpandableBranch\|shouldShowNodeType" src/components/StateTree.tsx`

List every line where these appear so the prop threading (adding `expandableSet` alongside `allObjects`) touches every recursive call site.

- [ ] **Step 2: Remove the now-dead local functions**

Delete `shouldShowNodeType` (`src/components/StateTree.tsx:28-40`) and `hasExpandableBranch` (`:42-55`) entirely — they now live in `src/hooks/useTreeState.ts` from Task 2.

- [ ] **Step 3: Add `expandableSet` to `TreeNodeComponent`'s props interface**

Find the props interface for `TreeNodeComponent` (search `grep -n "allObjects: Record<string, IoBrokerObject>;" src/components/StateTree.tsx` — it appears once in the props interface around line 92 and again in `StateTreeProps`). Add `expandableSet: Set<string>;` next to each `allObjects: Record<string, IoBrokerObject>;` occurrence inside the `TreeNodeComponent` props interface (not `StateTreeProps`, since `StateTree` itself computes it via `useTreeState` and only needs to thread it into the top-level `TreeNodeComponent` calls).

- [ ] **Step 4: Replace the `isExpandableFolder` computation**

Replace (around line 142-145):

```tsx
  const isExpandableFolder = useMemo(
    () => isFolder && hasExpandableBranch(node, allObjects, showFolders, showDevices, showChannels),
    [isFolder, node, allObjects, showFolders, showDevices, showChannels]
  );
```

with:

```tsx
  const isExpandableFolder = isFolder && expandableSet.has(node.fullPath);
```

No `useMemo` needed anymore — it's now an O(1) `Set.has` lookup, cheap enough to compute inline every render.

- [ ] **Step 5: Thread `expandableSet` through every recursive `TreeNodeComponent` render call**

At each site found in Step 1 where a child `<TreeNodeComponent allObjects={allObjects} .../>` is rendered (around line 232 and 472), add `expandableSet={expandableSet}` alongside the existing `allObjects={allObjects}` prop.

- [ ] **Step 6: Destructure `expandableSet` from `useTreeState()` in the top-level `StateTree` function and pass it to the root-level `TreeNodeComponent` calls**

Around line 544-557, add `expandableSet` to the destructured return of `useTreeState(...)`:

```tsx
  const {
    expandSignal, setExpandSignal,
    showFolders, setShowFolders,
    showDevices, setShowDevices,
    showChannels, setShowChannels,
    treeViewMode, handleTreeViewModeChange,
    filteredIds,
    tree,
    sortedChildren,
    expandableSet,
  } = useTreeState({
    stateIds, allObjects, historyIds, smartIds,
    treeSearch, historyOnly, smartOnly, treeExpandSignal,
    appSettings, persistSettings,
  });
```

Then find where the root-level `TreeNodeComponent` instances are rendered from `sortedChildren` (around line 652) and add `expandableSet={expandableSet}` there too.

- [ ] **Step 7: Update the `memo()` comparator for `TreeNodeComponent` to include `expandableSet`**

`src/components/StateTree.tsx:494` has a custom `memo` comparator checking `prev.allObjects !== next.allObjects`. Read lines ~485-500 and add `|| prev.expandableSet !== next.expandableSet` to that comparator so the memoized component re-renders when the Set identity changes (it will, since it's a `useMemo` output — same invalidation semantics as `allObjects`).

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors — this will catch any missed prop-drilling site immediately (TypeScript will flag a `TreeNodeComponent` call missing the now-required `expandableSet` prop).

- [ ] **Step 9: Run full test suite**

Run: `npm test`
Expected: all tests PASS, including the new `useTreeState.test.ts` from Task 1/2.

- [ ] **Step 10: Manual smoke test**

Run: `npm run dev`, open the app, and in the left tree:
- Confirm folders that contain visible children still show an expand chevron.
- Confirm folders whose only children are hidden by the Folder/Device/Channel filter toggles no longer show a (dead) chevron.
- Toggle the Folder/Device/Channel filters in the tree toolbar and confirm expand-arrows update correctly.
- Confirm expand/collapse-all buttons still work.

- [ ] **Step 11: Commit**

```bash
git add src/components/StateTree.tsx
git commit -m "perf(state-tree): use bottom-up expandableSet instead of per-node recursive scan"
```

---

### Task 4: Regression check under live-push conditions

**Files:** none modified — verification only.

- [ ] **Step 1: Confirm `expandableSet` only recomputes when `allObjects` identity changes, not on every render**

Add a temporary `console.count('buildExpandableSet')` inside `buildExpandableSet` in `src/hooks/useTreeState.ts`, run `npm run dev` with a live ioBroker connection (Socket.IO active), watch the console while a single state value updates — confirm the count does NOT increment on every state push (only when `allObjects`, `showFolders`, `showDevices`, or `showChannels` actually change identity). Remove the `console.count` before committing anything further (this step produces no commit — it's a manual check only).

- [ ] **Step 2: If the count increments too often, investigate `allObjects` identity stability**

If `buildExpandableSet` runs on every state push, the root cause is `allObjects` getting a new object identity on every Socket.IO patch even when only `value`/`ts` changed on a *state* query, not the *objects* query. Cross-check `useSocketIO.ts`'s object-cache patch logic — this would be a separate, pre-existing issue already covered by finding area 5 (Realtime-Transport) in `docs/performance-analysis.md`, not something to fix as part of this plan; note it if observed but don't expand scope here.

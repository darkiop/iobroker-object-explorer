# Remove Compact View Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the toolbar "Compact view" toggle button (column-set shortcut) and its supporting state/logic. Note: this is distinct from the row-height option `'compact'` in `UIContext.tsx`/`SettingsModal.tsx` (the S/M/L/XL row-height picker), which must stay untouched.

**Architecture:** Delete the `isCompactView` state, `handleToggleCompact` handler, and `COMPACT_COLS` constant from `StateList.tsx`/`StateListColumns.ts`, remove the toolbar button and its props from `StateListToolbar.tsx`, and simplify `handleColChange` (no longer needs to clear compact state).

**Tech Stack:** React, TypeScript, Vitest

---

### Task 1: Remove compact view button from StateListToolbar

**Files:**
- Modify: `src/components/statelist/StateListToolbar.tsx:59-60,78,358-369`

- [ ] **Step 1: Remove props from interface**

Delete lines 59-60 (`isCompactView: boolean;` / `onToggleCompact: () => void;`) from the toolbar's props interface.

- [ ] **Step 2: Remove props from destructure**

On line 78, remove `isCompactView, onToggleCompact,` from the destructured props list.

- [ ] **Step 3: Remove the button JSX**

Delete this whole block (lines 358-369):

```tsx
        <button
          type="button"
          onClick={onToggleCompact}
          title={isEn ? 'Compact view' : 'Kompaktansicht'}
          className={`p-2 rounded-lg transition-colors ${
            isCompactView
              ? 'text-blue-600 bg-blue-500/10 dark:text-blue-400 dark:bg-blue-500/10'
              : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          <LayoutList size={17} />
        </button>
```

- [ ] **Step 4: Remove unused `LayoutList` import**

On line 2, remove `LayoutList` from the lucide-react import list:

```tsx
import { X, History, Maximize2, Trash2, Plus, Link2, Download, Wand2, Upload, Tag, BarChart2, RotateCcw, EyeOff, Indent, FolderOpen, List, AlignLeft, FolderX } from 'lucide-react';
```

- [ ] **Step 5: Verify no other usages of `LayoutList` remain in this file**

Run: `grep -n "LayoutList" src/components/statelist/StateListToolbar.tsx`
Expected: no output

- [ ] **Step 6: Commit**

```bash
git add src/components/statelist/StateListToolbar.tsx
git commit -m "fix(statelist): remove compact view toggle button from toolbar"
```

---

### Task 2: Remove compact view state/logic from StateList

**Files:**
- Modify: `src/components/statelist/StateList.tsx:68,207-233,861-862`

- [ ] **Step 1: Remove `COMPACT_COLS` import**

Line 68, change:

```tsx
import { DEFAULT_COLS, COMPACT_COLS, BUILTIN_DEFAULT_WIDTHS, BUILTIN_MIN_WIDTHS, BUILTIN_MAX_WIDTHS } from './StateListColumns';
```

to:

```tsx
import { DEFAULT_COLS, BUILTIN_DEFAULT_WIDTHS, BUILTIN_MIN_WIDTHS, BUILTIN_MAX_WIDTHS } from './StateListColumns';
```

- [ ] **Step 2: Remove compact state and handler**

Delete lines 207-233:

```tsx
  const [isCompactView, setIsCompactView] = useState(false);
  const preCompactColsRef = useRef<SortKey[] | null>(null);

  function handleColChange(cols: SortKey[]) {
    if (isCompactView) setIsCompactView(false);
    if (onVisibleColsChange) {
      onVisibleColsChange(cols);
      setVisibleCols(cols);
    } else {
      persistSettings({ ...appSettings, visibleCols: cols });
    }
  }

  function handleToggleCompact() {
    if (isCompactView) {
      const restore = preCompactColsRef.current ?? DEFAULT_COLS;
      preCompactColsRef.current = null;
      setIsCompactView(false);
      if (onVisibleColsChange) { onVisibleColsChange(restore); setVisibleCols(restore); }
      else persistSettings({ ...appSettings, visibleCols: restore });
    } else {
      preCompactColsRef.current = visibleCols;
      setIsCompactView(true);
      if (onVisibleColsChange) { onVisibleColsChange(COMPACT_COLS); setVisibleCols(COMPACT_COLS); }
      else persistSettings({ ...appSettings, visibleCols: COMPACT_COLS });
    }
  }
```

Replace with the simplified handler (no compact-clearing needed anymore):

```tsx
  function handleColChange(cols: SortKey[]) {
    if (onVisibleColsChange) {
      onVisibleColsChange(cols);
      setVisibleCols(cols);
    } else {
      persistSettings({ ...appSettings, visibleCols: cols });
    }
  }
```

- [ ] **Step 3: Remove props passed to toolbar**

Delete lines 861-862:

```tsx
        isCompactView={isCompactView}
        onToggleCompact={handleToggleCompact}
```

- [ ] **Step 4: Verify no other usages remain**

Run: `grep -rn "isCompactView\|onToggleCompact\|handleToggleCompact\|COMPACT_COLS" src/`
Expected: no output

- [ ] **Step 5: Commit**

```bash
git add src/components/statelist/StateList.tsx
git commit -m "fix(statelist): remove compact view state and handler"
```

---

### Task 3: Remove COMPACT_COLS constant

**Files:**
- Modify: `src/components/statelist/StateListColumns.ts:51`

- [ ] **Step 1: Delete the constant**

Remove line 51:

```ts
export const COMPACT_COLS: SortKey[] = ['checkbox', 'id', 'name', 'room', 'value', 'ts'];
```

- [ ] **Step 2: Verify build and lint pass**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npm run lint`
Expected: no errors

- [ ] **Step 3: Run test suite**

Run: `npm test`
Expected: all tests pass (no test references `COMPACT_COLS`/`isCompactView`/`onToggleCompact` — confirmed via grep in Task 2 Step 4)

- [ ] **Step 4: Commit**

```bash
git add src/components/statelist/StateListColumns.ts
git commit -m "fix(statelist): remove unused COMPACT_COLS constant"
```

---

## Verification

1. Run `npm run dev`, open the app, open the State List toolbar.
2. Confirm the "Compact view" / "Kompaktansicht" icon button (LayoutList icon, between page-size select and column picker) is gone.
3. Confirm column picker (`ColPicker`) and page-size select still work normally.
4. Confirm the row-height picker in Settings → Display (S/M/L/XL, `compact`/`normal`/`comfortable`/`spacious`) is untouched and still functional — this is a separate feature and must not be affected.
5. Run `npx tsc --noEmit`, `npm run lint`, `npm test` — all green.

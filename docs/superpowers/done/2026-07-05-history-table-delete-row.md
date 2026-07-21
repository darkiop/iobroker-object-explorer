# History Table Row-Delete Button — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-row delete (trash) icon button to the single-series History table view (`HistoryChart.tsx`), shown on row hover, that opens the existing confirm dialog and deletes that one history entry — independent of the existing `deleteMode` toggle.

**Architecture:** `HistoryChart.tsx` already has all backend plumbing for single-entry deletion: `useDeleteHistory().deleteEntry` (`src/hooks/useStates.ts` → `deleteHistoryEntry(id, ts)` in `src/api/iobroker.ts:657-659`), the `ConfirmDialog` component (`HistoryChart.tsx:48-79`), and `confirmAction`/`setConfirmAction` state (`ConfirmAction` type in `HistoryChartUtils.ts`) already wired to trigger deletion on confirm. Currently the only way to reach `setConfirmAction({ type: 'entry', ts, val })` from the table is clicking a row while the global `deleteMode` toggle is active (`HistoryChart.tsx:687-699`). This plan adds a dedicated trash-icon button per row (visible on `group-hover`), calling the same `setConfirmAction` path, without needing `deleteMode`. `deleteMode` stays untouched — both interaction paths coexist. Scope is limited to the single-series table (`renderTable()`'s non-multi-series branch, `HistoryChart.tsx:669-707`); the multi-series table is out of scope since `deleteHistoryEntry` only accepts one `stateId`.

**Tech Stack:** React, TypeScript, Tailwind CSS, lucide-react (`Trash2` icon, already imported at `HistoryChart.tsx:26`).

---

### Task 1: Add hover delete-icon column to single-series history table

**Files:**
- Modify: `src/components/history/HistoryChart.tsx:672-707` (single-series `renderTable()` branch)

- [ ] **Step 1: Add a new header cell for the delete-icon column**

In the `<thead><tr>` block (currently lines 677-684), add a third `<th>` after the Value header, sized narrow with no label (icon-only column):

```tsx
<thead className="sticky top-0 bg-white dark:bg-gray-900 z-10">
  <tr className="border-b border-gray-200 dark:border-gray-700">
    <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">
      {isEn ? 'Timestamp' : 'Zeitstempel'}
    </th>
    <th className="text-right px-3 py-2 text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">
      {isEn ? 'Value' : 'Wert'}{unit ? ` (${unit})` : ''}
    </th>
    <th className="w-8 px-2 py-2" aria-hidden="true" />
  </tr>
</thead>
```

- [ ] **Step 2: Add `group` class to row, keep existing deleteMode click behavior, add delete-icon cell**

Replace the row rendering (currently lines 687-699) with:

```tsx
{pageRows.map((entry) => (
  <tr
    key={String(entry.ts)}
    className={`group border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${deleteMode ? 'cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20' : ''}`}
    onClick={deleteMode ? () => setConfirmAction({ type: 'entry', ts: entry.ts, val: entry.val }) : undefined}
  >
    <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">
      {formatTooltipTime(entry.ts, dateFormat)}
    </td>
    <td className={`text-right px-3 py-1.5 ${deleteMode ? 'text-red-500 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
      {entry.val != null ? `${entry.val}${unit ? ' ' + unit : ''}` : '—'}
    </td>
    <td className="px-2 py-1.5 text-right">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setConfirmAction({ type: 'entry', ts: entry.ts, val: entry.val });
        }}
        title={isEn ? 'Delete this entry' : 'Diesen Eintrag löschen'}
        className="opacity-0 group-hover:opacity-100 p-1 rounded text-red-500 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30 transition-opacity"
      >
        <Trash2 size={13} />
      </button>
    </td>
  </tr>
))}
```

Note: `e.stopPropagation()` is required so the icon click doesn't also fire the row's `onClick` when `deleteMode` is active (would otherwise both set the same `confirmAction`, harmless but redundant — stopping propagation keeps behavior clean and avoids double-processing if row `onClick` logic changes later).

- [ ] **Step 3: Manual verification (no automated test for this UI-only change)**

Run: `npm run dev`

In the browser:
1. Open any state's History (icon or context menu → History), switch to Table view (`Table2` icon toggle).
2. Hover a row — confirm a small red trash icon fades in at the row's right edge.
3. Click it — confirm the existing red `ConfirmDialog` overlay appears with the entry's timestamp/value.
4. Click "Delete" — confirm the row disappears from the table (entry deleted via `deleteHistoryEntry`) and no console errors.
5. Toggle the existing "Single value" `deleteMode` button on — confirm clicking anywhere on a row (not just the icon) still opens the same confirm dialog (regression check that old behavior is untouched).
6. Switch to a multi-series comparison view (add an extra series) — confirm the multi-series table branch is unchanged (no delete icon column, `renderTable()`'s other branch at lines 623-667 not modified).

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/history/HistoryChart.tsx
git commit -m "feat(history): add per-row delete icon to history table view"
```

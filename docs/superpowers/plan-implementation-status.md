# Plan Status

As of 2026-07-21 — all plans under `docs/` checked against the current code on branch `fix/baseline-lint-tsc-test`.

Legend: ✅ done · ⚠️ partial · ❌ open

---

## Overview

### Open in `specs/`

| Plan | Status | Evidence |
|---|---|---|
| [specs/2026-07-05-dropdown-flip.md](specs/2026-07-05-dropdown-flip.md) | ❌ open | `src/hooks/useDropdownPosition.ts` missing |
| [specs/2026-07-05-optimization-cleanup.md](specs/2026-07-05-optimization-cleanup.md) | ⚠️ partial | 1 of 3 tasks fully done, 1 partial (see below) |
| [specs/2026-07-20-db-backup-restore.md](specs/2026-07-20-db-backup-restore.md) | ❌ open | none of the 5 new files exist |
| [specs/2026-07-20-db-backup-restore-design.md](specs/2026-07-20-db-backup-restore-design.md) | ❌ open | design document for the plan above |
| [specs/2026-07-21-command-palette.md](specs/2026-07-21-command-palette.md) | ❌ open | `CommandPalette.tsx`, `CommandContext.tsx`, `commandMatch.ts`, `useRegisterCommands.ts` — all missing |
| [specs/2026-07-21-modal-shell.md](specs/2026-07-21-modal-shell.md) | ❌ open | `ui/Modal.tsx`, `useFocusTrap.ts`, `useModalStack.ts` missing; only `useEscapeKey.ts` exists (pre-existing) |
| [specs/2026-07-21-optimization-performance.md](specs/2026-07-21-optimization-performance.md) | ⚠️ partial | merge of optimization-plan + performance-analysis, verified against the code; see the measures table below |

### Moved to `done/` (2026-07-21)

| Plan | Status | Evidence |
|---|---|---|
| [done/2026-07-04-remove-compact-view.md](done/2026-07-04-remove-compact-view.md) | ✅ done | no hits for `isCompactView` / `COMPACT_COLS` in `src/` |
| [done/2026-07-16-f12-states-namespace-patterns.md](done/2026-07-16-f12-states-namespace-patterns.md) | ✅ done | `src/utils/idPatterns.ts:6` + `derivePatterns()` in `useSocketIO.ts:123` and `api/iobroker.ts` |
| [done/2026-06-12-optimization-plan.md](done/2026-06-12-optimization-plan.md) | 📦 superseded | absorbed into the merge document above |
| [done/2026-07-04-performance-analysis.md](done/2026-07-04-performance-analysis.md) | 📦 superseded | absorbed into the merge document above |

### Already in `done/` beforehand

| Plan | Status | Evidence |
|---|---|---|
| [done/2026-07-16-f15-bundle-recharts.md](done/2026-07-16-f15-bundle-recharts.md) | ✅ done | visualizer + lazy imports present |
| [done/2026-07-19-dboverview-logging-mismatch-design.md](done/2026-07-19-dboverview-logging-mismatch-design.md) | ✅ done | `DpStatus` in `DbOverviewModal.tsx:25` |

The remaining plans in `superpowers/done/` count as finished by virtue of being filed there and were not re-checked. Exception: the two superseded analysis documents sit there as history — their current state lives in the merge document.

---

## Open plans in detail

### ❌ dropdown-flip-plan.md — dropdown auto-flip

No `useDropdownPosition` hook in the repo. All three cells still position
downwards unconditionally, without a viewport check:

- [EditableRoleCell.tsx:70](../../src/components/cells/EditableRoleCell.tsx#L70) — `top: cellRect.bottom + 2`
- [EditableRoomCell.tsx:64](../../src/components/cells/EditableRoomCell.tsx#L64) — same
- [EditableFunctionCell.tsx:64](../../src/components/cells/EditableFunctionCell.tsx#L64) — same

Fully open. Small effort (1 new hook + 3 call sites).

### ❌ 2026-07-20-db-backup-restore.md — DB backup/restore

None of the planned files exist:

- `src/api/dbBackup.ts` — missing
- `src/api/dbBackup.test.ts` — missing
- `src/hooks/useDbBackup.ts` — missing
- `src/hooks/useDbBackup.test.ts` — missing
- `src/components/modals/DbBackupModal.tsx` — missing

Consequently there is no `dbBackupBeforeDelete` in `AppSettings` and no export ahead of the four
destructive actions (delete-all, 3M purge, dedupe, orphan delete). The accompanying design document
[2026-07-20-db-backup-restore-design.md](specs/2026-07-20-db-backup-restore-design.md)
is unimplemented as well.

Largest open item. Affects data safety: all four delete paths still run without a net.

### ❌ 2026-07-21-command-palette.md — command palette

None of the core files exist:

- `src/components/ui/CommandPalette.tsx` — missing
- `src/context/CommandContext.tsx` — missing
- `src/utils/commandMatch.ts` — missing
- `src/hooks/useRegisterCommands.ts` — missing

Fully open.

### ❌ 2026-07-21-modal-shell.md — unified modal shell

- `src/components/ui/Modal.tsx` — missing
- `src/hooks/useFocusTrap.ts` — missing
- `src/hooks/useModalStack.ts` — missing
- `src/hooks/useEscapeKey.ts` — ✅ exists (pre-existing, not from this plan)

Fully open. The plan would migrate ~20 modal components onto a shared shell.

### ⚠️ 2026-07-05-optimization-cleanup.md — 1 task open, 1 partial

| Task | Status | Evidence |
|---|---|---|
| Task 1 (M-07) tokenizer instead of regex loop | ❌ open | `src/api/iobroker.ts:1633` still compiles `new RegExp(...)` per ID |
| Task 2 (M-08) parallelize `deleteObjectsMany` | ⚠️ partial | `iobroker.ts:1387-1393` uses `Promise.all` per chunk, but `CHUNK = 8` stays sequential across chunks — still 13 rounds for 100 IDs |
| Task 3 (M-03) make modals genuinely lazy | ✅ done | `ObjectEditModal` via `lazy()` at all 3 call sites |

---

## Measures catalogue (M-01…M-10)

_Source since 2026-07-21: [specs/2026-07-21-optimization-performance.md](specs/2026-07-21-optimization-performance.md)_

| Measure | Status | Note |
|---|---|---|
| M-01 redundant object requests | ⚠️ reverted | deliberately rolled back, documented in the plan |
| M-02 cache bypass for enums | ✅ | |
| M-03 lazy-load modals | ✅ | completed via optimization-cleanup task 3 |
| M-04 search index | ✅ | |
| M-05 split up `StateList.tsx` | ⚠️ partial | state extracted into `useStateListModals`/`useStateListView`; the file stays large |
| M-06 module-global promise singletons | ❌ open | now 10 singletons instead of 4; needs its own design pass |
| M-07 `getScriptUsedIds` regex loop | ❌ open | see above |
| M-08 parallelize `deleteObjectsMany` | ⚠️ partial | `iobroker.ts:1386` — `Promise.all` **within** a chunk, chunks still run sequentially (`CHUNK = 8`). 100 objects = 13 rounds. Raise the chunk size or parallelize fully |
| M-09 virtual scrolling for StateTree | ❌ open | `@tanstack/react-virtual` not imported in `StateTree.tsx`; requires lifting the expand state into a `Set<string>` |
| M-10 Socket.IO transport | ✅ | |

---

## Recommended order

1. **DB backup/restore** — the only open item carrying data-loss risk, and the plan is ready.
2. **Quick wins from the merge document** — `StateRow` comparator (render bug, 15 min), `deleteObjectsMany` chunk size (15 min), split context hooks (30 min). Under 2h combined.
3. **Dropdown flip** — smallest effort, directly visible UI bug.
4. **M-07 tokenizer** — self-contained, plan is ready.
5. **Modal shell** — prerequisite for consistent modal behaviour, touches ~20 components; sensible before the command palette.
6. **Command palette** — largest new feature, benefits from the modal shell.
7. **M-09 StateTree virtualization** and **M-06 singletons** — both need their own design pass first.

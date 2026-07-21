# Unified Tooltip Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom hand-rolled hover-tooltip in `StateRow.tsx` and all native `title=` attributes across the StateList table with one shared, viewport-aware `Tooltip` component built on Radix UI, fixing edge-clipping and stuck/flicker bugs, with a 300ms open delay.

**Architecture:** Add `@radix-ui/react-tooltip` dependency. Build one wrapper component `src/components/ui/Tooltip.tsx` exposing a `<Tooltip content={...}>{children}</Tooltip>` API plus a shared `<TooltipProvider>` mounted once near the app root (in `App.tsx`) with `delayDuration={300}`. Migrate the custom row-tooltip (hidden-column info) in `StateRow.tsx` to render its existing table markup as Radix `Tooltip.Content` instead of a hand-built portal. Replace every native `title=` in `StateRow.tsx`, `StateList.tsx`, all `Editable*Cell.tsx` files, and `CopyIdButton.tsx` with the new component.

**Tech Stack:** React 18, TypeScript strict, Radix UI (`@radix-ui/react-tooltip`), Tailwind CSS, Vitest + Testing Library.

---

## File Structure

- **Create `src/components/ui/Tooltip.tsx`** — shared `Tooltip` component + re-exported `TooltipProvider`. Wraps Radix primitives, applies app's dark/light Tailwind styling once, handles `side`/`align`/`collisionPadding` defaults for viewport-aware positioning (Radix `Popper` handles this natively — this is what fixes the edge-clipping bug).
- **Create `src/components/ui/Tooltip.test.tsx`** — behavior tests (renders content on hover after delay, hides on unhover, no stuck state across rapid re-hover).
- **Modify `src/App.tsx`** — mount `<TooltipProvider delayDuration={300}>` once, wrapping the app tree (or the relevant subtree that renders `StateList`).
- **Modify `src/components/statelist/StateRow.tsx`** — remove `tooltipTimerRef`, `tooltipPos`, `handleMouseEnter`, `handleMouseLeave`, the manual `createPortal` block (L137-150, L176-202), and the `onMouseEnter`/`onMouseLeave` row props (L224-225). Wrap the `<tr>` in `Tooltip` with the existing `hiddenColRows`/`tooltipStateRows` table as `content`. Replace all native `title=` (L258, 265, 278, 294, 309, 318, 327, 336, 345, 354, 398, 410, 423, 437, 450, 470, 512) with `Tooltip`.
- **Modify `src/components/statelist/StateList.tsx`** — replace native `title=` on header cells and other cells (L913-918, L936, L983, L1191, L1209, L1215, L1238, L1246, L1254, L1262, L1287) with `Tooltip`.
- **Modify `src/components/cells/EditableNameCell.tsx`** (L20-41) — replace `title=` with `Tooltip`.
- **Modify `src/components/cells/EditableUnitCell.tsx`** (L48) — replace `title=` with `Tooltip`.
- **Modify `src/components/cells/EditableFunctionCell.tsx`** (L50) — replace `title=` with `Tooltip`.
- **Modify `src/components/cells/EditableTypeCell.tsx`** (L56, L60) — replace `title=` with `Tooltip`.
- **Modify `src/components/cells/EditableRoomCell.tsx`** (L50) — replace `title=` with `Tooltip`.
- **Modify `src/components/cells/EditableRoleCell.tsx`** (L55) — replace `title=` with `Tooltip`.
- **Modify `src/components/cells/EditableValueCell.tsx`** (L72-154) — replace `title=` with `Tooltip`.
- **Modify `src/components/cells/CopyIdButton.tsx`** (L18) — replace `title=` with `Tooltip`.

`Tooltip` wraps a single child element (the trigger) — since every existing usage already has exactly one focusable/hoverable element (`button`, `span`, `div`), no markup restructuring beyond swapping `title="x"` for `<Tooltip content="x">...</Tooltip>` is needed. Where content can be `undefined` (e.g. `aliasTooltip`, conditional `title`), `Tooltip` renders children unwrapped (no trigger, no popup) — this matches current behavior of native `title=undefined`.

---

### Task 1: Add Radix dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install package**

Run: `npm install @radix-ui/react-tooltip`
Expected: `package.json` dependencies gains `"@radix-ui/react-tooltip": "^1.x.x"`, `package-lock.json` updates.

- [ ] **Step 2: Verify install**

Run: `npm run build`
Expected: build succeeds (no TS/type errors introduced by the new dependency alone).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @radix-ui/react-tooltip dependency"
```

---

### Task 2: Build shared `Tooltip` component

**Files:**
- Create: `src/components/ui/Tooltip.tsx`
- Test: `src/components/ui/Tooltip.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ui/Tooltip.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip, TooltipProvider } from './Tooltip';

describe('Tooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows content after hover delay and hides on unhover', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(
      <TooltipProvider delayDuration={300}>
        <Tooltip content="Hello tooltip">
          <button>Trigger</button>
        </Tooltip>
      </TooltipProvider>
    );

    expect(screen.queryByText('Hello tooltip')).not.toBeInTheDocument();

    await user.hover(screen.getByText('Trigger'));
    await waitFor(() => expect(screen.getByText('Hello tooltip')).toBeInTheDocument());

    await user.unhover(screen.getByText('Trigger'));
    await waitFor(() => expect(screen.queryByText('Hello tooltip')).not.toBeInTheDocument());
  });

  it('renders only children when content is undefined', () => {
    render(
      <TooltipProvider>
        <Tooltip content={undefined}>
          <button>NoTooltip</button>
        </Tooltip>
      </TooltipProvider>
    );
    expect(screen.getByText('NoTooltip')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/Tooltip.test.tsx`
Expected: FAIL — `Cannot find module './Tooltip'`

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/ui/Tooltip.tsx
import React from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';

export const TooltipProvider = RadixTooltip.Provider;

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function Tooltip({ content, children, side = 'top', align = 'center', className }: TooltipProps) {
  if (content === undefined || content === null || content === '') {
    return children;
  }

  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          align={align}
          collisionPadding={8}
          sideOffset={6}
          className={
            className ??
            'z-[9999] px-2.5 py-1.5 rounded shadow-lg border text-xs font-mono bg-gray-900 border-gray-600 text-gray-100 dark:bg-gray-950 dark:border-gray-700'
          }
        >
          {content}
          <RadixTooltip.Arrow className="fill-gray-900 dark:fill-gray-950" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ui/Tooltip.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Tooltip.tsx src/components/ui/Tooltip.test.tsx
git commit -m "feat(ui): add shared viewport-aware Tooltip component"
```

---

### Task 3: Mount `TooltipProvider` once at app root

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Locate root render output**

Run: `grep -n "return (" src/App.tsx | head -5`
Find the top-level JSX return of the `App` component.

- [ ] **Step 2: Wrap with provider**

Add import:
```tsx
import { TooltipProvider } from './components/ui/Tooltip';
```

Wrap the existing top-level returned JSX fragment/element with:
```tsx
<TooltipProvider delayDuration={300}>
  {/* existing App JSX */}
</TooltipProvider>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: success, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: mount TooltipProvider with 300ms delay at app root"
```

---

### Task 4: Migrate custom row-tooltip in `StateRow.tsx` to `Tooltip`

**Files:**
- Modify: `src/components/statelist/StateRow.tsx:1-3, 137-150, 174-235`
- Test: `src/components/statelist/StateRow.test.tsx` (create if it doesn't already exist; otherwise extend)

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/components/statelist/StateRow.test.tsx
it('shows hidden-column info tooltip on row hover without clipping at viewport edge', async () => {
  const user = userEvent.setup({ delay: null });
  // render StateRow with visibleCols excluding 'name' so hiddenColRows is non-empty,
  // and obj.common.name set, inside <TooltipProvider delayDuration={0}>
  // ... existing StateRow render setup, wrapped in TooltipProvider ...
  await user.hover(screen.getByRole('row'));
  await waitFor(() => expect(screen.getByText(/Name/)).toBeInTheDocument());
});
```

(Adapt to this file's existing test setup/render helpers — reuse whatever mock objects/state fixtures existing StateRow tests already use.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/statelist/StateRow.test.tsx`
Expected: FAIL (no tooltip renders — `<tr>` still uses old mouseEnter/portal logic incompatible with test's `TooltipProvider` wrapper, or row has no accessible trigger)

- [ ] **Step 3: Implement — remove old state/handlers, wrap row in Tooltip**

Remove from `StateRow.tsx`:
- L2 `import { createPortal } from 'react-dom';` (no longer needed)
- L137-150: `startTransition` stays (still used for `onSelect`), but remove `tooltipTimerRef`, `tooltipPos`, `handleMouseEnter`, `handleMouseLeave`
- L176-202: the manual `createPortal` tooltip block
- L224-225: `onMouseEnter={handleMouseEnter}` / `onMouseLeave={handleMouseLeave}` props on `<tr>`

Add import:
```tsx
import { Tooltip } from '../ui/Tooltip';
```

Build tooltip content as a variable before the `return`:
```tsx
const rowTooltipContent = (hiddenColRows.length > 0 || tooltipStateRows.length > 0) ? (
  <table className="border-separate" style={{ borderSpacing: '0 1px' }}>
    <tbody>
      {hiddenColRows.map(([label, value]) => (
        <tr key={`h-${label}`}>
          <td className="pr-3 text-blue-300 whitespace-nowrap">{label}</td>
          <td className="text-gray-100 whitespace-nowrap">{value}</td>
        </tr>
      ))}
      {hiddenColRows.length > 0 && tooltipStateRows.length > 0 && (
        <tr><td colSpan={2} className="py-0.5"><div className="border-t border-gray-600" /></td></tr>
      )}
      {tooltipStateRows.map(([label, value]) => (
        <tr key={label}>
          <td className="pr-3 text-gray-400 whitespace-nowrap">{label}</td>
          <td className="text-gray-100 whitespace-nowrap">{value}</td>
        </tr>
      ))}
    </tbody>
  </table>
) : undefined;
```

Replace the `return (<><tr ...>)` block's opening so the `<tr>` is wrapped:
```tsx
return (
  <Tooltip content={rowTooltipContent} side="right" align="start">
    <tr
      ref={trRef}
      ...
      {/* all existing props except onMouseEnter/onMouseLeave */}
    >
      {/* unchanged row content */}
    </tr>
  </Tooltip>
);
```

Note: Radix `Tooltip.Trigger asChild` requires the child to accept a ref and forward DOM event props — `<tr>` already forwards `ref` (`trRef`) and native DOM props, so this works without a wrapper `<div>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/statelist/StateRow.test.tsx`
Expected: PASS

- [ ] **Step 5: Replace remaining native `title=` attributes in this file**

Replace each of the following (pattern: wrap the existing trigger element in `<Tooltip content="...">...</Tooltip>` and delete the `title=` prop):
- L258 Delete button (`title="Delete datapoint"`)
- L265 JSON button (`title="JSON"`)
- L278 own-target button (`title={ownTargetExists ? ownTarget : ...}`)
- L294 alias target button (`title={aid}`)
- L309 History button (`title="History anzeigen"`)
- L318 SmartName button (`title="SmartName"`)
- L327 Scripts button (`title={isEn ? 'Show script usages' : ...}`)
- L336 Custom button (`title={isEn ? 'Custom settings' : ...}`)
- L345, L354 dangling/has-alias Link2 buttons (`title={aliasTooltip}`)
- L370 `write` cell `<td title=...>` — move `Tooltip` onto the icon it contains (or wrap the `<td>`'s inner `<div>`), since `<td>` cannot be a Radix trigger reliably in all browsers; wrap the inner content div instead.
- L398 Custom cell button
- L410 `smart` cell `<td title=...>` — same treatment as `write` cell (wrap inner div)
- L423 SmartName cell button
- L437, L450 alias cell Link2 buttons
- L470 Scripts cell button
- L512 `ack` status dot (`<span title=...>`)

- [ ] **Step 6: Run full test suite for this file**

Run: `npx vitest run src/components/statelist/StateRow.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 7: Commit**

```bash
git add src/components/statelist/StateRow.tsx src/components/statelist/StateRow.test.tsx
git commit -m "refactor(statelist): migrate StateRow tooltips to shared Tooltip component"
```

---

### Task 5: Migrate `StateList.tsx` native tooltips

**Files:**
- Modify: `src/components/statelist/StateList.tsx:913-918, 936, 983, 1191, 1209, 1215, 1238, 1246, 1254, 1262, 1287`

- [ ] **Step 1: Read current usages**

Run: `grep -n "title=" src/components/statelist/StateList.tsx`
Confirm each line still matches the plan's line numbers (file may have shifted slightly); note exact content of each `title=` string.

- [ ] **Step 2: Replace each with `Tooltip`**

Add import:
```tsx
import { Tooltip } from '../ui/Tooltip';
```

For each match, wrap the element (header cell content span, checkbox, id/name cell content) in `<Tooltip content="...">...</Tooltip>` and remove the `title=` prop. For header `<th>` cells, wrap the inner label element (not the `<th>` itself) to keep column-resize drag handles untouched.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run src/components/statelist/StateList.test.tsx`
Expected: PASS (existing tests unaffected — tooltip is presentation-only)

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`, open app, hover header cells and id-column checkboxes — tooltips appear after ~300ms, disappear on unhover, do not get clipped when hovering near the right edge of the viewport.

- [ ] **Step 5: Commit**

```bash
git add src/components/statelist/StateList.tsx
git commit -m "refactor(statelist): migrate StateList header/cell tooltips to shared Tooltip component"
```

---

### Task 6: Migrate `Editable*Cell.tsx` tooltips

**Files:**
- Modify: `src/components/cells/EditableNameCell.tsx:20-41`
- Modify: `src/components/cells/EditableUnitCell.tsx:48`
- Modify: `src/components/cells/EditableFunctionCell.tsx:50`
- Modify: `src/components/cells/EditableTypeCell.tsx:56,60`
- Modify: `src/components/cells/EditableRoomCell.tsx:50`
- Modify: `src/components/cells/EditableRoleCell.tsx:55`
- Modify: `src/components/cells/EditableValueCell.tsx:72-154`

- [ ] **Step 1: Read current `title=` usages in each file**

Run: `grep -n "title=" src/components/cells/Editable*Cell.tsx`
Confirm exact content/line numbers per file.

- [ ] **Step 2: Replace with `Tooltip` in each file**

Same pattern as Task 5 — import `Tooltip` from `'../ui/Tooltip'`, wrap the existing trigger element, delete `title=`. These cells render dropdowns positioned via `getBoundingClientRect()` (per CLAUDE.md) — do not wrap the dropdown menu itself, only the always-visible cell trigger content, so dropdown positioning logic is untouched.

- [ ] **Step 3: Run existing cell tests**

Run: `npx vitest run src/components/cells`
Expected: PASS (all existing tests for these cells unaffected)

- [ ] **Step 4: Commit**

```bash
git add src/components/cells/EditableNameCell.tsx src/components/cells/EditableUnitCell.tsx src/components/cells/EditableFunctionCell.tsx src/components/cells/EditableTypeCell.tsx src/components/cells/EditableRoomCell.tsx src/components/cells/EditableRoleCell.tsx src/components/cells/EditableValueCell.tsx
git commit -m "refactor(cells): migrate Editable*Cell tooltips to shared Tooltip component"
```

---

### Task 7: Migrate `CopyIdButton.tsx`

**Files:**
- Modify: `src/components/cells/CopyIdButton.tsx:18`

- [ ] **Step 1: Read current usage**

Run: `grep -n "title=" src/components/cells/CopyIdButton.tsx`

- [ ] **Step 2: Replace with `Tooltip`**

Wrap the button in `<Tooltip content="...">`, remove `title=`. Note this button already shows a transient "Copied!" state change on click — verify the tooltip doesn't fight with that state (Radix tooltip closes automatically on click by default, which is correct here).

- [ ] **Step 3: Run existing test**

Run: `npx vitest run src/components/cells/CopyIdButton.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/cells/CopyIdButton.tsx
git commit -m "refactor(cells): migrate CopyIdButton tooltip to shared Tooltip component"
```

---

### Task 8: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests PASS

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`. In browser:
- Hover a row near the bottom-right corner of the table — tooltip must stay fully within viewport (fixes edge-clipping bug).
- Hover rapidly across multiple adjacent rows/cells — tooltip must not flicker or get stuck visible after mouse leaves (fixes stuck/flicker bug).
- Confirm hidden-column info tooltip still shows correct hidden-column + state data when columns are hidden via column picker.
- Confirm alias, history, custom, smart-name, delete, JSON, copy-id tooltips all still show correct text.

- [ ] **Step 5: Final commit (if smoke test required fixes)**

```bash
git add -A
git commit -m "fix: address issues found in tooltip migration smoke test"
```

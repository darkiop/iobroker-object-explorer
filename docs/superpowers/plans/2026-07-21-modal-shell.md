# Shared Modal Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a single `<Modal>` primitive that owns portal, backdrop, animation, z-layering, focus trap, and accessibility, then migrate all 22 dialog components onto it without changing any dialog's visual appearance.

**Architecture:** A module-level modal stack lets the shell know which dialog is topmost, so Escape and focus trapping only apply to the top of the stack — fixing the current class of bug where Escape closes a parent and its nested confirm together. The shell takes a `panelClassName` escape hatch so each migrated dialog keeps its exact existing width/height Tailwind classes; migration is a mechanical wrapper swap with zero pixel movement. Dialogs with bespoke close semantics (dirty-form interception, nested-confirm suppression) opt out via `closeOnEscape` / `closeOnBackdrop` and keep their own logic.

**Tech Stack:** React 18, TypeScript (strict, `noUnusedLocals`/`noUnusedParameters`), Tailwind CSS, Vitest + @testing-library/react + jsdom, `react-dom` `createPortal`.

---

## Prerequisites

Read before starting:
- `src/hooks/useEscapeKey.ts` — existing Escape hook, 19 dialogs use it
- `src/components/modals/ConfirmDialog.tsx` — smallest dialog, the migration template
- `src/components/statelist/StateRow.test.tsx` — house test style (Vitest, `render`, `userEvent`, `cleanup`)

House conventions this plan follows:
- No i18n framework. Strings are inline ternaries on an `isEn` boolean derived from a `language: 'en' | 'de'` prop.
- Tests live next to the code they test, named `*.test.ts` / `*.test.tsx`.
- There is no vitest setup file. Each test file imports `cleanup` from `@testing-library/react` and calls it in `afterEach` itself.

## File Structure

**Create:**
- `src/hooks/useFocusTrap.ts` — traps Tab focus inside an element, restores focus on unmount
- `src/hooks/useFocusTrap.test.ts` — tests for the above
- `src/hooks/useModalStack.ts` — module-level stack; tells a dialog whether it is topmost
- `src/hooks/useModalStack.test.ts` — tests for the above
- `src/components/ui/Modal.tsx` — the shell
- `src/components/ui/Modal.test.tsx` — tests for the shell

**Modify (22 dialogs, mechanical wrapper swap):**
`ConfirmDialog`, `MultiDeleteDialog`, `MoveDatapointModal`, `RenameDatapointModal`, `NewDatapointModal`, `CopyDatapointModal`, `CreateAliasModal`, `AliasReplaceModal`, `ImportDatapointsModal`, `ValueEditModal`, `SettingsModal`, `EnumManagerModal`, `VirtualFoldersModal`, `TreeStatsModal`, `OrphanValuesModal`, `HelpModal`, `AutoCreateAliasModal`, `OptimizeModal`, `DbOverviewModal`, `DpValuesModal`, `HistoryModal`, `ObjectEditModal` — all under `src/components/modals/`.

**Deliberately NOT migrated:**
- `src/components/modals/StateListModals.tsx:456` — the `batchProgress` overlay. It is a non-dismissible progress indicator, not a dialog: no close affordance, no focusable content, must not trap focus or respond to Escape. Migrating it would be a category error. Leave as-is.

## Design Decisions

**Why `panelClassName` instead of a `size` prop.** The 22 dialogs use 9 distinct width classes (`max-w-sm` through `max-w-7xl`, plus `max-w-[95vw]`) and 6 distinct height treatments (`max-h-[80vh]`, `max-h-[85vh]`, `max-h-[90vh]`, `max-h-[95vh]`, `h-[85vh]`, `h-[90vh]`), in inconsistent combinations with `flex flex-col`. A closed `size` enum would force judgement calls on every dialog and silently resize some of them. Passing the existing classes through verbatim makes each migration provably pixel-identical, which is what makes a 22-file refactor reviewable.

**Why a modal stack.** Four dialogs (`DbOverviewModal`, `DpValuesModal`, `TreeStatsModal`, `OrphanValuesModal`) currently work around nested-confirm collisions by disabling backdrop close with inline ternaries. `useEscapeKey` attaches a `document` listener per dialog, so with a nested confirm open, one Escape fires *both* handlers. The stack makes "only the topmost dialog reacts" a property of the shell instead of a per-dialog workaround.

**Normalized backdrop.** All dialogs converge on `bg-black/60 backdrop-blur-sm` with `animate-backdrop-in`. This is a deliberate visible change for exactly two dialogs — `EnumManagerModal` and `SettingsModal` currently use `bg-black/50`, and `EnumManagerModal` and `VirtualFoldersModal` currently have no entry animation. Every other dialog already matches.

**z-layering.** Three named layers replace ad-hoc values: `base` → `z-50` (default), `nested` → `z-[60]` (a dialog opened from inside another dialog), `top` → `z-[70]`.

---

## Task 1: Focus trap hook

**Files:**
- Create: `src/hooks/useFocusTrap.ts`
- Test: `src/hooks/useFocusTrap.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useFocusTrap.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { useFocusTrap } from './useFocusTrap';

afterEach(cleanup);

function Trapped({ active = true }: { active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, active);
  return (
    <div ref={ref}>
      <button>first</button>
      <button>middle</button>
      <button>last</button>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('focuses the first focusable element on mount', () => {
    render(<Trapped />);
    expect(document.activeElement).toHaveProperty('textContent', 'first');
  });

  it('wraps Tab from the last element back to the first', async () => {
    const user = userEvent.setup();
    render(<Trapped />);
    await user.tab();
    await user.tab();
    expect(document.activeElement).toHaveProperty('textContent', 'last');
    await user.tab();
    expect(document.activeElement).toHaveProperty('textContent', 'first');
  });

  it('wraps Shift+Tab from the first element to the last', async () => {
    const user = userEvent.setup();
    render(<Trapped />);
    await user.tab({ shift: true });
    expect(document.activeElement).toHaveProperty('textContent', 'last');
  });

  it('restores focus to the previously active element on unmount', () => {
    const outside = document.createElement('button');
    outside.textContent = 'outside';
    document.body.appendChild(outside);
    outside.focus();
    const { unmount } = render(<Trapped />);
    expect(document.activeElement).toHaveProperty('textContent', 'first');
    unmount();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('does nothing when inactive', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    render(<Trapped active={false} />);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/hooks/useFocusTrap.test.ts`
Expected: FAIL — `Failed to resolve import "./useFocusTrap"`.

- [ ] **Step 3: Write the implementation**

Create `src/hooks/useFocusTrap.ts`:

```ts
import { useEffect, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
    .filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * Keeps Tab focus inside `ref` while `active`, and restores focus to whatever
 * was focused beforehand once the trap is torn down.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;

    const previous = document.activeElement as HTMLElement | null;
    focusable(root)[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusable(root);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    root.addEventListener('keydown', onKeyDown);
    return () => {
      root.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [ref, active]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/hooks/useFocusTrap.test.ts`
Expected: PASS, 5 tests.

Note on the jsdom caveat: `offsetParent` is always `null` in jsdom, which is why `focusable()` keeps the currently-focused element as a fallback. If the wrap tests fail with "0 items", replace the `.filter(...)` line with a plain `[...root.querySelectorAll<HTMLElement>(FOCUSABLE)]` and drop visibility filtering — hidden-element filtering is not what these tests cover.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useFocusTrap.ts src/hooks/useFocusTrap.test.ts
git commit -m "feat(ui): add useFocusTrap hook"
```

---

## Task 2: Modal stack hook

**Files:**
- Create: `src/hooks/useModalStack.ts`
- Test: `src/hooks/useModalStack.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useModalStack.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useModalStack, __resetModalStack } from './useModalStack';

afterEach(() => { cleanup(); __resetModalStack(); });

function Probe({ label, onTop }: { label: string; onTop: (l: string, v: boolean) => void }) {
  const isTop = useModalStack();
  onTop(label, isTop);
  return <div>{label}</div>;
}

describe('useModalStack', () => {
  it('reports a single modal as topmost', () => {
    const seen: Record<string, boolean> = {};
    render(<Probe label="a" onTop={(l, v) => { seen[l] = v; }} />);
    expect(seen.a).toBe(true);
  });

  it('reports only the last-mounted modal as topmost', () => {
    const seen: Record<string, boolean> = {};
    const cb = (l: string, v: boolean) => { seen[l] = v; };
    render(<><Probe label="a" onTop={cb} /><Probe label="b" onTop={cb} /></>);
    expect(seen.a).toBe(false);
    expect(seen.b).toBe(true);
  });

  it('promotes the previous modal back to topmost when the top unmounts', () => {
    const seen: Record<string, boolean> = {};
    const cb = (l: string, v: boolean) => { seen[l] = v; };
    const { rerender } = render(
      <><Probe label="a" onTop={cb} /><Probe label="b" onTop={cb} /></>
    );
    expect(seen.a).toBe(false);
    rerender(<><Probe label="a" onTop={cb} /></>);
    expect(seen.a).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/hooks/useModalStack.test.ts`
Expected: FAIL — `Failed to resolve import "./useModalStack"`.

- [ ] **Step 3: Write the implementation**

Create `src/hooks/useModalStack.ts`:

```ts
import { useEffect, useId, useState } from 'react';

let stack: string[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

/** Test-only: clears the stack between cases. */
export function __resetModalStack() {
  stack = [];
  listeners.clear();
}

/**
 * Registers the calling modal on a global stack and returns whether it is
 * currently the topmost one. Only the topmost modal should react to Escape or
 * hold the focus trap.
 */
export function useModalStack(): boolean {
  const id = useId();
  const [, force] = useState(0);

  useEffect(() => {
    stack = [...stack, id];
    notify();
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      stack = stack.filter((x) => x !== id);
      notify();
    };
  }, [id]);

  return stack.length === 0 || stack[stack.length - 1] === id;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/hooks/useModalStack.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useModalStack.ts src/hooks/useModalStack.test.ts
git commit -m "feat(ui): add modal stack for topmost-modal tracking"
```

---

## Task 3: The Modal shell

**Files:**
- Create: `src/components/ui/Modal.tsx`
- Test: `src/components/ui/Modal.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/Modal.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from './Modal';
import { __resetModalStack } from '../../hooks/useModalStack';

afterEach(() => { cleanup(); __resetModalStack(); });

describe('Modal', () => {
  it('renders children inside a labelled dialog', () => {
    render(
      <Modal onClose={() => {}} panelClassName="max-w-md" titleId="t">
        <h2 id="t">Title</h2>
        <p>Body</p>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 't');
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('calls onClose when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal onClose={onClose} panelClassName="max-w-md"><button>x</button></Modal>);
    await user.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when the panel itself is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal onClose={onClose} panelClassName="max-w-md"><button>inside</button></Modal>);
    await user.click(screen.getByText('inside'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close on backdrop click when closeOnBackdrop is false', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} panelClassName="max-w-md" closeOnBackdrop={false}>
        <button>x</button>
      </Modal>
    );
    await user.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal onClose={onClose} panelClassName="max-w-md"><button>x</button></Modal>);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on Escape when closeOnEscape is false', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} panelClassName="max-w-md" closeOnEscape={false}>
        <button>x</button>
      </Modal>
    );
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('routes Escape only to the topmost modal', async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <>
        <Modal onClose={outer} panelClassName="max-w-md"><button>outer</button></Modal>
        <Modal onClose={inner} panelClassName="max-w-sm" layer="nested"><button>inner</button></Modal>
      </>
    );
    await user.keyboard('{Escape}');
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it('applies the z-index for the requested layer', () => {
    render(<Modal onClose={() => {}} panelClassName="max-w-md" layer="nested"><button>x</button></Modal>);
    expect(screen.getByTestId('modal-backdrop').className).toContain('z-[60]');
  });

  it('passes panelClassName through to the panel verbatim', () => {
    render(
      <Modal onClose={() => {}} panelClassName="w-full max-w-7xl flex flex-col h-[85vh]">
        <button>x</button>
      </Modal>
    );
    const cls = screen.getByRole('dialog').className;
    expect(cls).toContain('max-w-7xl');
    expect(cls).toContain('h-[85vh]');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/ui/Modal.test.tsx`
Expected: FAIL — `Failed to resolve import "./Modal"`.

- [ ] **Step 3: Write the implementation**

Create `src/components/ui/Modal.tsx`:

```tsx
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useModalStack } from '../../hooks/useModalStack';

export type ModalLayer = 'base' | 'nested' | 'top';

const LAYER_Z: Record<ModalLayer, string> = {
  base: 'z-50',
  nested: 'z-[60]',
  top: 'z-[70]',
};

const PANEL_BASE =
  'bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700';

interface ModalProps {
  /** Called on Escape (when topmost) and on backdrop click. */
  onClose: () => void;
  /** Width/height/layout Tailwind classes for the panel, passed through verbatim. */
  panelClassName: string;
  /** Stacking layer. `nested` for a dialog opened from inside another dialog. */
  layer?: ModalLayer;
  /** Set false when the dialog owns its own Escape handling. Default true. */
  closeOnEscape?: boolean;
  /** Set false to make the backdrop inert. Default true. */
  closeOnBackdrop?: boolean;
  /** id of the element labelling this dialog, for aria-labelledby. */
  titleId?: string;
  children: ReactNode;
}

export default function Modal({
  onClose,
  panelClassName,
  layer = 'base',
  closeOnEscape = true,
  closeOnBackdrop = true,
  titleId,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isTop = useModalStack();
  useFocusTrap(panelRef, isTop);

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!closeOnEscape || !isTop) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [closeOnEscape, isTop]);

  return createPortal(
    <div
      data-testid="modal-backdrop"
      className={`fixed inset-0 ${LAYER_Z[layer]} flex items-center justify-center animate-backdrop-in bg-black/60 backdrop-blur-sm p-4`}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${PANEL_BASE} ${panelClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/ui/Modal.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Modal.tsx src/components/ui/Modal.test.tsx
git commit -m "feat(ui): add shared Modal shell with focus trap and stacking"
```

---

## Migration procedure

Tasks 4–8 all apply the same mechanical transform. It is written out once here; each task below states the exact file, the exact lines, and the exact props for that file.

**Before** (the shape shared by every dialog):

```tsx
return createPortal(
  <div
    className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop-in bg-black/60 backdrop-blur-sm p-4"
    onClick={onClose}
  >
    <div
      className="w-full max-w-md bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700"
      onClick={(e) => e.stopPropagation()}
    >
      {/* ...dialog body, unchanged... */}
    </div>
  </div>,
  document.body
);
```

**After:**

```tsx
return (
  <Modal onClose={onClose} panelClassName="w-full max-w-md">
    {/* ...dialog body, unchanged... */}
  </Modal>
);
```

Per-file rules:

1. `panelClassName` receives the old panel classes **minus** the shared visual base that `Modal` now supplies. Strip exactly these tokens and keep everything else: `bg-white`, `dark:bg-gray-900`, `animate-modal-in`, `rounded-xl`, `shadow-2xl`, `border`, `border-gray-200`, `dark:border-gray-700`. Keep `w-full`, all `max-w-*`, all `max-h-*`, all `h-*`, `flex`, `flex-col`, `mx-4`, and any rounding that differs from `rounded-xl` (e.g. `ValueEditModal` uses `rounded-2xl` — keep it; it wins by source order).
2. Delete the `import { createPortal } from 'react-dom'` line if `createPortal` is no longer used anywhere in the file. Several files use it a second time for dropdowns — check before deleting.
3. Delete the `useEscapeKey(onClose)` call and its import **only** when the dialog gets the shell's default Escape. Where the dialog has bespoke Escape logic, keep the hook and pass `closeOnEscape={false}`.
4. Add `import Modal from '../ui/Modal';`.
5. Give the dialog's existing title element an `id` and pass it as `titleId`, so `aria-labelledby` resolves.

**After every task in this section, run the full gate:**

```bash
npx tsc --noEmit && npm run lint && npm test
```

Expected: clean, and the existing `ObjectEditModal.test.tsx` still passes.

---

## Task 4: Migrate the simple dialogs

Six dialogs with auto height and no scroll container.

**Files:**
- Modify: `src/components/modals/ConfirmDialog.tsx:28-67`
- Modify: `src/components/modals/MultiDeleteDialog.tsx:32-38`
- Modify: `src/components/modals/MoveDatapointModal.tsx:72-78`
- Modify: `src/components/modals/RenameDatapointModal.tsx:69-75`
- Modify: `src/components/modals/NewDatapointModal.tsx:114-120`
- Modify: `src/components/modals/CopyDatapointModal.tsx:121-127`

- [ ] **Step 1: Migrate ConfirmDialog**

This one keeps its own key handling — it binds Enter to confirm as well as Escape to cancel, so it opts out of the shell's Escape.

Replace the `useEffect` at lines 19–26 and the `createPortal(...)` return at lines 28–67. The `useEffect` stays exactly as it is. Change only the return:

```tsx
  return (
    <Modal
      onClose={onCancel}
      panelClassName="w-full max-w-sm mx-4"
      closeOnEscape={false}
      titleId="confirm-dialog-title"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-red-500">
          <AlertTriangle size={16} />
          <span id="confirm-dialog-title" className="font-semibold text-sm">{title}</span>
        </div>
        <button onClick={onCancel} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
          <X size={15} />
        </button>
      </div>
      <div className="px-5 py-4">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{effectiveDescription}</p>
        <p className="text-sm font-mono text-gray-800 dark:text-gray-200 break-all whitespace-pre-line">{message}</p>
      </div>
      <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onCancel}
          className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          {isEn ? 'Cancel' : 'Abbrechen'}
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-1.5 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
        >
          {effectiveConfirmLabel}
        </button>
      </div>
    </Modal>
  );
```

Update the imports at the top of the file:

```tsx
import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import Modal from '../ui/Modal';
```

Note the visual change: `ConfirmDialog` previously had no `p-4` on its backdrop. The shell adds it. On a `max-w-sm` centred dialog this is not observable except below 384px viewport width, where it is an improvement.

- [ ] **Step 2: Migrate MultiDeleteDialog**

`panelClassName="w-full max-w-lg mx-4 flex flex-col max-h-[80vh]"`. Remove `useEscapeKey(onClose)` at line 18 and its import — the shell handles it. Give the header `<span>` at line ~48 `id="multi-delete-title"` and pass `titleId="multi-delete-title"`.

- [ ] **Step 3: Migrate MoveDatapointModal**

`panelClassName="w-full max-w-md"`. Remove `useEscapeKey(onClose)` at line 37 and its import. Add `titleId`.

- [ ] **Step 4: Migrate RenameDatapointModal**

`panelClassName="w-full max-w-md"`. Remove `useEscapeKey(onClose)` at line 35 and its import. Add `titleId`.

- [ ] **Step 5: Migrate NewDatapointModal**

`panelClassName="w-full max-w-md"`. Remove `useEscapeKey(onClose)` at line 61 and its import. Add `titleId`.

- [ ] **Step 6: Migrate CopyDatapointModal**

`panelClassName="w-full max-w-md"`. Remove `useEscapeKey(onClose)` at line 68 and its import. Add `titleId`.

- [ ] **Step 7: Run the gate**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

- [ ] **Step 8: Verify visually**

Run: `npm run dev`, then open each of the six dialogs and confirm the panel size and position are unchanged. Confirm Escape closes each one, Tab cycles within it, and focus returns to the triggering control on close.

- [ ] **Step 9: Commit**

```bash
git add src/components/modals/
git commit -m "refactor(modals): migrate simple dialogs to Modal shell"
```

---

## Task 5: Migrate the form dialogs

**Files:**
- Modify: `src/components/modals/CreateAliasModal.tsx:141-147`
- Modify: `src/components/modals/AliasReplaceModal.tsx:117-123`
- Modify: `src/components/modals/ImportDatapointsModal.tsx:267-273`
- Modify: `src/components/modals/ValueEditModal.tsx:203-206`
- Modify: `src/components/modals/SettingsModal.tsx:226-229`

- [ ] **Step 1: Migrate CreateAliasModal**

`panelClassName="w-full max-w-2xl"`. Remove `useEscapeKey(onClose)` at line 88 and its import. Add `titleId`.

- [ ] **Step 2: Migrate AliasReplaceModal**

`panelClassName="w-full max-w-2xl flex flex-col max-h-[85vh]"`. Remove `useEscapeKey(onClose)` at line 59 and its import. Add `titleId`.

- [ ] **Step 3: Migrate ImportDatapointsModal**

`panelClassName="w-full max-w-3xl flex flex-col"`. Remove `useEscapeKey(onClose)` at line 205 and its import. Add `titleId`.

Caution: this file uses `createPortal` a second time and has an `aria-hidden` element at line 116. Do not remove the `createPortal` import without checking; do not touch the `aria-hidden` element.

- [ ] **Step 4: Migrate ValueEditModal**

`panelClassName="w-full max-w-4xl rounded-2xl"`. Keep `rounded-2xl` — it appears after `rounded-xl` in the concatenated class string, so it wins. Remove `useEscapeKey(onClose)` at line 166 and its import. Add `titleId`.

- [ ] **Step 5: Migrate SettingsModal**

`panelClassName="w-full max-w-3xl"`. Remove `useEscapeKey(onClose)` at line 78 and its import. Add `titleId`.

Visible change: the backdrop goes from `bg-black/50` (no blur) to `bg-black/60 backdrop-blur-sm`, matching every other dialog. This is intentional.

Caution: this file uses `createPortal` a second time for its dropdowns and has `aria-haspopup`/`aria-expanded` attributes at lines 36–37. Leave those alone.

- [ ] **Step 6: Run the gate**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

- [ ] **Step 7: Verify the dropdowns still escape their container**

Run `npm run dev`, open Settings, and open each dropdown. Portal-based dropdowns position via `getBoundingClientRect()` and must still render above the dialog panel. If any dropdown now renders behind the panel, its portal target z-index needs to exceed `z-50`; fix by raising that dropdown's own z-index, not by lowering the shell's.

- [ ] **Step 8: Commit**

```bash
git add src/components/modals/
git commit -m "refactor(modals): migrate form dialogs to Modal shell"
```

---

## Task 6: Migrate the list dialogs

**Files:**
- Modify: `src/components/modals/EnumManagerModal.tsx:124-127`
- Modify: `src/components/modals/VirtualFoldersModal.tsx:64-66`
- Modify: `src/components/modals/TreeStatsModal.tsx:139-145`
- Modify: `src/components/modals/OrphanValuesModal.tsx:91-97`
- Modify: `src/components/modals/HelpModal.tsx:85-91`

- [ ] **Step 1: Migrate EnumManagerModal**

`panelClassName="w-full max-w-lg flex flex-col max-h-[80vh]"`. Remove `useEscapeKey(onClose)` at line 42 and its import. Add `titleId`.

Two intentional visible changes: backdrop `bg-black/50` → `bg-black/60 backdrop-blur-sm`, and the panel gains the `animate-modal-in` entry animation it previously lacked. Also note the inline rename input at line 186 has its own `Escape` handler that calls `setRenamingId(null)`. That listener is on the input and stops at the input, but the shell's document-level Escape listener will *also* fire and close the whole dialog. Fix by adding `e.stopPropagation()` to that input's Escape branch:

```tsx
onKeyDown={(e) => {
  if (e.key === 'Enter') commitRename();
  if (e.key === 'Escape') { e.stopPropagation(); setRenamingId(null); }
}}
```

This is a real pre-existing bug that the migration surfaces — before, `useEscapeKey` had the same collision.

- [ ] **Step 2: Migrate VirtualFoldersModal**

`panelClassName="w-full max-w-2xl flex flex-col max-h-[80vh]"`. Remove `useEscapeKey(onClose)` at line 20 and its import. Add `titleId`.

Intentional behaviour change: this dialog currently has **no** backdrop click handler. It gains click-to-close, matching every other dialog.

Intentional visible changes: backdrop `bg-black/50` → `bg-black/60`, and the panel gains `animate-modal-in`.

- [ ] **Step 3: Migrate TreeStatsModal**

`panelClassName="w-full max-w-4xl flex flex-col max-h-[80vh]"`. This dialog suppresses backdrop close while a nested confirm is open, so replace that inline ternary with the prop:

```tsx
<Modal
  onClose={onClose}
  panelClassName="w-full max-w-4xl flex flex-col max-h-[80vh]"
  closeOnBackdrop={!pendingDelete}
  closeOnEscape={!pendingDelete}
  titleId="tree-stats-title"
>
```

Remove `useEscapeKey(onClose)` at line 39 and its import. With `closeOnEscape={!pendingDelete}`, Escape while the confirm is open is handled by the confirm alone — which is the behaviour the inline ternary was reaching for.

- [ ] **Step 4: Migrate OrphanValuesModal**

`panelClassName="w-full max-w-3xl flex flex-col max-h-[85vh]"`, `layer="nested"` (it opens from inside `DbOverviewModal`, and currently hardcodes `z-[60]`). Same suppression pattern as Task 6 Step 3, keyed on `pending`:

```tsx
<Modal
  onClose={onClose}
  panelClassName="w-full max-w-3xl flex flex-col max-h-[85vh]"
  layer="nested"
  closeOnBackdrop={!pending}
  closeOnEscape={!pending}
  titleId="orphan-values-title"
>
```

Remove `useEscapeKey(onClose)` at line 25 and its import.

- [ ] **Step 5: Migrate HelpModal**

`panelClassName="w-full max-w-6xl max-h-[90vh] overflow-y-auto"`. Remove `useEscapeKey(onClose)` at line 76 and its import. Add `titleId`.

- [ ] **Step 6: Run the gate**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

- [ ] **Step 7: Verify nested Escape behaviour**

Run `npm run dev`. Open Tree Statistics, trigger a subtree delete confirm, press Escape once. Expected: only the confirm closes, the statistics dialog stays open. Press Escape again: the statistics dialog closes. Repeat for Database overview → Orphan values.

- [ ] **Step 8: Commit**

```bash
git add src/components/modals/
git commit -m "refactor(modals): migrate list dialogs to Modal shell"
```

---

## Task 7: Migrate the large dialogs

**Files:**
- Modify: `src/components/modals/AutoCreateAliasModal.tsx:222-228`
- Modify: `src/components/modals/OptimizeModal.tsx:241-243`
- Modify: `src/components/modals/HistoryModal.tsx:96-98`

- [ ] **Step 1: Migrate AutoCreateAliasModal**

`panelClassName="w-full max-w-6xl flex flex-col max-h-[95vh]"`. Remove `useEscapeKey(onClose)` at line 69 and its import. Add `titleId`.

- [ ] **Step 2: Migrate OptimizeModal**

`panelClassName="w-full max-w-[95vw] max-h-[90vh] h-[90vh] flex flex-col"`. Remove `useEscapeKey(onClose)` at line 99 and its import. Add `titleId`.

Same inline-input Escape collision as `EnumManagerModal`: the suggestions input at line 266 handles Escape to close its suggestion list. Add `e.stopPropagation()` to that branch:

```tsx
onKeyDown={e => {
  if (e.key === 'Enter') { setShowSuggestions(false); handleAnalyze(); }
  if (e.key === 'Escape') { e.stopPropagation(); setShowSuggestions(false); }
}}
```

- [ ] **Step 3: Migrate HistoryModal**

This dialog computes its own `zClass` because it can be opened either standalone or from within another dialog. Map that to the `layer` prop.

The panel classes at line 102 are `bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col w-[95vw] h-[90vh]`, so after stripping the shared base tokens:

```tsx
<Modal
  onClose={onClose}
  panelClassName="flex flex-col w-[95vw] h-[90vh]"
  layer={zClass === 'z-50' ? 'base' : 'nested'}
  titleId="history-modal-title"
>
```

Find the `zClass` definition (it is computed above the return, near line 94) and keep it — only the backdrop `className` template literal that consumed it goes away. If `zClass` becomes unused after this edit, delete it and inline whatever condition produced it into the `layer` prop; `noUnusedLocals` will fail the build otherwise.

Remove `useEscapeKey(onClose)` at line 36 and its import.

- [ ] **Step 4: Run the gate**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/modals/
git commit -m "refactor(modals): migrate large dialogs to Modal shell"
```

---

## Task 8: Migrate the dialogs with custom close semantics

The three hardest. Each has close logic the shell must not override.

**Files:**
- Modify: `src/components/modals/DbOverviewModal.tsx:252-258`
- Modify: `src/components/modals/DpValuesModal.tsx:261-267`
- Modify: `src/components/modals/ObjectEditModal.tsx:276-332`

- [ ] **Step 1: Migrate DbOverviewModal**

It suppresses backdrop close while any of four nested things is open. Collapse that into one derived boolean:

```tsx
const nestedOpen = Boolean(pendingDelete || renameOldId || orphansOpen || historyOf);

return (
  <Modal
    onClose={onClose}
    panelClassName="w-full max-w-7xl flex flex-col h-[85vh]"
    closeOnBackdrop={!nestedOpen}
    closeOnEscape={!nestedOpen}
    titleId="db-overview-title"
  >
```

Remove `useEscapeKey(onClose)` at line 42 and its import.

- [ ] **Step 2: Migrate DpValuesModal**

`panelClassName="w-full max-w-7xl flex flex-col h-[85vh]"`, `layer="nested"` (it currently hardcodes `z-[60]`).

This file's `useEscapeKey` at lines 70–71 implements "Escape closes an open confirm first, the dialog only when none is open". That is now the shell's job. Delete the hook call and its import, and express the same rule with the prop:

```tsx
<Modal
  onClose={onClose}
  panelClassName="w-full max-w-7xl flex flex-col h-[85vh]"
  layer="nested"
  closeOnBackdrop={!historyOpen}
  closeOnEscape={!historyOpen}
  titleId="dp-values-title"
>
```

Read lines 70–80 first and confirm every condition the old handler checked appears in the `closeOnEscape` expression. This file has four `fixed inset-0` occurrences — only the one at line 263 is this dialog's own backdrop. The others are nested overlays; leave them.

- [ ] **Step 3: Migrate ObjectEditModal**

The hardest. It intercepts *every* close path when the form is dirty, routing through `openCloseConfirm()`, and it has a hand-rolled Escape handler at line 164 rather than `useEscapeKey`.

Keep all of that. The shell only replaces the wrapper markup:

```tsx
const requestClose = () => {
  if (isDirtyRef.current) { openCloseConfirm(); } else { onClose(); }
};

return (
  <Modal
    onClose={requestClose}
    panelClassName="w-full max-w-4xl flex flex-col h-[90vh]"
    closeOnEscape={false}
    titleId="object-edit-title"
  >
```

`closeOnEscape={false}` because the existing handler at line 164 stays and already does the dirty check. Replace the three duplicated inline `onClick={() => { if (isDirtyRef.current) ... }}` handlers at lines 329, 358, and 526 with `requestClose` — that de-duplication is the point of this step.

Structure caution, confirmed by reading lines 276–334: this file returns `createPortal(<>…</>)` where the fragment holds *first* a conditionally-rendered nested `CopyDatapointModal`, and *then* the backdrop div at line 328. The `<Modal>` replaces only the backdrop and panel divs. The `createPortal` call, the fragment, and the nested `CopyDatapointModal` all stay exactly where they are — `<Modal>` portals itself, so the result is:

```tsx
return createPortal(
  <>
    {showCopy && (
      <CopyDatapointModal /* ...unchanged... */ />
    )}
    <Modal
      onClose={requestClose}
      panelClassName="w-full max-w-4xl flex flex-col h-[90vh]"
      closeOnEscape={false}
      titleId="object-edit-title"
    >
      {/* ...dialog body, unchanged... */}
    </Modal>
  </>,
  document.body
);
```

Keep the `createPortal` import for this reason. Once `CopyDatapointModal` is itself on the shell (Task 4), the outer `createPortal` and fragment become redundant — collapsing them is a safe follow-up, not part of this step.

- [ ] **Step 4: Run the gate**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean, including the existing `src/components/modals/ObjectEditModal.test.tsx`.

- [ ] **Step 5: Verify dirty-form interception**

Run `npm run dev`. Open a datapoint, edit a field, then attempt to close three ways: Escape, backdrop click, and the X button. All three must show the unsaved-changes confirm rather than discarding. Then close without editing and confirm it closes immediately on all three.

- [ ] **Step 6: Commit**

```bash
git add src/components/modals/
git commit -m "refactor(modals): migrate dialogs with custom close semantics"
```

---

## Task 9: Remove the dead Escape hook and document the shell

**Files:**
- Modify: `src/hooks/useEscapeKey.ts` (delete if unused)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Check whether useEscapeKey still has callers**

Run: `grep -rn "useEscapeKey" src/`
Expected: only `src/hooks/useEscapeKey.ts` itself, if every migration removed its call. If any callers remain outside `src/components/modals/`, leave the hook in place and skip Step 2.

- [ ] **Step 2: Delete the hook if it has no callers**

```bash
git rm src/hooks/useEscapeKey.ts
```

- [ ] **Step 3: Document the shell in CLAUDE.md**

In the "Key Patterns" section, add:

```markdown
- **Modal shell**: all dialogs render through `src/components/ui/Modal.tsx`, which owns portal, backdrop, animation, z-layering (`base`/`nested`/`top`), focus trap, `role="dialog"`, and Escape. Width/height classes are passed per-dialog via `panelClassName`. A module-level stack (`useModalStack`) ensures only the topmost dialog reacts to Escape. Dialogs with bespoke close semantics opt out via `closeOnEscape` / `closeOnBackdrop` — see `ObjectEditModal` (dirty-form interception) and `DbOverviewModal` (nested-confirm suppression).
```

In the "Key Components" table, add a row:

```markdown
| `Modal` | `ui/Modal.tsx` | Shared dialog shell: portal, backdrop, focus trap, stacking, a11y |
```

- [ ] **Step 4: Run the full gate**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(modals): drop useEscapeKey, document Modal shell"
```

---

## Verification

After the final task, confirm all of the following by hand in `npm run dev`:

- [ ] Every dialog opens at the same size and position as before the refactor
- [ ] Tab cycles within the open dialog and never reaches the page behind it
- [ ] Closing a dialog returns focus to the control that opened it
- [ ] Escape closes only the topmost dialog when dialogs are nested
- [ ] Inline Escape handlers (`EnumManagerModal` rename, `OptimizeModal` suggestions) close only their own popup
- [ ] `ObjectEditModal` intercepts all three close paths when dirty
- [ ] The `batchProgress` overlay still blocks interaction and still ignores Escape
- [ ] Portal-based dropdowns inside dialogs still render above the dialog panel

## Follow-ups (out of scope)

- `SettingsModal` at 1242 lines and `StateList` at 1542 lines are both over the size where edits get unreliable. Splitting them is worth its own plan.
- The `?` shortcut, the `HelpModal` shortcut list, and the actual key handlers in `Layout.tsx` are three sources of truth that can drift. Consolidating them belongs with the command palette plan.

# Cursor-Following Tooltip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tooltip always renders at the mouse cursor position (not anchored to the trigger element via Radix's Popper positioning) and always stays fully inside the viewport, never clipped off-screen.

**Architecture:** Replace the Radix-UI-based `Tooltip` (`src/components/ui/Tooltip.tsx`) with a small custom implementation: track `mousemove`/`mouseenter`/`mouseleave` on the trigger, show the tooltip after `delayDuration` at the last known cursor position (small offset so cursor doesn't cover the text), and clamp the rendered position against `window.innerWidth`/`innerHeight` in a `useLayoutEffect` after measuring the tooltip's own size — same clamp pattern already used in `src/components/ui/ContextMenu.tsx:24-31`. Content is rendered via `createPortal` into `document.body`, same as `ContextMenu`. Keyboard focus (a11y) still shows the tooltip, anchored to the trigger element's bounding rect instead of a cursor position, then clamped the same way.

**Tech Stack:** React 18, TypeScript, Vitest + Testing Library (existing patterns), no new dependencies. `@radix-ui/react-tooltip` is removed as a dependency of this file (it's not used anywhere else in `src`).

---

### Task 1: Rewrite `Tooltip.tsx` as a cursor-following, viewport-clamped tooltip

**Files:**
- Modify: `src/components/ui/Tooltip.tsx` (full rewrite)
- Modify: `src/components/ui/Tooltip.test.tsx` (keep existing 2 tests working, add clamp test)

- [ ] **Step 1: Write the new failing test for viewport clamping**

Append to `src/components/ui/Tooltip.test.tsx` (keep the existing two `it(...)` blocks as-is):

```tsx
  it('clamps tooltip position so it never renders outside the viewport', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip content="Edge tooltip">
          <button>EdgeTrigger</button>
        </Tooltip>
      </TooltipProvider>
    );

    const trigger = screen.getByText('EdgeTrigger');
    fireEvent.mouseEnter(trigger, { clientX: 5000, clientY: 5000 });
    fireEvent.mouseMove(trigger, { clientX: 5000, clientY: 5000 });

    await waitFor(() => expect(screen.queryByTestId('tooltip-content')).not.toBeNull(), {
      advanceTimers: vi.advanceTimersByTime,
    });

    const el = screen.getByTestId('tooltip-content') as HTMLElement;
    const left = parseFloat(el.style.left);
    const top = parseFloat(el.style.top);
    expect(left).toBeLessThanOrEqual(window.innerWidth - 8);
    expect(top).toBeLessThanOrEqual(window.innerHeight - 8);

    await user.unhover(trigger);
  });
```

Add `fireEvent` to the existing import line at the top of the file:

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
```

- [ ] **Step 2: Run tests to verify the new test fails**

Run: `npx vitest run src/components/ui/Tooltip.test.tsx`
Expected: FAIL — `tooltip-content` testid doesn't exist yet (old Radix markup has no such testid, and the old implementation doesn't track cursor position at all).

- [ ] **Step 3: Rewrite the implementation**

Replace the full contents of `src/components/ui/Tooltip.tsx` with:

```tsx
import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TooltipContextValue {
  delayDuration: number;
}

const TooltipContext = createContext<TooltipContextValue>({ delayDuration: 700 });

export interface TooltipProviderProps {
  delayDuration?: number;
  disableHoverableContent?: boolean;
  children: React.ReactNode;
}

export function TooltipProvider({ delayDuration = 700, children }: TooltipProviderProps) {
  return <TooltipContext.Provider value={{ delayDuration }}>{children}</TooltipContext.Provider>;
}

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
}

const CURSOR_OFFSET_X = 14;
const CURSOR_OFFSET_Y = 18;
const VIEWPORT_MARGIN = 8;

export function Tooltip({ content, children, className }: TooltipProps) {
  const { delayDuration } = useContext(TooltipContext);
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  useLayoutEffect(() => {
    if (!visible || !anchor || !contentRef.current) return;
    const { width, height } = contentRef.current.getBoundingClientRect();
    let x = anchor.x + CURSOR_OFFSET_X;
    let y = anchor.y + CURSOR_OFFSET_Y;
    if (x + width + VIEWPORT_MARGIN > window.innerWidth) x = anchor.x - width - CURSOR_OFFSET_X;
    if (y + height + VIEWPORT_MARGIN > window.innerHeight) y = anchor.y - height - CURSOR_OFFSET_Y;
    x = Math.max(VIEWPORT_MARGIN, Math.min(x, window.innerWidth - width - VIEWPORT_MARGIN));
    y = Math.max(VIEWPORT_MARGIN, Math.min(y, window.innerHeight - height - VIEWPORT_MARGIN));
    setPos({ x, y });
  }, [visible, anchor]);

  if (content === undefined || content === null || content === '') {
    return children;
  }

  function scheduleShow(x: number, y: number) {
    setAnchor({ x, y });
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(true), delayDuration);
  }

  function hide() {
    clearTimeout(timeoutRef.current);
    setVisible(false);
    setPos(null);
  }

  const child = React.cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      children.props.onMouseEnter?.(e);
      scheduleShow(e.clientX, e.clientY);
    },
    onMouseMove: (e: React.MouseEvent) => {
      children.props.onMouseMove?.(e);
      setAnchor({ x: e.clientX, y: e.clientY });
    },
    onMouseLeave: (e: React.MouseEvent) => {
      children.props.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      children.props.onFocus?.(e);
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      scheduleShow(rect.left, rect.bottom);
    },
    onBlur: (e: React.FocusEvent) => {
      children.props.onBlur?.(e);
      hide();
    },
  });

  return (
    <>
      {child}
      {visible &&
        anchor &&
        createPortal(
          <div
            ref={contentRef}
            data-testid="tooltip-content"
            style={{
              position: 'fixed',
              top: pos?.y ?? anchor.y,
              left: pos?.x ?? anchor.x,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className={
              className ??
              'z-[9999] px-2.5 py-1.5 rounded shadow-lg border text-xs font-mono bg-gray-900 border-gray-600 text-gray-100 dark:bg-gray-950 dark:border-gray-700 pointer-events-none'
            }
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
}
```

Notes:
- `side`/`align` props are kept in `TooltipProps` (still typed as accepted) for call-site compatibility (75 call sites, only `StateRow.tsx:185` passes them), but are no longer used — position is always cursor-anchored now. Do not remove the props from the type; just don't destructure/use them, otherwise the one call site with `side="right" align="start"` needs no change.
- `pointer-events-none` on the tooltip div is important: without it, fast cursor movement toward the tooltip's own rendered area could trigger spurious `mouseleave`/`mouseenter` flicker on the trigger.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/ui/Tooltip.test.tsx`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Run full test suite and typecheck**

Run: `npm test`
Expected: PASS (no regressions in `StateRow.test.tsx` or elsewhere that renders `Tooltip`)

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Remove now-unused Radix tooltip dependency**

Check nothing else imports it:

Run: `grep -rn "@radix-ui/react-tooltip" src package.json`
Expected: only `package.json` (and `package-lock.json`) reference remain

Remove `@radix-ui/react-tooltip` from `package.json` `dependencies`, then:

Run: `npm install`
Expected: lockfile updates, no errors

- [ ] **Step 7: Manual verification in the running app**

Run: `npm run dev`

In the browser: hover over several tooltip triggers across the app (e.g. a row's ID cell in `StateList`, an editable cell's pencil icon, the copy-ID button) near the edges of the browser window (top edge, right edge, bottom edge) and confirm:
1. Tooltip appears near the mouse cursor and follows subsequent cursor movement while hovering.
2. Tooltip never renders clipped/off-screen at any edge — it flips to the opposite side of the cursor when it would overflow.
3. Tab-focusing a trigger (keyboard) still shows a tooltip anchored near the element.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/Tooltip.tsx src/components/ui/Tooltip.test.tsx package.json package-lock.json
git commit -m "feat(tooltip): follow cursor and clamp to viewport bounds"
```

---

## Verification Summary

- Automated: `npx vitest run src/components/ui/Tooltip.test.tsx`, `npm test`, `npx tsc --noEmit`.
- Manual: `npm run dev`, hover tooltip triggers near all four viewport edges, confirm cursor-following + no clipping, confirm keyboard focus still shows a tooltip.
</content>

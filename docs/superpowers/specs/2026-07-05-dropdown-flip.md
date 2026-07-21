# Dropdown auto-flip when near viewport bottom (Role/Function/Room cells)

## Context

`EditableRoleCell`, `EditableFunctionCell`, `EditableRoomCell` open a portal-positioned dropdown at `top: cellRect.bottom + 2, left: cellRect.left` (fixed position), computed once from the cell's `getBoundingClientRect()` when editing opens. There is no viewport-bottom check, so a row near the bottom of the table renders its dropdown partly/fully off-screen.

`src/components/ui/ContextMenu.tsx:20-31` already solves the same class of problem for right-click menus: it renders hidden first, measures its own actual size via `ref.current.getBoundingClientRect()` in a `useLayoutEffect`, then flips `x`/`y` if the menu would overflow `window.innerWidth`/`innerHeight`. Reuse this exact two-pass pattern (render → measure own height → reposition) instead of inventing a new one.

## Approach

Add one shared hook, since positioning logic is duplicated verbatim across the three cells:

**`src/hooks/useDropdownPosition.ts`**
```ts
export function useDropdownPosition(cellRect: DOMRect | null, dropdownRef: RefObject<HTMLElement>) {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!cellRect || !dropdownRef.current) { setStyle(null); return; }
    const { height } = dropdownRef.current.getBoundingClientRect();
    const overflowsBottom = cellRect.bottom + 2 + height > window.innerHeight;
    setStyle({
      position: 'fixed',
      top: overflowsBottom ? Math.max(0, cellRect.top - height - 2) : cellRect.bottom + 2,
      left: cellRect.left,
      zIndex: 9999,
    });
  }, [cellRect]);

  return style;
}
```
- Mirrors `ContextMenu`'s hidden-until-measured approach: dropdown renders with `visibility: hidden` until `style` is computed, then becomes visible — avoids a visible jump.
- Caller merges in cell-specific extras (`minWidth`) on top of the returned style.

## Files to change

- **`src/hooks/useDropdownPosition.ts`** (new) — shared hook above.
- **`src/components/cells/EditableRoleCell.tsx`** — replace inline `style={{ position: 'fixed', top: cellRect.bottom + 2, ... }}` (line ~70) with hook usage; attach dropdown ref; keep `minWidth: Math.max(180, cellRect.width)`.
- **`src/components/cells/EditableFunctionCell.tsx`** — same replacement (line ~63), `minWidth: 160`.
- **`src/components/cells/EditableRoomCell.tsx`** — same replacement (line ~63), `minWidth: 160`.

Each cell needs a `dropdownRef` (new `useRef<HTMLDivElement>(null)`) attached to the dropdown container, passed to the hook alongside existing `cellRect` state. No changes to `cellRect` capture logic (`openEdit()` / forceEdit effect) — only the render-time style computation changes.

## Verification

- `npm run dev`, open the datapoint table, scroll so a row is near the bottom of the viewport, open Role/Function/Room dropdown on that row → dropdown must render fully above the cell (flipped), not clipped by the viewport.
- Open the same dropdowns on a row near the top → must still render below the cell as before (no regression).
- `npx tsc --noEmit` to confirm types.

import { useState, useRef } from 'react';
import type { SortKey } from '../components/statelist/StateListColumns';
import { ALL_COLUMNS } from '../components/statelist/StateListColumns';
import { DEL_COL_WIDTH } from '../components/statelist/StateListConstants';

const MIN_COL_WIDTHS: Partial<Record<SortKey, number>> = { id: 150, name: 120 };
export function minColWidth(key: SortKey) { return MIN_COL_WIDTHS[key] ?? 40; }
export const LS_WIDTHS_KEY = 'iobroker-col-widths';

export function clampColWidthsWith(
  widths: Record<SortKey, number>,
  effectiveMin: Partial<Record<SortKey, number>>,
  effectiveMax: Partial<Record<SortKey, number>>,
): Record<SortKey, number> {
  const result = { ...widths };
  for (const k of Object.keys(result) as SortKey[]) {
    const mn = effectiveMin[k] ?? minColWidth(k);
    const mx = effectiveMax[k] ?? Infinity;
    result[k] = Math.min(mx, Math.max(mn, result[k]));
  }
  return result;
}

export function loadColWidths(
  effectiveDefaults: Record<SortKey, number>,
  effectiveMin: Partial<Record<SortKey, number>>,
  effectiveMax: Partial<Record<SortKey, number>>,
): Record<SortKey, number> {
  try {
    const raw = localStorage.getItem(LS_WIDTHS_KEY);
    if (raw) {
      const parsedWidths: unknown = JSON.parse(raw);
      if (typeof parsedWidths === 'object' && parsedWidths !== null && !Array.isArray(parsedWidths)) {
        const validated = Object.fromEntries(
          Object.entries(parsedWidths as Record<string, unknown>)
            .filter(([k, v]) => ALL_COLUMNS.some((c) => c.key === k) && typeof v === 'number')
            .map(([k, v]) => [k, v as number])
        ) as Partial<Record<SortKey, number>>;
        // Only enforce min on load — max is a drag-time UX limit, not a hard constraint.
        // Explicitly auto-fitted widths (handleAutoFit) may exceed the design max and must survive reload.
        return clampColWidthsWith({ ...effectiveDefaults, ...validated }, effectiveMin, {});
      }
    }
  } catch { /* ignore */ }
  return clampColWidthsWith({ ...effectiveDefaults }, effectiveMin, effectiveMax);
}

interface UseColumnResizeParams {
  effectiveDefaults: Record<SortKey, number>;
  effectiveMin: Partial<Record<SortKey, number>>;
  effectiveMax: Partial<Record<SortKey, number>>;
  visibleCols: SortKey[];
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function useColumnResize({
  effectiveDefaults,
  effectiveMin,
  effectiveMax,
  visibleCols,
  containerRef,
}: UseColumnResizeParams) {
  const [colWidths, setColWidths] = useState<Record<SortKey, number>>(
    () => loadColWidths(effectiveDefaults, effectiveMin, effectiveMax)
  );
  const saveWidthsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effectiveMinRef = useRef(effectiveMin);
  effectiveMinRef.current = effectiveMin;
  const effectiveMaxRef = useRef(effectiveMax);
  effectiveMaxRef.current = effectiveMax;

  function handleResizeStart(e: React.MouseEvent, key: SortKey) {
    const startX = e.clientX;
    const startWidth = colWidths[key];
    let latestWidths: Record<SortKey, number> = colWidths;
    let rafId: number | null = null;
    let pendingWidth = startWidth;

    function clampWidth(w: number) {
      const mn = effectiveMinRef.current[key] ?? minColWidth(key);
      return Math.min(effectiveMaxRef.current[key] ?? Infinity, Math.max(mn, w));
    }

    function onMouseMove(ev: MouseEvent) {
      pendingWidth = clampWidth(startWidth + ev.clientX - startX);
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const w = pendingWidth;
        setColWidths((prev) => {
          latestWidths = { ...prev, [key]: w };
          return latestWidths;
        });
        if (saveWidthsTimerRef.current !== null) clearTimeout(saveWidthsTimerRef.current);
        saveWidthsTimerRef.current = setTimeout(() => {
          localStorage.setItem(LS_WIDTHS_KEY, JSON.stringify(latestWidths));
          saveWidthsTimerRef.current = null;
        }, 500);
      });
    }

    function onMouseUp(ev: MouseEvent) {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (saveWidthsTimerRef.current !== null) {
        clearTimeout(saveWidthsTimerRef.current);
        saveWidthsTimerRef.current = null;
      }
      const newWidth = clampWidth(startWidth + ev.clientX - startX);
      const finalWidths = { ...latestWidths, [key]: newWidth };
      setColWidths(finalWidths);
      localStorage.setItem(LS_WIDTHS_KEY, JSON.stringify(finalWidths));
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function handleAutoFit(key: SortKey) {
    if (!containerRef.current) return;
    const cells = containerRef.current.querySelectorAll<HTMLElement>(`[data-col="${key}"]`);
    let maxWidth = 0;
    cells.forEach((cell) => {
      const inner = cell.firstElementChild as HTMLElement | null;
      maxWidth = Math.max(maxWidth, inner ? inner.scrollWidth : cell.scrollWidth);
    });
    if (maxWidth === 0) return;
    const newWidth = Math.max(40, maxWidth + 24);
    setColWidths((prev) => {
      const next = { ...prev, [key]: newWidth };
      localStorage.setItem(LS_WIDTHS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function fitToContainer() {
    const containerWidth = containerRef.current?.clientWidth;
    if (!containerWidth) return;
    const ICON_COLS: SortKey[] = ['checkbox', 'write', 'history', 'custom', 'smart', 'alias', 'scripts'];
    const show = (k: SortKey) => visibleCols.includes(k);
    const scalable = visibleCols.filter((k) => !ICON_COLS.includes(k));
    const iconWidth = ICON_COLS.filter((k) => show(k)).reduce((s, k) => s + colWidths[k], 0);
    const available = containerWidth - iconWidth - DEL_COL_WIDTH;
    const next = { ...colWidths };

    const capped = new Set<SortKey>();
    let remaining = available;
    let prevSize = -1;
    while (capped.size !== prevSize) {
      prevSize = capped.size;
      const free = scalable.filter((k) => !capped.has(k));
      const freeTotal = free.reduce((sum, k) => sum + colWidths[k], 0);
      if (freeTotal === 0) break;
      const scale = remaining / freeTotal;
      for (const k of free) {
        const max = effectiveMax[k] ?? Infinity;
        if (max !== Infinity && colWidths[k] * scale >= max) {
          next[k] = max;
          capped.add(k);
        }
      }
      remaining = available - scalable.filter((k) => capped.has(k)).reduce((sum, k) => sum + next[k], 0);
    }

    const free = scalable.filter((k) => !capped.has(k));
    if (free.length > 0) {
      const freeTotal = free.reduce((sum, k) => sum + colWidths[k], 0);
      const scale = freeTotal > 0 ? remaining / freeTotal : 0;
      let allocated = 0;
      for (let i = 0; i < free.length; i++) {
        const k = free[i];
        if (i === free.length - 1) {
          next[k] = Math.max(effectiveMinRef.current[k] ?? minColWidth(k), remaining - allocated);
        } else {
          const w = Math.max(effectiveMinRef.current[k] ?? minColWidth(k), Math.floor(colWidths[k] * scale));
          next[k] = w;
          allocated += w;
        }
      }
    }

    for (const k of ICON_COLS) {
      next[k] = effectiveDefaults[k];
    }
    setColWidths(next);
    localStorage.setItem(LS_WIDTHS_KEY, JSON.stringify(next));
  }

  return { colWidths, setColWidths, handleResizeStart, handleAutoFit, fitToContainer };
}

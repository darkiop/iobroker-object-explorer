# Command Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Ctrl+K command palette that reaches every dialog, toolbar action, and view toggle, jumps to any datapoint by ID, and applies search tokens — dispatching to whichever panel has focus.

**Architecture:** A `CommandContext` holds a registry that components populate via `useRegisterCommands`, tagging each command with the panel that owns it. `StateList` reports focus changes, so the palette dispatches panel-scoped commands to the focused panel and global commands unconditionally. The palette is a single input over three result sections — commands, datapoint IDs, and search tokens — sharing one pure matcher. It renders in the `Modal` shell from the modal-shell plan at `layer="top"`.

**Tech Stack:** React 18, TypeScript (strict), Tailwind CSS, Vitest + @testing-library/react + jsdom, lucide-react icons.

---

## Dependencies

**Requires `docs/superpowers/specs/2026-07-21-modal-shell.md` to be complete.** This plan uses `<Modal layer="top">` from that work. If the shell is not merged, Task 7 has no shell to render into.

## Prerequisites

Read before starting:
- `src/components/SearchBar.tsx` — holds `COMMANDS` and `buildSuggestions`, both of which move in Task 1
- `src/components/SearchBar.buildSuggestions.test.ts` — existing tests that must keep passing across that move
- `src/context/PanelContext.tsx` — the per-panel surface, extended in Task 2
- `src/context/FilterContext.tsx:143` — `handleSearch(newPattern)`, the panel-1 implementation
- `src/App.tsx:172-207` and `:475-490` — the parallel `p2*` state and panel-2 handlers
- `src/components/Layout.tsx:136-156` — where global shortcuts are bound
- `src/components/modals/HelpModal.tsx:25` — the `SHORTCUTS` list

## Architectural constraints discovered

**The two panels are not symmetric.** Panel 1's filter state lives in `FilterContext`; panel 2's lives in `App.tsx` as `p2Pattern`, `p2ColFilters`, `p2TreeFilter`, and friends, with its own handlers at `App.tsx:475-490`. `PanelContext` is the only interface both panels implement — so every panel-scoped command must route through `PanelContext`, never `FilterContext`. `PanelContext` currently exposes `pattern` read-only with no setter, which is why Task 2 exists.

**Modal state is per-`StateList`.** Each `StateList` instance owns a `useStateListModals` hook, so "open Import" means "open panel N's Import". This is why commands carry a `panelId` rather than being a flat global list.

## File Structure

**Create:**
- `src/utils/searchTokens.ts` — `COMMANDS`, `buildSuggestions`, moved out of `SearchBar`
- `src/utils/commandMatch.ts` — pure subsequence matcher and scorer
- `src/utils/commandMatch.test.ts`
- `src/context/CommandContext.tsx` — registry, focused panel, dispatch
- `src/context/CommandContext.test.tsx`
- `src/components/ui/CommandPalette.tsx` — the palette UI
- `src/components/ui/CommandPalette.test.tsx`
- `src/hooks/useRegisterCommands.ts` — registration hook with stable identity

**Modify:**
- `src/components/SearchBar.tsx` — import tokens from the new util
- `src/components/SearchBar.buildSuggestions.test.ts` — update the import path
- `src/context/PanelContext.tsx` — add `panelId` and `handleSearch`
- `src/App.tsx` — supply the two new `PanelContext` fields, mount `CommandProvider` and `CommandPalette`
- `src/components/statelist/StateList.tsx` — report focus, register panel commands
- `src/components/Layout.tsx` — bind Ctrl+K
- `src/components/modals/HelpModal.tsx` — add Ctrl+K to `SHORTCUTS`
- `CLAUDE.md` — document the registry

---

## Task 1: Extract the search token vocabulary

The palette and `SearchBar` must not own two copies of the token list. Move it to a util first, with the existing tests as the safety net.

**Files:**
- Create: `src/utils/searchTokens.ts`
- Modify: `src/components/SearchBar.tsx:8`, `:39-56`, `:67-140`
- Modify: `src/components/SearchBar.buildSuggestions.test.ts`

- [ ] **Step 1: Confirm the existing tests pass before touching anything**

Run: `npx vitest run src/components/SearchBar.buildSuggestions.test.ts`
Expected: PASS. Note the count — it must be identical at the end of this task.

- [ ] **Step 2: Create the util**

Create `src/utils/searchTokens.ts` and move these declarations out of `SearchBar.tsx` verbatim, adding `export` to each: `OBJECT_TYPES` (line 8), `Suggestion` (lines 32–37), `CommandDef` and `COMMANDS` (lines 39–48), `ID_COLOR` (line 49), `cmdColor` (51–53), `cmdLabel` (54–56), `getTokenAtCursor` (58–65), and `buildSuggestions` (67 to its closing brace).

Also move the two constants `ID_SUGGEST_MIN_LEN` and `ID_SUGGEST_MAX` (lines 5–6), since `buildSuggestions` reads `ID_SUGGEST_MAX`.

Do not change any logic. This is a pure move.

- [ ] **Step 3: Re-point SearchBar at the util**

In `src/components/SearchBar.tsx`, delete the moved declarations and add:

```tsx
import {
  COMMANDS,
  OBJECT_TYPES,
  ID_SUGGEST_MIN_LEN,
  buildSuggestions,
  getTokenAtCursor,
  cmdColor,
  cmdLabel,
  type Suggestion,
} from '../utils/searchTokens';
```

Then remove any of those names from the import list that `SearchBar` does not actually reference — `noUnusedLocals` is on and will fail the build otherwise.

- [ ] **Step 4: Re-point the existing test**

In `src/components/SearchBar.buildSuggestions.test.ts`, change the import of `buildSuggestions` from `./SearchBar` to `../utils/searchTokens`.

- [ ] **Step 5: Verify nothing moved semantically**

Run: `npx vitest run src/components/SearchBar.buildSuggestions.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS with the same test count as Step 1, and no type or lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/searchTokens.ts src/components/SearchBar.tsx src/components/SearchBar.buildSuggestions.test.ts
git commit -m "refactor(search): extract token vocabulary to utils/searchTokens"
```

---

## Task 2: Make PanelContext symmetric

**Files:**
- Modify: `src/context/PanelContext.tsx:4-14`
- Modify: `src/App.tsx` (both `PanelContextProvider` value objects)

- [ ] **Step 1: Add the two fields to the interface**

In `src/context/PanelContext.tsx`, extend `PanelContextValue`:

```tsx
export interface PanelContextValue {
  /** Which panel this context belongs to. 1 is the primary panel. */
  panelId: 1 | 2;
  colFilters: Partial<Record<SortKey, string>>;
  handleColFilterChange: (filters: Partial<Record<SortKey, string>>) => void;
  pattern: string;
  /** Sets this panel's search pattern. Panel 1 delegates to FilterContext. */
  handleSearch: (pattern: string) => void;
  treeFilter: string | null;
  handleClearTreeFilter: () => void;
  sidebarToggleSeq: number;
  fulltextEnabled: boolean;
  handleTreeScope: (prefix: string) => void;
  resetAllFilters: () => void;
}
```

- [ ] **Step 2: Run the type check to find every call site**

Run: `npx tsc --noEmit`
Expected: FAIL, with errors on each `PanelContextProvider` value in `src/App.tsx` reporting the two missing properties. Those errors are the worklist for Step 3.

- [ ] **Step 3: Supply the fields in App.tsx**

For the panel-1 provider, add `panelId: 1` and `handleSearch` sourced from `FilterContext`'s existing `handleSearch`.

For the panel-2 provider, add `panelId: 2` and a new handler defined next to the other `p2*` handlers around `src/App.tsx:475`:

```tsx
const p2HandleSearch = useCallback((next: string) => {
  setP2PatternRaw(next);
  setP2Page(0);
}, []);
```

Resetting the page mirrors what panel 1's `handleSearch` does — a new pattern with a stale page offset shows an empty table.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/context/PanelContext.tsx src/App.tsx
git commit -m "feat(panels): add panelId and handleSearch to PanelContext"
```

---

## Task 3: The command matcher

**Files:**
- Create: `src/utils/commandMatch.ts`
- Test: `src/utils/commandMatch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/commandMatch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { matchScore, rankBy } from './commandMatch';

describe('matchScore', () => {
  it('returns a score for an exact match', () => {
    expect(matchScore('import', 'import')).toBeGreaterThan(0);
  });

  it('returns 0 when the query is not a subsequence', () => {
    expect(matchScore('import', 'xyz')).toBe(0);
  });

  it('matches a subsequence spread across the text', () => {
    expect(matchScore('Virtual Folders', 'vf')).toBeGreaterThan(0);
  });

  it('is case insensitive', () => {
    expect(matchScore('Import', 'IMPORT')).toBeGreaterThan(0);
  });

  it('scores a prefix match above a mid-word match', () => {
    expect(matchScore('import', 'imp')).toBeGreaterThan(matchScore('reimport', 'imp'));
  });

  it('scores a word-boundary match above a mid-word match', () => {
    expect(matchScore('Alias Replace', 'ar')).toBeGreaterThan(matchScore('backward', 'ar'));
  });

  it('scores contiguous runs above scattered ones', () => {
    expect(matchScore('abcdef', 'abc')).toBeGreaterThan(matchScore('axbxcx', 'abc'));
  });

  it('treats an empty query as a neutral match', () => {
    expect(matchScore('anything', '')).toBeGreaterThan(0);
  });
});

describe('rankBy', () => {
  const items = [
    { id: 'import', label: 'Import datapoints' },
    { id: 'export', label: 'Export list' },
    { id: 'optimize', label: 'Optimize metadata' },
  ];

  it('returns every item for an empty query, order preserved', () => {
    expect(rankBy(items, '', (i) => i.label).map((i) => i.id))
      .toEqual(['import', 'export', 'optimize']);
  });

  it('drops non-matching items', () => {
    expect(rankBy(items, 'zzz', (i) => i.label)).toEqual([]);
  });

  it('sorts the best match first', () => {
    expect(rankBy(items, 'opt', (i) => i.label)[0].id).toBe('optimize');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/commandMatch.test.ts`
Expected: FAIL — `Failed to resolve import "./commandMatch"`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/commandMatch.ts`:

```ts
const SCORE_BASE = 1;
const SCORE_CONTIGUOUS = 8;
const SCORE_WORD_START = 12;
const SCORE_STRING_START = 16;

function isBoundary(text: string, i: number): boolean {
  if (i === 0) return true;
  const prev = text[i - 1];
  return prev === ' ' || prev === '.' || prev === '-' || prev === '_';
}

/**
 * Scores `query` as a subsequence of `text`. Returns 0 when it is not a
 * subsequence at all. Higher is better; scores are only comparable for the
 * same query.
 */
export function matchScore(text: string, query: string): number {
  if (query === '') return SCORE_BASE;

  const hay = text.toLowerCase();
  const needle = query.toLowerCase();

  let score = 0;
  let from = 0;
  let lastHit = -2;

  for (const ch of needle) {
    const hit = hay.indexOf(ch, from);
    if (hit === -1) return 0;

    let points = SCORE_BASE;
    if (hit === 0) points = SCORE_STRING_START;
    else if (isBoundary(hay, hit)) points = SCORE_WORD_START;
    else if (hit === lastHit + 1) points = SCORE_CONTIGUOUS;

    score += points;
    lastHit = hit;
    from = hit + 1;
  }

  return score;
}

/**
 * Filters out non-matches and sorts the rest best-first. Ties keep their
 * original relative order.
 */
export function rankBy<T>(items: T[], query: string, key: (item: T) => string): T[] {
  return items
    .map((item, index) => ({ item, index, score: matchScore(key(item), query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map((entry) => entry.item);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/commandMatch.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/commandMatch.ts src/utils/commandMatch.test.ts
git commit -m "feat(palette): add command match scoring"
```

---

## Task 4: The command registry

**Files:**
- Create: `src/context/CommandContext.tsx`
- Create: `src/hooks/useRegisterCommands.ts`
- Test: `src/context/CommandContext.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/context/CommandContext.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { CommandProvider, useCommands, type Command } from './CommandContext';
import { useRegisterCommands } from '../hooks/useRegisterCommands';

afterEach(cleanup);

function Registrar({ cmds }: { cmds: Command[] }) {
  useRegisterCommands(cmds);
  return null;
}

function Readout() {
  const { commands, focusedPanel } = useCommands();
  return <div data-testid="out">{commands.map((c) => c.id).join(',')}|{focusedPanel}</div>;
}

function cmd(id: string, panelId?: 1 | 2, run = () => {}): Command {
  return { id, titleEn: id, titleDe: id, group: 'data', panelId, run };
}

describe('CommandContext', () => {
  it('exposes registered commands', () => {
    render(
      <CommandProvider>
        <Registrar cmds={[cmd('import'), cmd('export')]} />
        <Readout />
      </CommandProvider>
    );
    expect(screen.getByTestId('out').textContent).toContain('import,export');
  });

  it('unregisters commands when the registrar unmounts', () => {
    const { rerender } = render(
      <CommandProvider>
        <Registrar cmds={[cmd('import')]} />
        <Readout />
      </CommandProvider>
    );
    expect(screen.getByTestId('out').textContent).toContain('import');
    rerender(<CommandProvider><Readout /></CommandProvider>);
    expect(screen.getByTestId('out').textContent).not.toContain('import');
  });

  it('defaults the focused panel to 1', () => {
    render(<CommandProvider><Readout /></CommandProvider>);
    expect(screen.getByTestId('out').textContent).toContain('|1');
  });

  it('runs a global command regardless of focused panel', () => {
    const run = vi.fn();
    function Dispatcher() {
      const { commands, dispatch } = useCommands();
      return <button onClick={() => dispatch(commands[0])}>go</button>;
    }
    render(
      <CommandProvider>
        <Registrar cmds={[cmd('settings', undefined, run)]} />
        <Dispatcher />
      </CommandProvider>
    );
    act(() => { screen.getByText('go').click(); });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runs only the focused panel copy of a panel-scoped command', () => {
    const runP1 = vi.fn();
    const runP2 = vi.fn();
    function Dispatcher() {
      const { commands, dispatch, setFocusedPanel } = useCommands();
      return (
        <>
          <button onClick={() => setFocusedPanel(2)}>focus2</button>
          <button onClick={() => dispatch(commands.find((c) => c.id === 'import')!)}>go</button>
        </>
      );
    }
    render(
      <CommandProvider>
        <Registrar cmds={[cmd('import', 1, runP1)]} />
        <Registrar cmds={[cmd('import', 2, runP2)]} />
        <Dispatcher />
      </CommandProvider>
    );
    act(() => { screen.getByText('focus2').click(); });
    act(() => { screen.getByText('go').click(); });
    expect(runP1).not.toHaveBeenCalled();
    expect(runP2).toHaveBeenCalledTimes(1);
  });

  it('deduplicates panel-scoped commands by id in the visible list', () => {
    render(
      <CommandProvider>
        <Registrar cmds={[cmd('import', 1)]} />
        <Registrar cmds={[cmd('import', 2)]} />
        <Readout />
      </CommandProvider>
    );
    const ids = screen.getByTestId('out').textContent!.split('|')[0].split(',');
    expect(ids.filter((i) => i === 'import')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/context/CommandContext.test.tsx`
Expected: FAIL — `Failed to resolve import "./CommandContext"`.

- [ ] **Step 3: Write the context**

Create `src/context/CommandContext.tsx`:

```tsx
import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';

export type CommandGroup = 'create' | 'data' | 'analyze' | 'view' | 'nav' | 'settings';

export interface Command {
  /** Stable identifier. Panel-scoped commands share one id across panels. */
  id: string;
  titleEn: string;
  titleDe: string;
  group: CommandGroup;
  icon?: LucideIcon;
  /** Extra terms the matcher should consider, beyond the title. */
  keywords?: string[];
  run: () => void;
  /** Omit for global commands. Set for commands that act on one panel. */
  panelId?: 1 | 2;
}

interface CommandContextValue {
  /** Deduplicated by id — one entry per command, whichever panel registered it. */
  commands: Command[];
  focusedPanel: 1 | 2;
  setFocusedPanel: (panel: 1 | 2) => void;
  /** Runs the focused panel's copy of a panel-scoped command. */
  dispatch: (command: Command) => void;
}

const CommandContext = createContext<CommandContextValue | null>(null);

export function useCommands(): CommandContextValue {
  const ctx = useContext(CommandContext);
  if (!ctx) throw new Error('useCommands must be used inside CommandProvider');
  return ctx;
}

/** Internal — used by useRegisterCommands only. */
export const CommandRegistryContext = createContext<{
  register: (key: string, cmds: Command[]) => void;
  unregister: (key: string) => void;
} | null>(null);

export function CommandProvider({ children }: { children: ReactNode }) {
  const [registry, setRegistry] = useState<Record<string, Command[]>>({});
  const [focusedPanel, setFocusedPanel] = useState<1 | 2>(1);
  const registryRef = useRef(registry);
  registryRef.current = registry;

  const register = useCallback((key: string, cmds: Command[]) => {
    setRegistry((prev) => ({ ...prev, [key]: cmds }));
  }, []);

  const unregister = useCallback((key: string) => {
    setRegistry((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const all = useMemo(() => Object.values(registry).flat(), [registry]);

  const commands = useMemo(() => {
    const seen = new Set<string>();
    return all.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }, [all]);

  const dispatch = useCallback((command: Command) => {
    if (command.panelId === undefined) {
      command.run();
      return;
    }
    const target = Object.values(registryRef.current)
      .flat()
      .find((c) => c.id === command.id && c.panelId === focusedPanel);
    (target ?? command).run();
  }, [focusedPanel]);

  const registryApi = useMemo(() => ({ register, unregister }), [register, unregister]);
  const value = useMemo(
    () => ({ commands, focusedPanel, setFocusedPanel, dispatch }),
    [commands, focusedPanel, dispatch]
  );

  return (
    <CommandRegistryContext.Provider value={registryApi}>
      <CommandContext.Provider value={value}>{children}</CommandContext.Provider>
    </CommandRegistryContext.Provider>
  );
}
```

- [ ] **Step 4: Write the registration hook**

Create `src/hooks/useRegisterCommands.ts`:

```ts
import { useContext, useEffect, useId, useRef } from 'react';
import { CommandRegistryContext, type Command } from '../context/CommandContext';

/**
 * Registers a set of commands for the lifetime of the calling component.
 * Callers may pass a fresh array each render — registration only re-runs when
 * the command ids or their panel changes, so unstable `run` closures are fine.
 */
export function useRegisterCommands(commands: Command[]) {
  const key = useId();
  const registry = useContext(CommandRegistryContext);
  const latest = useRef(commands);
  latest.current = commands;

  const signature = commands.map((c) => `${c.id}:${c.panelId ?? 'g'}`).join('|');

  useEffect(() => {
    if (!registry) return;
    registry.register(key, latest.current);
    return () => registry.unregister(key);
  }, [registry, key, signature]);
}
```

Note the deliberate design: `run` closures change identity every render, so keying the effect on the full array would re-register on every render and loop. Keying on `signature` means the registry holds the array captured at the last id-set change. Because `dispatch` looks commands up by id at call time and `latest.current` is refreshed every render, a stale `run` is never invoked — but if a command's behaviour must change without its id changing, the callee must read fresh state inside `run` rather than closing over it.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/context/CommandContext.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/context/CommandContext.tsx src/context/CommandContext.test.tsx src/hooks/useRegisterCommands.ts
git commit -m "feat(palette): add command registry with panel-scoped dispatch"
```

---

## Task 5: Track the focused panel

**Files:**
- Modify: `src/components/statelist/StateList.tsx`

- [ ] **Step 1: Report focus from StateList**

`StateList` already consumes `PanelContext`. Read `panelId` from it (added in Task 2) and report focus on any pointer or keyboard entry into the panel's root element. Add near the other hooks at the top of the component:

```tsx
const { panelId } = usePanelContext();
const { setFocusedPanel } = useCommands();
const markFocused = useCallback(() => setFocusedPanel(panelId), [setFocusedPanel, panelId]);
```

Attach to the component's outermost element:

```tsx
onMouseDownCapture={markFocused}
onFocusCapture={markFocused}
```

Use the capture variants so the handler fires even when an inner control stops propagation — several cells do.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/statelist/StateList.tsx
git commit -m "feat(palette): report focused panel from StateList"
```

---

## Task 6: Register the panel commands

**Files:**
- Modify: `src/components/statelist/StateList.tsx`

- [ ] **Step 1: Register the toolbar actions as commands**

`StateList` already holds every handler that `StateListToolbar` receives as a prop, so registration belongs here rather than in the toolbar — the toolbar is presentational and the palette must work whether or not the toolbar is rendered.

Add, after the handlers are defined:

```tsx
useRegisterCommands(useMemo<Command[]>(() => [
  { id: 'new-datapoint', titleEn: 'New datapoint', titleDe: 'Neuer Datenpunkt', group: 'create', icon: Plus, panelId, run: () => setNewDatapointOpen(true) },
  { id: 'new-alias', titleEn: 'New alias', titleDe: 'Neuer Alias', group: 'create', icon: Link2, panelId, run: () => setNewAliasOpen(true) },
  { id: 'export-csv', titleEn: 'Export as CSV', titleDe: 'Als CSV exportieren', group: 'data', icon: Download, panelId, run: handleExportCsv },
  { id: 'export-json', titleEn: 'Export as JSON', titleDe: 'Als JSON exportieren', group: 'data', icon: Download, panelId, run: handleExportJson },
  { id: 'import', titleEn: 'Import datapoints', titleDe: 'Datenpunkte importieren', group: 'data', icon: Upload, panelId, run: () => setImportOpen(true) },
  { id: 'enums', titleEn: 'Manage enums', titleDe: 'Enums verwalten', group: 'data', icon: Tag, keywords: ['rooms', 'functions', 'räume', 'funktionen'], panelId, run: handleEnums },
  { id: 'stats', titleEn: 'Namespace statistics', titleDe: 'Namespace-Statistik', group: 'analyze', icon: BarChart2, panelId, run: handleStats },
  { id: 'optimize', titleEn: 'Analyze metadata quality', titleDe: 'Metadaten-Qualität analysieren', group: 'analyze', icon: Wand2, panelId, run: () => setOptimizeOpen(true) },
  { id: 'virtual-folders', titleEn: 'Find virtual folders', titleDe: 'Virtuelle Ordner finden', group: 'analyze', icon: FolderX, panelId, run: () => setVirtualFoldersOpen(true) },
  { id: 'db-overview', titleEn: 'Database overview', titleDe: 'Datenbank-Übersicht', group: 'analyze', icon: Database, panelId, run: () => setDbOverviewOpen(true) },
  { id: 'script-index', titleEn: 'Refresh script index', titleDe: 'Skript-Index aktualisieren', group: 'analyze', icon: RotateCcw, panelId, run: handleScriptRefresh },
  { id: 'toggle-group', titleEn: 'Toggle grouped view', titleDe: 'Gruppierte Ansicht umschalten', group: 'view', icon: FolderOpen, panelId, run: handleToggleGroupByPath },
  { id: 'toggle-desc', titleEn: 'Toggle description column', titleDe: 'Beschreibungsspalte umschalten', group: 'view', icon: AlignLeft, panelId, run: handleToggleShowDesc },
  { id: 'toggle-alias-rows', titleEn: 'Toggle alias sub-rows', titleDe: 'Alias-Unterzeilen umschalten', group: 'view', icon: EyeOff, panelId, run: handleToggleHideAliasSubRows },
  { id: 'fit-columns', titleEn: 'Stretch columns to fit', titleDe: 'Spalten auf 100% strecken', group: 'view', icon: Maximize2, panelId, run: handleFitToContainer },
  { id: 'reset-filters', titleEn: 'Reset all filters', titleDe: 'Alle Filter zurücksetzen', group: 'view', icon: X, panelId, run: resetAllFilters },
], [panelId, handleExportCsv, handleExportJson, handleEnums, handleStats, handleScriptRefresh, handleToggleGroupByPath, handleToggleShowDesc, handleToggleHideAliasSubRows, handleFitToContainer, resetAllFilters, setNewDatapointOpen, setNewAliasOpen, setImportOpen, setOptimizeOpen, setVirtualFoldersOpen, setDbOverviewOpen]));
```

Before writing this, confirm each handler name against the props `StateList` currently passes to `StateListToolbar` at its render site — the toolbar prop names in `StateListToolbar.tsx:33-59` (`onExportCsv`, `onEnums`, `onStats`, and so on) tell you what each local handler is called. Where a name differs, use the local name, not the prop name.

Commands deliberately omitted, with reasons: `alias-replace` and `auto-alias` both require a selection or a path to act on and are meaningless from a palette with no argument; `delete-selected` is destructive and should not be one fuzzy match away from Enter; `reset-localstorage` is destructive for the same reason and moves into Settings as a follow-up.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/statelist/StateList.tsx
git commit -m "feat(palette): register StateList actions as commands"
```

---

## Task 7: The palette UI

**Files:**
- Create: `src/components/ui/CommandPalette.tsx`
- Test: `src/components/ui/CommandPalette.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/CommandPalette.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommandPalette from './CommandPalette';
import { CommandProvider, type Command } from '../../context/CommandContext';
import { useRegisterCommands } from '../../hooks/useRegisterCommands';
import { __resetModalStack } from '../../hooks/useModalStack';

afterEach(() => { cleanup(); __resetModalStack(); });

function cmd(id: string, titleEn: string, run = () => {}): Command {
  return { id, titleEn, titleDe: titleEn, group: 'data', run };
}

function Harness({ cmds, onClose, ids = [] }: { cmds: Command[]; onClose?: () => void; ids?: string[] }) {
  function Reg() { useRegisterCommands(cmds); return null; }
  return (
    <CommandProvider>
      <Reg />
      <CommandPalette
        onClose={onClose ?? (() => {})}
        language="en"
        allObjectIds={ids}
        onNavigateTo={() => {}}
        onApplyPattern={() => {}}
        roomNames={[]}
        functionNames={[]}
        roleNames={[]}
      />
    </CommandProvider>
  );
}

describe('CommandPalette', () => {
  it('lists all commands when the query is empty', () => {
    render(<Harness cmds={[cmd('a', 'Import'), cmd('b', 'Export')]} />);
    expect(screen.getByText('Import')).toBeTruthy();
    expect(screen.getByText('Export')).toBeTruthy();
  });

  it('filters commands as the user types', async () => {
    const user = userEvent.setup();
    render(<Harness cmds={[cmd('a', 'Import'), cmd('b', 'Export')]} />);
    await user.keyboard('imp');
    expect(screen.getByText('Import')).toBeTruthy();
    expect(screen.queryByText('Export')).toBeNull();
  });

  it('runs the highlighted command on Enter and closes', async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    const onClose = vi.fn();
    render(<Harness cmds={[cmd('a', 'Import', run)]} onClose={onClose} />);
    await user.keyboard('{Enter}');
    expect(run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves the highlight with ArrowDown', async () => {
    const user = userEvent.setup();
    const first = vi.fn();
    const second = vi.fn();
    render(<Harness cmds={[cmd('a', 'Alpha', first), cmd('b', 'Beta', second)]} />);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('shows matching datapoint ids in their own section', async () => {
    const user = userEvent.setup();
    render(<Harness cmds={[]} ids={['hm-rpc.0.ABC.TEMPERATURE']} />);
    await user.keyboard('temperature');
    expect(screen.getByText('hm-rpc.0.ABC.TEMPERATURE')).toBeTruthy();
  });

  it('offers a token action when the query looks like a search token', async () => {
    const user = userEvent.setup();
    render(<Harness cmds={[]} />);
    await user.keyboard('room:Kitchen');
    expect(screen.getByText(/room:Kitchen/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/ui/CommandPalette.test.tsx`
Expected: FAIL — `Failed to resolve import "./CommandPalette"`.

- [ ] **Step 3: Write the palette**

Create `src/components/ui/CommandPalette.tsx`:

```tsx
import { useMemo, useRef, useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import Modal from './Modal';
import { useCommands, type Command } from '../../context/CommandContext';
import { rankBy } from '../../utils/commandMatch';
import { COMMANDS as TOKEN_PREFIXES } from '../../utils/searchTokens';

const MAX_IDS = 8;

interface Props {
  onClose: () => void;
  language: 'en' | 'de';
  allObjectIds: string[];
  onNavigateTo: (id: string) => void;
  onApplyPattern: (pattern: string) => void;
  roomNames: string[];
  functionNames: string[];
  roleNames: string[];
}

type Row =
  | { kind: 'command'; command: Command }
  | { kind: 'id'; id: string }
  | { kind: 'token'; pattern: string };

export default function CommandPalette({
  onClose, language, allObjectIds, onNavigateTo, onApplyPattern,
}: Props) {
  const isEn = language === 'en';
  const { commands, dispatch } = useCommands();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setActive(0); }, [query]);

  const rows = useMemo<Row[]>(() => {
    const trimmed = query.trim();

    const isToken = TOKEN_PREFIXES.some((c) => trimmed.toLowerCase().startsWith(c.prefix))
      && trimmed.length > trimmed.indexOf(':') + 1;

    const cmdRows: Row[] = rankBy(
      commands,
      trimmed,
      (c) => [isEn ? c.titleEn : c.titleDe, ...(c.keywords ?? [])].join(' ')
    ).map((command) => ({ kind: 'command', command }));

    const idRows: Row[] = trimmed.length < 2 ? [] :
      rankBy(allObjectIds, trimmed, (id) => id)
        .slice(0, MAX_IDS)
        .map((id) => ({ kind: 'id', id }));

    const tokenRows: Row[] = isToken ? [{ kind: 'token', pattern: trimmed }] : [];

    return [...tokenRows, ...cmdRows, ...idRows];
  }, [query, commands, allObjectIds, isEn]);

  function activate(row: Row) {
    if (row.kind === 'command') dispatch(row.command);
    else if (row.kind === 'id') onNavigateTo(row.id);
    else onApplyPattern(row.pattern);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[active];
      if (row) activate(row);
    }
  }

  return (
    <Modal
      onClose={onClose}
      layer="top"
      panelClassName="w-full max-w-xl flex flex-col max-h-[60vh] self-start mt-[12vh]"
      titleId="command-palette-label"
    >
      <span id="command-palette-label" className="sr-only">
        {isEn ? 'Command palette' : 'Befehlspalette'}
      </span>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <Search size={16} className="text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={isEn ? 'Search commands, datapoints, filters…' : 'Befehle, Datenpunkte, Filter suchen…'}
          className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none"
        />
      </div>
      <div className="overflow-y-auto py-1">
        {rows.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-gray-400">
            {isEn ? 'No matches' : 'Keine Treffer'}
          </div>
        )}
        {rows.map((row, i) => {
          const key = row.kind === 'command' ? `c:${row.command.id}`
            : row.kind === 'id' ? `i:${row.id}` : `t:${row.pattern}`;
          const Icon = row.kind === 'command' ? row.command.icon : undefined;
          const label = row.kind === 'command' ? (isEn ? row.command.titleEn : row.command.titleDe)
            : row.kind === 'id' ? row.id
            : `${isEn ? 'Apply filter' : 'Filter anwenden'}: ${row.pattern}`;
          return (
            <button
              key={key}
              onMouseEnter={() => setActive(i)}
              onClick={() => activate(row)}
              className={`w-full flex items-center gap-2 px-4 py-1.5 text-left text-xs ${
                i === active
                  ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {Icon && <Icon size={14} className="shrink-0" />}
              <span className={row.kind === 'id' ? 'font-mono truncate' : 'truncate'}>{label}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
```

Note the `self-start mt-[12vh]` in `panelClassName`: the shell centres its panel, and a palette pinned near the top reads better than one floating mid-screen. This is why the shell takes free-form panel classes.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/ui/CommandPalette.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/CommandPalette.tsx src/components/ui/CommandPalette.test.tsx
git commit -m "feat(palette): add command palette UI"
```

---

## Task 8: Mount the palette and bind Ctrl+K

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx:136-156`
- Modify: `src/context/UIContext.tsx:253-256`, `:283-284`, `:369-370`

- [ ] **Step 1: Add palette open state to UIOverlayCtx**

`UIOverlayCtx` already carries `settingsOpen` and `shortcutsOpen`, so the palette belongs there rather than in a new context. Following the existing pattern exactly, add `paletteOpen: boolean` and `setPaletteOpen` to the interface at line 253, the `useState` at line 283, and the memo dependency list at line 369.

- [ ] **Step 2: Bind Ctrl+K in Layout**

In the keyboard effect at `src/components/Layout.tsx:136-156`, add a branch alongside the existing ones:

```tsx
if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
  e.preventDefault();
  onOpenPalette?.();
}
```

Note the effect returns early for `INPUT`, `TEXTAREA`, `SELECT`, and contenteditable targets at line 140. That early return is correct for `?` but wrong for Ctrl+K — the palette must open even from the search box. Move the Ctrl+K check **above** the early return, and add `onOpenPalette` to the props and the dependency array.

Wire `const onOpenPalette = () => setPaletteOpen(true);` next to the existing `onShowShortcuts` at line 51.

- [ ] **Step 3: Mount the provider and the palette in App**

Wrap the existing provider stack at `src/App.tsx:1135` with `<CommandProvider>`, placing it outside `FilterContextProvider` so both panels sit inside it.

Render the palette next to the other lazy modals around line 918:

```tsx
{paletteOpen && (
  <CommandPalette
    onClose={() => setPaletteOpen(false)}
    language={appSettings.language}
    allObjectIds={allObjectIdList}
    onNavigateTo={(id) => handleNavigateTo([id])}
    onApplyPattern={(p) => handleSearch(p)}
    roomNames={roomNames}
    functionNames={functionNames}
    roleNames={roleNames}
  />
)}
```

Use the same `lazy(() => import(...))` treatment as the sibling modals at lines 13–22, and check the actual local names for `allObjectIdList`, `roomNames`, `functionNames`, and `roleNames` — `SearchBar` is already passed equivalents, so mirror whatever it receives at its render site.

`onApplyPattern` and `onNavigateTo` intentionally target panel 1 here. Routing them to the focused panel requires reading `focusedPanel` from `useCommands()` and selecting between `handleSearch` and `p2HandleSearch` — do that only if the single-panel behaviour proves wrong in use.

- [ ] **Step 4: Add Ctrl+K to the shortcuts list**

In `src/components/modals/HelpModal.tsx`, add as the first entry of `SHORTCUTS` at line 25:

```tsx
{ keys: [isMac ? '⌘ K' : 'Ctrl K'], descEn: 'Open command palette', descDe: 'Befehlspalette öffnen' },
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: clean.

- [ ] **Step 6: Verify by hand**

Run `npm run dev` and confirm:
- Ctrl+K opens the palette from anywhere, including with the search box focused
- Typing `imp` highlights Import; Enter opens the Import dialog
- Arrow keys move the highlight; Escape closes without running anything
- Typing part of a datapoint ID lists matching IDs; Enter navigates to it
- Typing `room:Kitchen` offers the filter action and applies it on Enter
- In dual-pane mode, clicking panel 2 then running Import opens panel 2's Import dialog

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(palette): mount command palette on Ctrl+K"
```

---

## Task 9: Thin the toolbar

With the palette carrying discovery, the toolbar keeps only frequent actions.

**Files:**
- Modify: `src/components/statelist/StateListToolbar.tsx`

- [ ] **Step 1: Move the rare actions behind an overflow menu**

Keep as direct buttons: New, Export, Import, History, and the right-hand view toggles. Move Enums, Statistics, Script Index, Optimize, Virtual Folders, and Database into a single overflow button using the same dropdown markup as the existing New menu at lines 114–141 — that pattern already handles click-outside via `newMenuRef`, so mirror it with an `overflowMenuRef` and matching effect in `useStateListModals`.

Add a palette hint as the overflow menu's last row: `{isEn ? 'More… (Ctrl K)' : 'Mehr… (Strg K)'}`.

- [ ] **Step 2: Fix the duplicated icon**

`RotateCcw` currently means both "refresh script index" (line 191) and "reset settings" (line 352). Change the reset button to `Trash2`, matching the destructive styling it already carries.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. Then run `npm run dev` and confirm every moved action is still reachable from both the overflow menu and the palette.

- [ ] **Step 4: Commit**

```bash
git add src/components/statelist/StateListToolbar.tsx src/hooks/useStateListModals.ts
git commit -m "refactor(toolbar): move rare actions into overflow menu"
```

---

## Task 10: Document the registry

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the pattern**

Add to "Key Patterns":

```markdown
- **Command registry**: `src/context/CommandContext.tsx` holds every palette-reachable action. Components register via `useRegisterCommands`, tagging panel-scoped commands with `panelId`. `StateList` reports focus, so `dispatch` runs the focused panel's copy. Commands are deduplicated by `id` for display. Destructive actions (delete selected, reset localStorage) are deliberately excluded — a fuzzy match plus Enter is too short a path to data loss.
```

Add to "Key Components":

```markdown
| `CommandPalette` | `ui/CommandPalette.tsx` | Ctrl+K palette over commands, datapoint IDs, and search tokens |
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document command registry and palette"
```

---

## Verification

- [ ] Ctrl+K opens the palette from any focus location, including inputs
- [ ] Empty query lists every registered command
- [ ] Command, ID, and token sections all match and activate correctly
- [ ] Arrow keys and Enter work; Escape closes without side effects
- [ ] Focus returns to the previously focused element on close
- [ ] Panel-scoped commands hit the focused panel in dual-pane mode
- [ ] No destructive command is reachable from the palette
- [ ] `SearchBar` behaviour is unchanged after the Task 1 extraction

## Known limitations

- `onNavigateTo` and `onApplyPattern` target panel 1 regardless of focus (Task 8, Step 3). Panel-scoped routing is a small follow-up once the single-panel behaviour is judged in use.
- `useRegisterCommands` re-registers only when command ids change, so `run` must read live state rather than close over it. This is documented at the hook but is a real footgun worth revisiting if command behaviour starts depending on rapidly-changing state.
- The token section recognises a token prefix but does not autocomplete the value the way `SearchBar` does. Wiring `buildSuggestions` into the palette's token row is a natural follow-up now that it lives in a shared util.

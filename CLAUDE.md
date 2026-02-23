# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `npm run dev` (Vite HMR, port 5173)
- **Build:** `npm run build` (TypeScript check + Vite bundle)
- **Lint:** `npm run lint`
- **Type check only:** `npx tsc --noEmit`

No test framework is configured.

## Architecture

React + TypeScript dashboard for browsing ioBroker smart home objects and states via REST API. Dark/light theme, German language UI.

### Stack
React 18, TanStack React Query, Recharts, Tailwind CSS, Vite

### Data Flow
```
SearchBar (pattern input)
  → useFilteredObjects() / useAllObjects() → objects cached in-memory, filtered client-side
  → useStateValues(pageIds) → batched fetch, 30s polling
  → StateList (paginated table) + StateTree (hierarchical nav)
  → on select → StateDetail panel (5s polling)
  → ObjectEditModal (right-click → "Objekt bearbeiten")
  → HistoryChart (sql.0 adapter only)
```

### Layer Structure
- **`src/types/iobroker.ts`** — TypeScript interfaces: IoBrokerState, IoBrokerObject, IoBrokerObjectCommon, HistoryEntry, TreeNode
- **`src/api/iobroker.ts`** — REST API client. Objects cached globally. History via POST `/api/v1/command/sendTo` (sql.0). Alias reverse map, room/function enum helpers.
- **`src/hooks/useStates.ts`** — React Query hooks wrapping API functions with refetch intervals
- **`src/components/`** — UI components using Tailwind classes
- **`src/context/ThemeContext.tsx`** — Dark/light mode context

### API Proxy
Vite proxies `/api` to the ioBroker REST API (configured in `vite.config.ts`, default `http://10.4.0.20:8093`).

### Runtime Config (Docker)
At runtime `window.__CONFIG__.ioBrokerHost` overrides the proxy label in the header. A Docker entrypoint generates `/config.js` from env vars (`IOBROKER_HOST`). The file is loaded via `<script src="/config.js">` in `index.html`. TypeScript declaration in `src/vite-env.d.ts`.

### Key Patterns
- Objects are fetched once (`useAllObjects`, `staleTime: Infinity`) and filtered client-side
- State values fetched for current page (50 items), refreshed every 30s
- Selected state detail refreshes every 5s
- History data uses `staleTime: Infinity` (immutable once fetched); **sql.0 adapter only**
- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters`
- Portal-based dropdowns (EditableRoomCell, EditableRoleCell, EditableFunctionCell) positioned via `getBoundingClientRect()`
- Portal-based context menu (ContextMenu.tsx) with boundary detection

### ioBroker Concepts Used
- **Alias objects** (`alias.0.*`): `common.alias.id` points to source; `common.alias.read/write` are optional JS conversion formulas. Reverse map (`Map<targetId, aliasId[]>`) built from all objects for the alias column in the table.
- **Room enums** (`enum.rooms.*`): `common.members[]` lists member object IDs. Displayed and editable in the Raum column.
- **Function enums** (`enum.functions.*`): same structure as rooms, displayed in the Funktion column.

### Key Components
| Component | Description |
|---|---|
| `StateList` | Main paginated table with sortable/resizable columns, column picker, filters, right-click context menu |
| `StateDetail` | Detail panel opened on row click; tabs: Details, Objekt, Alias |
| `ObjectEditModal` | Modal opened via "Objekt bearbeiten" in context menu; tabs: Details, JSON, Alias; expert mode + delete |
| `StateTree` | Left sidebar hierarchical tree with context menu |
| `Layout` | App shell with collapsible sidebar (CSS width transition), dark mode toggle |
| `CreateAliasModal` | Creates `alias.0.*` object pointing to a source datapoint |
| `CopyDatapointModal` | Copies a datapoint with new ID (copies type, role, unit, read, write, min, max, desc, states) |
| `HistoryModal` | Full-screen history chart modal |
| `NewDatapointModal` | Creates a new datapoint |
| `ContextMenu` | Portal-based right-click menu used in both StateList and StateTree |

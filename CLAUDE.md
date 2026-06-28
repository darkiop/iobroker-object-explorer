# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `npm run dev` (Vite HMR, port 5173)
- **Build:** `npm run build` (TypeScript check + Vite bundle)
- **Lint:** `npm run lint`
- **Type check only:** `npx tsc --noEmit`
- **Test:** `npm test` (Vitest, run once)
- **Test watch:** `npm run test:watch`
- **Test UI:** `npm run test:ui`

Test framework: **Vitest** + `@testing-library/react` + jsdom.
Test files live next to the code they test (`*.test.ts` / `*.test.tsx`).

## API Reference

Full ioBroker REST API + Socket.io protocol documentation → **[API.md](API.md)**
Covers: used endpoints, unused endpoints with potential (FE-041, FE-047, etc.), subscription mechanism, auth, socket.io event protocol, connection flow, fallback behavior.

## Architecture

React + TypeScript dashboard for browsing ioBroker smart home objects and states via REST API. Dark/light theme, EN/DE language toggle.

### Stack
React 18, TanStack React Query v5, @tanstack/react-virtual, Recharts, Tailwind CSS, Vite, Vitest

### Data Flow
```
SearchBar (pattern input)
  → useFilteredObjects() / useAllObjects() → objects cached in-memory, filtered client-side
  → useStateValues(pageIds) → batched fetch, 30s polling
  → StateList (paginated table) + StateTree (hierarchical nav)
  → on row click / right-click → ObjectEditModal (Details / JSON / Alias / Custom / Scripts tabs)
  → History icon / menu entry → HistoryModal → HistoryChart (sql.0 adapter only)
```

### Layer Structure
- **`src/types/iobroker.ts`** — TypeScript interfaces: IoBrokerState, IoBrokerObject, IoBrokerObjectCommon, HistoryEntry, TreeNode
- **`src/api/iobroker.ts`** — REST API client. Objects cached globally. History via POST `/api/v1/command/sendTo` (sql.0). Alias reverse map, room/function enum helpers.
- **`src/hooks/useStates.ts`** — Re-export barrel for mutation hooks only (`useObjectMutations`, `useEnumMutations`); query hooks live in `useObjectQueries.ts`
- **`src/hooks/useObjectQueries.ts`** — React Query hooks (objects, states, history, room/function enums, CRUD)
- **`src/hooks/useObjectMutations.ts`** — Mutation hooks for object CRUD (create, update, delete, rename, move)
- **`src/hooks/useEnumMutations.ts`** — Mutation hooks for enum membership (room/function add/remove)
- **`src/hooks/useStateListModals.ts`** — State and handlers for all modals opened from StateList/StateTree
- **`src/hooks/useStateListView.ts`** — Sorting, filtering, grouping, pagination logic extracted from StateList
- **`src/hooks/useTreeState.ts`** — Tree expand/collapse state and logic for StateTree
- **`src/hooks/queryKeys.ts`** — Centralized React Query key factory
- **`src/components/`** — UI components using Tailwind classes (organized in subdirectories)
- **`src/context/ThemeContext.tsx`** — Dark/light/obsidian mode context
- **`src/context/UIContext.tsx`** — AppSettings, expertMode, script index state; split into `AppSettingsCtx` (stable, settings+scripts) and `UIOverlayCtx` (volatile, modal open/close) for render performance
- **`src/context/FilterContext.tsx`** — Search pattern, filters, pagination, saved filters, filter history
- **`src/context/PanelContext.tsx`** — Per-panel context for dual-pane mode (colFilters, pattern, treeFilter, fulltextEnabled)
- **`src/context/SelectionContext.tsx`** — Selected ID, open modal tracking
- **`src/utils/`** — Pure utility functions (format, i18n, clipboard, coloredId, filterObjectIds, roleColor, typeColor, validation)

### Realtime Transport (Long-Polling / Socket.io)
- **`src/hooks/useLongPolling.ts`** — fallback transport. Polls REST `/states/subscribe` per namespace pattern (`derivePatterns()`). Activates automatically when socket.io unreachable.
- **`src/hooks/useSocketIO.ts`** — default transport. `socket.io-client@2` (adapter runs v2.x server — v3/v4 incompatible), port `8084`. Diff-based resubscribe on filter change. Auto-fallback to long polling on `connect_error`. Live-patches React Query caches on push events — no polling roundtrip. Both hooks share `{ supported: boolean | null, connected: boolean }` shape; selection logic in `App.tsx`.
- Status shown in `HostConnectedButton`. ⚠️ **No auth support** — trusted networks only.
- → Protocol details, event names, connection flow, cache update keys: **[API.md](API.md)**

### API Proxy
Vite proxies `/api` to the ioBroker REST API (configured in `vite.config.ts`). Dev target read from `VITE_IOBROKER_TARGET` in `.env.local` (copy from `.env.local.example`). Browser can also connect directly without proxy — configured in Settings → Connection.

In Docker, `nginx.conf` also proxies `/socket.io/` → `http://${IOBROKER_HOST}:${SOCKETIO_PORT}/socket.io/` (WebSocket upgrade included) so the Socket.io adapter is reachable through the single nginx port without CORS issues. `SOCKETIO_PORT` defaults to 8084 and can be overridden via environment variable.

### Runtime Config (Docker)
At runtime `window.__CONFIG__.ioBrokerHost` overrides the proxy label in the header. A Docker entrypoint generates `/config.js` from env vars (`IOBROKER_HOST`). The file is loaded via `<script src="/config.js">` in `index.html`. TypeScript declaration in `src/vite-env.d.ts`.

### Key Patterns
- Objects fetched once (`useAllObjects`, `staleTime: Infinity`) and filtered client-side
- State values fetched for current page, refreshed every 30s (or push via long-poll/socket.io)
- Row click and right-click → "Edit object" both open `ObjectEditModal` (StateDetail panel no longer exists as a separate component)
- History data uses `staleTime: Infinity` (immutable once fetched); **sql.0 adapter only**
- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters`
- Portal-based dropdowns (`cells/EditableRoomCell`, `cells/EditableRoleCell`, `cells/EditableFunctionCell`) positioned via `getBoundingClientRect()`
- Portal-based context menu (`ui/ContextMenu.tsx`) with boundary detection
- **Optimistic updates** in `useSetState` via `onMutate` — value shown immediately in UI, reverted on error
- **AppSettings** (interface in `src/context/UIContext.tsx`) persisted to `localStorage` under key `iobroker-app-settings`; Settings modal uses a `settingsDraft` copy — changes only apply on "Save"; some toggles (`expertMode`, `toolbarLabels`, `groupByPath`) save immediately AND update the draft
- **UIContext split**: `AppSettingsCtx` is stable (identity only changes when settings/scripts change), `UIOverlayCtx` is volatile (changes on every modal open/close). Subscribe to only what you need to avoid excess re-renders.
- **StateTree always uses full `allObjects` data** — `allStateIds`, `treeHistoryIds`, `treeSmartIds` are all computed from `allObjects` (not from the pattern-filtered `stateObjects`), so the tree namespace stays complete regardless of the search pattern
- **Batch editing**: when rows are checked in StateList, a batch bar appears with `BatchComboControl` for role, unit, room, and function — applies to all checked IDs at once
- **Threshold highlighting**: `getThresholdStatus()` in `StateListUtils.ts` compares state value against `common.min`/`common.max`; row value cell turns yellow (warn) or red (exceeded)
- **Dual-pane mode**: toggled via `AppSettings.panel2Open`; each panel has independent filter state (persisted in `localStorage`); `PanelContext` provides per-panel data to `StateList`/`StateTree`
- **Two-phase object loading**: Phase 1 fetches `type=state` immediately (fast, populates table); Phase 2 runs 5 parallel requests for all types (full object map for tree + enums). Both phases use IndexedDB cache controlled by `objectsCacheReloads` / `objectsCacheTTL`.
- **`includeIdPrefixes`**: when non-empty, only fetches objects whose IDs start with one of the configured prefixes — reduces payload for large ioBroker installs
- **`showUnitInValue`**: when on, appends `common.unit` to the value in the Value column (useful when Unit column is hidden)
- **`dragDropEnabled`**: drag a row onto an `alias.0.*` target in the other pane to open CreateAliasModal pre-filled; off by default (avoids click latency from `draggable` attribute); only active in dual-pane view

### ioBroker Concepts Used
- **Alias objects** (`alias.0.*`): `common.alias.id` points to source; `common.alias.read/write` are optional JS conversion formulas. Reverse map (`Map<targetId, aliasId[]>`) built from all objects for the alias column in the table.
- **Room enums** (`enum.rooms.*`): `common.members[]` lists member object IDs. Displayed and editable in the Raum column.
- **Function enums** (`enum.functions.*`): same structure as rooms, displayed in the Funktion column.

### AppSettings
Defined in `src/context/UIContext.tsx` (`interface AppSettings`), persisted to `localStorage` as `iobroker-app-settings`. Settings modal uses a `settingsDraft` copy — changes apply on "Save"; `expertMode`, `toolbarLabels`, `groupByPath` save immediately.

### StateTree Props (App.tsx → StateTree)
- `stateIds={allStateIds}` — all IDs where `type === 'state'` from `allObjects` (NOT from search-filtered objects)
- `historyIds={treeHistoryIds}` — IDs with history config from `allObjects`
- `smartIds={treeSmartIds}` — IDs with smart name from `allObjects`
This ensures the tree always shows the full namespace, independent of the search pattern.

### Key Components
| Component | Path | Description |
|---|---|---|
| `StateList` | `statelist/StateList.tsx` | Main paginated table with sortable/resizable columns, column picker, filters, right-click context menu, batch edit bar, threshold highlighting. Virtualized via `@tanstack/react-virtual`. |
| `StateListToolbar` | `statelist/StateListToolbar.tsx` | Toolbar extracted from StateList (New, Export, Import, Enums, Statistics, Optimize, Script Index, column controls) |
| `StateRow` | `statelist/StateRow.tsx` | Individual virtualized table row |
| `ObjectEditModal` | `modals/ObjectEditModal.tsx` | Opened on row click AND via "Edit object" in context menu; tabs: Details, JSON, Alias, Custom Settings, Scripts; expert mode + delete. |
| `DetailsTab` | `tabs/DetailsTab.tsx` | Details tab of ObjectEditModal (editable fields + live value + mini history chart) |
| `AliasTab` | `tabs/AliasTab.tsx` | Alias tab; supports separate read/write IDs and JS conversion formulas with inline tester |
| `JsonTab` | `tabs/JsonTab.tsx` | Raw JSON editor tab |
| `CustomTab` | `tabs/CustomTab.tsx` | `common.custom` adapter settings tab |
| `ScriptsTab` | `tabs/ScriptsTab.tsx` | Shows javascript.0 scripts that reference the current datapoint ID |
| `StateTree` | `StateTree.tsx` | Left sidebar hierarchical tree with context menu. Always fed from `allObjects`. |
| `Layout` | `Layout.tsx` | App shell with collapsible sidebar (CSS width transition), drag-resize divider, dark mode toggle |
| `CreateAliasModal` | `modals/CreateAliasModal.tsx` | Creates `alias.0.*` object pointing to a source datapoint |
| `AutoCreateAliasModal` | `modals/AutoCreateAliasModal.tsx` | Batch-creates aliases for all child states of a device/channel |
| `AliasReplaceModal` | `modals/AliasReplaceModal.tsx` | Find & Replace in alias target IDs across all `alias.0.*` objects |
| `CopyDatapointModal` | `modals/CopyDatapointModal.tsx` | Copies a datapoint with new ID; alias sources get optional target path replacement |
| `RenameDatapointModal` | `modals/RenameDatapointModal.tsx` | Renames object + state to new ID |
| `MoveDatapointModal` | `modals/MoveDatapointModal.tsx` | Moves object + state to a new path |
| `HistoryModal` | `modals/HistoryModal.tsx` | Full-screen history modal; up to 4 extra series; periodic comparison; stats; zoom/pan; PNG export |
| `HistoryChart` | `history/HistoryChart.tsx` | Recharts chart with time range, aggregation, multi-series, zoom/pan via `viewWindow`, comparison via `compareOffset`, delete functions |
| `NewDatapointModal` | `modals/NewDatapointModal.tsx` | Creates a new datapoint |
| `ImportDatapointsModal` | `modals/ImportDatapointsModal.tsx` | Import datapoints from JSON file |
| `OptimizeModal` | `modals/OptimizeModal.tsx` | Metadata quality scanner with inline batch fix controls |
| `TreeStatsModal` | `modals/TreeStatsModal.tsx` | Namespace statistics table with subtree delete and script index |
| `EnumManagerModal` | `modals/EnumManagerModal.tsx` | Room and function enum manager |
| `ValueEditModal` | `modals/ValueEditModal.tsx` | Standalone value edit modal |
| `SettingsModal` | `modals/SettingsModal.tsx` | All settings tabs (Connection, Display, Columns, Filters) |
| `HelpModal` | `modals/HelpModal.tsx` | In-app help / feature overview |
| `ContextMenu` | `ui/ContextMenu.tsx` | Portal-based right-click menu |
| `BatchComboControl` | `statelist/BatchComboControl.tsx` | Combo dropdown used in batch edit bar and OptimizeModal |
| `HostConnectedButton` | `HostConnectedButton.tsx` | Connection status badge in header |
| `IdSuggestInput` | `ui/IdSuggestInput.tsx` | ID input with autocomplete suggestions from known object IDs |
| Editable cells | `cells/Editable*.tsx` | Inline-editable cells (Name, Role, Room, Function, Type, Unit, Value) — portal-positioned dropdowns |

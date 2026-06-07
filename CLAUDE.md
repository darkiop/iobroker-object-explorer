# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `npm run dev` (Vite HMR, port 5173)
- **Build:** `npm run build` (TypeScript check + Vite bundle)
- **Lint:** `npm run lint`
- **Type check only:** `npx tsc --noEmit`

No test framework is configured.

## Architecture

React + TypeScript dashboard for browsing ioBroker smart home objects and states via REST API. Dark/light theme, EN/DE language toggle.

### Stack
React 18, TanStack React Query, Recharts, Tailwind CSS, Vite

### Data Flow
```
SearchBar (pattern input)
  → useFilteredObjects() / useAllObjects() → objects cached in-memory, filtered client-side
  → useStateValues(pageIds) → batched fetch, 30s polling
  → StateList (paginated table) + StateTree (hierarchical nav)
  → on row click / right-click → ObjectEditModal (Details / JSON / Alias / Custom Settings tabs)
  → History icon / menu entry → HistoryModal → HistoryChart (sql.0 adapter only)
```

### Layer Structure
- **`src/types/iobroker.ts`** — TypeScript interfaces: IoBrokerState, IoBrokerObject, IoBrokerObjectCommon, HistoryEntry, TreeNode
- **`src/api/iobroker.ts`** — REST API client. Objects cached globally. History via POST `/api/v1/command/sendTo` (sql.0). Alias reverse map, room/function enum helpers.
- **`src/hooks/useStates.ts`** — React Query hooks wrapping API functions with refetch intervals
- **`src/components/`** — UI components using Tailwind classes
- **`src/context/ThemeContext.tsx`** — Dark/light mode context

### Realtime Transport (Long-Polling / Socket.io)
- **`src/hooks/useLongPolling.ts`** — default transport (`AppSettings.realtimeTransport: 'longpolling'`). Polls REST API `/states/subscribe`/`unsubscribe` for namespace patterns derived from visible IDs (`derivePatterns()`). Always available, works with the standard REST adapter.
- **`src/hooks/useSocketIO.ts`** — experimental alternative transport (`'socketio'`, opt-in via Settings). Connects to a separate `socketio` adapter instance (default port `8084`, `socket.io-client@2` — the adapter runs a v2.x server, v3/v4 clients are incompatible). Subscribes per-pattern to both `subscribe`/`unsubscribe` (→ `stateChange`) and `subscribeObjects`/`unsubscribeObjects` (→ `objectChange`), live-patching the React Query caches (`states.values*`, `states.detail`, `objects.all`, `objects.bootstrap`, `objects.detail`) — no waiting for polling/refresh.
  - **Diff-based resubscribe**: socket connection persists across page/filter changes; only the pattern *delta* (added/removed) is (un)subscribed — no full teardown+rebuild, no gap in the live stream for patterns that stay visible.
  - **Ack handling**: every `(un)subscribe(Objects)` emits with a callback; failed subscribes get one retry after 5s, errors are logged via `console.warn` (no silent data loss).
  - **Auto-fallback**: if the socket.io adapter is unreachable (`supported === false`), `App.tsx` automatically activates long polling in parallel as a live fallback and reflects the *effective* active transport in the status badge (not just the setting); recovers automatically once socket.io reconnects.
  - Both hooks share the `{ supported: boolean | null, connected: boolean }` status shape so they're interchangeable — selection logic lives in `App.tsx` (`useSocketTransport`, `sioFailed`, `lpEnabled`, `lpStatus`).
- Status for both REST API connectivity and the active realtime transport is shown in `HostConnectedButton` (Wifi/WifiOff for REST, Zap/Radio badge for Socket.io/Long-Polling with connected/unreachable/connecting indicator + amber fallback marker).
- ⚠️ **No auth support** for either REST API or the socketio adapter — see README warning; only use on trusted networks.

### API Proxy
Vite proxies `/api` to the ioBroker REST API (configured in `vite.config.ts`, default `http://10.4.0.33:8093`).

### Runtime Config (Docker)
At runtime `window.__CONFIG__.ioBrokerHost` overrides the proxy label in the header. A Docker entrypoint generates `/config.js` from env vars (`IOBROKER_HOST`). The file is loaded via `<script src="/config.js">` in `index.html`. TypeScript declaration in `src/vite-env.d.ts`.

### Key Patterns
- Objects are fetched once (`useAllObjects`, `staleTime: Infinity`) and filtered client-side
- State values fetched for current page (50 items), refreshed every 30s
- Row click and right-click → "Edit object" both open `ObjectEditModal` (StateDetail panel no longer exists as a separate component)
- History data uses `staleTime: Infinity` (immutable once fetched); **sql.0 adapter only**
- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters`
- Portal-based dropdowns (EditableRoomCell, EditableRoleCell, EditableFunctionCell) positioned via `getBoundingClientRect()`
- Portal-based context menu (ContextMenu.tsx) with boundary detection
- **Optimistic updates** in `useSetState` via `onMutate` — value shown immediately in UI, reverted on error
- **AppSettings** (interface in App.tsx) persisted to `localStorage` under `LS_APP_SETTINGS`; uses a draft pattern (`settingsDraft`) in the Settings modal — changes only apply on "Save"; some toggles (e.g. `expertMode`, `toolbarLabels`) also save immediately when clicked in-app
- **StateTree always uses full `allObjects` data** — `allStateIds`, `treeHistoryIds`, `treeSmartIds` are all computed from `allObjects` (not from the pattern-filtered `stateObjects`), so the tree namespace stays complete regardless of the search pattern
- **Batch editing**: when rows are checked in StateList, a batch bar appears with `BatchComboControl` for role, unit, room, and function — applies to all checked IDs at once
- **Threshold highlighting**: `getThresholdStatus()` in StateList compares state value against `common.min`/`common.max`; row value cell turns yellow (warn) or red (exceeded)

### ioBroker Concepts Used
- **Alias objects** (`alias.0.*`): `common.alias.id` points to source; `common.alias.read/write` are optional JS conversion formulas. Reverse map (`Map<targetId, aliasId[]>`) built from all objects for the alias column in the table.
- **Room enums** (`enum.rooms.*`): `common.members[]` lists member object IDs. Displayed and editable in the Raum column.
- **Function enums** (`enum.functions.*`): same structure as rooms, displayed in the Funktion column.

### AppSettings
Central settings object in App.tsx, persisted to `localStorage` as `LS_APP_SETTINGS`:
```typescript
interface AppSettings {
  language: 'en' | 'de';
  dateFormat: DateFormatSetting;
  visibleCols: SortKey[];
  extraQuickFilters: string[];
  toolbarLabels: boolean; // default true — show text labels on toolbar buttons
  pageSize: number;       // default 50 — rows per page in StateList
  realtimeTransport: 'longpolling' | 'socketio'; // default 'longpolling' — see "Realtime Transport"
  socketHost: string;     // override host:port for socketio adapter (default guess: <restHost>:8084)
}
```
Settings modal uses a `settingsDraft` copy; only saved on "Speichern". Some toggles (`expertMode`, `toolbarLabels`) save immediately AND update the draft.

### StateTree Props (App.tsx → StateTree)
- `stateIds={allStateIds}` — all IDs where `type === 'state'` from `allObjects` (NOT from search-filtered objects)
- `historyIds={treeHistoryIds}` — IDs with history config from `allObjects`
- `smartIds={treeSmartIds}` — IDs with smart name from `allObjects`
This ensures the tree always shows the full namespace, independent of the search pattern.

### Key Components
| Component | Description |
|---|---|
| `StateList` | Main paginated table with sortable/resizable columns, column picker, filters, right-click context menu, batch edit bar (role/unit/room/function for checked rows), threshold value highlighting. |
| `ObjectEditModal` | Opened on row click AND via "Edit object" in context menu; tabs: Details, JSON, Alias, Custom Settings; expert mode + delete. Alias tab supports separate read/write IDs (`alias.id` as `{read, write}`). |
| `StateTree` | Left sidebar hierarchical tree with context menu. Always fed from `allObjects` (not filtered stateObjects) so search pattern doesn't collapse the namespace. |
| `Layout` | App shell with collapsible sidebar (CSS width transition), dark mode toggle |
| `CreateAliasModal` | Creates `alias.0.*` object pointing to a source datapoint |
| `CopyDatapointModal` | Copies a datapoint with new ID (copies type, role, unit, read, write, min, max, desc, states) |
| `HistoryModal` | Full-screen history modal; supports up to 4 extra series (multi-datapoint comparison); periodic comparison overlay (±1w/1m); stats badges (min/max/avg/last); zoom (mouse wheel) + pan (drag); export as PNG. |
| `HistoryChart` | Recharts chart with time range, aggregation, delete functions, multi-series support (`extraSeries` prop), zoom/pan via `viewWindow` state, comparison series via `compareOffset`. |
| `NewDatapointModal` | Creates a new datapoint |
| `ContextMenu` | Portal-based right-click menu used in both StateList and StateTree |

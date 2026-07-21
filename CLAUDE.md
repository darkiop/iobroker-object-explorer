# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Commands

| | |
|---|---|
| Dev server | `npm run dev` (Vite HMR, port 5173) |
| Build | `npm run build` (`tsc -b` + Vite bundle) |
| Lint | `npm run lint` |
| Type check | `npx tsc --noEmit` |
| Test | `npm test` / `npm run test:watch` / `npm run test:ui` |

Vitest + `@testing-library/react` + jsdom. Test files live next to the code they test (`*.test.ts` / `*.test.tsx`).

## Docs

| File | Content |
|---|---|
| [docs/api.md](docs/api.md) | ioBroker REST endpoints (used + unused), socket.io event protocol, auth, connection/fallback flow |
| [docs/architecture.md](docs/architecture.md) | Mermaid diagrams: system context, transport selection, query pipeline, provider tree, component hierarchy, module layers |
| [docs/features.md](docs/features.md) | User-facing feature overview |
| [docs/findings.md](docs/findings.md) · [docs/ideas.md](docs/ideas.md) · [docs/stats.md](docs/stats.md) | Audit findings + feature backlog, ideas, project metrics |
| [docs/bugs.md](docs/bugs.md) | Small concrete defects — stale comments, missed i18n, tooling glitches; too small for findings.md |

## Architecture

React 18 + TypeScript SPA for browsing and editing ioBroker objects/states via REST API. 6 themes (`light`, `dark`, `abyss`, 3× catppuccin), EN/DE.

**Stack:** React 18, TanStack React Query v5, @tanstack/react-virtual, Recharts, Tailwind, Vite, Vitest, socket.io-client v2, lucide-react, expr-eval, dompurify.

### Data Flow
```
SearchBar (pattern)
  → useAllObjects() → objects cached in IndexedDB + memory, filtered client-side
  → useStateValues(pageIds) → batched fetch, 30s polling (or realtime push)
  → StateList (virtualized table) + StateTree (hierarchical nav)
  → row click / context menu → ObjectEditModal (Details / JSON / Alias / Custom / Scripts / SmartName / History tabs)
  → history icon → HistoryModal → HistoryChart (sql.0 adapter only)
```

### Module Layers
- **`src/types/iobroker.ts`** — `IoBrokerState`, `IoBrokerObject`, `IoBrokerObjectCommon`, `HistoryEntry`, `TreeNode`
- **`src/api/iobroker.ts`** — REST client, global object cache, history via POST `/api/v1/command/sendTo` (sql.0), alias reverse map, enum helpers
- **`src/hooks/`** — `useObjectQueries` (queries), `useObjectMutations` (object CRUD), `useEnumMutations` (room/function membership), `useStates` (re-export barrel for all three), `queryKeys` (key factory), `useStateListView` (sort/filter/group/paginate), `useStateListModals`, `useTreeState`, `useBatchEdit`, `useColumnResize`, `useApiConnectivity`, `useLongPolling`, `useSocketIO`
- **`src/context/`** — `ThemeContext`, `UIContext` (settings + scripts), `FilterContext` (pattern, filters, pagination, saved filters, history), `PanelContext` (per-pane state in dual-pane mode), `SelectionContext`, `ToastContext`
- **`src/components/`** — `statelist/`, `modals/`, `tabs/`, `cells/`, `history/`, `ui/`
- **`src/utils/`** — pure helpers: `format`, `i18n`, `clipboard`, `coloredId`, `filterObjectIds`, `idPatterns`, `aliasFormula`, `commPause`, `roleColor`, `typeColor`, `enumColor`, `validation`

### Realtime Transport
- **`useSocketIO.ts`** — default. `socket.io-client@2` (adapter runs a v2.x server — v3/v4 incompatible), port `8084`. Diff-based resubscribe on filter change; live-patches React Query caches on push, no polling roundtrip. Falls back to long polling on `connect_error`.
- **`useLongPolling.ts`** — fallback. Polls REST `/states/subscribe` per namespace pattern (`derivePatterns()`).
- Both return `{ supported: boolean | null, connected: boolean }`; selection logic in `App.tsx`, status in `HostConnectedButton`.
- ⚠️ **No auth support** — trusted networks only.

### Proxy & Docker
- Vite proxies `/api` to the REST API (`vite.config.ts`), target from `VITE_IOBROKER_TARGET` in `.env.local` (see `.env.local.example`). The browser can also connect directly without proxy — Settings → Connection.
- `nginx.conf` proxies `/api` and `/socket.io/` (with WebSocket upgrade) so everything is reachable through one port without CORS. `SOCKETIO_PORT` defaults to 8084.
- A Docker entrypoint generates `/config.js` from `IOBROKER_HOST`; `window.__CONFIG__.ioBrokerHost` overrides the proxy label in the header. Declared in `src/vite-env.d.ts`, loaded via `<script src="/config.js">` in `index.html`.

### Key Patterns
- **Two-phase object loading**: phase 1 fetches `type=state` (fast, populates the table), phase 2 runs 5 parallel requests for all types (full map for tree + enums). Both use the IndexedDB cache, controlled by `objectsCacheReloads` / `objectsCacheTTL`.
- Objects use `staleTime: Infinity` and are filtered client-side; state values refetch every 30s or arrive via push. History data is `staleTime: Infinity` (immutable once fetched) and **sql.0 only**.
- **StateTree always uses full `allObjects`** — `allStateIds`, `treeHistoryIds`, `treeSmartIds` are computed from `allObjects`, not from the pattern-filtered set, so the tree namespace stays complete regardless of the search pattern.
- **AppSettings** (`interface AppSettings` in `src/context/UIContext.tsx`) persists to `localStorage` key `iobroker-app-settings`. SettingsModal edits a `settingsDraft` copy applied on "Save"; `expertMode`, `toolbarLabels`, `groupByPath` save immediately *and* update the draft.
- **UIContext split**: `AppSettingsCtx` is stable (identity changes only on settings/scripts change), `UIOverlayCtx` is volatile (every modal open/close). Subscribe to only what you need.
- **Optimistic updates** in `useSetState` via `onMutate` — value shows immediately, reverts on error.
- **Portals**: editable cell dropdowns (`cells/Editable*.tsx`) and `ui/ContextMenu.tsx` are portal-rendered and positioned via `getBoundingClientRect()` with boundary detection.
- **Batch editing**: checking rows in StateList reveals a batch bar (`StateListBatchBar` + `BatchComboControl`) for role, unit, room, function across all checked IDs.
- **Threshold highlighting**: `getThresholdStatus()` in `statelist/StateListUtils.ts` compares the value against `common.min`/`common.max` — value cell turns yellow (warn) or red (exceeded).
- **Dual-pane mode**: `AppSettings.panel2Open`; each pane keeps independent filter state in `localStorage` via `PanelContext`.
- **Virtual folder nodes**: StateList separator rows whose `item.prefix` has no `allObjects` entry and is deeper than 2 segments render italic at 40%/50% opacity with a tooltip. `VirtualFoldersModal` enumerates them by walking every ID's intermediate segments. Depth ≤ 2 (e.g. `alias`, `alias.0`) is excluded from both.
- **Backup before delete**: `AppSettings.dbBackupBeforeDelete` (default on) makes the four destructive DB actions (delete-all, 3-month purge, dedupe, orphan delete) download a JSON dump of the affected rows first; a failed export aborts the delete. Format logic lives IO-free in `src/api/dbBackup.ts`, the run in `src/hooks/useDbBackup.ts`. Export is capped at `DB_DUMP_MAX_ROWS` (500k) with an explicit user decision above it. Restore goes through `DbBackupModal` and writes with `INSERT IGNORE`, so re-running the same file is safe.
- Settings worth knowing: `includeIdPrefixes` (fetch only IDs with these prefixes — cuts payload on large installs), `showUnitInValue` (append `common.unit` in the Value column), `dragDropEnabled` (drag a row onto an `alias.0.*` target in the other pane to prefill CreateAliasModal; off by default because `draggable` adds click latency; dual-pane only).
- TypeScript strict mode with `noUnusedLocals` / `noUnusedParameters`.

### ioBroker Concepts
- **Aliases** (`alias.0.*`): `common.alias.id` points at the source; `common.alias.read/write` are optional JS conversion formulas (tested inline in AliasTab via `utils/aliasFormula.ts`). A reverse map `Map<targetId, aliasId[]>` feeds the alias column.
- **Enums** (`enum.rooms.*`, `enum.functions.*`): `common.members[]` lists member IDs; both are editable inline in the Room / Function columns.

### Key Components
Paths are relative to `src/components/`.

- **Table** — `statelist/StateList.tsx` (virtualized main table: sortable + resizable columns, column picker, per-column filters, context menu, batch bar, threshold highlighting), `StateListToolbar.tsx`, `StateRow.tsx`, `StateListBatchBar.tsx`, `StateListColumns.ts`, `StateListUtils.ts`
- **Tree / shell** — `StateTree.tsx` (always fed from `allObjects`), `Layout.tsx` (collapsible sidebar, drag-resize divider), `SearchBar.tsx`, `HostConnectedButton.tsx`, `PwaManager.tsx`
- **Object editor** — `modals/ObjectEditModal.tsx` with `tabs/`: `DetailsTab` (fields + live value + mini chart), `JsonTab`, `AliasTab` (separate read/write IDs, formula tester), `CustomTab` (`common.custom`), `ScriptsTab` (javascript.0 scripts referencing the ID), `SmartNameTab`, `HistoryTab`
- **Alias tooling** — `modals/CreateAliasModal`, `AutoCreateAliasModal` (batch aliases for all child states of a device/channel), `AliasReplaceModal` (find & replace across alias targets)
- **Datapoint ops** — `modals/NewDatapointModal`, `CopyDatapointModal`, `RenameDatapointModal`, `MoveDatapointModal`, `ImportDatapointsModal`, `ValueEditModal`, `MultiDeleteDialog`, `StateListModals.tsx`
- **History** — `modals/HistoryModal` (full-screen, up to 4 extra series, periodic comparison, stats, zoom/pan, PNG export) → `history/HistoryChart.tsx` (zoom/pan via `viewWindow`, comparison via `compareOffset`, delete functions)
- **Analysis** — `modals/OptimizeModal` (metadata quality scanner + inline batch fixes), `TreeStatsModal` (namespace stats, subtree delete, script index), `VirtualFoldersModal`, `DbOverviewModal` (sql.0 table overview with per-column filters) → `DpValuesModal`, `OrphanValuesModal` (scan for `ts_*` rows whose id is gone from `datapoints`; per-group delete with SQL preview), `DbBackupModal` (restores a JSON dump of raw `ts_*` rows: file picker, per-series status ok/missing/blocked, batch insert via `INSERT IGNORE`, skip-and-report; opened from DbOverviewModal)
- **Misc** — `modals/EnumManagerModal`, `SettingsModal` (Connection / Display / Columns / Filters), `HelpModal`, `ConfirmDialog`
- **UI primitives** — `ui/ContextMenu`, `IdSuggestInput`, `ColPicker`, `SortHeader`, `StyledCheckbox`, `Tooltip`, `ToastContainer`, `TsRangeFilterControl`, `TypeIcon`, `LanguageDropdown`
- **Editable cells** — `cells/Editable*.tsx` for Name, Role, Room, Function, Type, Unit, Value

# Features

## Search & Filters

- Pattern search with wildcard support (e.g. `alias.0.*`, `javascript.0.*`)
- Full-text search across ID, name, description and alias targets
- Exact-match mode (no wildcard fuzziness)
- ID suggest mode: autocomplete for known IDs
- Filter-prefix suggestions: focusing the empty search field lists all available prefixes; `id:` offers object-ID value suggestions with auto-submit
- Type filter inside the pattern, e.g. `type:state`, `type:channel`
- Room and function filters extracted from the pattern
- Quick-filter buttons for common namespaces in the sidebar (configurable)
- Quick-filter buttons for every configured room
- Quick-filter buttons for every configured function
- Quick-filter buttons for object types
- History filter: only datapoints with active history recording
- SmartName filter: only datapoints with a configured smart-home name
- Dangling-alias filter: only `alias.0.*` entries whose target datapoint is missing
- All filters combinable; active filters highlighted, clearable individually or all at once
- Folder scoping: show datapoints below a tree path in the table
- Save & load filters: named filter sets persisted in localStorage
- Filter history: back/forward buttons next to the app title step through previously applied filters
- Filter state restored across sessions (pattern, page, all active filters)
- `defaultAliasFilterOnStartup`: first load defaults the pattern to `alias.0.*` (on by default)

## Object Tree (Sidebar)

- Hierarchical view of the ioBroker object structure (folder / device / channel / datapoint)
- Two display modes: adapter view (default) and path view
- Distinct icons per node type; history and SmartName indicators
- Object counter per namespace: configurable (off / states / objects / both)
- Expand / collapse the whole tree
- Collapsible sidebar with drag-resize (180–600 px), width persisted in localStorage
- Font size configurable independently of the table (small / normal / large / xl)
- Hover actions: scope, copy, new datapoint
- Right-click context menu: set as filter, select, copy ID, edit object, rename, move, replace alias target, auto-create aliases, delete datapoint

## Table

- Sort ascending / descending by clicking a column header
- Filter row directly below the headers (ID, name, room, function, role, value, unit)
- Timestamp range filter (from / to) for the timestamp column
- Icon columns (read-only, history, SmartName, alias) filterable by click
- Column widths draggable; double-click fits width to content
- Custom default, min and max widths configurable per column
- Columns toggleable via the column picker; selection persisted in localStorage
- All column widths persisted in localStorage; settings resettable
- Font size configurable (small / normal / large / xl)
- Row height density configurable (`rowHeight`, default comfortable)
- Description column toggleable
- Grouping by path prefix (optional collapse behavior), with a toggle for shortened vs. full group paths
- Alias sub-rows hideable (`hideAliasSubRows`)
- Object and object-type icons toggleable
- Pagination: configurable page size; without an active filter all rows are shown
- Color coding for values: boolean green/red, null values highlighted
- Room and function values colorized
- Threshold highlighting: value cell turns yellow (warn) or red (exceeded) when `common.min`/`common.max` is crossed
- Type colors in the ID column (by object type)
- Virtualized rendering via `@tanstack/react-virtual`

## Row Actions & Context Menu

- Clicking a row opens the ObjectEditModal
- Double-clicking a value opens the ValueEditModal (focused value editor)
- Right-click context menu: copy ID / name / value, show history, set as filter, edit room/function, edit object, copy datapoint, rename, move, create alias, replace alias target, delete datapoint
- Inline editing of name, role, unit and value directly in the table
- Inline editing of room and function with enum assignment (portal dropdown)
- Multi-select via checkbox → batch delete and batch edit (role, unit, room, function)
- Single delete with confirmation dialog

## Value Editor (ValueEditModal)

- Opens on double-click of a value cell
- Type-aware input with automatic conversion (number, boolean, string)
- Ack flag settable
- Force-write option (also for read-only datapoints)
- Numeric values validated against `common.min`/`common.max` — out-of-range input shows an inline error and blocks saving instead of clamping
- JSON syntax highlighting for JSON values
- HTML preview for HTML content

## Edit Object (ObjectEditModal)

- Opens via row click or right-click → "Edit object"
- **Details** tab: metadata (name, type, role, unit, min/max, read/write), live value with ack/quality/timestamp, value controls (switch, button, number, text, boolean)
- Expert mode: free-form input field with automatic type conversion
- Number inputs validated against `common.min`/`common.max`, in both the number control and the expert control
- **History** tab: own tab with the chart, shown only when history is configured (sql.0)
- **JSON** tab: full JSON view with raw editor and syntax-error display; saved via PUT
- **Alias** tab: set or clear target ID, read and write formulas; separate read/write IDs
- **Custom** tab: adapter-specific settings (`common.custom`)
- **SmartName** tab: smart-home name configuration
- **Scripts** tab: javascript.0 scripts that reference the current datapoint
- Delete datapoint directly from the modal

## Creating & Managing Datapoints

- New datapoint: ID, name, type, role, unit, initial value, min/max, read/write; ID pre-filled from the active search path
- Copy datapoint: new ID and name pre-filled; copies type, role, unit, read/write, min/max, description, states mapping
- Rename datapoint: dialog with a new ID (POST + DELETE)
- Move datapoint: path change with validation
- Create alias: suggests `alias.0.<source-id>`; carries over name, type, role, unit, read/write, min/max/step, states and description from the source
- Replace alias target (AliasReplaceModal): find & replace across all alias read/write targets with preview
- Auto-create aliases (AutoCreateAliasModal): create `alias.0.*` entries for all state children of a device at once, assigning room/function directly

## Virtual Folders (VirtualFoldersModal)

- Lists intermediate folder paths that have no real ioBroker object behind them
- Filter input (defaults to `alias.0.`); per-row filter button sets the table ID filter
- Such separator rows are styled italic and dimmed in the table, with a tooltip
- Paths of depth ≤ 2 (e.g. `alias`, `alias.0`) are excluded

## Enum Manager

- Manages rooms (`enum.rooms.*`) and functions (`enum.functions.*`) in one modal
- Create new enum entries, rename or delete existing ones
- Show and remove members per enum
- Confirmation dialog before deleting

## Namespace Statistics (TreeStatsModal)

- Overview of all namespaces with object / state / history / SmartName / alias counters
- Sortable by every column
- Bar visualization of the relative share
- Click a namespace → set it directly as the scope filter
- Delete a whole namespace (subtree) with confirmation
- Script analysis: which datapoints are used by javascript.0 scripts
- Colorized IDs and columns, matching the table

## Import / Export

- Export: filtered datapoint list as CSV or JSON (ID-keyed object)
- Copy the filtered list as JSON to the clipboard
- Import: JSON editor with syntax highlighting, file upload via button or drag & drop

## History Chart

> Only the **`sql.0` adapter** is currently supported.

- Range presets: 1 h, 6 h, 24 h, 7 d, 30 d, 1 year; manual datetime picker
- Chart types: line, area, bar
- Aggregation: none / average / min+max / min / max
- Stats panel: min / max / avg / last value as badges above the chart
- Multi-datapoint comparison: several history-capable states on one time axis
- Periodic comparison: overlay the current range with the same range of the previous week
- Zoom & pan: mouse-wheel zoom on the time axis plus drag-to-pan
- Chart export as PNG
- Delete a single value (click mode), delete a time range, delete all history (each with confirmation)
- Table view with a per-row delete icon
- Recharts is lazy-loaded, keeping it out of the initial bundle

## Database Overview (sql.0)

- **DbOverviewModal**: lists all datapoints stored in the sql.0 database via `getDpOverview`, independent of the current history configuration
- Header stats: approximate total value rows and DB size via `information_schema` (instant, no full-table COUNT)
- Per-row value count on demand (type-specific indexed query); "Count and sort desc" counts all shown rows and sorts by count
- Per-column filter row: text columns match the formatted cell value, the status column uses a select over the four `DpStatus` values, epoch columns offer relative age buckets
- Rename the DB name via raw query (`UPDATE datapoints`) — history preserved, object untouched; existing target names rejected, quotes escaped
- Delete all stored values per row, with confirmation
- Numeric DB id column, sortable columns, type column colored via `getTypeColor`
- "Copy SQL" button in both DB modals (`buildDpValuesSql` / `buildDpOverviewSql`)
- Per-row chart button opens the history modal on top of the DB modal

### Stored Values (DpValuesModal)

- Paginated per-datapoint value view: edit and delete rows, insert rows, timestamp range filter, raw-ts toggle
- Header badges: total row count and oldest timestamp, via a single indexed `getDpValueSpan()` query
- Deduplicate consecutive duplicate values
- Purge values older than three months ("> 3M"), with the exact affected row count previewed before the irreversible delete
- Chart button in the header

### Orphan Values (OrphanValuesModal)

- Scans for `ts_*` value rows whose numeric id no longer exists in `datapoints`
- Runs automatically when the modal opens (probes the id gaps in `datapoints` instead of a full table scan); the button rescans, e.g. after deleting a group
- Per-group delete with SQL preview

## Metadata Optimization (OptimizeModal)

- Quality scanner: checks all visible datapoints for missing metadata (room, function, role, name, description, unit, min/max, type, SmartName)
- Individual checks toggleable; scope narrowable to a namespace
- Issues fixable inline per datapoint (input fields directly in the table row)
- Batch fix for all flagged datapoints at once
- Direct link to the ObjectEditModal for deeper editing
- Colorized IDs, matching the table

## Dual-Pane Mode

- Two independent panels side by side (table + tree), toggled in the settings
- Each panel has its own search filter, tree navigation and column settings
- Drag & drop: drag a row from panel 1 onto the `alias.0.*` namespace in panel 2 → CreateAliasModal opens pre-filled (enabled in the settings)
- "Open in other panel" action in the context menu

## Realtime Transport

- **Socket.io** (default): connects to the `socketio` adapter (default port 8084, socket.io-client v2); live updates for state values and objects without polling
  - Diff-based resubscribe: on filter change only new/dropped patterns are (un)subscribed — running subscriptions are not interrupted
  - Ack-based error handling: failed subscribes are retried once after 5 s
- **Long polling** (fallback): REST API `/states/subscribe`; activates automatically when Socket.io is unreachable
- Automatic fallback: if the Socket.io adapter does not answer, the app activates long polling in parallel and shows the effective transport in the status badge
- Connection status in the header (`HostConnectedButton`): wifi icon (REST), zap/radio badge (Socket.io / long polling) with colored status; amber marker when the fallback is active
- Realtime transport setting: Socket.io host/port configurable; switchable without a page reload
- **Pause mode**: the header play/pause button halts the object poll, the state-value poll and both push transports. Ephemeral — resets to running on reload; resuming refetches everything immediately. An amber viewport ring and a "Paused" badge signal the state.

## Object Cache (IndexedDB)

- Large `/objects` bulk payloads are cached in IndexedDB
- Two-phase loading: phase 1 fetches `type=state` immediately (fast, fills the table); phase 2 loads all types in parallel (full object map for tree + enums)
- Cache expiry: configurable by number of reloads (`objectsCacheReloads`: off / 5 / 10 / 20 / 50) and by time (`objectsCacheTTL`: off / 1h / 6h / 24h / 7d); whichever triggers first forces a refetch
- The manual refresh button always bypasses both and fetches fresh
- `includeIdPrefixes`: when configured, only objects with the given ID prefixes are loaded — reduces payload on large ioBroker installs (enums are always fetched)

## Settings (SettingsModal)

- Connection: ioBroker host, Socket.io host/port, admin port, realtime transport
- Display: language (DE/EN), date format (DE/US/ISO), font size (table + tree), row height, tree counter mode, description on/off, grouping by path, tree view mode, object icons, group-expand animation
- Columns: pick visible columns, custom widths, show unit in the value column (`showUnitInValue`)
- Filters: configurable quick-filter buttons, include script IDs, load only visible state values (`loadOnlyVisibleStateValues`), ID prefix filter (`includeIdPrefixes`), default alias filter on startup
- Performance: object auto-refresh, cache settings (reloads + TTL)
- Enable drag & drop (dual-pane only)
- Changes live in a settings draft — applied on "Save"; a few toggles (expertMode, toolbarLabels, groupByPath) save immediately

## UI & General

- 6 themes: Light, Dark, Abyss, Catppuccin Frappé, Catppuccin Macchiato, Catppuccin Mocha; switched by click in the header, persisted in localStorage
- German and English (switchable in the header)
- Responsive layout; sidebar collapsible for more table width
- Fullscreen mode
- Toast notifications for actions and errors
- Keyboard shortcuts overview (modal)
- In-app help modal covering all feature areas, including a "Database (sql.0)" section
- Local storage clearable (reset all persisted settings)
- ioBroker host configurable directly in the browser: click the connection badge in the header → enter `host:port` → Enter; connection test before saving with status display; host persisted in localStorage
- Auto-refresh for objects: configurable (off / 30s / 1min / 5min / 10min)
- ioBroker admin port configurable (default 8081) for direct admin links
- Include script IDs: analyze javascript.0 scripts for the datapoints they use
- Docker-compatible: `nginx.conf` proxies the REST API and Socket.io; runtime config via `window.__CONFIG__.ioBrokerHost` from environment variables

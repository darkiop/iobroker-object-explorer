| ID | Description | Category | Priority | Effort | Status |
|---|---|---|---|---|---|
| FE-001 | Improve type safety: remove unsafe as-casts, especially in enum name parsing and API responses. | Code Quality | high | M | done |
| FE-002 | Use React.memo() for StateList and StateTree, as both re-render on every app re-render despite unchanged props. | Performance | high | M | done |
| FE-003 | Add input validation: regex for object IDs, min/max for numeric fields, XSS escaping for name inputs. | Security | high | S | done |
| FE-004 | Ensure XSS protection for JSON editor; prevent raw HTML injection via object fields. | Security | high | S | done |
| FE-005 | Column sorting in StateList: click column header to sort ascending/descending (ID, Name, Role, Room, Value, Unit). | Feature | high | M | done |
| FE-006 | Delete button in table row: delete icon with confirmation dialog; multi-select + bulk delete. | Feature | high | M | done |
| FE-007 | Improve error handling: meaningful error messages, toast notifications for mutation success/failure. | Code Quality | high | M | done |
| FE-008 | Use virtualization for StateList: 1000+ entries render all DOM nodes. | Performance | high | L | done |
| FE-009 | Move hardcoded IP from vite.config.ts to .env.local; update dev setup documentation. | DX | medium | S | done |
| FE-010 | Adjust column order in table: ID, Name, Type, Role, Function, Value, Unit, ACK, Last Update. | UX | medium | S | done |
| FE-011 | Add type column to table (folder/device/channel/state) with corresponding icon. | Feature | medium | S | done |
| FE-012 | Show alias source/target in ID column; source/target clickable and navigable in the tree. | Feature | medium | M | done |
| FE-013 | Add quick filter buttons for all rooms in the sidebar. | Feature | medium | M | done |
| FE-014 | Unit input in table as searchable dropdown instead of free text field. | UX | medium | S | done |
| FE-015 | Extract duplicate copyText() implementation into a shared utility. | Code Quality | medium | S | done |
| FE-016 | Structure QueryKey hierarchy according to TanStack React Query best practices. | Code Quality | medium | S | done |
| FE-017 | Extract column filter logic in App.tsx into a separate utility function filterObjectIds(). | Code Quality | medium | S | done |
| FE-018 | Increase API batch size in getStatesBatch() from 20 to 50+ and make it configurable. | Performance | medium | S | done |
| FE-019 | useStateValues() hook: pause refetch when tab/window is not visible (Page Visibility API). | Performance | medium | S | done |
| FE-020 | Cache buildAliasReverseMap() in QueryClient instead of recalculating on every re-render. | Performance | medium | S | done |
| FE-021 | Keyboard navigation: arrow keys in table, tab for focus, enter to open modal. | UX | medium | M | open |
| FE-022 | Debouncing (300–500ms) for SearchBar and column filter inputs instead of immediate filtering. | UX | medium | S | done |
| FE-023 | Implement E2E tests with Playwright: cover critical paths Search→Select→Edit→Save. | Tooling | medium | L | open |
| FE-024 | HistoryChart: implement downsampling for >1000 data points, as Recharts stutters with large datasets. | Performance | medium | M | open |
| FE-025 | Merge enum map parsing logic into a shared utility parseEnumName(). | Code Quality | low | S | open |
| FE-026 | Skeleton screens / loading states in StateList while datapoint values are being loaded. | UX | low | M | open |
| FE-027 | State persistence in localStorage: retain active filters and page navigation across sessions. | UX | low | S | open |
| FE-028 | Persist sidebar width and collapsed state in localStorage. | UX | low | S | done |
| FE-029 | Color coding for state values: boolean green/red, numbers with trend arrows, highlight null values. | UX | low | S | done |
| FE-030 | Export function: export filtered datapoint list as JSON or CSV. | Feature | low | M | done |
| FE-031 | Full-text search: search in names, descriptions, and alias targets with relevance ranking. | Feature | low | L | done |
| FE-032 | Progressive Web App (PWA): service worker + offline support for cached objects. | Feature | low | L | open |
| FE-033 | Undo/redo for edits (name, role, unit, room, function), especially after batch operations. | Feature | low | L | open |
| FE-034 | Localization: hardcoded German; add English and additional languages. | Feature | low | L | done |
| FE-035 | Multi-datapoint comparison in chart: multiple history-enabled states simultaneously on one time axis. | Chart | high | L | done |
| FE-036 | Sparkline mini chart in the value table column: trend graph of the last 24h for history-enabled datapoints. | Chart | high | M | open |
| FE-037 | Statistics panel in HistoryChart: min/max/avg/last-value summary as badges above the chart. | Chart | medium | S | done |
| FE-038 | Zoom & pan in chart: mouse wheel zoom on time axis + drag-to-pan. | Chart | medium | M | done |
| FE-039 | Boolean states as Gantt/time bar chart: on-periods as colored bars instead of lines. | Chart | medium | M | open |
| FE-040 | Chart export as PNG: button in HistoryModal that downloads the chart as an image file. | Chart | medium | S | done |
| FE-041 | History adapter selectable: currently hardcoded to sql.0; add support for influxdb.0 and history.0. | Feature | medium | M | open |
| FE-042 | Batch editing: edit multiple selected rows simultaneously (role, unit, room, function). | Feature | medium | M | done |
| FE-043 | Threshold highlighting: min/max thresholds per datapoint; row flashes red/yellow when value is out of range. | Feature | medium | M | done |
| FE-044 | Alias formula tester: make read/write formulas in the alias tab directly testable. | Feature | medium | S | done |
| FE-045 | Adapter grouping in tree: optional view that groups datapoints by adapter instead of path hierarchy. | Feature | low | L | open |
| FE-046 | Periodic comparison in chart: overlay current time range with the same range from last week. | Chart | low | M | done |
| FE-047 | History data import: upload CSV file and import as history entries into sql.0. | Feature | low | L | open |
| FE-048 | Stabilize ThemeContext value object with useMemo: recreated on every render. | Performance | medium | S | done |
| FE-049 | Wrap StateList itself with React.memo: re-renders on every app state change despite stable props. | Performance | high | S | done |
| FE-050 | StateList table rows as dedicated React.memo component (StateRow) with custom comparator. | Performance | high | L | done |
| FE-051 | Wrap editable cells in StateList with React.memo: up to 400 cells without memoization. | Performance | high | M | done |
| FE-052 | Layout.tsx sidebar resize: stabilize handleMouseDown via useCallback + useRef for startWidth. | Performance | medium | S | done |
| FE-053 | Stabilize hasAnyFilter in App.tsx with useMemo as stable prop for memoized child components. | Performance | low | S | done |
| FE-054 | Rename datapoint in context menu: dialog for new ID; POST to new ID + DELETE old ID. | Feature | medium | M | done |
| FE-055 | Move datapoint in context menu: path change with path validation. | Feature | medium | M | done |
| FE-056 | JSON editor in edit object modal: check if full object JSON is editable and saveable. | Feature | medium | S | open |
| FE-057 | Update CLAUDE.md: architecture description, new components, and current stack decisions. | DX | low | S | done |
| FE-058 | Update README.md: features, screenshots, configuration, and development setup documentation. | DX | low | M | done |
| FE-059 | Alias: separate IDs for read and write (common.alias.read and common.alias.write as separate IDs). | Feature | medium | M | done |
| FE-060 | Create MIT license file: LICENSE file with current year and copyright holder. | DX | low | S | open |
| FE-061 | Bug: folder icon missing in object tree — folder nodes no longer show an icon. | Bug | high | S | done |
| FE-062 | XSS via dangerouslySetInnerHTML in ValueEditModal: HTML values from ioBroker states rendered without sanitization (`<img onerror=...>` possible). Use DOMPurify or disable HTML rendering. | Security | high | S | done |
| FE-063 | Host URL without format validation: custom host input in Layout.tsx accepted directly as fetch URL without IP/FQDN check. Regex validation before saving. | Security | medium | S | done |
| FE-064 | HTTP instead of HTTPS for custom host: custom host URLs are always constructed as `http://`, no HTTPS support possible. | Security | low | S | open |
| FE-065 | CORS errors not recognizable: no specific error handling for CORS preflight failures; user only sees a generic network error without CORS configuration hint. | UX | low | S | open |
| FE-066 | filterObjectIds.ts: merge 12 sequential `.filter()` calls (each O(n)) into a single pass → O(n) instead of O(12n) for large object sets. | Performance | medium | S | done |
| FE-067 | ContextMenu: array index as React `key` instead of stable label-based ID — causes incorrect DOM reuse in dynamically generated menus. | Performance | low | S | done |
| FE-068 | StateList column resize: `localStorage.setItem` called on every `mousemove` event (~60/s) — debounce writes to 500ms. | Performance | medium | S | done |
| FE-069 | Modals (ValueEditModal, ObjectEditModal et al.): `onClose` reference as dependency in escape keydown effect causes unnecessary listener re-registration on every render. | Performance | low | S | done |
| FE-070 | Implement auth for the explorer itself: login screen or HTTP Basic Auth before accessing the app. | Security | medium | L | open |
| FE-071 | Implement auth for the REST API: authentication for requests to the ioBroker REST API (e.g. API key, Basic Auth or token). | Security | medium | M | open |

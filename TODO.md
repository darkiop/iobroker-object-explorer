<table>
<thead>
<tr><th>ID</th><th>Description</th><th>Category</th><th>Priority</th><th>Effort</th><th>Status</th></tr>
</thead>
<tbody>
<tr style="background-color:#1a3a1f"><td>FE-001</td><td>Improve type safety: remove unsafe as-casts, especially in enum name parsing and API responses.</td><td>Code Quality</td><td>high</td><td>M</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-002</td><td>Use React.memo() for StateList and StateTree, as both re-render on every app re-render despite unchanged props.</td><td>Performance</td><td>high</td><td>M</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-003</td><td>Add input validation: regex for object IDs, min/max for numeric fields, XSS escaping for name inputs.</td><td>Security</td><td>high</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-004</td><td>Ensure XSS protection for JSON editor; prevent raw HTML injection via object fields.</td><td>Security</td><td>high</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-005</td><td>Column sorting in StateList: click column header to sort ascending/descending (ID, Name, Role, Room, Value, Unit).</td><td>Feature</td><td>high</td><td>M</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-006</td><td>Delete button in table row: delete icon with confirmation dialog; multi-select + bulk delete.</td><td>Feature</td><td>high</td><td>M</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-007</td><td>Improve error handling: meaningful error messages, toast notifications for mutation success/failure.</td><td>Code Quality</td><td>high</td><td>M</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-008</td><td>Use virtualization for StateList: 1000+ entries render all DOM nodes.</td><td>Performance</td><td>high</td><td>L</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-009</td><td>Move hardcoded IP from vite.config.ts to .env.local; update dev setup documentation.</td><td>DX</td><td>medium</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-010</td><td>Adjust column order in table: ID, Name, Type, Role, Function, Value, Unit, ACK, Last Update.</td><td>UX</td><td>medium</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-011</td><td>Add type column to table (folder/device/channel/state) with corresponding icon.</td><td>Feature</td><td>medium</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-012</td><td>Show alias source/target in ID column; source/target clickable and navigable in the tree.</td><td>Feature</td><td>medium</td><td>M</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-013</td><td>Add quick filter buttons for all rooms in the sidebar.</td><td>Feature</td><td>medium</td><td>M</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-014</td><td>Unit input in table as searchable dropdown instead of free text field.</td><td>UX</td><td>medium</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-015</td><td>Extract duplicate copyText() implementation into a shared utility.</td><td>Code Quality</td><td>medium</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-016</td><td>Structure QueryKey hierarchy according to TanStack React Query best practices.</td><td>Code Quality</td><td>medium</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-017</td><td>Extract column filter logic in App.tsx into a separate utility function filterObjectIds().</td><td>Code Quality</td><td>medium</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-018</td><td>Increase API batch size in getStatesBatch() from 20 to 50+ and make it configurable.</td><td>Performance</td><td>medium</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-019</td><td>useStateValues() hook: pause refetch when tab/window is not visible (Page Visibility API).</td><td>Performance</td><td>medium</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-020</td><td>Cache buildAliasReverseMap() in QueryClient instead of recalculating on every re-render.</td><td>Performance</td><td>medium</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-021</td><td>Keyboard navigation: arrow keys in table, tab for focus, enter to open modal.</td><td>UX</td><td>medium</td><td>M</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-022</td><td>Debouncing (300–500ms) for SearchBar and column filter inputs instead of immediate filtering.</td><td>UX</td><td>medium</td><td>S</td><td>done</td></tr>
<tr><td>FE-023</td><td>Implement E2E tests with Playwright: cover critical paths Search→Select→Edit→Save.</td><td>Tooling</td><td>medium</td><td>L</td><td>open</td></tr>
<tr><td>FE-024</td><td>HistoryChart: implement downsampling for &gt;1000 data points, as Recharts stutters with large datasets.</td><td>Performance</td><td>medium</td><td>M</td><td>open</td></tr>
<tr><td>FE-025</td><td>Merge enum map parsing logic into a shared utility parseEnumName().</td><td>Code Quality</td><td>low</td><td>S</td><td>open</td></tr>
<tr><td>FE-026</td><td>Skeleton screens / loading states in StateList while datapoint values are being loaded.</td><td>UX</td><td>low</td><td>M</td><td>open</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-027</td><td>State persistence in localStorage: retain active filters and page navigation across sessions.</td><td>UX</td><td>low</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-028</td><td>Persist sidebar width and collapsed state in localStorage.</td><td>UX</td><td>low</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-029</td><td>Color coding for state values: boolean green/red, numbers with trend arrows, highlight null values.</td><td>UX</td><td>low</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-030</td><td>Export function: export filtered datapoint list as JSON or CSV.</td><td>Feature</td><td>low</td><td>M</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-031</td><td>Full-text search: search in names, descriptions, and alias targets with relevance ranking.</td><td>Feature</td><td>low</td><td>L</td><td>done</td></tr>
<tr><td>FE-032</td><td>Progressive Web App (PWA): service worker + offline support for cached objects.</td><td>Feature</td><td>low</td><td>L</td><td>open</td></tr>
<tr><td>FE-033</td><td>Undo/redo for edits (name, role, unit, room, function), especially after batch operations.</td><td>Feature</td><td>low</td><td>L</td><td>open</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-034</td><td>Localization: hardcoded German; add English and additional languages.</td><td>Feature</td><td>low</td><td>L</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-035</td><td>Multi-datapoint comparison in chart: multiple history-enabled states simultaneously on one time axis.</td><td>Chart</td><td>high</td><td>L</td><td>done</td></tr>
<tr><td>FE-036</td><td>Sparkline mini chart in the value table column: trend graph of the last 24h for history-enabled datapoints.</td><td>Chart</td><td>high</td><td>M</td><td>open</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-037</td><td>Statistics panel in HistoryChart: min/max/avg/last-value summary as badges above the chart.</td><td>Chart</td><td>medium</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-038</td><td>Zoom &amp; pan in chart: mouse wheel zoom on time axis + drag-to-pan.</td><td>Chart</td><td>medium</td><td>M</td><td>done</td></tr>
<tr><td>FE-039</td><td>Boolean states as Gantt/time bar chart: on-periods as colored bars instead of lines.</td><td>Chart</td><td>medium</td><td>M</td><td>open</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-040</td><td>Chart export as PNG: button in HistoryModal that downloads the chart as an image file.</td><td>Chart</td><td>medium</td><td>S</td><td>done</td></tr>
<tr><td>FE-041</td><td>History adapter selectable: currently hardcoded to sql.0; add support for influxdb.0 and history.0.</td><td>Feature</td><td>medium</td><td>M</td><td>open</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-042</td><td>Batch editing: edit multiple selected rows simultaneously (role, unit, room, function).</td><td>Feature</td><td>medium</td><td>M</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-043</td><td>Threshold highlighting: min/max thresholds per datapoint; row flashes red/yellow when value is out of range.</td><td>Feature</td><td>medium</td><td>M</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-044</td><td>Alias formula tester: make read/write formulas in the alias tab directly testable.</td><td>Feature</td><td>medium</td><td>S</td><td>done</td></tr>
<tr><td>FE-045</td><td>Adapter grouping in tree: optional view that groups datapoints by adapter instead of path hierarchy.</td><td>Feature</td><td>low</td><td>L</td><td>open</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-046</td><td>Periodic comparison in chart: overlay current time range with the same range from last week.</td><td>Chart</td><td>low</td><td>M</td><td>done</td></tr>
<tr><td>FE-047</td><td>History data import: upload CSV file and import as history entries into sql.0.</td><td>Feature</td><td>low</td><td>L</td><td>open</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-048</td><td>Stabilize ThemeContext value object with useMemo: recreated on every render.</td><td>Performance</td><td>medium</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-049</td><td>Wrap StateList itself with React.memo: re-renders on every app state change despite stable props.</td><td>Performance</td><td>high</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-050</td><td>StateList table rows as dedicated React.memo component (StateRow) with custom comparator.</td><td>Performance</td><td>high</td><td>L</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-051</td><td>Wrap editable cells in StateList with React.memo: up to 400 cells without memoization.</td><td>Performance</td><td>high</td><td>M</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-052</td><td>Layout.tsx sidebar resize: stabilize handleMouseDown via useCallback + useRef for startWidth.</td><td>Performance</td><td>medium</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-053</td><td>Stabilize hasAnyFilter in App.tsx with useMemo as stable prop for memoized child components.</td><td>Performance</td><td>low</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-054</td><td>Rename datapoint in context menu: dialog for new ID; POST to new ID + DELETE old ID.</td><td>Feature</td><td>medium</td><td>M</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-055</td><td>Move datapoint in context menu: path change with path validation.</td><td>Feature</td><td>medium</td><td>M</td><td>done</td></tr>
<tr><td>FE-056</td><td>JSON editor in edit object modal: check if full object JSON is editable and saveable.</td><td>Feature</td><td>medium</td><td>S</td><td>open</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-057</td><td>Update CLAUDE.md: architecture description, new components, and current stack decisions.</td><td>DX</td><td>low</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-058</td><td>Update README.md: features, screenshots, configuration, and development setup documentation.</td><td>DX</td><td>low</td><td>M</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-059</td><td>Alias: separate IDs for read and write (common.alias.read and common.alias.write as separate IDs).</td><td>Feature</td><td>medium</td><td>M</td><td>done</td></tr>
<tr><td>FE-060</td><td>Create MIT license file: LICENSE file with current year and copyright holder.</td><td>DX</td><td>low</td><td>S</td><td>open</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-061</td><td>Bug: folder icon missing in object tree — folder nodes no longer show an icon.</td><td>Bug</td><td>high</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-062</td><td>XSS via dangerouslySetInnerHTML in ValueEditModal: HTML values from ioBroker states rendered without sanitization (`&lt;img onerror=...&gt;` possible). Use DOMPurify or disable HTML rendering.</td><td>Security</td><td>high</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-063</td><td>Host URL without format validation: custom host input in Layout.tsx accepted directly as fetch URL without IP/FQDN check. Regex validation before saving.</td><td>Security</td><td>medium</td><td>S</td><td>done</td></tr>
<tr><td>FE-064</td><td>HTTP instead of HTTPS for custom host: custom host URLs are always constructed as `http://`, no HTTPS support possible.</td><td>Security</td><td>low</td><td>S</td><td>open</td></tr>
<tr><td>FE-065</td><td>CORS errors not recognizable: no specific error handling for CORS preflight failures; user only sees a generic network error without CORS configuration hint.</td><td>UX</td><td>low</td><td>S</td><td>open</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-066</td><td>filterObjectIds.ts: merge 12 sequential .filter() calls (each O(n)) into a single pass → O(n) instead of O(12n) for large object sets.</td><td>Performance</td><td>medium</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-067</td><td>ContextMenu: array index as React `key` instead of stable label-based ID — causes incorrect DOM reuse in dynamically generated menus.</td><td>Performance</td><td>low</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-068</td><td>StateList column resize: `localStorage.setItem` called on every `mousemove` event (~60/s) — debounce writes to 500ms.</td><td>Performance</td><td>medium</td><td>S</td><td>done</td></tr>
<tr style="background-color:#1a3a1f"><td>FE-069</td><td>Modals (ValueEditModal, ObjectEditModal et al.): `onClose` reference as dependency in escape keydown effect causes unnecessary listener re-registration on every render.</td><td>Performance</td><td>low</td><td>S</td><td>done</td></tr>
<tr><td>FE-070</td><td>Implement auth for the explorer itself: login screen or HTTP Basic Auth before accessing the app.</td><td>Security</td><td>medium</td><td>L</td><td>open</td></tr>
<tr><td>FE-071</td><td>Implement auth for the REST API: authentication for requests to the ioBroker REST API (e.g. API key, Basic Auth or token).</td><td>Security</td><td>medium</td><td>M</td><td>open</td></tr>
</tbody>
</table>

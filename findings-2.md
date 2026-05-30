# Project Audit — iobroker-object-explorer

> **Audit date:** 2026-05-30  
> **Scope:** Full source audit — Security, Performance, Architecture, Code Quality, Testing, DevOps, Accessibility  
> **Auditor:** Automated enterprise audit (Claude Sonnet 4.6)

---

## Findings Table

| ID | Status | Kategorie | Priorität | Bereich | Datei/Pfad | Problem | Technische Auswirkung | Empfehlung | Aufwand | Risiko |
|----|--------|-----------|-----------|---------|------------|---------|----------------------|------------|---------|--------|
| F-001 | **Fixed** | Security | CRITICAL | Code Execution | `src/components/ObjectEditModal.tsx:554,562` | ~~`new Function('val', userInput)` executes user-typed alias formulas verbatim.~~ | ~~Arbitrary JS execution in browser context.~~ | ✅ **CLOSED** (2026-05-30): `new Function()` replaced with `expr-eval` `Parser`. `assignment: false`, `in: false`. No access to `window`/`document`/`fetch`/`localStorage`. Formulas with JS builtins (`Math.round` etc.) show parse error in tester — executed correctly server-side by ioBroker. Added `src/types/expr-eval.d.ts`. | M | Security |
| F-002 | **Fixed** | Security | CRITICAL | Dependency | `package.json` | ~~`@tanstack/react-query` is listed under `devDependencies`, not `dependencies`.~~ | ~~Production Docker build fails with `Cannot find module`.~~ | ✅ **CLOSED** (2026-05-30): Moved to `dependencies`. `npm ci --omit=dev` now resolves the package correctly. | S | Stability |
| F-003 | **Open** | Security | HIGH | Secret Exposure | `docker-compose.yml:8`, `.env.local.example:3` | Real internal IP `10.4.0.33` committed to repository in both files. | Internal network topology exposed in public/shared repo. Combined with vite.config.ts hostname leak, reveals production infrastructure layout. | Replace with placeholder `YOUR_IOBROKER_IP` in both files. | S | Security |
| F-004 | **Fixed** | Security | HIGH | Secret Exposure | `vite.config.ts:34` | ~~Personal FQDN `iobroker-object-explorer.birkenweg.walk-steinweiler.de` hardcoded in `allowedHosts` fallback array.~~ | ~~Personal domain name/infrastructure committed to source.~~ | ✅ **CLOSED** (2026-05-30): Moved to `VITE_ALLOWED_HOSTS` env var. Hardcoded fallback removed from `vite.config.ts`. `.env.local.example` uses placeholder `your-domain.example.com`. `.env.local` is gitignored. | S | Security |
| F-005 | **Open** | Security | HIGH | Injection | `docker/entrypoint.sh:7-9` | `printf '{"ioBrokerHost":"%s:%s"}' "$IOBROKER_HOST" "$IOBROKER_PORT"` — no JSON-escaping of env values. | Crafted `IOBROKER_HOST=","evil":"injected"` produces invalid/poisoned `config.js` loaded as `<script>` in `index.html`. | Use `jq -n --arg h "$IOBROKER_HOST" --arg p "$IOBROKER_PORT" '{"ioBrokerHost":($h+":"+$p)}'` | S | Security |
| F-006 | **Open** | Security | HIGH | XSS | `src/components/ImportDatapointsModal.tsx:21-92,123` | `highlightJson()` builds HTML via string concatenation with unescaped JSON key/value content. DOMPurify is applied at line 92 as last defense, but the function itself is not safe. | If DOMPurify is ever skipped, removed, or misconfigured, raw HTML injection occurs. Architecture is inherently fragile. | Replace with React-rendered tokenizer (spans per token type) like `ObjectEditModal` uses. Eliminates `dangerouslySetInnerHTML` entirely. | M | Security |
| F-007 | **Open** | Security | HIGH | SSRF / Open Redirect | `src/api/iobroker.ts:10-11` | `getBaseUrl()` reads `localStorage.getItem('ioBrokerHost')` with no validation and constructs `http://${host}/v1`. | XSS (via F-006 or future vector) can overwrite `ioBrokerHost` to point at any internal IP. All API calls become SSRF. Valid values could also include path traversal (`host/../../../etc`). | Validate with `/^[\w.-]+(:\d{1,5})?$/` before use. Reject and clear if invalid. | S | Security |
| F-008 | **Open** | Security | MEDIUM | Missing CSP | `nginx.conf` | No `Content-Security-Policy` header. Only X-Frame-Options, X-Content-Type-Options, Referrer-Policy. | Without CSP, XSS payloads can load external scripts, exfiltrate data via `fetch`, or inject frames. Reduces blast radius of F-001 and F-006. | Add `Content-Security-Policy: default-src 'self'; script-src 'self'; connect-src 'self' http:; style-src 'self' 'unsafe-inline';` | S | Security |
| F-009 | **Fixed** | Performance | HIGH | N+1 Requests | `src/api/iobroker.ts:138-158` | `getStatesBatch()` sends one `GET /v1/state/{id}` per item. At pageSize=50 (default) = 50 simultaneous requests every 30s. At pageSize=200 = 200 simultaneous requests every 30s. | Saturates browser HTTP/1.1 connection pool (6 concurrent per host). On slow network or large pages causes cascading timeouts. ioBroker REST API has bulk state endpoint `/v1/states?ids=a,b,c`. | Use bulk endpoint: `GET /v1/states?ids=${ids.join(',')}` — one request for all. Fallback to individual if bulk not available. | M | Performance |
| F-010 | **Fixed** | Performance | HIGH | Unbounded Concurrency | `src/api/iobroker.ts:283-285` | `deleteObjectsMany` uses `Promise.all(ids.map(...))` — no concurrency limit. | Deleting 200+ objects sends 200+ simultaneous DELETE requests. Server-side rate limits or connection exhaustion likely. Browser can freeze. | Use `p-limit` or manual batched Promise.all with 5-10 concurrent ops. | S | Performance |
| F-011 | **Open** | Architecture | HIGH | God Component | `src/components/StateList.tsx` | 1695 lines, 81 hook invocations (useState + useEffect + useCallback + useMemo). Owns: toolbar, column picker, virtualization, sort/filter, pagination, batch edit, context menu, export, row rendering, all modal state for create/copy/rename/move/delete. | Impossible to test in isolation. Any change risks regressions across all features. Long compile times for this file. New developers cannot understand the component without reading 1700 lines. | Extract: `StateListToolbar`, `StateListPagination`, `StateListBatchBar` as separate components. Move modal state to `SelectionContext`. | XL | Maintainability |
| F-012 | **Fixed** | Architecture | HIGH | Context Value Re-renders | `src/context/SelectionContext.tsx:39-46` | `value` object is created inline on every render (`const value: SelectionContextValue = { ... }`). No `useMemo`. 7 independent `useState` hooks in provider. | Any state change in `SelectionContextProvider` (e.g. `setHistoryModalId`) recreates `value` object reference → all `useSelectionContext()` consumers re-render, including `StateList`, `StateTree`, `App`. | Wrap `value` in `useMemo` with all state values as deps. Or split context into read/write contexts. | S | Performance |
| F-013 | **Open** | Architecture | MEDIUM | Duplicate Modal Wiring | `src/App.tsx:502-564` + `src/components/StateList.tsx` | Both App.tsx and StateList.tsx import and conditionally render `ObjectEditModal`, `HistoryModal`, `CreateAliasModal`, `CopyDatapointModal`, `RenameDatapointModal`, `MoveDatapointModal`. | Two parallel modal systems. State in StateList opens its copy; state in SelectionContext opens App's copy. Behavior is non-obvious. Bugs manifest in one path but not the other. | Consolidate all modals into App.tsx via SelectionContext. StateList only sets context state; never renders modals directly. | L | Maintainability |
| F-014 | **Open** | Architecture | MEDIUM | Error Boundary Silences Errors | `src/App.tsx:502` | `<ErrorBoundary fallback={null} onError={(e) => console.error('Modal error:', e)}>` — modal errors produce blank UI with only a console log. | Users see nothing when a modal crashes. No error state, no retry option, no message. Developers see only a console.log, which is suppressed in production. | Use a proper `FallbackComponent` that shows an error message and close button. Use `onError` with a real logging mechanism. | S | Stability |
| F-015 | **Open** | Architecture | MEDIUM | Page Number Persisted | `src/context/FilterContext.tsx:156,194-201` | `page` is included in the `LS_FILTER_STATE` localStorage snapshot persisted on every filter change. | User reloads app, resumes on page 7. After changing search pattern, page may be out of bounds for new result set. Results in empty table with no obvious cause. | Exclude `page` from persisted state. Reset `page` to 0 on pattern/filter change (already partially done but persistence overrides it). | S | Stability |
| F-016 | **Open** | Code Quality | MEDIUM | Substring Match Bug | `src/api/iobroker.ts:515` | `sources.includes(id)` — `sources` is the full concatenated script text. `id = "sql.0"` matches inside `"sql.0.data.temperature"`, `"sql.0.info.connection"`, etc. | `useScriptUsedIds` reports false positives. Objects appear as "used in scripts" when they're not. Misleads users in script-usage column. | Use word-boundary regex: `new RegExp('\\b' + escapeRegex(id) + '\\b').test(sources)` | S | Maintainability |
| F-017 | **Open** | Code Quality | MEDIUM | `any` in HistoryChart | `src/components/HistoryChart.tsx:332,340,353` | Three Recharts callback parameters typed as `any`: `handlePanStart(state: any)`, `handlePanMove(state: any)`, `handleChartClick(state: any)`. | Loses type safety for Recharts event payloads. Errors in payload access (wrong property names) not caught at compile time. | Use Recharts type `CategoricalChartState` from `recharts/types/chart/generateCategoricalChart`. | S | DX |
| F-018 | **Open** | Architecture | MEDIUM | QueryClient at Module Level | `src/App.tsx:30-32` | `const queryClient = new QueryClient(...)` declared at module top level, outside React tree. | On HMR hot-reload during dev, module re-executes and creates new `QueryClient` instance, dropping all cached query data. Causes unnecessary API refetches during development. | Move `QueryClient` creation inside `App` function, memoized with `useRef` or `useMemo`. | S | DX |
| F-019 | **Fixed** | Performance | MEDIUM | Recharts Bundle | `package.json` | `recharts@^3.8.1` imported wholesale. Recharts is ~400kb minified. No dynamic import, no code splitting. | Recharts loads on initial page load even when user never opens HistoryModal. Increases initial bundle and TTI. | Dynamic import: `const HistoryModal = React.lazy(() => import('./components/HistoryModal'))` | S | Performance |
| F-020 | **Open** | Testing | HIGH | No Component Tests | `src/` | Zero tests for React components, hooks, or context. Only pure-function unit tests (`stateListUtils.test.ts`, `format.test.ts`, `i18n.test.ts`, `iobroker.test.ts`). No `@testing-library/react` tests actually used. | Cannot safely refactor god components (F-011, F-013). Mutations (`useSetState`, `useUpdateObject`) have no test coverage. Optimistic update + rollback logic untested. | Add component tests for: `ObjectEditModal` (alias formula validation), `useSetState` optimistic update rollback, `SelectionContext` state transitions. | L | Stability |
| F-021 | **Open** | Testing | MEDIUM | No E2E Tests | `/` | No Playwright or Cypress config. No `package.json` scripts for E2E. | Core user flows (search → click row → edit → save) have no automated coverage. Regressions only caught manually. | Add Playwright. Cover: search, row click → modal open, value edit → optimistic update, filter persistence. | L | Stability |
| F-022 | **Open** | DevOps | HIGH | No CI/CD | `/` | No `.github/workflows/`, no CI config of any kind. | No automated lint, type check, or test run on push/PR. F-002 (missing dependency) and TypeScript errors can reach `main` undetected. | Add GitHub Actions: `npm run lint && npx tsc --noEmit && npm test` on push and PRs. | S | Stability |
| F-023 | **Open** | DevOps | MEDIUM | Docker Runs as Root | `Dockerfile` | `nginx:alpine` base image runs nginx as root by default. No `USER` directive added. | Container runs as UID 0. Any nginx vulnerability or path traversal runs with root privileges inside container. | Add `RUN addgroup -S appgroup && adduser -S appuser -G appgroup` and configure nginx to bind to port 8080 as non-root. | M | Security |
| F-024 | **Open** | DevOps | MEDIUM | No HEALTHCHECK | `Dockerfile` | No `HEALTHCHECK` instruction in Dockerfile. | Container orchestrators (Compose, Kubernetes) cannot detect when nginx is alive but serving 500s or config.js is malformed. Container stays "healthy" indefinitely. | Add `HEALTHCHECK --interval=30s --timeout=5s CMD wget -q -O/dev/null http://localhost/ \|\| exit 1` | S | Stability |
| F-025 | **Open** | DevOps | LOW | `config.js` Cache | `nginx.conf` | No `Cache-Control` for `/config.js`. Nginx default may cache it. | Browser caches runtime config. After changing `IOBROKER_HOST` env var and redeploying, old host persists until cache expires. | Add `location = /config.js { add_header Cache-Control "no-store"; }` | S | Stability |
| F-026 | **Open** | Accessibility | HIGH | No ARIA on Table | `src/components/StateList.tsx` | Main data table has no `role="grid"`, no `aria-sort` on sortable column headers, no `aria-label` on table. Only 2 `aria-*` attributes in entire 1695-line file. | WCAG 2.1 Level AA violation. Screen readers announce table as generic div. Sort state invisible to AT. | Add `role="grid"` to table wrapper, `aria-sort="ascending|descending|none"` to `<SortHeader>`, `aria-label="ioBroker objects"` to table. | M | Stability |
| F-027 | **Open** | Accessibility | MEDIUM | Icon Buttons Without Labels | `src/components/StateList.tsx`, `src/components/Layout.tsx` | Icon-only buttons (Expert Mode toggle, Group View, Maximize, Reset columns, theme toggle) have only `title` attributes. `title` is not reliably announced by screen readers. | Keyboard-only users and screen reader users cannot identify button purpose. WCAG 2.1 SC 4.1.2 violation. | Replace `title` with `aria-label` (or add both). | S | Stability |
| F-028 | **Open** | Accessibility | MEDIUM | No Skip Navigation | `src/components/Layout.tsx` | No skip-nav link (`<a href="#main-content">Skip to main content</a>`). Sidebar and toolbar render before main table. | Keyboard users must tab through entire sidebar tree (potentially hundreds of nodes) before reaching the main table on every page load. | Add visually-hidden skip link as first element in Layout. Add `id="main-content"` to main table wrapper. | S | Stability |
| F-029 | **Open** | Accessibility | LOW | Missing `lang` Attribute | `src/utils/i18n.ts`, `index.html` | `index.html` has `<html lang="en">` hardcoded. Language toggle (EN/DE) never updates `document.documentElement.lang`. | Screen readers use `lang` to select TTS voice/pronunciation. German content announced with English pronunciation when user switches to DE. | Add `document.documentElement.lang = language` in language toggle handler. | S | Stability |
| F-030 | **Fixed** | Architecture | MEDIUM | FilterContext Value Not Memoized | `src/context/FilterContext.tsx:362-379` | `value` object in `FilterContextProvider` is reconstructed every render. 382-line context with 16 useCallback/useMemo calls but the final `value` object is inline. | All `useFilterContext()` consumers re-render on any FilterContext state change, even unrelated ones (e.g. `danglingAliasFilter` change triggers re-render in `SearchBar`). | Wrap entire `value` with `useMemo`. | S | Performance |
| F-031 | **Open** | Code Quality | LOW | Dead Function in FilterContext | `src/context/FilterContext.tsx:355-361` | `handleCreateDatapointAtPath` is a `useCallback` that calls `setNewDatapointInitialId(prefix)` and `setSelectedId(null)` — but `newDatapointInitialId` is managed by `SelectionContext`, not `FilterContext`. The setter comes from... nowhere visible. Likely a noop. | Dead code that confuses readers. `newDatapointInitialId` is a `SelectionContext` value, not FilterContext. This callback does nothing observable. | Verify callers; if no callers, remove entirely. If callers exist, they should use `SelectionContext` directly. | S | Maintainability |
| F-032 | **Open** | Security | LOW | `onSuccess` Deprecated Pattern | `src/hooks/useStates.ts:128,132,136` | `useMutation` uses `onSuccess` in mutation options. TanStack Query v5 deprecated per-mutation-option callbacks — they still work but show deprecation warnings and will be removed in v6. | Will break on TanStack Query v6 upgrade. Silent in production. | Move `queryClient.invalidateQueries(...)` to `onSettled` or use `onSuccess` at `useMutation` call site level instead of mutation config. | S | DX |
| F-033 | **Fixed** | Performance | LOW | Manual Virtualization | `src/components/StateList.tsx:954-967` | Custom scroll-based virtualization using `Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT)`. Assumes fixed row height. | Any row with multi-line content or dynamic height breaks scroll position calculations. Edge cases at page boundaries cause jitter. `@tanstack/react-virtual` handles these correctly with measured heights. | Replace with `@tanstack/react-virtual` (already have TanStack in deps). Lower maintenance burden. | M | Maintainability |
| F-034 | **Open** | Performance | LOW | `staleTime: Infinity` on Object List | `src/hooks/useStates.ts:52,60` | `useAllObjects` / `useFilteredObjects` use `staleTime: Infinity`. Objects are invalidated only via explicit mutations. | If external tool modifies ioBroker objects (admin UI, scripts, another user), the app never sees changes until page reload. No background sync. Acceptable for single-user but documented assumption missing. | Either document the assumption clearly, or add a long `refetchInterval` (e.g. `5 * 60 * 1000`) as background sync. | S | Maintainability |

---

## Executive Summary

Dieses Projekt ist ein funktionsfähiges internes Tool mit solider Grundarchitektur (React Query, TypeScript strict mode, Error Boundaries), aber mehreren kritischen und hochpriorisierten Problemen, die vor einer öffentlichen oder Multi-User-Nutzung behoben werden müssen.

**Kritischste Befunde:**
- `new Function()` auf Benutzereingaben ist eine direkte Remote-Code-Execution-Schwachstelle (F-001).
- `@tanstack/react-query` in `devDependencies` macht Production-Builds broken (F-002).
- Reale IP-Adressen und persönliche Domain im Repository (F-003, F-004).

Die Codequalität zeigt klare Zeichen von Feature-Akkumulation ohne Refactoring-Phasen: `StateList.tsx` mit 1695 Zeilen und 81 Hook-Aufrufen ist das deutlichste Symptom. Performance-kritisch ist die N+1-Request-Strategie für State-Werte (50 parallele HTTP-Requests alle 30 Sekunden).

Testing-Abdeckung ist minimal — ausschließlich pure-function unit tests, keine Komponenten- oder Integrationstests.

---

## Top 10 Critical Findings

1. ~~**F-001 — `new Function()` Code Execution**~~ ✅ **FIXED**: `new Function()` durch `expr-eval` `Parser` ersetzt. Assignment und `in`-Operator deaktiviert. Kein Zugriff auf Browser-APIs.

2. ~~**F-002 — React Query in devDependencies**~~ ✅ **FIXED**: `@tanstack/react-query` nach `dependencies` verschoben.

3. **F-003 / F-004 — Infrastruktur-Daten im Repo**: Interne IP `10.4.0.33` in `docker-compose.yml` und `.env.local.example`, persönliche Domain in `vite.config.ts` committed. Minimale Info-Leaks, aber Reparatur dauert 2 Minuten.

4. **F-005 — JSON-Injection im Docker Entrypoint**: `printf` ohne JSON-Escaping in `entrypoint.sh` ermöglicht Injection in `config.js`-Script-Tag via manipuliertem `IOBROKER_HOST`.

5. **F-006 — `dangerouslySetInnerHTML` in ImportDatapointsModal**: String-konkateniertes HTML mit DOMPurify als einziger Defense. Sollte als React-Tokenizer reimplementiert werden.

6. **F-007 — SSRF via unvalidiertem localStorage-Host**: `getBaseUrl()` konstruiert HTTP-URLs aus unvalidierten localStorage-Daten. XSS kann Ziel-Host umleiten.

7. **F-009 — 50 parallele HTTP-Requests pro Poll-Intervall**: Kein Bulk-State-Endpoint genutzt. Bei pageSize=200 = 200 simultane GET-Requests alle 30 Sekunden.

8. **F-011 — StateList God Component (1695 Zeilen)**: Unmöglich zu testen, zu warten oder neue Features hinzuzufügen ohne Regressionsrisiko für alle anderen Features.

9. **F-022 — Kein CI/CD**: Keine automatisierten Checks auf Push/PR. F-002 (missing dep) und TypeScript-Fehler können unbemerkt in `main` landen.

10. **F-020 — Keine Komponenten- oder Integrationstests**: Nur pure-function tests. Core flows (Mutation, Optimistic Update, Modal-Lifecycle) sind nicht abgedeckt.

---

## Quick Wins

Folgende Findings sind in unter 2 Stunden behebbar (Aufwand S):

| ID | Fix |
|----|-----|
| F-002 | `@tanstack/react-query` von `devDependencies` nach `dependencies` verschieben |
| F-003 | `docker-compose.yml:8` und `.env.local.example:3`: IP durch `YOUR_IOBROKER_IP` ersetzen |
| F-004 | Persönliche Domain aus `vite.config.ts:34` entfernen, via Env-Var steuern |
| F-005 | `entrypoint.sh`: `printf` durch `jq`-basiertes JSON-Building ersetzen |
| F-008 | CSP-Header in `nginx.conf` hinzufügen |
| F-007 | Regex-Validierung für `localStorage`-Host in `getBaseUrl()` |
| F-010 | Concurrency-Limit (5-10) für `deleteObjectsMany` |
| F-015 | `page` aus persistiertem FilterContext-State ausschließen |
| F-016 | `sources.includes(id)` → Regex word-boundary check |
| F-024 | `HEALTHCHECK` in Dockerfile |
| F-025 | `Cache-Control: no-store` für `/config.js` in nginx.conf |
| F-027 | `title` → `aria-label` auf Icon-only-Buttons |
| F-029 | `document.documentElement.lang = language` im Language-Toggle |
| F-032 | `onSuccess` → `onSettled` in Mutation-Configs |

---

## Architektur-Risiken

**StateList God Component (F-011)** ist das größte strukturelle Risiko. Mit 1695 Zeilen und 81 Hook-Aufrufen ist jede Änderung mit hohem Regressionsrisiko behaftet. Solange hier kein Test-Baseline existiert (F-020), ist Refactoring gefährlich. Empfehlung: Zuerst Tests aufbauen, dann extrahieren.

**Duplizierte Modal-Verdrahtung (F-013)**: Zwei parallele Modal-Systeme (App.tsx + StateList.tsx) bedeuten, dass bugs in einem Pfad den anderen nicht betreffen — was korrekte Fixes verdeckt und inkonsistentes Verhalten erzeugt.

**Context ohne Memoization (F-012, F-030)**: `SelectionContext` und `FilterContext` erstellen Value-Objekte inline. Jede State-Änderung in diesen Contexts triggert Re-Renders in allen Konsumenten, einschließlich `StateList` (1695 Zeilen). Bei großen Datensätzen messbar.

---

## Security-Risiken

| Priorität | ID | Beschreibung |
|-----------|----|----|
| CRITICAL | F-001 | `new Function()` — beliebige Code-Ausführung |
| HIGH | F-005 | JSON-Injection in Docker entrypoint |
| HIGH | F-006 | `dangerouslySetInnerHTML` mit fragiler DOMPurify-Abhängigkeit |
| HIGH | F-007 | SSRF via unvalidiertem localStorage-Host |
| HIGH | F-003/F-004 | Interne IP und persönliche Domain im Repository |
| MEDIUM | F-008 | Fehlender Content-Security-Policy Header |
| MEDIUM | F-023 | Docker-Container läuft als root |

---

## Performance-Risiken

| Priorität | ID | Beschreibung |
|-----------|----|----|
| HIGH | F-009 | 50 parallele HTTP-Requests pro State-Poll (alle 30s) |
| HIGH | F-010 | Unbegrenzte Parallelität bei Massen-DELETE |
| MEDIUM | F-019 | Recharts (~400kb) immer geladen, kein Lazy Loading |
| MEDIUM | F-012 | SelectionContext Value ohne useMemo → unnötige Re-Renders |
| MEDIUM | F-030 | FilterContext Value ohne useMemo → unnötige Re-Renders |
| LOW | F-033 | Custom Virtualization statt battle-tested @tanstack/react-virtual |

---

## Empfohlene Roadmap

### Sofortmaßnahmen (heute)

1. **F-002**: `@tanstack/react-query` nach `dependencies` — Production ist sonst broken
2. **F-001**: `new Function()` durch `expr-eval` ersetzen — aktive Sicherheitslücke
3. **F-003 / F-004**: Echte IPs/Domains aus Repository entfernen
4. **F-005**: `entrypoint.sh` JSON-Escaping mit `jq`
5. **F-007**: Regex-Validierung in `getBaseUrl()`
6. **F-015**: `page` aus localStorage-Persistenz entfernen

### Kurzfristig (diese Woche)

7. **F-022**: GitHub Actions CI — lint + tsc + test auf jedem Push
8. **F-008**: CSP-Header in nginx.conf
9. **F-010**: Concurrency-Limit für `deleteObjectsMany`
10. **F-009**: Bulk-State-Endpoint nutzen (falls REST API unterstützt)
11. **F-012**: `SelectionContext` value in `useMemo`
12. **F-030**: `FilterContext` value in `useMemo`
13. **F-016**: Word-boundary Regex für Script-ID-Matching
14. **F-024 / F-025**: Dockerfile HEALTHCHECK + config.js Cache-Control
15. **F-027 / F-029**: aria-label + document.lang — schnelle Accessibility-Fixes

### Mittelfristig (dieses Quartal)

16. **F-020**: Komponenten-Tests aufbauen — Fokus auf `useSetState` Optimistic Update, `ObjectEditModal` Alias-Validierung
17. **F-011**: StateList aufteilen — `StateListToolbar`, `StateListBatchBar`, `StateListPagination` extrahieren
18. **F-013**: Modal-Duplizierung auflösen — alle Modals in App.tsx via SelectionContext
19. **F-006**: `dangerouslySetInnerHTML` in `ImportDatapointsModal` durch React-Tokenizer ersetzen
20. **F-023**: Docker non-root User konfigurieren
21. **F-019**: `HistoryModal` lazy-loaden via `React.lazy`
22. **F-026**: `StateTree`/`StateList` Keyboard-Navigation verbessern

### Langfristig (6+ Monate)

23. **F-021**: E2E-Tests mit Playwright für kritische User-Flows
24. **F-033**: Custom Virtualization durch `@tanstack/react-virtual` ersetzen
25. **F-034**: `staleTime: Infinity` dokumentieren oder Background-Sync ergänzen
26. **F-018**: `QueryClient` aus Modul-Level in React-Tree verschieben
27. Architektur-Review: Single-Context-Split (separate Read/Write Contexts für SelectionContext und FilterContext) für bessere Render-Isolation

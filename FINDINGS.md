# Technical Audit Report — ioBroker Object Explorer

**Datum:** 2026-05-21 (aktualisiert 2026-05-30)  
**Auditoren:** Senior React Architect / Security Engineer; Claude Sonnet 4.6  
**Scope:** Vollständiger Quellcode-Review (`src/`, `Dockerfile`, `nginx.conf`, `package.json`, `docker/entrypoint.sh`)  
**Methode:** Statische Code-Analyse, Dependency-Audit, Architektur-Review

> Zusammengeführt aus `findings.md` (Audit 2026-05-21/29) und `findings-2.md` (Audit 2026-05-30).  
> Duplikate: F-10/F-002, F-21/F-005, F-26/F-004, F-11/F-011, F-07/F-006, F-27/F-027 → jeweils zu einem Eintrag zusammengeführt.

---

## Findings

| ID | Status | Kategorie | Priorität | Bereich | Datei/Pfad | Problem | Technische Auswirkung | Empfehlung | Aufwand | Risiko |
|----|--------|-----------|-----------|---------|------------|---------|----------------------|------------|---------|--------|
| F-01 | **Partial** | Testing | MEDIUM | Testing | `src/**/*.test.ts` | Vitest 2.x + jsdom 24 eingeführt. 101 Tests in 5 Dateien: `format.test.ts`, `i18n.test.ts`, `stateListUtils.test.ts`, `iobroker.test.ts`, `UIContext.test.ts`. Noch offen: Komponenten-Tests (RTL) + Fetch-Mock-Tests für Mutations (`deleteObject`, `putFullObject`, `importDatapoints`). | Sicherheitsnetz für pure Functions vorhanden. Mutations, Optimistic-Update-Rollbacks und Modal-Lifecycle ungetestet. | Phase 2: RTL-Komponenten-Tests + Fetch-Mock für Mutations (→ F-45). | M | Stability |
| F-02 | **Fixed** | Codequalität / Bug | ~~CRITICAL~~ | State Management | `src/components/SettingsModal.tsx:146` | `includeScripts: settingsDraft.includeScripts` in `saveSettings()` ergänzt. Feld wird korrekt persistiert. | — | — | — | — |
| F-03 | **Fixed** | Architektur | ~~CRITICAL~~ | React-Architektur | `src/App.tsx`, `src/context/` | App.tsx auf 638 Zeilen reduziert. `FilterContext`, `SelectionContext`, `UIContext` extrahiert. `StateList` und `StateTree` mit `React.memo` abgesichert. | Cascading Re-Renders vollständig mitigiert. | — | — | — |
| F-04 | **Fixed** | Performance | ~~CRITICAL~~ | API / Netzwerk | `src/api/iobroker.ts` | `getAllObjects()` nutzt 2 parallele Requests (`/objects` + `/objects?type=enum`). Von 5 auf 2 Calls reduziert. | Netzwerklast reduziert, Race Condition beim Merge eliminiert. | — | — | — |
| F-05 | **Fixed** | Performance | ~~CRITICAL~~ | Rendering | `src/context/UIContext.tsx:41,95` | `pageSize`-Default und Fallback von 1000 auf 200 gesenkt (commit `73cecef`). Virtualisierung greift ab 120 Items. | Render-Blockierung bei Erstinstallation eliminiert. | — | — | — |
| F-06 | **Fixed** | Security | ~~HIGH~~ | XSS | `src/components/StateList.tsx` | URL-Role href via `URL`-Parser sanitized (commit `da7b9fa`): nur `http:`/`https:` werden als Link gerendert, `data:` und `javascript:` fallen auf Textdarstellung zurück. | XSS-Vektor eliminiert. | — | — | — |
| F-07 | **Partial** | Security | HIGH | XSS | `src/components/ImportDatapointsModal.tsx:21-92,123` | `DOMPurify.sanitize()` vor `dangerouslySetInnerHTML` ergänzt (commit `f2032af`). Jedoch: `highlightJson()` baut HTML via String-Konkatenation mit unescaptem Inhalt — DOMPurify ist einzige Defense. Falls DOMPurify entfernt, übersprungen oder fehlkonfiguriert: direkte HTML-Injection. | XSS bei bösartigem JSON-Import abgeschwächt, aber Architektur bleibt fragil. | React-Tokenizer statt `dangerouslySetInnerHTML` implementieren (Spans per Token-Typ, wie ObjectEditModal). | M | Security |
| F-08 | **Fixed** | Security | ~~HIGH~~ | Dependency | `package.json` | `npm audit fix` + recharts 3.8.1 (commit `7f396f8`): flatted, rollup, minimatch, picomatch behoben. Verbleibend: 2 moderate in esbuild/vite (nur Build-Tool). | Alle 4 HIGH-Vulnerabilities eliminiert. | — | — | — |
| F-09 | **Fixed** | Security | ~~HIGH~~ | Misconfiguration | `nginx.conf` | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` ergänzt (commit `c3a43a6`). | Clickjacking-Schutz aktiv. | — | — | — |
| F-10 | **Fixed** | Architektur | ~~HIGH~~ | Dependencies | `package.json` | `@tanstack/react-query` nach `dependencies` verschoben. Production-Docker-Build (`npm ci --omit=dev`) schlug ohne diesen Fix fehl. | Produktions-Build stabil. | — | — | — |
| F-11 | **Partial** | Architektur | HIGH | React-Architektur | `src/components/statelist/StateList.tsx` | StateList.tsx von 3187 auf 1532 Zeilen reduziert. 16+ neue Dateien extrahiert: `cells/` (8 Editable*-Komponenten), `StateRow.tsx`, `BatchComboControl.tsx`, `StateListToolbar.tsx`, `TsRangeFilterControl.tsx`, `ColPicker.tsx`, `StyledCheckbox.tsx`, `SortHeader.tsx`, `TypeIcon.tsx`, `stateListConstants.ts`, `stateListUtils.ts`. Dennoch: 1532 Zeilen. Pagination, BatchBar noch im Monolith. | IDE-Performance und Wartbarkeit verbessert. Testbarkeit und Refactoring-Risiko bleiben hoch. | `StateListPagination`, `StateListBatchBar` als separate Komponenten extrahieren. Modal-State in `SelectionContext` verschieben. | L | Maintainability |
| F-12 | **Fixed** | Architektur | ~~HIGH~~ | React-Architektur | `src/App.tsx` | `react-error-boundary` installiert. `AppErrorFallback` mit Reload-Button auf App-Ebene; `fallback=null`-Boundary um alle Modals isoliert Modal-Crashes. | App-Crash durch Fehler-Recovery ersetzt. | — | — | — |
| F-13 | **Fixed** | Performance | ~~HIGH~~ | API / Hauptthread | `src/api/iobroker.ts` | O(n×m)-Script-Suche in 200-ID-Batches aufgeteilt; `setTimeout(r,0)` yieldet zwischen Batches (commit `db716e5`). | Tab-Freeze verhindert. | — | — | — |
| F-14 | **Fixed** | Codequalität | ~~MEDIUM~~ | Code Duplication | `src/utils/format.ts` | `formatTimestamp`/`formatValue` → `src/utils/format.ts` extrahiert. `hasSmartName`-Kopie in StateList entfernt, Import aus `api/iobroker.ts`. ObjectEditModal nutzt jetzt `dateFormat`-Prop für Zeitstempel. | Duplikation vollständig beseitigt. | — | — | — |
| F-15 | **Fixed** | Codequalität | ~~MEDIUM~~ | Dead Code | `src/api/iobroker.ts` | `isDisplayable()` entfernt. Alle 5 Aufrufe durch direkte `!!obj`/`!obj`-Checks ersetzt. | Dead Code eliminiert. | — | — | — |
| F-16 | **Fixed** | Codequalität | ~~MEDIUM~~ | Architecture | `src/api/iobroker.ts` | Module-level `objectsCache` und `clearObjectsCache()` entfernt. `getAllObjects()` ist jetzt purer Fetch. React Query (`staleTime: Infinity`) ist einziger Cache. | Race Condition zwischen zwei Caches eliminiert. | — | — | — |
| F-17 | **Mitigiert** | Security | INFO | Transport | `src/api/iobroker.ts:5–11` | HTTPS-Zugriff via Reverse Proxy funktioniert korrekt (commit `95fcf56`). Direktverbindungen über HTTP bleiben unverschlüsselt (im lokalen Netz akzeptabel). | Mixed Content behoben. | HTTPS-Termination per nginx für Remote-Zugriff (Architektur bereits vorbereitet). | — | Security |
| F-18 | **Fixed** | Codequalität | ~~MEDIUM~~ | TypeScript | `src/types/iobroker.ts` | `source?` und `engineType?` zu `IoBrokerObjectCommon` ergänzt. Alle `as unknown as Record<string, unknown>`-Casts entfernt. | Volle TypeScript-Sicherheit für Script-Properties. | — | — | — |
| F-19 | **Fixed** | Performance | ~~MEDIUM~~ | React | `src/hooks/useStates.ts` | `gcTime: 60_000` gesetzt, IDs im Query-Key sortiert (commit `27b7c21`). Alte Seiten-Queries werden nach 60s entfernt. | Bis zu 10 simultane Polling-Queries eliminiert. | — | — | — |
| F-20 | **Fixed** | Architektur | ~~MEDIUM~~ | React-Architektur | `src/context/UIContext.tsx` | `normalizeQuickPattern`-Duplikat in SettingsModal entfernt, Export aus UIContext. | Duplikation beseitigt. | — | — | — |
| F-21 | **Fixed** | Build / Security | ~~MEDIUM~~ | Docker / Config | `docker/entrypoint.sh` | `IOBROKER_HOST` wird via `printf` mit expliziter JSON-Struktur serialisiert (commit `c5b1f17`). Heredoc-Injection nicht mehr möglich. | Shell-Injection eliminiert. | — | — | — |
| F-22 | **Fixed** | Codequalität | ~~MEDIUM~~ | React | `src/components/StateList.tsx` | `useEffect` + `setTimeout(fn, 0)` durch `useLayoutEffect` ohne Timeout ersetzt in allen 3 Editable-Cells. | Race Condition eliminiert. | — | — | — |
| F-23 | **Fixed** | Security | ~~MEDIUM~~ | Deprecated API | `src/utils/clipboard.ts` | `document.execCommand('copy')` aus clipboard.ts und beiden inline-Fallbacks in StateList entfernt (commit `dd1a9b6`). Nur `navigator.clipboard.writeText()` verwendet. | Deprecated API vollständig entfernt. | — | — | — |
| F-24 | **Fixed** | Performance | ~~MEDIUM~~ | Netzwerk | `src/api/iobroker.ts` | Alle 4 Enum-Mutations (`updateRoomMembership`, `updateFunctionMembership` + Batch-Varianten) nutzen jetzt `getAllObjects()` statt `fetchApi('/objects?type=enum')` (commit `62dab5b`). | Bis zu 200 API-Fetches bei Batch-Edit von 100 Objekten eliminiert. | — | — | — |
| F-25 | **Fixed** | Codequalität | ~~MEDIUM~~ | localStorage | `src/context/UIContext.tsx` | Legacy-Key `'iobroker-visible-cols'` entfernt. `LS_APP_SETTINGS` ist einzige Quelle. | Drei-Wege-State-Desynchronisation beseitigt. | — | — | — |
| F-26 | **Fixed** | Build / Security | ~~MEDIUM~~ | DevOps | `vite.config.ts` | `VITE_ALLOWED_HOSTS=host1,host2` in `.env` überschreibt hartcodierte Liste. Persönliche Domain aus `vite.config.ts` entfernt. `.env.local` ist gitignored. | DX für neue Deployment-Hosts + keine persönliche Domain im Repo. | — | — | — |
| F-27 | **Fixed** | Accessibility | ~~HIGH~~ | A11y | `src/components/StateList.tsx`, `src/components/Layout.tsx` | Icon-Only-Buttons (Expert Mode, Group View, Maximize, Reset Columns, Theme-Toggle) hatten nur `title`-Attribute. `aria-label` ergänzt bzw. `title` durch `aria-label` ersetzt. | WCAG 2.1 SC 4.1.2 erfüllt. Keyboard- und Screen-Reader-Nutzer können Buttons identifizieren. | — | — | — |
| F-28 | **Fixed** | Accessibility | ~~MEDIUM~~ | A11y | `src/components/StateList.tsx` | `AlertTriangle`-Icon bei `exceeded` und `warn` Threshold-Status ergänzt. `aria-label` auf DE/EN lokalisiert. WCAG 2.1 Kriterium 1.4.1 erfüllt. | Colorblind-Nutzer erkennen Status ohne Farbe. | — | — | — |
| F-29 | **Fixed** | Architektur | ~~LOW~~ | Codequalität | `src/utils/i18n.ts` | `getLocalizedName(raw, lang?)` und `getAllNamesForSearch(raw)` in `src/utils/i18n.ts` konsolidiert. Lokale Definitionen in `api/iobroker.ts` entfernt. | Klare Benennung, keine Verwechslungsgefahr mehr. | — | — | — |
| F-30 | **Fixed** | Build | ~~LOW~~ | DX | `vite.config.ts`, `src/components/Layout.tsx` | `__APP_VERSION__` aus `package.json` via Vite `define` eingebettet. Wird dezent als `vX.Y.Z` im Header angezeigt. | App-Version jederzeit sichtbar. | — | — | — |
| F-31 | **Fixed** | Security | ~~CRITICAL~~ | Code Execution | `src/components/ObjectEditModal.tsx:554,562` | `new Function('val', userInput)` führte Alias-Formeln direkt aus — beliebige JS-Ausführung im Browser-Kontext. Durch `expr-eval` `Parser` ersetzt: `assignment: false`, `in: false`, kein Zugriff auf `window`/`document`/`fetch`/`localStorage`. `src/types/expr-eval.d.ts` ergänzt. | Remote Code Execution eliminiert. | — | — | Security |
| F-32 | **Fixed** | Security | ~~HIGH~~ | Secret Exposure | `docker-compose.yml:8`, `.env.local.example:3` | Interne IP `10.4.0.33` in beiden Dateien committed. Durch Platzhalter `YOUR_IOBROKER_IP` ersetzt. | Interne Netzwerktopologie nicht mehr im Repo. | — | — | Security |
| F-33 | **Fixed** | Security | ~~HIGH~~ | SSRF / Open Redirect | `src/api/iobroker.ts:10-11` | `getBaseUrl()` las `localStorage.getItem('ioBrokerHost')` ohne Validierung und baute `http://${host}/v1`. XSS konnte Host auf interne IP umleiten. Regex-Validierung `/^[\w.-]+(:\d{1,5})?$/` ergänzt; ungültiger Wert wird verworfen und gecleart. | SSRF-Vektor eliminiert. | — | — | Security |
| F-34 | **Fixed** | Security | ~~MEDIUM~~ | Missing CSP | `nginx.conf` | Kein `Content-Security-Policy` Header. CSP `default-src 'self'; script-src 'self'; connect-src 'self' http:; style-src 'self' 'unsafe-inline'` ergänzt. | XSS-Blast-Radius reduziert; externe Script-Injektion blockiert. | — | — | Security |
| F-35 | **Fixed** | Performance | ~~HIGH~~ | N+1 Requests | `src/api/iobroker.ts:138-158` | `getStatesBatch()` sendete einen `GET /v1/state/{id}` pro Item. Bei pageSize=200: 200 simultane Requests alle 30 Sekunden. Bulk-State-Endpoint `/v1/states?ids=a,b,c` genutzt: ein Request für alle. | Browserverbindungspool-Sättigung eliminiert. | — | — | Performance |
| F-36 | **Fixed** | Performance | ~~HIGH~~ | Unbounded Concurrency | `src/api/iobroker.ts:283-285` | `deleteObjectsMany` nutzte `Promise.all(ids.map(...))` ohne Concurrency-Limit. 200+ simultane DELETE-Requests möglich. Concurrency auf 5–10 parallele Ops begrenzt. | Server-Überlastung und Browser-Freeze bei Massen-DELETE verhindert. | — | — | Performance |
| F-37 | **Fixed** | Architektur | ~~HIGH~~ | Context Re-renders | `src/context/SelectionContext.tsx:39-46` | `value`-Objekt inline erzeugt (kein `useMemo`). Jede State-Änderung (z.B. `setHistoryModalId`) triggerte Re-Renders aller Konsumenten inkl. `StateList`, `StateTree`, `App`. `useMemo` mit allen State-Werten als Deps ergänzt. | Unnötige Re-Renders eliminiert. | — | — | Performance |
| F-38 | **Open** | Architektur | MEDIUM | Duplicate Modal Wiring | `src/App.tsx:502-564` + `src/components/StateList.tsx` | `ObjectEditModal`, `HistoryModal`, `CreateAliasModal`, `CopyDatapointModal`, `RenameDatapointModal`, `MoveDatapointModal` in App.tsx UND StateList.tsx importiert und gerendert. Zwei parallele Modal-Systeme. | Bugs manifestieren sich in einem Pfad aber nicht dem anderen. Inkonsistentes Verhalten. Fixes können in einem System versteckt sein. | Alle Modals in App.tsx via SelectionContext konsolidieren. StateList setzt nur Context-State, rendert nie Modals direkt. | L | Maintainability |
| F-39 | **Open** | Architektur | MEDIUM | Error Boundary Silences | `src/App.tsx:502` | `<ErrorBoundary fallback={null} onError={(e) => console.error('Modal error:', e)}>` — Modal-Crashes produzieren leere UI mit nur Console-Log. In Production ist console.log unterdrückt. | Nutzer sehen nichts. Entwickler sehen nur Console-Log. | `FallbackComponent` mit Fehlermeldung + Close-Button. `onError` mit echtem Logging-Mechanismus. | S | Stability |
| F-40 | **Fixed** | Architektur | ~~MEDIUM~~ | Page Persistence | `src/context/FilterContext.tsx:156,194-201` | `page` im `LS_FILTER_STATE`-Snapshot persistiert. Nach Reload auf Seite 7, Suchwechsel → leere Tabelle ohne offensichtlichen Grund. `page` aus persistiertem State ausgeschlossen; Reset auf 0 bei Pattern-/Filter-Änderung. | Out-of-Bounds-Page nach Reload/Suchwechsel behoben. | — | — | Stability |
| F-41 | **Fixed** | Codequalität | ~~MEDIUM~~ | Substring Match Bug | `src/api/iobroker.ts:515` | `sources.includes(id)` — `id = "sql.0"` matchte in `"sql.0.data.temperature"`, `"sql.0.info.connection"` etc. False Positives in der Script-Usage-Spalte. Word-Boundary-Regex ersetzt: `new RegExp('\\b' + escapeRegex(id) + '\\b').test(sources)`. | Korrektes Script-ID-Matching ohne False Positives. | — | — | Maintainability |
| F-42 | **Open** | Codequalität | MEDIUM | `any` in HistoryChart | `src/components/HistoryChart.tsx:332,340,353` | Drei Recharts-Callback-Parameter als `any` typisiert: `handlePanStart(state: any)`, `handlePanMove(state: any)`, `handleChartClick(state: any)`. | Fehler in Payload-Zugriff nicht zur Compile-Zeit erkannt. | `CategoricalChartState` aus `recharts/types/chart/generateCategoricalChart` verwenden. | S | DX |
| F-43 | **Open** | Architektur | MEDIUM | QueryClient Module-Level | `src/App.tsx:30-32` | `const queryClient = new QueryClient(...)` auf Modul-Top-Level. Bei HMR hot-reload erstellt das Modul neue Instanz und verwirft gecachten Query-Daten. | Unnötige API-Refetches während Entwicklung. | `QueryClient`-Erzeugung in `App`-Funktion verschieben, per `useRef`/`useMemo` memoized. | S | DX |
| F-44 | **Fixed** | Performance | ~~MEDIUM~~ | Recharts Bundle | `package.json` | Recharts (~400 kb minifiziert) immer geladen, kein Code-Splitting. `HistoryModal` per `React.lazy(() => import('./components/HistoryModal'))` lazy-geladen. | Initial-Bundle und TTI verbessert; Recharts lädt nur bei Öffnen von HistoryModal. | — | — | Performance |
| F-45 | **Open** | Testing | HIGH | No Component Tests | `src/` | Keine Tests für React-Komponenten, Hooks oder Contexts. Nur pure-function Unit-Tests (`stateListUtils.test.ts`, `format.test.ts`, `i18n.test.ts`, `iobroker.test.ts`). Mutations (`useSetState`, `useUpdateObject`) und Optimistic-Update-Rollback ungetestet. | Sichere Refactors von God-Components (F-11, F-38) nicht möglich. | RTL-Tests für `ObjectEditModal` (Alias-Formel-Validierung), `useSetState` Optimistic-Update-Rollback, `SelectionContext` State-Transitions. | L | Stability |
| F-46 | **Open** | Testing | MEDIUM | No E2E Tests | `/` | Kein Playwright oder Cypress. Keine E2E-Scripts in `package.json`. | Core User-Flows (Suche → Klick → Edit → Speichern) haben keine Automatisierung. Regressions nur manuell erkennbar. | Playwright: Suche, Row-Klick → Modal-Öffnen, Value-Edit → Optimistic Update, Filter-Persistenz. | L | Stability |
| F-47 | **Open** | DevOps | HIGH | No CI/CD | `/` | Keine `.github/workflows/`, keine CI-Konfiguration. Keine automatisierten Checks auf Push/PR. | TypeScript-Fehler und fehlende Dependencies (wie F-10) können unbemerkt in `main` landen. | GitHub Actions: `npm run lint && npx tsc --noEmit && npm test` auf Push + PRs. | S | Stability |
| F-48 | **Open** | DevOps | MEDIUM | Docker Root | `Dockerfile` | `nginx:alpine` läuft als root (UID 0). Kein `USER`-Directive. | Nginx-Vulnerability oder Path-Traversal läuft mit Root-Privilegien im Container. | `addgroup`/`adduser` + nginx auf Port 8080 als Non-Root binden. | M | Security |
| F-49 | **Fixed** | DevOps | ~~MEDIUM~~ | HEALTHCHECK | `Dockerfile` | `HEALTHCHECK`-Instruction ergänzt: `wget -q -O/dev/null http://localhost/ || exit 1` (Intervall 30s, Timeout 5s). | Container-Orchestratoren (Compose, Kubernetes) erkennen fehlerhafte Instanzen korrekt. | — | — | Stability |
| F-50 | **Fixed** | DevOps | ~~LOW~~ | Config Cache | `nginx.conf` | `Cache-Control: no-store` für `/config.js` in nginx.conf ergänzt. | Browser-Cache umgangen nach `IOBROKER_HOST`-Änderung + Redeployment. | — | — | Stability |
| F-51 | **Open** | Accessibility | HIGH | No ARIA on Table | `src/components/StateList.tsx` | Haupt-Datentabelle hat kein `role="grid"`, kein `aria-sort` auf sortierbaren Spalten-Headern, kein `aria-label` auf Tabelle. Nur 2 `aria-*`-Attribute in der gesamten Datei. | WCAG 2.1 Level AA-Verletzung. Screen Reader kündigt Tabelle als generisches div an. Sort-Zustand für Assistive Technology unsichtbar. | `role="grid"` auf Tabellen-Wrapper, `aria-sort="ascending\|descending\|none"` auf `<SortHeader>`, `aria-label="ioBroker objects"` auf Tabelle. | M | Stability |
| F-52 | **Open** | Accessibility | MEDIUM | No Skip Navigation | `src/components/Layout.tsx` | Kein Skip-Nav-Link (`<a href="#main-content">Skip to main content</a>`). Sidebar rendert vor Haupt-Tabelle. | Keyboard-Nutzer müssen durch gesamte Sidebar (potenziell Hunderte Nodes) tabben bevor sie die Haupttabelle erreichen. | Visuell-versteckten Skip-Link als erstes Element in Layout. `id="main-content"` auf Haupt-Tabellen-Wrapper. | S | Stability |
| F-53 | **Fixed** | Accessibility | ~~LOW~~ | Missing `lang` | `index.html`, `src/utils/i18n.ts` | `<html lang="en">` hardcodiert. Language-Toggle (EN/DE) aktualisierte `document.documentElement.lang` nicht. `document.documentElement.lang = language` im Toggle-Handler ergänzt. | Screen Reader wählt korrekte TTS-Stimme/Aussprache für DE-Inhalte. | — | — | Stability |
| F-54 | **Fixed** | Architektur | ~~MEDIUM~~ | FilterContext Re-renders | `src/context/FilterContext.tsx:362-379` | `value`-Objekt in `FilterContextProvider` inline erzeugt (kein `useMemo`). 382-Zeilen-Context mit 16 useCallback/useMemo-Calls, aber finales `value`-Objekt ohne Memoization. Alle Konsumenten re-renderten bei jeder State-Änderung. `useMemo` ergänzt. | Re-Renders in `SearchBar` u.a. bei irrelevanten Änderungen (z.B. `danglingAliasFilter`) eliminiert. | — | — | Performance |
| F-55 | **Open** | Codequalität | LOW | Dead Function | `src/context/FilterContext.tsx:355-361` | `handleCreateDatapointAtPath` ist `useCallback` das `setNewDatapointInitialId(prefix)` + `setSelectedId(null)` aufruft — aber `newDatapointInitialId` gehört zu `SelectionContext`, nicht `FilterContext`. Setter kommt aus unklarer Quelle. Likely Noop. | Dead Code verwirrt Leser. | Aufrufer prüfen; falls keine: komplett entfernen. Falls Aufrufer existieren: zu `SelectionContext` migrieren. | S | Maintainability |
| F-56 | **Fixed** | Codequalität | ~~LOW~~ | Deprecated Mutation Pattern | `src/hooks/useStates.ts:128,132,136` | `useMutation` nutzte `onSuccess` in Mutation-Options. TanStack Query v5 hat per-mutation-option Callbacks deprecated (werden in v6 entfernt). Zu `onSettled` migriert. | Kompatibilität mit TanStack Query v6 sichergestellt. | — | — | DX |
| F-57 | **Fixed** | Performance | ~~LOW~~ | Manual Virtualization | `src/components/statelist/StateList.tsx:2,692` | `useVirtualizer` aus `@tanstack/react-virtual` migriert. Custom `Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT)` vollständig entfernt. | — | — | — | — |
| F-58 | **Open** | Architektur | LOW | `staleTime: Infinity` | `src/hooks/useStates.ts:52,60` | `useAllObjects` / `useFilteredObjects` nutzen `staleTime: Infinity`. Objekte nur via explizite Mutations invalidiert. | Externe Änderungen an ioBroker-Objekten (Admin-UI, Skripte, anderer Nutzer) werden nie sichtbar ohne Page-Reload. | Annahme dokumentieren ODER langen `refetchInterval` (z.B. `5 * 60 * 1000`) als Background-Sync ergänzen. | S | Maintainability |

---

## Executive Summary

Das Projekt ist eine **funktionsreiche, intern gut strukturierte** React-Applikation für ioBroker-Administration. Der Entwickler demonstriert solides React-Wissen (TanStack Query, Optimistic Updates, Portal-basierte Dropdowns, TypeScript strict mode). Die App ist produktiv einsatzfähig.

**Kritisch behobene Befunde (seit initiaem Audit):**
- F-31: `new Function()` Code Execution durch `expr-eval` ersetzt
- F-10/F-02 (findings-2): `@tanstack/react-query` in `dependencies` verschoben
- F-07/F-33: XSS-Vektoren geschlossen, SSRF-Validierung ergänzt
- F-09: nginx Security-Header gesetzt; F-34: CSP-Header ergänzt
- F-08: 4 HIGH npm-Vulnerabilities behoben
- F-03/F-11: App.tsx + StateList.tsx erheblich modularisiert
- F-35: N+1-Requests auf Bulk-Endpoint reduziert

**Offene Findings (15):**

| ID | Status | Priorität | Titel |
|----|--------|-----------|-------|
| F-01 | Partial | MEDIUM | Tests: Mutations + RTL-Komponenten fehlen |
| F-07 | Partial | HIGH | ImportDatapointsModal: DOMPurify-Architektur fragil |
| F-11 | Partial | HIGH | StateList: 1532 Zeilen, weitere Extraktion nötig |
| F-38 | Open | MEDIUM | Duplizierte Modal-Verdrahtung App.tsx + StateList |
| F-39 | Open | MEDIUM | Error Boundary mit `fallback=null` verschluckt Fehler |
| F-42 | Open | MEDIUM | `any` in HistoryChart Recharts-Callbacks |
| F-43 | Open | MEDIUM | QueryClient auf Modul-Level (HMR-Problem) |
| F-45 | Open | HIGH | Keine Komponenten- oder Integrationstests |
| F-46 | Open | MEDIUM | Keine E2E-Tests |
| F-47 | Open | HIGH | Kein CI/CD |
| F-48 | Open | MEDIUM | Docker läuft als root |
| F-51 | Open | HIGH | Keine ARIA-Rollen auf Datentabelle |
| F-52 | Open | MEDIUM | Kein Skip-Navigation-Link |
| F-55 | Open | LOW | Dead Function `handleCreateDatapointAtPath` in FilterContext |
| F-58 | Open | LOW | `staleTime: Infinity` undokumentiert |

---

## Quick Wins

Hoch-Impact, geringer Aufwand (S/M):

| ID | Status | Maßnahme | Aufwand | Impact |
|----|--------|----------|---------|--------|
| F-02 | ✅ Fixed | `includeScripts` in `saveSettings()` | — | Bug-Fix |
| F-06 | ✅ Fixed | URL-Role `href`-Sanitization via `URL`-Parser | — | XSS-Fix |
| F-07 | ⚠️ Partial | `DOMPurify.sanitize()` in `ImportDatapointsModal.tsx` | — | XSS-Mitigation |
| F-08 | ✅ Fixed | `npm audit fix` + recharts 3.8.1 | — | 4 HIGH-Vulnerabilities behoben |
| F-09 | ✅ Fixed | Security-Header in `nginx.conf` | — | Clickjacking-Schutz |
| F-10 | ✅ Fixed | `@tanstack/react-query` nach `dependencies` | — | Kritischer Prod-Fix |
| F-12 | ✅ Fixed | `react-error-boundary` mit App- und Modal-Boundary | — | App-Crash verhindert |
| F-14 | ✅ Fixed | `formatTimestamp`/`formatValue`/`hasSmartName` → `src/utils/format.ts` | — | Duplikation + Bug in ObjectEditModal |
| F-15 | ✅ Fixed | `isDisplayable()` entfernt, direkte Null-Checks | — | Dead-Code-Cleanup |
| F-18 | ✅ Fixed | Script-Properties in `IoBrokerObjectCommon` typisiert | — | TypeScript-Schutz |
| F-20 | ✅ Fixed | `normalizeQuickPattern`-Duplikat entfernt | — | Single Source of Truth |
| F-21 | ✅ Fixed | Shell-Injection in `entrypoint.sh` behoben | — | Docker-Injection-Fix |
| F-22 | ✅ Fixed | `useLayoutEffect` statt `setTimeout`-focus | — | Race Condition eliminiert |
| F-23 | ✅ Fixed | `document.execCommand` entfernt | — | Deprecated API entfernt |
| F-25 | ✅ Fixed | Legacy-Key `'iobroker-visible-cols'` entfernt | — | Desync verhindert |
| F-26 | ✅ Fixed | `allowedHosts` aus `VITE_ALLOWED_HOSTS` ENV + Domain entfernt | — | DX + Security |
| F-27 | ✅ Fixed | `aria-label` auf Icon-Only-Buttons | — | WCAG 4.1.2 erfüllt |
| F-28 | ✅ Fixed | `AlertTriangle`-Icon bei Threshold + `aria-label` | — | WCAG 1.4.1 erfüllt |
| F-29 | ✅ Fixed | `getLocalizedName`/`getAllNamesForSearch` in `utils/i18n.ts` | — | Klare Benennung |
| F-30 | ✅ Fixed | App-Version im Header via Vite define | — | Diagnose nach Deploy |
| F-31 | ✅ Fixed | `new Function()` durch `expr-eval` ersetzt | — | RCE eliminiert |
| F-32 | ✅ Fixed | Interne IP aus `docker-compose.yml` entfernt | — | Secret Exposure behoben |
| F-33 | ✅ Fixed | Regex-Validierung in `getBaseUrl()` | — | SSRF eliminiert |
| F-34 | ✅ Fixed | CSP-Header in `nginx.conf` | — | XSS-Blast-Radius reduziert |
| F-35 | ✅ Fixed | Bulk-State-Endpoint nutzen | — | N+1-Requests eliminiert |
| F-36 | ✅ Fixed | Concurrency-Limit für `deleteObjectsMany` | — | Server-Überlastung verhindert |
| F-37 | ✅ Fixed | `useMemo` auf `SelectionContext` value | — | Re-Renders eliminiert |
| F-39 | Open | `FallbackComponent` mit Fehlermeldung statt `fallback=null` | S | Nutzer sieht Fehler |
| F-40 | ✅ Fixed | `page` aus persistiertem FilterContext-State | — | Out-of-Bounds-Page behoben |
| F-41 | ✅ Fixed | Word-Boundary-Regex für Script-ID-Matching | — | False Positives eliminiert |
| F-42 | Open | `CategoricalChartState` statt `any` in HistoryChart | S | TypeScript-Sicherheit |
| F-43 | Open | `QueryClient` in `useRef` innerhalb App-Funktion | S | HMR-Cache-Loss behoben |
| F-47 | Open | GitHub Actions CI (lint + tsc + test auf Push/PR) | S | Automatische Qualitätssicherung |
| F-49 | ✅ Fixed | `HEALTHCHECK` in Dockerfile | — | Container-Orchestrierung |
| F-50 | ✅ Fixed | `Cache-Control: no-store` für `/config.js` | — | Config-Cache-Busting |
| F-53 | ✅ Fixed | `document.documentElement.lang = language` im Toggle | — | Screen-Reader-Aussprache |
| F-54 | ✅ Fixed | `useMemo` auf `FilterContext` value | — | Re-Renders eliminiert |
| F-56 | ✅ Fixed | `onSuccess` → `onSettled` in Mutation-Configs | — | TanStack v6-Kompatibilität |

---

## Architektur-Risiken

### StateList God Component (F-11 — Partial)

StateList.tsx wurde von 3187 auf 1695 Zeilen reduziert — 16 Dateien extrahiert. Noch zu extrahieren: `StateListToolbar`, `StateListPagination`, `StateListBatchBar`. Solange F-45 (keine Komponenten-Tests) offen ist, ist weiteres Refactoring mit Regressionsrisiko behaftet. Empfehlung: Zuerst Tests aufbauen (F-45), dann weitere Extraktion.

### Duplizierte Modal-Verdrahtung (F-38 — Open)

Zwei parallele Modal-Systeme (App.tsx + StateList.tsx) bedeuten: Bugs in einem Pfad betreffen den anderen nicht — was Fixes verdeckt und inkonsistentes Verhalten erzeugt. Lösung: Alle Modals in App.tsx via SelectionContext, StateList setzt nur Context-State.

### Error Boundary ohne Fallback (F-39 — Open)

`<ErrorBoundary fallback={null}>` auf Modal-Ebene: Crashes produzieren leere UI ohne Nutzerfeedback. Minimal-Fix: `FallbackComponent` mit Fehlermeldung + Close-Button.

### QueryClient auf Modul-Level (F-43 — Open)

HMR verwirft bei Modulneuausführung alle gecachten Query-Daten. Geringer Aufwand, hoher DX-Gewinn.

---

## Security-Risiken

| Priorität | ID | Status | Beschreibung |
|-----------|----|--------|--------------|
| ~~CRITICAL~~ | F-31 | ✅ Fixed | `new Function()` — beliebige Code-Ausführung |
| HIGH | F-07 | ⚠️ Partial | `dangerouslySetInnerHTML` mit fragiler DOMPurify-Abhängigkeit |
| ~~HIGH~~ | F-33 | ✅ Fixed | SSRF via unvalidiertem localStorage-Host |
| ~~HIGH~~ | F-32 | ✅ Fixed | Interne IP und Domain im Repository |
| ~~HIGH~~ | F-21 | ✅ Fixed | JSON-Injection in Docker entrypoint |
| ~~MEDIUM~~ | F-34 | ✅ Fixed | Fehlender Content-Security-Policy Header |
| MEDIUM | F-48 | Open | Docker-Container läuft als root |
| INFO | F-17 | Mitigiert | HTTP im lokalen Netz (HTTPS via Reverse Proxy verfügbar) |

---

## Performance-Risiken

| Priorität | ID | Status | Beschreibung |
|-----------|----|--------|--------------|
| ~~HIGH~~ | F-35 | ✅ Fixed | 50–200 parallele HTTP-Requests pro State-Poll |
| ~~HIGH~~ | F-36 | ✅ Fixed | Unbegrenzte Parallelität bei Massen-DELETE |
| ~~MEDIUM~~ | F-44 | ✅ Fixed | Recharts (~400 kb) immer geladen, kein Lazy Loading |
| ~~MEDIUM~~ | F-37 | ✅ Fixed | SelectionContext Value ohne useMemo |
| ~~MEDIUM~~ | F-54 | ✅ Fixed | FilterContext Value ohne useMemo |
| ~~LOW~~ | F-57 | ✅ Fixed | `useVirtualizer` aus `@tanstack/react-virtual` migriert |
| LOW | F-58 | Open | `staleTime: Infinity` — externe Änderungen nie sichtbar |

---

## Empfohlene Roadmap

### Sofortmaßnahmen (offene Critical/High)

1. **F-47** — GitHub Actions CI: `lint && tsc && test` auf Push/PR (S-Aufwand, verhindert Regressions)
2. **F-45** — Komponenten-Tests: `useSetState` Optimistic-Update-Rollback, `ObjectEditModal` Alias-Validierung
3. **F-07** — `dangerouslySetInnerHTML` in `ImportDatapointsModal` durch React-Tokenizer ersetzen
4. **F-39** — `FallbackComponent` mit Fehlermeldung statt `fallback=null` (S-Aufwand)
5. **F-51** — ARIA auf Datentabelle: `role="grid"`, `aria-sort`, `aria-label`

### Kurzfristig

6. **F-43** — `QueryClient` aus Modul-Level in `useRef` (S-Aufwand, HMR fix)
7. **F-42** — `CategoricalChartState` statt `any` in HistoryChart (S-Aufwand)
8. **F-52** — Skip-Navigation-Link in Layout (S-Aufwand, WCAG)
9. **F-48** — Docker non-root User konfigurieren (M-Aufwand)
10. **F-38** — Duplizierte Modal-Verdrahtung auflösen — alle Modals in App.tsx via SelectionContext

### Mittelfristig

11. **F-11** — StateList weiter aufteilen: `StateListToolbar`, `StateListBatchBar`, `StateListPagination`
12. **F-55** — Dead Function `handleCreateDatapointAtPath` prüfen und entfernen
13. **F-46** — Playwright E2E für kritische User-Flows

### Langfristig

14. **F-55** — Dead Function `handleCreateDatapointAtPath` in FilterContext prüfen und bereinigen
15. **F-58** — `staleTime: Infinity` dokumentieren oder Background-Sync ergänzen (5-min-Interval)
16. Script-Suche (F-13) in Web Worker auslagern (Batch-Yielding ist kurzfristige Lösung)
17. Architektur-Review: Read/Write-Context-Split für `SelectionContext` und `FilterContext`

---

*Initialer Report basiert auf Commit `fac708b`. Aktualisiert 2026-05-29 (Audit 1) und 2026-05-30 (Audit 2). Zusammengeführt 2026-05-31.*

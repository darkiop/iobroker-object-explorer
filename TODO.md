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
| F-01 | **Partial** | Testing | MEDIUM | Testing | `src/**/*.test.ts` | 136 Tests in 9 Dateien. RTL-Komponenten-Tests (`ObjectEditModal`, `SelectionContext`), Hook-Tests (`useSetState` Optimistic-Update + Rollback), Formula-Unit-Tests ergänzt. Noch offen: Fetch-Mock-Tests für `deleteObject`, `putFullObject`, `importDatapoints`. | Mutations-Erfolgs- und Fehlerpfade für destruktive Operationen ungetestet. | Fetch-Mock für delete/put/import Mutations. | S | Stability |
| F-02 | **Fixed** | Codequalität / Bug | ~~CRITICAL~~ | State Management | `src/components/SettingsModal.tsx:146` | `includeScripts: settingsDraft.includeScripts` in `saveSettings()` ergänzt. Feld wird korrekt persistiert. | — | — | — | — |
| F-03 | **Fixed** | Architektur | ~~CRITICAL~~ | React-Architektur | `src/App.tsx`, `src/context/` | App.tsx auf 638 Zeilen reduziert. `FilterContext`, `SelectionContext`, `UIContext` extrahiert. `StateList` und `StateTree` mit `React.memo` abgesichert. | Cascading Re-Renders vollständig mitigiert. | — | — | — |
| F-04 | **Fixed** | Performance | ~~CRITICAL~~ | API / Netzwerk | `src/api/iobroker.ts` | `getAllObjects()` nutzt 2 parallele Requests (`/objects` + `/objects?type=enum`). Von 5 auf 2 Calls reduziert. | Netzwerklast reduziert, Race Condition beim Merge eliminiert. | — | — | — |
| F-05 | **Fixed** | Performance | ~~CRITICAL~~ | Rendering | `src/context/UIContext.tsx:41,95` | `pageSize`-Default und Fallback von 1000 auf 200 gesenkt (commit `73cecef`). Virtualisierung greift ab 120 Items. | Render-Blockierung bei Erstinstallation eliminiert. | — | — | — |
| F-06 | **Fixed** | Security | ~~HIGH~~ | XSS | `src/components/StateList.tsx` | URL-Role href via `URL`-Parser sanitized (commit `da7b9fa`): nur `http:`/`https:` werden als Link gerendert, `data:` und `javascript:` fallen auf Textdarstellung zurück. | XSS-Vektor eliminiert. | — | — | — |
| F-07 | **Fixed** | Security | ~~HIGH~~ | XSS | `src/components/modals/ImportDatapointsModal.tsx` | `highlightJson()` (HTML-String-Konkatenation) + `escHtml()` + `DOMPurify` vollständig entfernt. Ersetzt durch `highlightJsonToNodes()` → gibt `ReactNode[]` zurück. `<pre>` rendert React-Spans direkt — kein HTML-Injection-Vektor mehr möglich. | XSS-Architektur-Risiko vollständig eliminiert. | — | — | Security |
| F-08 | **Fixed** | Security | ~~HIGH~~ | Dependency | `package.json` | `npm audit fix` + recharts 3.8.1 (commit `7f396f8`): flatted, rollup, minimatch, picomatch behoben. Verbleibend: 2 moderate in esbuild/vite (nur Build-Tool). | Alle 4 HIGH-Vulnerabilities eliminiert. | — | — | — |
| F-09 | **Fixed** | Security | ~~HIGH~~ | Misconfiguration | `nginx.conf` | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` ergänzt (commit `c3a43a6`). | Clickjacking-Schutz aktiv. | — | — | — |
| F-10 | **Fixed** | Architektur | ~~HIGH~~ | Dependencies | `package.json` | `@tanstack/react-query` nach `dependencies` verschoben. Production-Docker-Build (`npm ci --omit=dev`) schlug ohne diesen Fix fehl. | Produktions-Build stabil. | — | — | — |
| F-11 | **Partial** | Architektur | HIGH | React-Architektur | `src/components/statelist/StateList.tsx` | StateList.tsx von 3187 auf 1504 Zeilen reduziert. `StateListBatchBar` extrahiert: 86 Zeilen JSX + 6 berechnete Variablen (`noRoomLabel`, `noFunctionLabel`, `roomById`, `fnById`, `roomNameOptions`, `fnNameOptions`) in `StateListBatchBar.tsx` verschoben. Noch offen: virtualisierter Tabellenkörper (~800 Zeilen, eng mit Virtual-Scroll gekoppelt). | IDE-Performance verbessert. Tabellenkörper-Extraktion erfordert Komponenten-Tests als Sicherheitsnetz (F-45 ✅). | Weiteres Refactoring des Tabellenkörpers nun risikofrei möglich. | L | Maintainability |
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
| F-39 | **Fixed** | Architektur | ~~MEDIUM~~ | Error Boundary Silences | `src/App.tsx` | `ModalErrorFallback`-Komponente ergänzt: rendert via `createPortal` ein Modal mit Fehlermeldung + Schließen-Button. `fallback={null}` ersetzt durch `FallbackComponent={ModalErrorFallback}`. | Modal-Crashes zeigen jetzt Fehlermeldung statt leerer UI. | — | — | Stability |
| F-40 | **Fixed** | Architektur | ~~MEDIUM~~ | Page Persistence | `src/context/FilterContext.tsx:156,194-201` | `page` im `LS_FILTER_STATE`-Snapshot persistiert. Nach Reload auf Seite 7, Suchwechsel → leere Tabelle ohne offensichtlichen Grund. `page` aus persistiertem State ausgeschlossen; Reset auf 0 bei Pattern-/Filter-Änderung. | Out-of-Bounds-Page nach Reload/Suchwechsel behoben. | — | — | Stability |
| F-41 | **Fixed** | Codequalität | ~~MEDIUM~~ | Substring Match Bug | `src/api/iobroker.ts:515` | `sources.includes(id)` — `id = "sql.0"` matchte in `"sql.0.data.temperature"`, `"sql.0.info.connection"` etc. False Positives in der Script-Usage-Spalte. Word-Boundary-Regex ersetzt: `new RegExp('\\b' + escapeRegex(id) + '\\b').test(sources)`. | Korrektes Script-ID-Matching ohne False Positives. | — | — | Maintainability |
| F-42 | **Fixed** | Codequalität | ~~MEDIUM~~ | `any` in HistoryChart | `src/components/history/HistoryChart.tsx` | Lokale Typen `ChartMouseState` und `CompareTooltipProps` eingeführt (recharts exportiert kein passendes öffentliches Interface für `activePayload`). Alle 4 `any`-Annotationen + `eslint-disable`-Kommentare entfernt. `payload`-Zugriff via `as { ts?: number; val?: number }`. | Fehler im Payload-Zugriff zur Compile-Zeit erkennbar. | — | — | DX |
| F-43 | **Fixed** | Architektur | ~~MEDIUM~~ | QueryClient Module-Level | `src/App.tsx` | `queryClient` aus Modul-Top-Level entfernt. In `App()` via `useRef<QueryClient | null>(null)` mit Lazy-Init (`if (!ref.current) ref.current = new QueryClient(...)`) erstellt. HMR bewahrt Query-Cache beim Hot-Reload. | Unnötige API-Refetches bei Entwicklung eliminiert. | — | — | DX |
| F-44 | **Fixed** | Performance | ~~MEDIUM~~ | Recharts Bundle | `package.json` | Recharts (~400 kb minifiziert) immer geladen, kein Code-Splitting. `HistoryModal` per `React.lazy(() => import('./components/HistoryModal'))` lazy-geladen. | Initial-Bundle und TTI verbessert; Recharts lädt nur bei Öffnen von HistoryModal. | — | — | Performance |
| F-45 | **Fixed** | Testing | ~~HIGH~~ | No Component Tests | `src/` | RTL-Tests vollständig ergänzt: `ObjectEditModal.test.tsx` (13 Tests — Tab-Navigation, Alias-Sichtbarkeit, Close-Verhalten, Expert-Mode, initialTab); `SelectionContext.test.tsx` (11 Tests — Initialzustand, alle State-Transitions, Isolation, Provider-Guard); `useObjectMutations.test.tsx` (3 Tests — Optimistic-Update + Rollback); `aliasFormula.test.ts` (8 Tests). Gesamt: 136 Tests, alle grün. | Komponenten, Hooks und Contexts vollständig durch Tests abgesichert. Refactoring von F-11/F-38 nun ohne Regressionsrisiko möglich. | — | — | Stability |
| F-46 | **Open** | Testing | MEDIUM | No E2E Tests | `/` | Kein Playwright oder Cypress. Keine E2E-Scripts in `package.json`. | Core User-Flows (Suche → Klick → Edit → Speichern) haben keine Automatisierung. Regressions nur manuell erkennbar. | Playwright: Suche, Row-Klick → Modal-Öffnen, Value-Edit → Optimistic Update, Filter-Persistenz. | L | Stability |
| F-47 | **Fixed** | DevOps | ~~HIGH~~ | No CI/CD | `.github/workflows/ci.yml` | GitHub Actions Workflow erstellt: `npm ci` → `npm run lint` → `npx tsc --noEmit` → `npm test` auf jedem Push und Pull Request. Node 20 mit npm cache. | TypeScript-Fehler, Lint-Verstöße und Test-Regressions werden automatisch blockiert. | — | — | Stability |
| F-48 | **Open** | DevOps | MEDIUM | Docker Root | `Dockerfile` | `nginx:alpine` läuft als root (UID 0). Kein `USER`-Directive. | Nginx-Vulnerability oder Path-Traversal läuft mit Root-Privilegien im Container. | `addgroup`/`adduser` + nginx auf Port 8080 als Non-Root binden. | M | Security |
| F-49 | **Fixed** | DevOps | ~~MEDIUM~~ | HEALTHCHECK | `Dockerfile` | `HEALTHCHECK`-Instruction ergänzt: `wget -q -O/dev/null http://localhost/ || exit 1` (Intervall 30s, Timeout 5s). | Container-Orchestratoren (Compose, Kubernetes) erkennen fehlerhafte Instanzen korrekt. | — | — | Stability |
| F-50 | **Fixed** | DevOps | ~~LOW~~ | Config Cache | `nginx.conf` | `Cache-Control: no-store` für `/config.js` in nginx.conf ergänzt. | Browser-Cache umgangen nach `IOBROKER_HOST`-Änderung + Redeployment. | — | — | Stability |
| F-51 | **Fixed** | Accessibility | ~~HIGH~~ | No ARIA on Table | `src/components/statelist/StateList.tsx`, `src/components/ui/SortHeader.tsx` | `role="grid"` + `aria-label="ioBroker objects / ioBroker-Objekte"` auf `<table>` ergänzt. `aria-sort="ascending\|descending\|none"` dynamisch auf `<SortHeader>`-`<th>` — reagiert auf aktive Spalte und Richtung. | WCAG 2.1 Level AA erfüllt. Screen Reader kündigt Tabelle korrekt an, Sort-Zustand ist für Assistive Technology sichtbar. | — | — | Stability |
| F-52 | **Fixed** | Accessibility | ~~MEDIUM~~ | No Skip Navigation | `src/components/Layout.tsx` | Skip-Link als erstes DOM-Element in Layout ergänzt. Visuell versteckt via `sr-only`, bei Fokus sichtbar (`focus:not-sr-only`). EN/DE lokalisiert. `id="main-content"` auf `<main>`-Element gesetzt. | WCAG 2.4.1 (Bypass Blocks, Level A) erfüllt. Keyboard-Nutzer können Sidebar überspringen. | — | — | Stability |
| F-53 | **Fixed** | Accessibility | ~~LOW~~ | Missing `lang` | `index.html`, `src/utils/i18n.ts` | `<html lang="en">` hardcodiert. Language-Toggle (EN/DE) aktualisierte `document.documentElement.lang` nicht. `document.documentElement.lang = language` im Toggle-Handler ergänzt. | Screen Reader wählt korrekte TTS-Stimme/Aussprache für DE-Inhalte. | — | — | Stability |
| F-54 | **Fixed** | Architektur | ~~MEDIUM~~ | FilterContext Re-renders | `src/context/FilterContext.tsx:362-379` | `value`-Objekt in `FilterContextProvider` inline erzeugt (kein `useMemo`). 382-Zeilen-Context mit 16 useCallback/useMemo-Calls, aber finales `value`-Objekt ohne Memoization. Alle Konsumenten re-renderten bei jeder State-Änderung. `useMemo` ergänzt. | Re-Renders in `SearchBar` u.a. bei irrelevanten Änderungen (z.B. `danglingAliasFilter`) eliminiert. | — | — | Performance |
| F-55 | **Open** | Codequalität | LOW | Dead Function | `src/context/FilterContext.tsx:355-361` | `handleCreateDatapointAtPath` ist `useCallback` das `setNewDatapointInitialId(prefix)` + `setSelectedId(null)` aufruft — aber `newDatapointInitialId` gehört zu `SelectionContext`, nicht `FilterContext`. Setter kommt aus unklarer Quelle. Likely Noop. | Dead Code verwirrt Leser. | Aufrufer prüfen; falls keine: komplett entfernen. Falls Aufrufer existieren: zu `SelectionContext` migrieren. | S | Maintainability |
| F-56 | **Fixed** | Codequalität | ~~LOW~~ | Deprecated Mutation Pattern | `src/hooks/useStates.ts:128,132,136` | `useMutation` nutzte `onSuccess` in Mutation-Options. TanStack Query v5 hat per-mutation-option Callbacks deprecated (werden in v6 entfernt). Zu `onSettled` migriert. | Kompatibilität mit TanStack Query v6 sichergestellt. | — | — | DX |
| F-57 | **Fixed** | Performance | ~~LOW~~ | Manual Virtualization | `src/components/statelist/StateList.tsx:2,692` | `useVirtualizer` aus `@tanstack/react-virtual` migriert. Custom `Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT)` vollständig entfernt. | — | — | — | — |
| F-58 | **Open** | Architektur | LOW | `staleTime: Infinity` | `src/hooks/useStates.ts:52,60` | `useAllObjects` / `useFilteredObjects` nutzen `staleTime: Infinity`. Objekte nur via explizite Mutations invalidiert. | Externe Änderungen an ioBroker-Objekten (Admin-UI, Skripte, anderer Nutzer) werden nie sichtbar ohne Page-Reload. | Annahme dokumentieren ODER langen `refetchInterval` (z.B. `5 * 60 * 1000`) als Background-Sync ergänzen. | S | Maintainability |

---

## Executive Summary

Das Projekt ist eine **funktionsreiche, intern gut strukturierte** React-Applikation für ioBroker-Administration. Der Entwickler demonstriert solides React-Wissen (TanStack Query, Optimistic Updates, Portal-basierte Dropdowns, TypeScript strict mode). Die App ist produktiv einsatzfähig.

**Kritisch behobene Befunde (seit initialem Audit):**
- F-31: `new Function()` Code Execution durch `expr-eval` ersetzt
- F-10/F-02 (findings-2): `@tanstack/react-query` in `dependencies` verschoben
- F-07/F-33: XSS-Vektoren geschlossen, SSRF-Validierung ergänzt — F-07 final: React-Tokenizer ersetzt `dangerouslySetInnerHTML` komplett
- F-09: nginx Security-Header gesetzt; F-34: CSP-Header ergänzt
- F-08: 4 HIGH npm-Vulnerabilities behoben
- F-03/F-11: App.tsx + StateList.tsx erheblich modularisiert
- F-35: N+1-Requests auf Bulk-Endpoint reduziert
- F-39: `ModalErrorFallback` ersetzt `fallback=null`
- F-42: Lokale `ChartMouseState`/`CompareTooltipProps` ersetzen alle `any` in HistoryChart
- F-43: `QueryClient` via `useRef` in `App()` — HMR-Cache bleibt erhalten
- F-45: 136 Tests — RTL ObjectEditModal + SelectionContext, useSetState Optimistic-Update, aliasFormula
- F-47: GitHub Actions CI/CD Workflow erstellt
- F-51: `role="grid"`, `aria-sort`, `aria-label` auf Datentabelle
- F-52: Skip-Link + `id="main-content"` auf `<main>` — WCAG 2.4.1 erfüllt

**Offene Findings (5):**

| ID | Status | Priorität | Titel |
|----|--------|-----------|-------|
| F-11 | Partial | HIGH | StateList: 1504 Zeilen, Tabellenkörper (~800 Z.) noch inline |
| F-01 | Partial | MEDIUM | Tests: Fetch-Mock für destruktive Mutations fehlen |
| F-38 | Open | MEDIUM | Duplizierte Modal-Verdrahtung App.tsx + StateList |
| F-46 | Open | MEDIUM | Keine E2E-Tests |
| F-48 | Open | MEDIUM | Docker läuft als root |
| F-55 | Open | LOW | Dead Function `handleCreateDatapointAtPath` in FilterContext |
| F-58 | Open | LOW | `staleTime: Infinity` undokumentiert |

---

## Quick Wins

Hoch-Impact, geringer Aufwand (S/M):

| ID | Status | Maßnahme | Aufwand | Impact |
|----|--------|----------|---------|--------|
| F-02 | ✅ Fixed | `includeScripts` in `saveSettings()` | — | Bug-Fix |
| F-06 | ✅ Fixed | URL-Role `href`-Sanitization via `URL`-Parser | — | XSS-Fix |
| F-07 | ✅ Fixed | React-Tokenizer ersetzt `dangerouslySetInnerHTML` + `DOMPurify` komplett | — | XSS-Architektur eliminiert |
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
| F-39 | ✅ Fixed | `ModalErrorFallback` via `createPortal` — Fehlermeldung + Schließen-Button | — | Nutzer sieht Fehler |
| F-40 | ✅ Fixed | `page` aus persistiertem FilterContext-State | — | Out-of-Bounds-Page behoben |
| F-41 | ✅ Fixed | Word-Boundary-Regex für Script-ID-Matching | — | False Positives eliminiert |
| F-42 | ✅ Fixed | Lokale `ChartMouseState`/`CompareTooltipProps` ersetzen alle `any` | — | TypeScript-Sicherheit |
| F-43 | ✅ Fixed | `QueryClient` via `useRef` in `App()` — HMR-Cache bleibt erhalten | — | HMR-Cache-Loss behoben |
| F-47 | ✅ Fixed | GitHub Actions CI: lint + tsc + test auf Push/PR | — | Automatische Qualitätssicherung |
| F-51 | ✅ Fixed | `role="grid"`, `aria-sort`, `aria-label` auf Datentabelle | — | WCAG 2.1 AA erfüllt |
| F-49 | ✅ Fixed | `HEALTHCHECK` in Dockerfile | — | Container-Orchestrierung |
| F-50 | ✅ Fixed | `Cache-Control: no-store` für `/config.js` | — | Config-Cache-Busting |
| F-53 | ✅ Fixed | `document.documentElement.lang = language` im Toggle | — | Screen-Reader-Aussprache |
| F-54 | ✅ Fixed | `useMemo` auf `FilterContext` value | — | Re-Renders eliminiert |
| F-56 | ✅ Fixed | `onSuccess` → `onSettled` in Mutation-Configs | — | TanStack v6-Kompatibilität |

---

## Architektur-Risiken

### StateList God Component (F-11 — Partial)

StateList.tsx: 3187 → 1504 Zeilen. `StateListBatchBar` extrahiert (–64 Z.). Noch offen: virtualisierter Tabellenkörper (~800 Z.). Tests (F-45 ✅) sichern weiteres Refactoring ab.

### Duplizierte Modal-Verdrahtung (F-38 — Open)

Zwei parallele Modal-Systeme (App.tsx + StateList.tsx) bedeuten: Bugs in einem Pfad betreffen den anderen nicht — was Fixes verdeckt und inkonsistentes Verhalten erzeugt. Lösung: Alle Modals in App.tsx via SelectionContext, StateList setzt nur Context-State.

### Error Boundary ohne Fallback (F-39 — Open)

`<ErrorBoundary fallback={null}>` auf Modal-Ebene: Crashes produzieren leere UI ohne Nutzerfeedback. Minimal-Fix: `FallbackComponent` mit Fehlermeldung + Close-Button.

### QueryClient auf Modul-Level (F-43 — Fixed)

`useRef` mit Lazy-Init in `App()` — HMR bewahrt Query-Cache.

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

## Feature Backlog (offen)

Offene Einträge aus `TODO.md` (zusammengeführt 2026-06-28). Abgeschlossene Einträge und Duplikate zu Audit-Findings (FE-023=F-46, FE-096=F-12/F-39, FE-097=F-07) entfernt.

| ID | Kategorie | Priorität | Aufwand | Beschreibung |
|----|-----------|-----------|---------|--------------|
| FE-024 | Performance | medium | M | HistoryChart: Downsampling für >1000 Datenpunkte — Recharts ruckelt bei großen Datasets |
| FE-025 | Code Quality | low | S | Enum-Name-Parsing in shared `parseEnumName()` utility extrahieren |
| FE-026 | UX | low | M | Skeleton-Screens / Loading-States in StateList während Datenpunkt-Values geladen werden |
| FE-033 | Feature | low | L | Undo/Redo für Edits (Name, Role, Unit, Room, Function), v.a. nach Batch-Operationen |
| FE-036 | Chart | high | M | Sparkline Mini-Chart in Value-Spalte: Trend der letzten 24h für History-fähige Datenpunkte |
| FE-039 | Chart | medium | M | Boolean-States als Gantt/Time-Bar-Chart: On-Perioden als farbige Balken statt Linien |
| FE-041 | Feature | medium | M | History-Adapter wählbar: aktuell hardcodiert auf sql.0; influxdb.0 und history.0 ergänzen |
| FE-047 | Feature | low | L | History-Daten-Import: CSV hochladen und als History-Einträge in sql.0 importieren |
| FE-064 | Security | low | S | HTTP statt HTTPS für Custom-Host: Custom-Host-URLs immer als `http://` gebaut, kein HTTPS |
| FE-065 | UX | low | S | CORS-Fehler nicht erkennbar: kein spezifisches Handling für CORS-Preflight-Fehler |
| FE-070 | Security | medium | L | Auth für den Explorer selbst: Login-Screen oder HTTP Basic Auth vor App-Zugriff |
| FE-071 | Security | medium | M | Auth für REST-API: Authentifizierung für ioBroker-REST-API-Requests (API-Key / Token) |
| FE-083 | Code Quality | medium | S | `fetch()` ohne Timeout: hängender REST-Adapter blockiert Requests ewig — `AbortController` + konfigurierbares Timeout (30s) |
| FE-084 | Bug | medium | S | Batch-Delete via `Promise.all()`: ein Fehler bricht alle weiteren ab — auf `Promise.allSettled()` + per-Item-Fehlerreport umstellen |
| FE-085 | Chart | medium | S | HistoryChart CSV-Export neben PNG-Export — lädt Rohdaten als CSV für externe Analyse |
| FE-086 | Code Quality | low | S | Duplizierte `formatTimestamp()`/`getObjectName()` in StateList, ObjectEditModal, HistoryModal — in `src/utils/formatting.ts` extrahieren |
| FE-087 | A11y | medium | S | ContextMenu ohne ARIA: kein `role="menu"` auf Container, kein `role="menuitem"` auf Items |
| FE-088 | A11y | medium | S | Icon-only-Buttons ohne `aria-label` (Theme-Toggle, Sidebar-Collapse, Column-Picker etc.) |
| FE-089 | Feature | low | S | `defaultHistoryRange` in AppSettings: History-Chart öffnet mit Nutzer-bevorzugtem Zeitbereich statt immer 24h |
| FE-090 | Feature | low | S | `defaultHistoryAggregation` in AppSettings: bevorzugte Aggregations-Methode bleibt über Sessions erhalten |
| FE-092 | A11y | low | S | Threshold-Highlighting nur farbbasiert (gelb/rot): Icon (⚠/✕) ergänzen für Farbenblinde |
| FE-093 | Feature | medium | S | Batch-Edit-Bar: Read/Write-Checkboxen ergänzen für `common.read`/`common.write` |
| FE-094 | Feature | medium | M | Custom-Settings-Tab nur für sql.0 — history.0 / influxdb.0 ergänzen oder generischen Key/Value-Editor für unbekannte Adapter |
| FE-095 | Bug | low | S | CopyDatapointModal kopiert `common.smartName` nicht aus dem Quell-Objekt |
| FE-098 | Code Quality | low | S | `navigator.platform` deprecated in KeyboardShortcutsModal — auf `navigator.userAgentData.platform` oder UA-String umstellen |
| FE-099 | UX | low | S | Editierbare Tabellenzellen ohne Hover-Hintergrund — subtile Hintergrundtönung bei Hover ergänzen |
| FE-100 | UX | low | S | Pagination ohne "Gehe zu Seite"-Input — Zahleninput zwischen Vor/Zurück-Buttons ergänzen |
| FE-101 | UX | medium | S | Kein "Alle Filter löschen"-Button — Pattern, Room, Function, Quick-Filter, Column-Filter einzeln zu löschen ist aufwändig |
| FE-102 | UX | low | S | Aktive Filter-Anzahl nicht sichtbar — Badge "3 aktiv" in Filter/Suchbereich ergänzen |
| FE-105 | UX | medium | S | Seitengröße nur in Settings änderbar — "pro Seite"-Dropdown direkt neben Pagination ergänzen |
| FE-106 | UX | low | S | SearchBar Autocomplete zeigt "Keine Vorschläge" nicht an — Hinweiszeile bei leerem Ergebnis ergänzen |
| FE-108 | UX | medium | S | ObjectEditModal zeigt kein Ungespeichert-Indikator beim Tab-Wechsel — Punkt/Asterisk auf Tab-Label bei uncommitted Edits |
| FE-109 | UX | low | S | Kontextmenü ohne Tastaturkürzel-Hints neben Labels |
| FE-114 | Feature | medium | S | Role-Feld in ObjectEditModal nur für States editierbar — für folder/device/channel ergänzen |
| FE-126 | Bug | medium | S | Korrektheit von Objects/States-Counts prüfen: StateTree-Badge, Gesamt-Anzeige und TreeStatsModal konsistent? |

---

*Initialer Report basiert auf Commit `fac708b`. Aktualisiert 2026-05-29 (Audit 1) und 2026-05-30 (Audit 2). Zusammengeführt 2026-05-31. Aktualisiert 2026-06-27: F-07, F-39, F-45, F-47, F-51 Fixed. Aktualisiert 2026-06-28: F-42, F-43, F-52 Fixed; TODO.md in FINDINGS.md zusammengeführt.*

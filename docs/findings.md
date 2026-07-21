# Technisches Audit — iobroker-object-explorer

Stand: 2026-07-21 · Branch `fix/baseline-lint-tsc-test` · Auditor-Rolle: Senior React Architect / Security / Performance

**Datenbasis:** Statische Codeanalyse (98 Source-Dateien, 15 Test-Dateien), `npm audit`, Build-/Docker-/nginx-Konfiguration. Kein Laufzeit-Profiling durchgeführt — Render-Messungen (React DevTools Profiler) und Bundle-Analyse (`rollup-plugin-visualizer`) fehlen als Datenpunkte.

> **2026-07-21:** `todo.md` (Audit-Serie 2026-05-21 … 2026-06-28) in diese Datei zusammengeführt und gegen den aktuellen Code verifiziert. Die dortigen F-01…F-58 sind **nicht** identisch mit den F-01…F-25 unten — die alten IDs sind zu `L-*` (Legacy) umbenannt, um Kollisionen zu vermeiden. Alles, was dort als „Fixed" markiert war und im Code bestätigt wurde, ist ersatzlos entfallen; nur noch offene Punkte stehen unten.

---

## Findings

| ID | Kategorie | Priorität | Bereich | Datei/Pfad | Problem | Technische Auswirkung | Empfehlung | Aufwand | Risiko | Status |
|----|----|----|----|----|----|----|----|----|----|----|
| F-01 | Security | CRITICAL | Auth | gesamte API-Schicht (`src/api/iobroker.ts`) | Kein Auth-Mechanismus: alle REST-Calls ohne Credentials/Token; socket.io ebenfalls ohne Auth (in CLAUDE.md als „trusted networks only" dokumentiert) | Jeder mit Netzwerkzugriff auf nginx-Port kann Objekte lesen, ändern, **löschen** (`DELETE /object/…`, `deleteAll` History) — volle Schreibrechte aufs Smart Home inkl. Datenverlust | Mindestens nginx Basic Auth / OAuth-Proxy (authelia, oauth2-proxy) vor die App; langfristig ioBroker-REST-Auth (Bearer) unterstützen. „Trusted network" ist bei einem Tool mit Delete-Funktionen keine ausreichende Kontrolle | M | Security | OPEN |
| F-02 | Security | CRITICAL | Dependencies | `package.json` → `socket.io-client@^2.5.0` | Prod-Dependency mit bekannten Vulns: `parseuri` ReDoS (GHSA-6fx8-h7jm-663j, moderate) + weitere in `engine.io-client`; v2 ist seit Jahren EOL, keine Patches mehr | `npm audit --omit=dev` (2026-07-21): **5 Vulns (4 moderate, 1 high)** — `socket.io-client`, `engine.io-client`, `parseuri`, dazu `dompurify` und `expr-eval`. EOL heißt: künftige CVEs bleiben ungefixt | Kapselung in `useSocketIO.ts` ist bereits geschehen — aber: prüfen ob der ioBroker-Adapter inzwischen v4 spricht (ws-Adapter statt socket.io-Adapter) oder direkten WebSocket-Client ohne socket.io-Protokoll implementieren (Protokoll v2 ist simpel genug). `dompurify`/`expr-eval` separat auf gepatchte Versionen heben | L | Security | OPEN |
| F-03 | Security | HIGH | Dependencies | `package-lock.json` | `npm audit` gesamt (2026-07-21): **15 Vulns, davon 2 critical, 5 high** (Dev-Tree: Vite 5.x/Vitest 2.x-Kette) | Dev-Server-Vulns (Vite ≤5) sind real ausnutzbar wenn `npm run dev` mit `host: '0.0.0.0'` läuft (siehe F-04) — genau so ist der Dev-Server hier konfiguriert | `npm audit fix`; Vite auf 6/7, Vitest auf 3.x heben. Renovate/Dependabot einrichten — es gibt kein automatisiertes Dependency-Monitoring (CI führt `npm audit` nicht aus, siehe F-21) | M | Security | OPEN |
| F-04 | Security | HIGH | Dev-Server | `vite.config.ts:89` (`server.host: '0.0.0.0'`) | Dev-Server lauscht unkonditioniert auf allen Interfaces; `allowedHosts` nur optional via ENV (`vite.config.ts:90`) | Kombiniert mit F-03 (Vite-5-CVEs, u. a. DNS-Rebinding/`server.fs`-Bypässe) exponiert der Dev-Server Quellcode und Proxy (→ ioBroker!) ins LAN | `host: true` nur hinter ENV-Flag (`VITE_HOST=0.0.0.0`), Default `localhost`; `allowedHosts` verpflichtend wenn host offen | S | Security | OPEN |
| F-05 | Security | HIGH | API | `src/api/iobroker.ts:645` `sendToSql()` | `POST /command/sendTo` erlaubt beliebige Adapter-Kommandos; App nutzt es für `delete`/`deleteRange`/`deleteAll` auf History-Daten — unwiderrufliche Löschung ohne serverseitige Gegenkontrolle | Da REST ohne Auth (F-01): jeder Client kann via identischem Call komplette History-Tabellen leeren. Auch UI-seitig: `deleteAll` ist ein Ein-Klick-Datenverlust | Serverseitig: `sendTo` im REST-Adapter auf Whitelist beschränken (ioBroker-Konfig dokumentieren). Clientseitig: destruktive Calls hinter Confirm mit Klartext-Eingabe („DELETE" tippen) statt nur Button | S | Security | OPEN |
| F-06 | Security | MEDIUM | CSP | `nginx.conf:10` | CSP `connect-src 'self' http: https: ws: wss:` — erlaubt Verbindungen zu **jedem** Host; `style-src 'unsafe-inline'` | Ein XSS (falls je eines entsteht) kann Daten an beliebige externe Hosts exfiltrieren; CSP-Schutzwirkung für connect praktisch null | `connect-src` auf `'self'` + konkret konfigurierte ioBroker-Hosts einschränken (per entrypoint.sh templatebar, `IOBROKER_HOST` ist bekannt). `unsafe-inline` für styles ist mit Tailwind vermeidbar | S | Security | OPEN |
| F-07 | Security | MEDIUM | Config-Injection | `vite.config.ts:24` `devConfigPlugin` | `window.__CONFIG__ = { ioBrokerHost: '${host}' }` — ENV-Wert wird unescaped in JavaScript-String interpoliert. **Nur Dev-Pfad betroffen**: `docker/entrypoint.sh:12` nutzt bereits `printf '… %s' "$(cat)"` mit JSON-Serialisierung | Ein Wert mit `'` bricht `config.js` und damit stillschweigend die Host-Anzeige; theoretisch JS-Injection über kompromittierte ENV | `JSON.stringify(host)` statt String-Template in `vite.config.ts` | S | Security | OPEN |
| F-08 | Security | LOW | Storage | `src/api/iobroker.ts:22-38`, AppSettings | `JSON.parse` von localStorage-Inhalten ohne Schema-Validierung (`as SavedConnection[]`, `as Record<string, unknown>`) | Korrupte/manipulierte localStorage-Daten (anderer Tab, Extension, XSS aus Nachbar-App auf gleicher Origin) landen ungeprüft im App-State; nur `Array.isArray`-Check | Zod/valibot-Schema für `SavedConnection[]` und `AppSettings` beim Laden; bei Fehler auf Defaults zurückfallen | S | Stability | OPEN |
| F-09 | Architektur | HIGH | God Components | `src/components/statelist/StateList.tsx` (1542 Zeilen), `src/App.tsx` (1151 Zeilen) | Trotz bereits erfolgter Extraktionen (`useStateListView`, `useStateListModals`, `StateListToolbar`, `StateListBatchBar`) bleiben zwei Monolithen: StateList mischt Tabellen-Rendering, Header-Logik, Separator-Rows, Filter-UI; App.tsx orchestriert Datenfluss, Transport-Auswahl, ~15 Modals | Jede Änderung berührt riesige Dateien → Merge-Konflikte, hohe Review-Last, versteckte Kopplungen; Re-Render-Analyse in 1500-Zeilen-Komponente praktisch unmöglich | StateList weiter zerlegen: `StateListHeader` (Spalten/Sortierung), `SeparatorRow` als eigene memoisierte Komponenten. App.tsx: Modal-Orchestrierung in eine `<ModalHost/>` verschieben. Tests (RTL, 15 Dateien) sichern das Refactoring ab | L | Maintainability | OPEN |
| F-10 | Architektur | MEDIUM | Transport-Layer | `src/hooks/useSocketIO.ts`, `useLongPolling.ts`, Auswahl-Logik in `App.tsx` | Zwei parallele Transport-Hooks mit dupliziertem Cache-Patch-Code und geteiltem informellem Interface `{supported, connected}`; Auswahl-Logik lebt in der God-Component App.tsx | Cache-Update-Logik (React-Query-Patches auf `stateValue`-Keys) doppelt gepflegt → Drift-Gefahr (ein Transport patcht Keys, der andere vergisst neue) | Gemeinsames `RealtimeTransport`-Interface + geteilte `applyStatePush(queryClient, id, state)`-Funktion extrahieren; Transport-Auswahl in eigenen Hook `useRealtimeTransport()` | M | Maintainability | OPEN |
| F-11 | Architektur | MEDIUM | Fehlerbehandlung | `src/App.tsx` (einzige ErrorBoundary-Nutzung) | Globale ErrorBoundary + `ModalErrorFallback` vorhanden, aber Chart (Recharts wirft bei degenerierten Daten gern) und Tree haben keine eigenen Boundaries | Ein Rendering-Fehler in z. B. HistoryChart reißt größere UI-Bereiche weg als nötig | `react-error-boundary` ist bereits Dependency: Boundaries um jedes lazy-Modal (`<Suspense>` + `<ErrorBoundary>` kombinieren) und um StateTree/StateList | S | Stability | OPEN |
| F-12 | Performance | HIGH | Overfetching | `src/api/iobroker.ts:556` (`/command/getStates?pattern=*`) | Fallback lädt **alle** States der Installation in einem Request | Bei großen Installationen (50k+ States) Multi-MB-Response, Parse-Blockade des Main Threads, Speicher-Spike | Fallback auf per-Namespace-Patterns beschränken (analog `derivePatterns()` aus useLongPolling) statt `*` | M | Performance | FIXED (e189c03, 3aaf267) |
| F-13 | Performance | MEDIUM | Polling | `useStateValues` (30s-Poll) parallel zu Push-Transport | State-Werte werden alle 30 s gepollt, auch wenn socket.io verbunden ist und live patcht | Redundante Requests + Cache-Races | `pausedStatesRefetch()` in `src/utils/commPause.ts:21-24` gibt `false` zurück sobald `realtimeConnected` — in `App.tsx:436,473` verdrahtet. Polling ist bei aktivem Push aus | S | Performance | FIXED (`commPause.ts`) |
| F-14 | Performance | MEDIUM | Kontext-Granularität | `src/context/ToastContext.tsx:51`, `src/context/FilterContext.tsx` | ToastContext-Value ist Inline-Objekt `{{ showToast, toasts, dismiss }}` → neue Identität pro Render; jeder Toast-Konsument re-rendert bei jedem Provider-Render. FilterContext bündelt Pattern + Filter + Pagination + Historie in einem Context (525 Zeilen) | Tipp-Eingaben ins Suchfeld re-rendern alle Filter-Konsumenten inkl. Tabelle; Toast-Anzeige re-rendert alle `showToast`-Nutzer | ToastContext splitten: stabiler `showToast`-Context (useCallback) vs. volatiler `toasts`-Context (Pattern existiert schon bei UIContext — konsequent anwenden). FilterContext: Pattern via `useDeferredValue` entkoppeln | M | Performance | OPEN |
| F-15 | Performance | LOW | Bundle | `package.json` (recharts ~400 kB, lucide-react) | Kein Bundle-Monitoring; recharts landete über die statisch importierte ObjectEditModal→HistoryTab→HistoryChart-Kette im Initial-Chunk | Recharts (~430 kB) im Entry-Bundle, obwohl nur bei geöffnetem Chart gebraucht | `rollup-plugin-visualizer` in Build aufgenommen; ObjectEditModal + HistoryTab + HistoryModal via `lazy()` ausgelagert → recharts in eigenem Chunk. Index 1159→725 kB (gzip 326→200) | S | Performance | FIXED (12aa40e) |
| F-16 | Performance | LOW | PWA-Cache | `vite.config.ts:67,76` workbox `runtimeCaching` | `NetworkFirst` mit `cacheableResponse: { statuses: [0, 200] }` cached opaque Responses (Status 0) für `/v1/objects` und `/v1/states` | Opaque Responses belegen aufgebläht Cache-Quota (Chrome padded ~7 MB/Eintrag); bei Direct-Connect (cross-origin, http) sind alle Responses opaque | Status 0 aus `cacheableResponse` entfernen; States (Echtzeitdaten!) gar nicht SW-cachen — stale State-Werte in einem Smart-Home-Dashboard sind irreführend | S | Stability | OPEN |
| F-17 | Codequalität | MEDIUM | Typisierung | `src/api/iobroker.ts` (`sendToSql(): Promise<unknown>`, Response-Casts) | API-Responses per `as`-Cast statt Validierung; `sendToSql` gibt `unknown` zurück, Aufrufer casten frei (`data as { result?: HistoryEntry[] }`) | Server-Format-Änderung (Adapter-Update) erzeugt Runtime-Fehler tief in der UI statt klarer Fehlermeldung an der API-Grenze | Schmale Parse-Funktionen an der API-Grenze (`parseHistoryEntries(data): HistoryEntry[]` mit Feld-Checks); kein Zod-Zwang nötig, handgeschriebene Guards genügen | M | Stability | OPEN |
| F-18 | Codequalität | LOW | Dead Config | `src/api/iobroker.ts:4` `LS_HOST_KEY` Migrationscode | Legacy-Migration `ioBrokerHost` → `iob-connections` läuft bei jedem `getConnections()` mit; `switchToConnection` schreibt weiterhin den Legacy-Key | Doppelte Quelle der Wahrheit für aktiven Host (Legacy-Key + Connections-Array) — Drift möglich wenn nur einer geschrieben wird | Migration einmalig beim App-Start ausführen, danach Legacy-Key löschen; `getBaseUrl()` aus aktivem Connection-Objekt ableiten | S | Maintainability | OPEN |
| F-19 | Testing | HIGH | Abdeckung | `src/` gesamt: 15 Test-Dateien / 98 Source-Dateien | Kritische Pfade ungetestet: kein Test für `useSocketIO`/`useLongPolling` (Cache-Patch-Logik!), `useStateListView` (Sortierung/Filter/Pagination), `FilterContext`, API-Fehlerpfade, Batch-Edit, sämtliche destruktiven Mutationen (delete/rename/move/`putFullObject`/`importDatapoints`) | Regressionen in Kern-Logik (Push-Patches, Filter) fallen erst manuell auf; destruktive Operationen ohne Test-Netz | Priorisiert: (1) `useStateListView` (pure Logik, billig testbar), (2) Transport-Cache-Patches mit Mock-QueryClient, (3) Mutations-Hooks (msw/fetch-Mock für delete/put/import) | L | Stability | OPEN |
| F-20 | Testing | MEDIUM | E2E | fehlt komplett | Keine E2E-/Integrationstests gegen echte oder gemockte ioBroker-REST-API | Vertrag zwischen App und REST-Adapter (Response-Shapes, sendTo-Semantik) nur durch manuelle Nutzung abgesichert. Kern-Flow (suchen → klicken → editieren → speichern) ohne Automatisierung | Playwright + msw-Mock des REST-Adapters; ein Smoke-Test im CI genügt als Start | M | Stability | OPEN |
| F-21 | DevOps | MEDIUM | CI/CD | `.github/workflows/ci.yml` | CI existiert und läuft auf jedem Push/PR: `npm ci` → `npm run lint` → `npx tsc --noEmit` → `npm test` (Node 20, npm-Cache). **Fehlt:** `npm audit --omit=dev --audit-level=high` und ein Docker-Build-Job | Security-Regressions (F-02/F-03) bleiben unbemerkt; Docker-Image wird ungetestet gebaut | Zwei Steps ergänzen: Audit-Gate im bestehenden Job, `docker build` als zweiter Job | S | DX | PARTIAL |
| F-22 | DevOps | MEDIUM | Docker | `Dockerfile`, `.dockerignore` | `.dockerignore` existiert (`node_modules`, `dist`, `.git`, `*.md`) — **enthält aber kein `.env*`**; `COPY . .` (Dockerfile:6) zieht damit `.env.local` in den Builder-Layer. nginx läuft als root (Default-Image, kein `USER`-Directive) | `.env.local` mit internen Hostnamen landet im Builder-Layer; root-nginx vergrößert die Angriffsfläche bei nginx-Vuln oder Path-Traversal | `.env*` in `.dockerignore` ergänzen; `nginx:alpine-unprivileged` oder `user nginx` + Port 8080 | S | Security | PARTIAL |
| F-23 | Accessibility | MEDIUM | Gesamt-UI | Tabelle, Modals, Portal-Dropdowns, `ui/ContextMenu.tsx` | Grundlagen vorhanden (`role="grid"`, `aria-sort`, Skip-Link, `aria-label` auf Icon-Buttons, `document.documentElement.lang`). **Offen:** ContextMenu ohne `role="menu"`/`role="menuitem"` (im Code nicht vorhanden), Portal-Dropdowns (`EditableRoleCell` etc.) ohne geprüftes Focus-Management/`aria-expanded`, Modals ohne verifizierten Focus-Trap | Kontextmenü-only-Funktionen sind ohne Maus unerreichbar; Zellen-Editieren per Tastatur faktisch nicht unterstützt | Minimalprogramm: `role="menu"`/`menuitem` + Pfeiltasten im ContextMenu, Focus-Trap in Modals (`useEscapeKey` existiert schon — um Focus-Management ergänzen), alle Kontextmenü-Aktionen auch über Toolbar erreichbar machen | L | Maintainability | OPEN |
| F-24 | Rendering | LOW | Memoization | `StateList.tsx` (34 memo-Hooks), `StateRow` React.memo | Memoization vorhanden und StateRow memoisiert — gut. Aber: Callback-Props an StateRow aus 1542-Zeilen-Parent sind ohne Profiler-Nachweis nicht verifizierbar stabil; ein instabiler Callback macht `React.memo` wirkungslos für alle sichtbaren Rows | Bei jedem Parent-Render potenziell 50+ Row-Re-Renders trotz Virtualisierung | React DevTools Profiler-Session dokumentieren; `why-did-you-render` in Dev; Callbacks über `useEvent`-Pattern (Ref-Wrapper) stabilisieren | M | Performance | OPEN |
| F-25 | DX | LOW | Logging | 5 `console.*`-Aufrufe, keine Strategie | Kein zentrales Log/Debug-Flag; Transport-Verbindungsprobleme (häufigster Support-Fall laut Architektur) nur schwer diagnostizierbar | Fehlersuche beim Nutzer („warum verbindet socket.io nicht?") ohne Anhaltspunkte | Mini-Logger (`debug`-Style, per localStorage-Flag aktivierbar) für Transport-Layer; Verbindungs-Events in HostConnectedButton-Tooltip anzeigen | S | DX | OPEN |
| L-55 | Codequalität | LOW | Dead Code | `src/context/FilterContext.tsx:458-463` | `handleCreateDatapointAtPath` ist ein `useCallback`, dessen Body nur `void prefix;` enthält — reiner Noop. Ein Kommentar verweist auf SelectionContext; App.tsx:523 definiert und nutzt eine eigene, funktionierende Variante. Der Context-Eintrag steht trotzdem im `value`-Objekt (Zeilen 481, 499) und im Interface (Zeile 156) | Toter Eintrag in der Context-API verwirrt Leser und lädt zum Aufruf einer Funktion ein, die nichts tut | Aus `FilterContextValue`, `value`-Objekt und Datei entfernen | S | Maintainability | OPEN |
| L-58 | Architektur | LOW | Cache-Staleness | `src/hooks/useObjectQueries.ts` (12× `staleTime: Infinity`) | `useAllObjects`/`useFilteredObjects` u. a. nutzen `staleTime: Infinity`; Objekte werden nur durch explizite Mutations invalidiert | Externe Änderungen an ioBroker-Objekten (Admin-UI, Skripte, anderer Nutzer) werden ohne Page-Reload nie sichtbar. Der IndexedDB-Cache mit `objectsCacheTTL` mildert das, dokumentiert die Annahme aber nicht | Annahme in `docs/architecture.md` dokumentieren ODER langen `refetchInterval` (z. B. 5 min) als Background-Sync ergänzen — `useAllObjects()` akzeptiert bereits einen `refetchInterval`-Parameter | S | Maintainability | OPEN |

---

## Aus `todo.md` übernommen und verifiziert

Der alte Report (`todo.md`, Audit-Serie 2026-05-21 … 2026-06-28) listete 58 Findings, davon 51 als „Fixed". Stichprobenprüfung am 2026-07-21 gegen den Code:

| Alt-ID | Alte Aussage | Verifikationsergebnis |
|---|---|---|
| F-47 | „CI/CD Fixed" | **Bestätigt** — `.github/workflows/ci.yml` mit lint/tsc/test. Das neue F-21 („keine CI") war falsch und ist zu PARTIAL korrigiert |
| F-38 | „Duplizierte Modal-Verdrahtung, OPEN" | **Erledigt** — StateList nutzt `useStateListModals` + `StateListModals`; keine parallelen Modal-Systeme mehr. Entfällt |
| F-11 | „StateList 1504 Z., Partial" | **Weiterhin offen**, jetzt 1542 Z. → aufgegangen in F-09 |
| F-01 | „Fetch-Mock-Tests fehlen, Partial" | **Weiterhin offen** → aufgegangen in F-19 |
| F-46 | „Keine E2E-Tests" | **Weiterhin offen** → aufgegangen in F-20 |
| F-48 | „Docker root" | **Weiterhin offen** → aufgegangen in F-22 |
| F-55 | „Dead Function, OPEN" | **Bestätigt offen** → oben als L-55 |
| F-58 | „`staleTime: Infinity`, OPEN" | **Bestätigt offen** → oben als L-58 |
| F-17 | „HTTP im lokalen Netz, Mitigiert" | Unverändert; überlagert von F-01 (Auth) — kein eigener Eintrag mehr |

Alle übrigen als „Fixed" markierten Alt-Findings (Security-Header, CSP, XSS-Tokenizer, `expr-eval` statt `new Function`, SSRF-Regex, Bulk-State-Endpoint, Concurrency-Limit, `useMemo` auf Context-Values, ARIA-Grundlagen, Skip-Link, `HEALTHCHECK`, Vite-`define`-Version, …) wurden nicht einzeln nachgeprüft, sind aber im Executive Summary des aktuellen Audits als Positivbefund reflektiert.

---

# Executive Summary

Das Projekt ist für ein Einzelentwickler-Dashboard **überdurchschnittlich sauber**: TypeScript strict, React Query korrekt als Server-State-Layer, Virtualisierung, Context bewusst gesplittet (UIContext), lazy-geladene Modals, `expr-eval` statt `eval` für Alias-Formeln, DOMPurify vor dem einzigen `dangerouslySetInnerHTML`, durchdachte Zwei-Phasen-Ladelogik mit IndexedDB-Cache, CI auf jedem Push. Kein `any`-Missbrauch, kein XSS-Fund, kein Secret im Code.

Die realen Risiken liegen woanders:

1. **Sicherheitsmodell**: Die App hat volle Schreib- und Löschrechte auf ein Smart Home und **keinerlei Authentifizierung**. „Trusted network" ist als einzige Kontrolle für ein Tool mit `deleteAll`-Funktionen nicht vertretbar (F-01, F-05).
2. **Dependency-Hygiene**: `socket.io-client@2` ist EOL mit offenen Vulns; der Dev-Tree enthält 2 critical Findings; die CI kennt kein `npm audit` und es gibt kein Dependency-Monitoring (F-02, F-03, F-21).
3. **Wartbarkeits-Schulden**: Zwei God-Files (StateList 1542 LOC, App 1151 LOC) und eine Testabdeckung von ~15 %, die genau die riskantesten Pfade (Push-Cache-Patches, destruktive Mutationen) auslässt (F-09, F-19).

# Top Critical Findings

1. **F-01** Kein Auth — Vollzugriff inkl. Delete für jeden im Netz (CRITICAL)
2. **F-02** socket.io-client@2 EOL mit bekannten Vulns in Prod (CRITICAL)
3. **F-03** 2 critical / 5 high npm-audit-Findings, kein Monitoring (HIGH)
4. **F-04** Dev-Server auf 0.0.0.0 + verwundbares Vite 5 (HIGH)
5. **F-05** Unbeschränktes `sendTo` = Ein-Request-History-Löschung (HIGH)
6. **F-19** Kritische Logik (Transport-Patches, Mutationen) ungetestet (HIGH)
7. **F-09** God-Components StateList/App.tsx (HIGH)
8. **F-21** CI ohne Audit-Gate und ohne Docker-Build (MEDIUM)
9. **F-22** `.dockerignore` ohne `.env*`, nginx als root (MEDIUM)
10. **F-06** CSP `connect-src` erlaubt Exfiltration an jeden Host (MEDIUM)

# Quick Wins

- **F-21** `npm audit --omit=dev --audit-level=high` als CI-Step: 3 Zeilen, größter Hebel
- **F-22** `.env*` in `.dockerignore`: 1 Zeile
- **F-04** Dev-Server-Host hinter ENV-Flag: 5 Zeilen
- **F-07** `JSON.stringify` in `vite.config.ts:24`: 2 Zeilen
- **F-11** ErrorBoundary um lazy-Modals: Dependency existiert schon
- **F-16** Status 0 aus PWA `cacheableResponse` entfernen
- **F-06** `connect-src` in CSP einschränken
- **L-55** Noop `handleCreateDatapointAtPath` aus FilterContext entfernen

# Architektur-Risiken

- **God-Components** (F-09): StateList/App.tsx wachsen weiter — jedes neue Feature landet in denselben Dateien. Ohne Zerlegung steigt die Änderungs-Fehlerrate.
- **Doppelter Transport-Code** (F-10): Cache-Patch-Logik in zwei Hooks; neue Query-Keys müssen an zwei Stellen nachgezogen werden — klassische Drift-Falle.
- **API-Grenze ohne Validierung** (F-17): `as`-Casts koppeln die UI hart an aktuelle Adapter-Response-Shapes.
- **Positiv**: Context-Split (AppSettingsCtx/UIOverlayCtx), Query-Key-Factory, Hook-Extraktion (`useStateListView`, `useStateListModals`, `commPause`) zeigen, dass die Richtung stimmt — das Muster muss nur konsequent zu Ende geführt werden.

# Security-Risiken

- **Kein Auth** (F-01) + **unbeschränktes sendTo** (F-05) = jeder LAN-Teilnehmer kann das Smart Home steuern und Historien unwiderruflich löschen. Das ist das dominante Risiko; alles andere ist nachgelagert.
- **EOL-Dependency** socket.io-client@2 (F-02): keine Patches mehr, je länger gewartet wird, desto teurer der Ausstieg.
- **Dev-Server-Exposition** (F-04): 0.0.0.0 + Vite-5-CVEs + Proxy auf ioBroker = Dev-Rechner als Pivot ins Smart Home.
- **CSP praktisch wirkungslos für Exfiltration** (F-06).
- Kein XSS gefunden; der einzige `dangerouslySetInnerHTML` ist DOMPurify-gesichert (`ValueEditModal.tsx:266`). Alias-Formeln laufen über `expr-eval` (sandboxed AST-Evaluator), nicht `eval` — korrekt gelöst.

# Performance-Risiken

- ~~**`pattern=*`-Fallback** (F-12)~~ FIXED
- ~~**Redundantes Polling** (F-13)~~ FIXED — `pausedStatesRefetch()` schaltet den 30s-Poll bei aktivem Push ab
- ~~**Bundle unbeobachtet** (F-15)~~ FIXED
- **Context-Identitäten** (F-14): ToastContext-Inline-Value; FilterContext-Breite (525 Zeilen).
- **Unverifizierte Callback-Stabilität** (F-24): `React.memo` auf StateRow ohne Profiler-Nachweis.
- **Positiv**: Virtualisierung, `staleTime: Infinity` für Objekte, memoisierte StateRow, Batch-State-Fetches — die Grundarchitektur ist performance-bewusst.

# Empfohlene Roadmap

**Sofortmaßnahmen (diese Woche)**
- CI um `npm audit`-Gate + Docker-Build erweitern (F-21)
- `.env*` in `.dockerignore` (F-22, Teil 1)
- `npm audit fix`, Vite/Vitest-Major-Update planen (F-03)
- Dev-Server-Host absichern (F-04), config.js-Escaping (F-07)
- Confirm-Härtung für `deleteAll`/`deleteRange` (F-05, UI-Teil)

**Kurzfristig (2–4 Wochen)**
- Auth-Schicht vor die App (nginx Basic Auth / oauth2-proxy) (F-01)
- ErrorBoundaries um Modals (F-11), PWA-Cache-Fix (F-16), nginx non-root (F-22, Teil 2)
- Tests für `useStateListView` + Mutations-Hooks (F-19, Teil 1)
- Dead Code L-55 entfernen, `staleTime`-Annahme dokumentieren (L-58)

**Mittelfristig (1–3 Monate)**
- socket.io-client@2-Ausstieg evaluieren (F-02)
- StateList/App.tsx-Zerlegung (F-09), gemeinsamer Transport-Layer (F-10)
- API-Grenz-Validierung (F-17), E2E-Smoke-Test (F-20)
- ContextMenu-ARIA + Focus-Trap (F-23, Minimalprogramm)

**Langfristig (3–6 Monate)**
- Auth nativ (Bearer-Token gegen ioBroker-REST) statt nur Proxy-Auth
- Accessibility-Vollprogramm (F-23)
- Profiler-gestützte Render-Optimierung (F-24), Logging-Strategie (F-25)
- Renovate + Release-Automatisierung

---

## Feature Backlog

Übernommen aus `todo.md` (2026-07-21). Einträge, die inzwischen im Code umgesetzt sind, wurden entfernt: FE-086 (`formatTimestamp` liegt in `src/utils/format.ts`), FE-085 (CSV-Export in `HistoryChart.tsx` vorhanden). FE-088/FE-092 (A11y-Grundlagen) sind teilweise erledigt; der Rest ist in F-23 aufgegangen.

| ID | Kategorie | Priorität | Aufwand | Beschreibung |
|----|-----------|-----------|---------|--------------|
| FE-036 | Chart | high | M | Sparkline Mini-Chart in Value-Spalte: Trend der letzten 24h für History-fähige Datenpunkte |
| FE-024 | Performance | medium | M | HistoryChart: Downsampling für >1000 Datenpunkte — Recharts ruckelt bei großen Datasets |
| FE-039 | Chart | medium | M | Boolean-States als Gantt/Time-Bar-Chart: On-Perioden als farbige Balken statt Linien |
| FE-041 | Feature | medium | M | History-Adapter wählbar: aktuell hardcodiert auf sql.0; influxdb.0 und history.0 ergänzen |
| FE-070 | Security | medium | L | Auth für den Explorer selbst: Login-Screen oder HTTP Basic Auth vor App-Zugriff — überlappt mit F-01 |
| FE-071 | Security | medium | M | Auth für REST-API: Authentifizierung für ioBroker-REST-API-Requests (API-Key / Token) — überlappt mit F-01 |
| FE-083 | Code Quality | medium | S | `fetch()` ohne Timeout: hängender REST-Adapter blockiert Requests ewig — `AbortController` + konfigurierbares Timeout (30s) |
| FE-084 | Bug | medium | S | Batch-Delete via `Promise.all()`: ein Fehler bricht alle weiteren ab — auf `Promise.allSettled()` + per-Item-Fehlerreport umstellen |
| FE-087 | A11y | medium | S | ContextMenu ohne ARIA: kein `role="menu"` auf Container, kein `role="menuitem"` auf Items — Teilmenge von F-23 |
| FE-093 | Feature | medium | S | Batch-Edit-Bar: Read/Write-Checkboxen ergänzen für `common.read`/`common.write` |
| FE-094 | Feature | medium | M | Custom-Settings-Tab nur für sql.0 — history.0 / influxdb.0 ergänzen oder generischen Key/Value-Editor für unbekannte Adapter |
| FE-101 | UX | medium | S | Kein „Alle Filter löschen"-Button — Pattern, Room, Function, Quick-Filter, Column-Filter einzeln zu löschen ist aufwändig |
| FE-105 | UX | medium | S | Seitengröße nur in Settings änderbar — „pro Seite"-Dropdown direkt neben Pagination ergänzen |
| FE-108 | UX | medium | S | ObjectEditModal zeigt kein Ungespeichert-Indikator beim Tab-Wechsel — Punkt/Asterisk auf Tab-Label bei uncommitted Edits |
| FE-114 | Feature | medium | S | Role-Feld in ObjectEditModal nur für States editierbar — für folder/device/channel ergänzen |
| FE-126 | Bug | medium | S | Korrektheit von Objects/States-Counts prüfen: StateTree-Badge, Gesamt-Anzeige und TreeStatsModal konsistent? |
| FE-025 | Code Quality | low | S | Enum-Name-Parsing in shared `parseEnumName()` utility extrahieren |
| FE-026 | UX | low | M | Skeleton-Screens / Loading-States in StateList während Datenpunkt-Values geladen werden |
| FE-033 | Feature | low | L | Undo/Redo für Edits (Name, Role, Unit, Room, Function), v. a. nach Batch-Operationen |
| FE-047 | Feature | low | L | History-Daten-Import: CSV hochladen und als History-Einträge in sql.0 importieren |
| FE-064 | Security | low | S | HTTP statt HTTPS für Custom-Host: Custom-Host-URLs immer als `http://` gebaut, kein HTTPS |
| FE-065 | UX | low | S | CORS-Fehler nicht erkennbar: kein spezifisches Handling für CORS-Preflight-Fehler |
| FE-089 | Feature | low | S | `defaultHistoryRange` in AppSettings: History-Chart öffnet mit Nutzer-bevorzugtem Zeitbereich statt immer 24h |
| FE-090 | Feature | low | S | `defaultHistoryAggregation` in AppSettings: bevorzugte Aggregations-Methode bleibt über Sessions erhalten |
| FE-095 | Bug | low | S | CopyDatapointModal kopiert `common.smartName` nicht aus dem Quell-Objekt |
| FE-098 | Code Quality | low | S | `navigator.platform` deprecated (`Layout.tsx`, `HelpModal.tsx`) — auf `navigator.userAgentData.platform` oder UA-String umstellen |
| FE-099 | UX | low | S | Editierbare Tabellenzellen ohne Hover-Hintergrund — subtile Hintergrundtönung bei Hover ergänzen |
| FE-100 | UX | low | S | Pagination ohne „Gehe zu Seite"-Input — Zahleninput zwischen Vor/Zurück-Buttons ergänzen |
| FE-102 | UX | low | S | Aktive Filter-Anzahl nicht sichtbar — Badge „3 aktiv" in Filter/Suchbereich ergänzen |
| FE-106 | UX | low | S | SearchBar Autocomplete zeigt „Keine Vorschläge" nicht an — Hinweiszeile bei leerem Ergebnis ergänzen |
| FE-109 | UX | low | S | Kontextmenü ohne Tastaturkürzel-Hints neben Labels |

---

*Audit-Historie: initialer Report auf Commit `fac708b` (2026-05-21), Audits 2026-05-29/30, Zusammenführung 2026-05-31, Updates 2026-06-27/28, Neu-Audit 2026-07-15, Merge von `todo.md` + Code-Verifikation 2026-07-21.*

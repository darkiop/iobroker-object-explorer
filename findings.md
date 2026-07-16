# Technisches Audit — iobroker-object-explorer

Stand: 2026-07-15 · Branch `master` · Auditor-Rolle: Senior React Architect / Security / Performance

**Datenbasis:** Statische Codeanalyse (98 Source-Dateien, 15 Test-Dateien), `npm audit`, Build-/Docker-/nginx-Konfiguration. Kein Laufzeit-Profiling durchgeführt — Render-Messungen (React DevTools Profiler) und Bundle-Analyse (`rollup-plugin-visualizer`) fehlen als Datenpunkte und sollten nachgeholt werden.

---

## Findings

| ID | Kategorie | Priorität | Bereich | Datei/Pfad | Problem | Technische Auswirkung | Empfehlung | Aufwand | Risiko | Status |
|----|----|----|----|----|----|----|----|----|----|----|
| F-01 | Security | CRITICAL | Auth | gesamte API-Schicht (`src/api/iobroker.ts`) | Kein Auth-Mechanismus: alle REST-Calls ohne Credentials/Token; socket.io ebenfalls ohne Auth (in CLAUDE.md als „trusted networks only" dokumentiert) | Jeder mit Netzwerkzugriff auf nginx-Port kann Objekte lesen, ändern, **löschen** (`DELETE /object/…`, `deleteAll` History) — volle Schreibrechte aufs Smart Home inkl. Datenverlust | Mindestens nginx Basic Auth / OAuth-Proxy (authelia, oauth2-proxy) vor die App; langfristig ioBroker-REST-Auth (Bearer) unterstützen. „Trusted network" ist bei einem Tool mit Delete-Funktionen keine ausreichende Kontrolle | M | Security | OPEN |
| F-02 | Security | CRITICAL | Dependencies | `package.json` → `socket.io-client@^2.5.0` | Prod-Dependency mit bekannten Vulns: `parseuri` ReDoS (GHSA-6fx8-h7jm-663j, moderate) + weitere in `engine.io-client`; v2 ist seit Jahren EOL, keine Patches mehr | `npm audit --omit=dev`: 5 Vulns (4 moderate, 1 high) direkt aus dieser Kette. EOL heißt: künftige CVEs bleiben ungefixt | socket.io-client v2 in eigenes, isoliertes Modul kapseln ist bereits geschehen (`useSocketIO.ts`) — aber: prüfen ob der ioBroker-Adapter inzwischen v4 spricht (ws-Adapter statt socket.io-Adapter) oder direkten WebSocket-Client ohne socket.io-Protokoll implementieren (Protokoll v2 ist simpel genug) | L | Security | OPEN |
| F-03 | Security | HIGH | Dependencies | `package-lock.json` | `npm audit` gesamt: 14 Vulns, davon **2 critical, 3 high** (Dev-Tree: Vite 5.x/Vitest 2.x-Kette) | Dev-Server-Vulns (Vite ≤5) sind real ausnutzbar wenn `npm run dev` mit `host: 0.0.0.0` läuft (siehe F-04) — genau so ist der Dev-Server hier konfiguriert | `npm audit fix`; Vite auf 6/7, Vitest auf 3.x heben. Renovate/Dependabot einrichten — es gibt aktuell keinerlei automatisiertes Dependency-Monitoring | M | Security | OPEN |
| F-04 | Security | HIGH | Dev-Server | `vite.config.ts` (`server.host: '0.0.0.0'`) | Dev-Server lauscht unkonditioniert auf allen Interfaces; `allowedHosts` nur optional via ENV | Kombiniert mit F-03 (Vite-5-CVEs, u. a. DNS-Rebinding/`server.fs`-Bypässe) exponiert der Dev-Server Quellcode und Proxy (→ ioBroker!) ins LAN | `host: true` nur hinter ENV-Flag (`VITE_HOST=0.0.0.0`), Default `localhost`; `allowedHosts` verpflichtend wenn host offen | S | Security | OPEN |
| F-05 | Security | HIGH | API | `src/api/iobroker.ts:645` `sendToSql()` | `POST /command/sendTo` erlaubt beliebige Adapter-Kommandos; App nutzt es für `delete`/`deleteRange`/`deleteAll` auf History-Daten — unwiderrufliche Löschung ohne serverseitige Gegenkontrolle | Da REST ohne Auth (F-01): jeder Client kann via identischem Call komplette History-Tabellen leeren. Auch UI-seitig: `deleteAll` ist ein Ein-Klick-Datenverlust | Serverseitig: `sendTo` im REST-Adapter auf Whitelist beschränken (ioBroker-Konfig dokumentieren). Clientseitig: destruktive Calls hinter Confirm mit Klartext-Eingabe („DELETE" tippen) statt nur Button | S | Security | OPEN |
| F-06 | Security | MEDIUM | CSP | `nginx.conf` | CSP `connect-src 'self' http: https: ws: wss:` — erlaubt Verbindungen zu **jedem** Host; `style-src 'unsafe-inline'` | Ein XSS (falls je eines entsteht) kann Daten an beliebige externe Hosts exfiltrieren; CSP-Schutzwirkung für connect praktisch null | `connect-src` auf `'self'` + konkret konfigurierte ioBroker-Hosts einschränken (per entrypoint.sh templatebar, IOBROKER_HOST ist ja bekannt). `unsafe-inline` für styles ist mit Tailwind vermeidbar | S | Security | OPEN |
| F-07 | Security | MEDIUM | Config-Injection | `vite.config.ts` `devConfigPlugin`, `docker/entrypoint.sh` | `window.__CONFIG__ = { ioBrokerHost: '${host}' }` — ENV-Wert wird unescaped in JavaScript-String interpoliert | Wer ENV setzt, kontrolliert das Deployment (geringes Risiko), aber ein Wert mit `'` bricht `config.js` und damit stillschweigend die Host-Anzeige; theoretisch JS-Injection über kompromittierte ENV | `JSON.stringify(host)` statt String-Template; im entrypoint.sh Wert validieren (`^[A-Za-z0-9._:-]+$`) | S | Security | OPEN |
| F-08 | Security | LOW | Storage | `src/api/iobroker.ts:22-38`, AppSettings | `JSON.parse` von localStorage-Inhalten ohne Schema-Validierung (`as SavedConnection[]`, `as Record<string, unknown>`) | Korrupte/manipulierte localStorage-Daten (anderer Tab, Extension, XSS aus Nachbar-App auf gleicher Origin) landen ungeprüft im App-State; nur `Array.isArray`-Check | Zod/valibot-Schema für `SavedConnection[]` und `AppSettings` beim Laden; bei Fehler auf Defaults zurückfallen | S | Stability | OPEN |
| F-09 | Architektur | HIGH | God Components | `src/components/statelist/StateList.tsx` (1533 Zeilen), `src/App.tsx` (1134 Zeilen, 26 useState/useEffect) | Trotz bereits erfolgter Extraktionen (`useStateListView`, `useStateListModals`, Toolbar) bleiben zwei Monolithen: StateList mischt Tabellen-Rendering, Header-Logik, Separator-Rows, Batch-Bar, Filter-UI; App.tsx orchestriert Datenfluss, Transport-Auswahl, ~15 Modals | Jede Änderung berührt riesige Dateien → Merge-Konflikte, hohe Review-Last, versteckte Kopplungen; Re-Render-Analyse in 1500-Zeilen-Komponente praktisch unmöglich | StateList weiter zerlegen: `StateListHeader` (Spalten/Sortierung), `BatchBar`, `SeparatorRow` als eigene memoisierte Komponenten. App.tsx: Modal-Orchestrierung in eine `<ModalHost/>` verschieben, die nur `useStateListModals` konsumiert | L | Maintainability | OPEN |
| F-10 | Architektur | MEDIUM | Transport-Layer | `src/hooks/useSocketIO.ts`, `useLongPolling.ts`, Auswahl-Logik in `App.tsx` | Zwei parallele Transport-Hooks mit dupliziertem Cache-Patch-Code und geteiltem informellem Interface `{supported, connected}`; Auswahl-Logik lebt in der God-Component App.tsx | Cache-Update-Logik (React-Query-Patches auf `stateValue`-Keys) doppelt gepflegt → Drift-Gefahr (ein Transport patcht Keys, der andere vergisst neue) | Gemeinsames `RealtimeTransport`-Interface + geteilte `applyStatePush(queryClient, id, state)`-Funktion extrahieren; Transport-Auswahl in eigenen Hook `useRealtimeTransport()` | M | Maintainability | OPEN |
| F-11 | Architektur | MEDIUM | Fehlerbehandlung | `src/App.tsx` (einzige ErrorBoundary-Nutzung) | Nur eine globale Error Boundary; Modals, Chart (Recharts wirft bei degenerierten Daten gern), Tree haben keine eigenen Boundaries | Ein Rendering-Fehler in z. B. HistoryChart reißt die ganze App weg statt nur das Modal | `react-error-boundary` ist bereits Dependency: Boundaries um jedes lazy-Modal (`<Suspense>` + `<ErrorBoundary>` kombinieren) und um StateTree/StateList | S | Stability | OPEN |
| F-12 | Performance | HIGH | Overfetching | `src/api/iobroker.ts:556` (`/command/getStates?pattern=*`) | Fallback lädt **alle** States der Installation in einem Request | Bei großen Installationen (50k+ States) Multi-MB-Response, Parse-Blockade des Main Threads, Speicher-Spike — genau der Installationstyp, für den `includeIdPrefixes` gebaut wurde, wird hier umgangen | Fallback auf per-Namespace-Patterns beschränken (analog `derivePatterns()` aus useLongPolling) statt `*`; Response-Größe loggen/warnen | M | Performance | OPEN |
| F-13 | Performance | MEDIUM | Polling | `useStateValues` (30s-Poll) parallel zu Push-Transport | State-Werte werden alle 30 s gepollt, auch wenn socket.io verbunden ist und live patcht | Redundante Requests + Cache-Races (Poll-Response kann frischeren Push-Wert überschreiben, wenn Poll-Request vor dem Push gestartet wurde) | `refetchInterval` deaktivieren sobald `connected === true`; nur als Heartbeat (z. B. 5 min) behalten | S | Performance | OPEN |
| F-14 | Performance | MEDIUM | Kontext-Granularität | `src/context/FilterContext.tsx`, `ToastContext.tsx:51` | ToastContext-Value ist Inline-Objekt `{{ showToast, toasts, dismiss }}` → neue Identität pro Render; jeder Toast-Konsument re-rendert bei jedem Provider-Render. FilterContext bündelt Pattern + Filter + Pagination + Historie in einem Context | Tipp-Eingaben ins Suchfeld re-rendern alle Filter-Konsumenten inkl. Tabelle; Toast-Anzeige re-rendert alle `showToast`-Nutzer | ToastContext splitten: stabiler `showToast`-Context (useCallback) vs. volatiler `toasts`-Context (Pattern existiert schon bei UIContext — konsequent anwenden). FilterContext: Pattern via `useDeferredValue` entkoppeln | M | Performance | OPEN |
| F-15 | Performance | LOW | Bundle | `package.json` (recharts ~400 kB, lucide-react) | Kein Bundle-Monitoring; recharts ist schwerste Dependency, aber HistoryModal/HistoryChart sind lazy — DetailsTab (mini history chart) hängt jedoch an ObjectEditModal, der **nicht** lazy ist | Recharts landet potenziell im Initial-Chunk über die DetailsTab-Kette | `rollup-plugin-visualizer` in Build aufnehmen; ObjectEditModal ebenfalls `lazy()` laden (öffnet erst auf Klick); prüfen ob DetailsTab-Chart eigenes dynamic import braucht | S | Performance | OPEN |
| F-16 | Performance | LOW | PWA-Cache | `vite.config.ts` workbox `runtimeCaching` | `NetworkFirst` mit `cacheableResponse: { statuses: [0, 200] }` cached opaque Responses (Status 0) für `/v1/objects` und `/v1/states` | Opaque Responses belegen aufgebläht Cache-Quota (Chrome padded ~7 MB/Eintrag); bei Direct-Connect (cross-origin, http) sind alle Responses opaque | Status 0 aus `cacheableResponse` entfernen; States (Echtzeitdaten!) gar nicht SW-cachen — stale State-Werte in einem Smart-Home-Dashboard sind irreführend | S | Stability | OPEN |
| F-17 | Codequalität | MEDIUM | Typisierung | `src/api/iobroker.ts` (`sendToSql(): Promise<unknown>`, Response-Casts) | API-Responses per `as`-Cast statt Validierung; `sendToSql` gibt `unknown` zurück, Aufrufer casten frei (`data as { result?: HistoryEntry[] }`) | Server-Format-Änderung (Adapter-Update) erzeugt Runtime-Fehler tief in der UI statt klarer Fehlermeldung an der API-Grenze | Schmale Parse-Funktionen an der API-Grenze (`parseHistoryEntries(data): HistoryEntry[]` mit Feld-Checks); kein Zod-Zwang nötig, handgeschriebene Guards genügen | M | Stability | OPEN |
| F-18 | Codequalität | LOW | Dead Config | `src/api/iobroker.ts:4` `LS_HOST_KEY` Migrationscode | Legacy-Migration `ioBrokerHost` → `iob-connections` läuft bei jedem `getConnections()` mit; `switchToConnection` schreibt weiterhin den Legacy-Key | Doppelte Quelle der Wahrheit für aktiven Host (Legacy-Key + Connections-Array) — Drift möglich wenn nur einer geschrieben wird | Migration einmalig beim App-Start ausführen, danach Legacy-Key löschen; `getBaseUrl()` aus aktivem Connection-Objekt ableiten | S | Maintainability | OPEN |
| F-19 | Testing | HIGH | Abdeckung | `src/` gesamt: 15 Test-Dateien / 98 Source-Dateien | Kritische Pfade ungetestet: kein Test für `useSocketIO`/`useLongPolling` (Cache-Patch-Logik!), `useStateListView` (Sortierung/Filter/Pagination), `FilterContext`, API-Fehlerpfade, Batch-Edit, sämtliche destruktiven Mutationen (delete/rename/move) | Regressionen in Kern-Logik (Push-Patches, Filter) fallen erst manuell auf; destruktive Operationen (Rename = delete+create?) ohne Test-Netz | Priorisiert: (1) `useStateListView` (pure Logik, billig testbar), (2) Transport-Cache-Patches mit Mock-QueryClient, (3) Mutations-Hooks (msw für fetch). E2E (Playwright) für Kern-Flow: suchen → editieren → speichern | L | Stability | OPEN |
| F-20 | Testing | MEDIUM | E2E | fehlt komplett | Keine E2E-/Integrationstests gegen echte oder gemockte ioBroker-REST-API | Vertrag zwischen App und REST-Adapter (Response-Shapes, sendTo-Semantik) nur durch manuelle Nutzung abgesichert | Playwright + msw-Mock des REST-Adapters; ein Smoke-Test im CI genügt als Start | M | Stability | OPEN |
| F-21 | DevOps | HIGH | CI/CD | Repo-Root (kein `.github/workflows`) | Keine CI: Lint, `tsc`, Tests, `npm audit`, Docker-Build laufen nirgends automatisch | Master kann jederzeit broken sein; Security-Regressions (F-03) bleiben unbemerkt; Docker-Image wird ungetestet gebaut | GitHub Actions: `lint + tsc --noEmit + vitest run + npm audit --omit=dev --audit-level=high` auf jeden Push; Docker-Build als zweiter Job | S | DX | OPEN |
| F-22 | DevOps | MEDIUM | Docker | `Dockerfile` | Kein `.dockerignore`-Nachweis geprüft, aber `COPY . .` kopiert `node_modules`/`dist`/`.env.local` in den Build-Context wenn nicht ignoriert; nginx läuft als root (Default-Image) | `.env.local` mit internen Hostnamen könnte im Builder-Layer landen; root-nginx vergrößert Angriffsfläche | `.dockerignore` mit `node_modules`, `dist`, `.env*`, `.git`; `nginx:alpine-unprivileged` oder `user nginx` + Port 8080 | S | Security | OPEN |
| F-23 | Accessibility | MEDIUM | Gesamt-UI | Tabelle, Modals, Portal-Dropdowns | Virtualisierte Tabelle ohne erkennbare ARIA-Grid-Semantik; Portal-Dropdowns (`EditableRoleCell` etc.) und ContextMenu ohne geprüftes Focus-Management/`aria-expanded`; Modals: Focus-Trap nicht verifiziert | Tastatur-Nutzung (Zellen editieren ohne Maus) und Screenreader faktisch nicht unterstützt; für internes Tool tolerierbar, aber Kontextmenü-only-Funktionen sind ohne Maus unerreichbar | Minimalprogramm: Focus-Trap in Modals (`useEscapeKey` existiert schon — um Focus-Management ergänzen), alle Kontextmenü-Aktionen auch über sichtbare Buttons/Toolbar erreichbar machen, `role="grid"` + Pfeiltasten-Navigation als Stretch-Goal | L | Maintainability | OPEN |
| F-24 | Rendering | LOW | Memoization | `StateList.tsx` (34 memo-Hooks), `StateRow` React.memo | Memoization vorhanden und StateRow memoisiert — gut. Aber: Callback-Props an StateRow aus 1533-Zeilen-Parent sind ohne Profiler-Nachweis nicht verifizierbar stabil; ein instabiler Callback macht `React.memo` wirkungslos für alle sichtbaren Rows | Bei jedem Parent-Render potenziell 50+ Row-Re-Renders trotz Virtualisierung | React DevTools Profiler-Session dokumentieren; `why-did-you-render` in Dev; Callbacks über `useEvent`-Pattern (Ref-Wrapper) stabilisieren | M | Performance | OPEN |
| F-25 | DX | LOW | Logging | 5 `console.*`-Aufrufe, keine Strategie | Kein zentrales Log/Debug-Flag; Transport-Verbindungsprobleme (häufigster Support-Fall laut Architektur) nur schwer diagnostizierbar | Fehlersuche beim Nutzer („warum verbindet socket.io nicht?") ohne Anhaltspunkte | Mini-Logger (`debug`-Style, per localStorage-Flag aktivierbar) für Transport-Layer; Verbindungs-Events in HostConnectedButton-Tooltip anzeigen | S | DX | OPEN |

---

# Executive Summary

Das Projekt ist für ein Einzelentwickler-Dashboard **überdurchschnittlich sauber**: TypeScript strict, React Query korrekt als Server-State-Layer, Virtualisierung, Context bewusst gesplittet (UIContext), lazy-geladene Modals, `expr-eval` statt `eval` für Alias-Formeln, DOMPurify vor dem einzigen `dangerouslySetInnerHTML`, durchdachte Zwei-Phasen-Ladelogik mit IndexedDB-Cache. Kein `any`-Missbrauch, kein XSS-Fund, kein Secret im Code.

Die realen Risiken liegen woanders:

1. **Sicherheitsmodell**: Die App hat volle Schreib- und Löschrechte auf ein Smart Home und **keinerlei Authentifizierung**. „Trusted network" ist als einzige Kontrolle für ein Tool mit `deleteAll`-Funktionen nicht vertretbar (F-01, F-05).
2. **Dependency-Hygiene**: `socket.io-client@2` ist EOL mit offenen Vulns; der Dev-Tree enthält 2 critical Findings; es existiert kein CI und kein Dependency-Monitoring (F-02, F-03, F-21).
3. **Wartbarkeits-Schulden**: Zwei God-Files (StateList 1533 LOC, App 1134 LOC) und eine Testabdeckung von ~15 %, die genau die riskantesten Pfade (Push-Cache-Patches, destruktive Mutationen) auslässt (F-09, F-19).

# Top 10 Critical Findings

1. **F-01** Kein Auth — Vollzugriff inkl. Delete für jeden im Netz (CRITICAL)
2. **F-02** socket.io-client@2 EOL mit bekannten Vulns in Prod (CRITICAL)
3. **F-03** 2 critical / 3 high npm-audit-Findings, kein Monitoring (HIGH)
4. **F-04** Dev-Server auf 0.0.0.0 + verwundbares Vite 5 (HIGH)
5. **F-05** Unbeschränktes `sendTo` = Ein-Request-History-Löschung (HIGH)
6. **F-21** Keine CI — nichts wird automatisch verifiziert (HIGH)
7. **F-19** Kritische Logik (Transport-Patches, Mutationen) ungetestet (HIGH)
8. **F-09** God-Components StateList/App.tsx (HIGH)
9. **F-12** `getStates?pattern=*`-Fallback lädt gesamte Installation (HIGH)
10. **F-13** 30s-Polling läuft redundant neben Push-Transport, Race-Gefahr (MEDIUM)

# Quick Wins

- **F-21** CI-Workflow (lint + tsc + test + audit): ~1 h, größter Hebel
- **F-04** Dev-Server-Host hinter ENV-Flag: 5 Zeilen
- **F-07** `JSON.stringify` in config.js-Generierung: 2 Zeilen
- **F-13** Polling bei aktivem Push deaktivieren: 1 Bedingung
- **F-11** ErrorBoundary um lazy-Modals: Dependency existiert schon
- **F-16** Status 0 aus PWA `cacheableResponse` entfernen
- **F-22** `.dockerignore` anlegen
- **F-06** `connect-src` in CSP einschränken

# Architektur-Risiken

- **God-Components** (F-09): StateList/App.tsx wachsen weiter — jedes neue Feature (siehe Commit-Historie: History-Tab, Tooltip, Delete-Icons) landet in denselben Dateien. Ohne Zerlegung steigt die Änderungs-Fehlerrate.
- **Doppelter Transport-Code** (F-10): Cache-Patch-Logik in zwei Hooks; neue Query-Keys müssen an zwei Stellen nachgezogen werden — klassische Drift-Falle.
- **API-Grenze ohne Validierung** (F-17): `as`-Casts koppeln die UI hart an aktuelle Adapter-Response-Shapes.
- **Positiv**: Context-Split (AppSettingsCtx/UIOverlayCtx), Query-Key-Factory, Hook-Extraktion zeigen, dass die Richtung stimmt — das Muster muss nur konsequent zu Ende geführt werden.

# Security-Risiken

- **Kein Auth** (F-01) + **unbeschränktes sendTo** (F-05) = jeder LAN-Teilnehmer kann das Smart Home steuern und Historien unwiderruflich löschen. Das ist das dominante Risiko; alles andere ist nachgelagert.
- **EOL-Dependency** socket.io-client@2 (F-02): keine Patches mehr, je länger gewartet wird, desto teurer der Ausstieg.
- **Dev-Server-Exposition** (F-04): 0.0.0.0 + Vite-5-CVEs + Proxy auf ioBroker = Dev-Rechner als Pivot ins Smart Home.
- **CSP praktisch wirkungslos für Exfiltration** (F-06).
- Kein XSS gefunden; der einzige `dangerouslySetInnerHTML` ist DOMPurify-gesichert (ValueEditModal.tsx:266). Alias-Formeln laufen über `expr-eval` (sandboxed AST-Evaluator), nicht `eval` — korrekt gelöst.

# Performance-Risiken

- **`pattern=*`-Fallback** (F-12): Skalierungs-Killer bei großen Installationen — der einzige Fund mit potenziell mehrsekündigem UI-Freeze.
- **Redundantes Polling** (F-13): 30s-Refetch neben Live-Push verschwendet Requests und kann Push-Werte mit älteren Poll-Werten überschreiben.
- **Context-Identitäten** (F-14): ToastContext-Inline-Value; FilterContext-Breite.
- **Bundle unbeobachtet** (F-15): recharts-Kette über nicht-lazy ObjectEditModal.
- **Positiv**: Virtualisierung, `staleTime: Infinity` für Objekte, memoisierte StateRow, Batch-State-Fetches — die Grundarchitektur ist performance-bewusst.

# Empfohlene Roadmap

**Sofortmaßnahmen (diese Woche)**
- CI-Pipeline aufsetzen (F-21)
- `npm audit fix`, Vite/Vitest-Major-Update planen (F-03)
- Dev-Server-Host absichern (F-04), config.js-Escaping (F-07)
- Confirm-Härtung für `deleteAll`/`deleteRange` (F-05, UI-Teil)

**Kurzfristig (2–4 Wochen)**
- Auth-Schicht vor die App (nginx Basic Auth / oauth2-proxy) (F-01)
- Polling-Dedup bei aktivem Push (F-13)
- ErrorBoundaries um Modals (F-11), PWA-Cache-Fix (F-16), `.dockerignore` (F-22)
- Tests für `useStateListView` + Mutations-Hooks (F-19, Teil 1)

**Mittelfristig (1–3 Monate)**
- socket.io-client@2-Ausstieg evaluieren (F-02)
- StateList/App.tsx-Zerlegung (F-09), gemeinsamer Transport-Layer (F-10)
- `pattern=*`-Fallback durch Namespace-Patterns ersetzen (F-12)
- API-Grenz-Validierung (F-17), E2E-Smoke-Test (F-20)
- Bundle-Analyse + ObjectEditModal lazy (F-15)

**Langfristig (3–6 Monate)**
- Auth nativ (Bearer-Token gegen ioBroker-REST) statt nur Proxy-Auth
- Accessibility-Minimalprogramm (F-23)
- Profiler-gestützte Render-Optimierung (F-24), Logging-Strategie (F-25)
- Renovate + Release-Automatisierung

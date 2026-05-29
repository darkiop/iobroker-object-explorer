# Technical Audit Report — ioBroker Object Explorer

**Datum:** 2026-05-21 (aktualisiert 2026-05-29, Security-Sprint 2026-05-29)  
**Auditor:** Senior React Architect / Security Engineer  
**Scope:** Vollständiger Quellcode-Review (src/, Dockerfile, nginx.conf, package.json, docker/entrypoint.sh)  
**Methode:** Statische Code-Analyse, Dependency-Audit, Architektur-Review

---

## Findings

| ID | Status | Kategorie | Priorität | Bereich | Datei/Pfad | Problem | Technische Auswirkung | Empfehlung | Aufwand | Risiko |
|----|--------|-----------|-----------|---------|------------|---------|----------------------|------------|---------|--------|
| F-01 | Offen | Testing | CRITICAL | Testing | — (kein Test-Framework) | Kein einziger Test existiert im Projekt. Kein Unit-, Integrations- oder E2E-Test. TypeScript-Typen sind keine Funktionsprüfung. | Regressions bei Refactoring bleiben unentdeckt. Jede Änderung an API-Layer, Filter-Logik oder Mutations könnte produktiv fehlerhafte Daten schreiben — ohne Sicherheitsnetz. Besonders kritisch bei `deleteObject`, `putFullObject`, `importDatapoints`. | Vitest + React Testing Library einführen. Priorität: `filterObjectIds`, `getObjectsByPattern`, `loadAppSettings` (Migrations-Logik), `getStatesBatch`, alle Mutations mit Rollback. | XL | Stability |
| F-02 | **Fixed** | Codequalität / Bug | ~~CRITICAL~~ | State Management | `src/components/SettingsModal.tsx:146` | `includeScripts: settingsDraft.includeScripts` in `saveSettings()` ergänzt. Feld wird korrekt persistiert. | — | — | — | — |
| F-03 | **Fixed** | Architektur | ~~CRITICAL~~ | React-Architektur | `src/App.tsx` (638 Z.), `src/context/` | App.tsx auf 638 Zeilen reduziert. `FilterContext`, `SelectionContext`, `UIContext` extrahiert. `StateList` und `StateTree` mit `React.memo` abgesichert. `useReducer`-Konsolidierung als Maintainability-Aufgabe (kein Performance-Impact). | Cascading Re-Renders vollständig mitigiert. | — | — | — |
| F-04 | **Fixed** | Performance | ~~CRITICAL~~ | API / Netzwerk | `src/api/iobroker.ts:72–83` | `getAllObjects()` nutzt jetzt einen einzigen `GET /objects`-Request (commit `1676e3e`). | 5× Netzwerklast, Race Condition beim Merge eliminiert. | — | — | — |
| F-05 | **Fixed** | Performance | ~~CRITICAL~~ | Rendering | `src/context/UIContext.tsx:41,95` | `pageSize`-Default und Fallback von 1000 auf 200 gesenkt (commit `73cecef`). Virtualisierung greift ab 120 Items. | Render-Blockierung bei Erstinstallation eliminiert. | — | — | — |
| F-06 | **Fixed** | Security | ~~HIGH~~ | XSS | `src/components/StateList.tsx` | URL-Role href via `URL`-Parser sanitized (commit `da7b9fa`): nur `http:`/`https:` werden als Link gerendert, `data:` und `javascript:` fallen auf Textdarstellung zurück. | XSS-Vektor eliminiert. | — | — | — |
| F-07 | **Fixed** | Security | ~~HIGH~~ | XSS | `src/components/ImportDatapointsModal.tsx` | `DOMPurify.sanitize()` vor `dangerouslySetInnerHTML` (commit `f2032af`). dompurify als Dependency ergänzt. | XSS bei bösartigem JSON-Import verhindert. | — | — | — |
| F-08 | **Fixed** | Security | ~~HIGH~~ | Dependency | `package.json` | `npm audit fix` + recharts 3.8.1 (commit `7f396f8`): flatted, rollup, minimatch, picomatch behoben. Verbleibend: 2 moderate in esbuild/vite (nur Build-Tool). | Alle 4 HIGH-Vulnerabilities eliminiert. | — | — | — |
| F-09 | **Fixed** | Security | ~~HIGH~~ | Misconfiguration | `nginx.conf` | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` ergänzt (commit `c3a43a6`). | Clickjacking-Schutz aktiv. | — | — | — |
| F-10 | **Fixed** | Architektur | ~~HIGH~~ | Dependencies | `package.json` | `@tanstack/react-query` befindet sich jetzt in `dependencies`. | — | — | — | — |
| F-11 | Offen | Architektur | HIGH | React-Architektur | `src/components/StateList.tsx` (3264 Z.) | 12+ Komponenten in einer Datei. Editable\*Cell-Komponenten identisch strukturiert — ~400 Zeilen Duplication. | Kognitiv nicht wartbar. IDE-Performance leidet. | Jede Editable\*Cell in eigene Datei unter `src/components/cells/`. `usePortalDropdown()`-Hook extrahieren. | L | Maintainability |
| F-12 | Offen | Architektur | HIGH | React-Architektur | `src/App.tsx`, `src/components/` | Keine Error Boundaries. Exception in beliebiger Komponente → weißer Bildschirm, kein Recovery. | Vollständiger App-Crash bei einem einzigen Render-Fehler. Kein Stack-Trace in Produktion. | `react-error-boundary`: eine Boundary für die App, eine für Modals. | S | Stability |
| F-13 | **Fixed** | Performance | ~~HIGH~~ | API / Hauptthread | `src/api/iobroker.ts` | O(n×m)-Script-Suche in 200-ID-Batches aufgeteilt; `setTimeout(r,0)` yieldet zwischen Batches (commit `db716e5`). Langfristig: Web Worker. | Tab-Freeze verhindert. | — | — | — |
| F-14 | **Teilweise** | Codequalität | ~~MEDIUM~~ → LOW | Code Duplication | `src/api/iobroker.ts`, `src/components/StateList.tsx:1201` | Import-Kollision behoben (commit `4ffb41d`). Lokale `hasSmartName()`-Kopie (Z. 1201) besteht noch. `formatTimestamp()` und `formatValue()` weiterhin dupliziert. | Redundanter Code. Bug-Fix muss an 2 Stellen gepflegt werden. | Lokale `hasSmartName`-Kopie entfernen. `formatTimestamp`/`formatValue` → `src/utils/format.ts`. | S | Maintainability |
| F-15 | Offen | Codequalität | MEDIUM | Dead Code | `src/api/iobroker.ts:59` | `isDisplayable(obj)` gibt genau `!!obj` zurück. Missverständliche Abstraktion, 8× aufgerufen. | Kognitive Last. | Direkt `!!obj` einsetzen. Funktion löschen. | S | Maintainability |
| F-16 | Offen | Codequalität | MEDIUM | Architecture | `src/api/iobroker.ts:61–62` | Module-level `objectsCache` parallel zu React Querys Cache. `clearObjectsCache()` muss manuell aufgerufen werden. Race Condition bei schnellen Mutations möglich. | Zwei Caches können desynchronisieren. | Module-level Cache entfernen. React Querys `queryClient.getQueryData()` als Single Source of Truth. | M | Stability |
| F-17 | **Mitigiert** | Security | ~~MEDIUM~~ → INFO | Transport | `src/api/iobroker.ts:5–11` | HTTPS-Zugriff via Reverse Proxy funktioniert jetzt korrekt (commit `95fcf56`): `getBaseUrl()` routet bei HTTPS immer über `/api/v1`, nginx übernimmt die HTTP-Verbindung serverseitig. Offen: Direktverbindungen über HTTP bleiben unverschlüsselt (im lokalen Netz akzeptabel). | Mixed Content behoben. | HTTPS-Termination per nginx für Remote-Zugriff (Architektur bereits vorbereitet). | — | Security |
| F-18 | Offen | Codequalität | MEDIUM | TypeScript | `src/api/iobroker.ts:526–527, 570–571` | `as unknown as Record<string, unknown>` als `any`-Äquivalent für Script-Properties. 6× im API-File. | Kein TypeScript-Schutz für Script-Objekt-Zugriffe. Laufzeitfehler bei fehlendem Feld möglich. | `IoBrokerObjectCommon` um `source?: string; engineType?: string; enabled?: boolean;` erweitern. | S | Maintainability |
| F-19 | **Fixed** | Performance | ~~MEDIUM~~ | React | `src/hooks/useStates.ts` | `gcTime: 60_000` gesetzt, IDs im Query-Key sortiert (commit `27b7c21`). Alte Seiten-Queries werden nach 60s entfernt statt nach 5 min. | Bis zu 10 simultane Polling-Queries eliminiert. | — | — | — |
| F-20 | Offen | Architektur | MEDIUM | React-Architektur | `src/App.tsx` | `DateFormatDropdown` und Utility-Funktionen (`parseEnumFilters`, `normalizeQuickPattern`, `parseColWidthMap`) noch in App.tsx definiert. | Testbarkeit eingeschränkt. | `DateFormatDropdown` → eigene Datei. Utility-Funktionen → `src/utils/`. | S | Maintainability |
| F-21 | **Fixed** | Build / Security | ~~MEDIUM~~ | Docker / Config | `docker/entrypoint.sh` | `IOBROKER_HOST` wird jetzt via `printf` mit expliziter JSON-Struktur serialisiert (commit `c5b1f17`). Heredoc-Injection nicht mehr möglich. | Shell-Injection eliminiert. | — | — | — |
| F-22 | Offen | Codequalität | MEDIUM | React | `src/components/StateList.tsx:242, 355` | `setTimeout(() => inputRef.current?.focus(), 0)` in `useEffect`. Race Condition wenn Komponente zwischen Render und Timeout unmountet. | Flackernder oder fehlender Fokus bei schnellen Interaktionen. | `autoFocus`-Prop oder `useLayoutEffect` statt `useEffect` + `setTimeout`. | S | Stability |
| F-23 | **Fixed** | Security | ~~MEDIUM~~ | Deprecated API | `src/utils/clipboard.ts` | `document.execCommand('copy')` aus clipboard.ts und beiden inline-Fallbacks in StateList entfernt (commit `dd1a9b6`). Nur `navigator.clipboard.writeText()` wird verwendet. | Deprecated API vollständig entfernt. | — | — | — |
| F-24 | **Fixed** | Performance | ~~MEDIUM~~ | Netzwerk | `src/api/iobroker.ts` | Alle 4 Enum-Mutations (`updateRoomMembership`, `updateFunctionMembership` + Batch-Varianten) nutzen jetzt `getAllObjects()` statt `fetchApi('/objects?type=enum')` (commit `62dab5b`). | Bis zu 200 API-Fetches bei Batch-Edit von 100 Objekten eliminiert. | — | — | — |
| F-25 | Offen | Codequalität | MEDIUM | localStorage | `src/App.tsx` | `visibleCols` wird in zwei localStorage-Keys geschrieben: `LS_APP_SETTINGS` und `'iobroker-visible-cols'`. Drei-Wege-State kann desynchronisieren. | visibleCols in RAM, `LS_APP_SETTINGS` und Legacy-Key können auseinanderlaufen. | Legacy-Key `'iobroker-visible-cols'` entfernen. `loadVisibleCols()` in StateList streichen. | S | Maintainability |
| F-26 | **Teilweise** | Build | ~~MEDIUM~~ → LOW | DevOps | `vite.config.ts:29` | `allowedHosts` um `localhost`, `127.0.0.1` und Produktions-Hostname erweitert (commit `95fcf56`). Weiterhin hardcodiert statt aus ENV. | Liste wächst mit jedem neuen Deployment-Host. | `allowedHosts: env.VITE_ALLOWED_HOSTS?.split(',') ?? true` | S | DX |
| F-27 | Offen | Accessibility | HIGH | A11y | `src/components/StateList.tsx`, `src/App.tsx` | 80+ Icon-Only-Buttons ohne `aria-label`. Nur `title`-Attribut vorhanden. | App für Screen-Reader-Nutzer nicht bedienbar. WCAG 2.1 AA nicht erfüllt. | `aria-label` auf alle Icon-Only-Buttons (Wert = `title`-Wert). | L | Stability |
| F-28 | Offen | Accessibility | MEDIUM | A11y | `src/components/StateList.tsx:98–114` | Threshold-Highlighting nur via Farbe (`text-red-600`, `text-yellow-600`). Kein Icon, kein ARIA. | WCAG 2.1 Kriterium 1.4.1 verletzt. Colorblind-Nutzer erkennen Status nicht. | Status-Icon ergänzen: `<AlertTriangle size={10} aria-label="Value exceeded" />`. | S | Stability |
| F-29 | Offen | Architektur | LOW | Codequalität | `src/api/iobroker.ts:30–34` | `getNameString()` und `parseLocalizedName()` fast identisch. Verwirrende Benennung. | Risiko der falschen Funktion an der falschen Stelle. | In `src/utils/i18n.ts` konsolidieren: `getLocalizedName(raw, lang?)` und `getAllNamesForSearch(raw)`. | S | Maintainability |
| F-30 | Offen | Build | LOW | DX | `package.json` | Version bleibt `0.0.0`. Kein Build-Datum oder Git-Hash in der App sichtbar. | Diagnose nach Deployments unmöglich. | `define: { __APP_VERSION__: JSON.stringify(pkg.version) }` in vite.config. Im Footer anzeigen. | S | DX |

---

## Executive Summary

Das Projekt ist eine **funktionsreiche, intern gut strukturierte** React-Applikation für ioBroker-Administration. Der Entwickler demonstriert solides React-Wissen (TanStack Query, Optimistic Updates, Portal-basierte Dropdowns, TypeScript strict mode). Die App ist produktiv einsatzfähig.

**Seit dem initialen Audit behobene Punkte:** F-02, F-03, F-04, F-05, F-06, F-07, F-08, F-09, F-10, F-13, F-17 (mitigiert), F-19, F-21, F-23, F-24, F-26 (teilweise).

**Die verbleibenden kritischen Probleme:**

1. **Keine Tests** — Die Codebase wächst aktiv ohne jegliches Sicherheitsnetz. Eine falsche Zeile in `filterObjectIds` oder `loadAppSettings` ist nicht erkennbar bis ein Nutzer es bemerkt.

2. **God Component StateList.tsx** — 3264 Zeilen, 12+ Komponenten. App.tsx wurde bereits erheblich reduziert; StateList ist der nächste Kandidat.

Die Sicherheitslage hat sich erheblich verbessert: alle XSS-Vektoren geschlossen, Security-Header gesetzt, 4 HIGH-npm-Vulnerabilities behoben. Das Risikoprofil ist jetzt für ein internes Tool angemessen.

---

## Top 10 Offene Findings (nach Priorität)

| Rank | ID | Status | Titel | Warum kritisch |
|------|----|--------|-------|----------------|
| 1 | F-01 | Offen | Kein Test-Framework | Regressions bei jeder Änderung unerkennbar. Mutations können produktiv Daten beschädigen. |
| 2 | F-12 | Offen | Keine Error Boundaries | Einzelner Render-Fehler crasht die gesamte App ohne Recovery. |
| 3 | F-11 | Offen | StateList.tsx 3264 Zeilen | 12 Komponenten in 1 Datei. Maintainability-Grenze überschritten. |
| 4 | F-27 | Offen | Icon-Buttons ohne aria-label | App für Screen-Reader-Nutzer nicht bedienbar. WCAG 2.1 AA nicht erfüllt. |
| 5 | F-16 | Offen | Paralleler Cache-Layer | `objectsCache` + React Query Cache können desynchronisieren. |
| 6 | F-14 | Teilweise | Code-Duplikation (format utils) | `formatTimestamp`/`formatValue` an 2 Stellen — Bug-Fixes müssen doppelt gepflegt werden. |
| 7 | F-25 | Offen | Doppelter localStorage-Key (visibleCols) | Drei-Wege-State kann desynchronisieren. |
| 8 | F-20 | Offen | Utility-Funktionen in App.tsx | Testbarkeit eingeschränkt. |
| 9 | F-28 | Offen | Threshold-Highlighting nur via Farbe | WCAG 2.1 Kriterium 1.4.1 verletzt. Colorblind-Nutzer betroffen. |
| 10 | F-26 | Teilweise | allowedHosts hardcodiert | Liste wächst mit jedem Deployment-Host. |

---

## Quick Wins

Hoch-Impact, geringer Aufwand — innerhalb eines Tages umsetzbar:

| ID | Status | Maßnahme | Aufwand | Impact |
|----|--------|----------|---------|--------|
| F-02 | ✅ Fixed | `includeScripts` in `saveSettings()` ergänzt | — | Bug-Fix |
| F-10 | ✅ Fixed | `@tanstack/react-query` nach `dependencies` verschoben | — | Kritischer Prod-Fix |
| F-06 | ✅ Fixed | URL-Role `href`-Sanitization via `URL`-Parser | — | XSS-Fix |
| F-07 | ✅ Fixed | `DOMPurify.sanitize()` in `ImportDatapointsModal.tsx` | — | XSS-Mitigation |
| F-08 | ✅ Fixed | `npm audit fix` + recharts 3.8.1 | — | 4 HIGH-Vulnerabilities behoben |
| F-09 | ✅ Fixed | Security-Header in `nginx.conf` | — | Clickjacking-Schutz |
| F-21 | ✅ Fixed | Shell-Injection in `entrypoint.sh` behoben | — | Docker-Injection-Fix |
| F-23 | ✅ Fixed | `document.execCommand` entfernt | — | Deprecated API entfernt |
| F-12 | Offen | `react-error-boundary` installieren, `<ErrorBoundary>` um App und Modals | 15 Zeilen | App-Crash verhindert |
| F-15 | Offen | `isDisplayable()` entfernen, direkte Null-Checks einsetzen | S | Dead-Code-Cleanup |
| F-14 | Offen | `formatTimestamp`/`formatValue` in `src/utils/format.ts` extrahieren | 30 min | Duplikation + Bug in ObjectEditModal |
| F-26 | Offen | `allowedHosts` in vite.config.ts aus ENV-Variable | 2 Zeilen | DX für alle Entwickler |

---

## Architektur-Risiken

### Langfristiges Haupt-Risiko: Monolithische Komponenten

App.tsx (638 Z.) und Context-Segmentierung (FilterContext, SelectionContext, UIContext) sind abgeschlossen. StateList.tsx (3264 Zeilen) bleibt der größte offene Punkt — 12+ Komponenten, ~400 Zeilen Editable\*Cell-Duplikation.

### Risiko: Paralleler Cache-Layer

Der module-level `objectsCache` in `api/iobroker.ts` ist ein zweiter Cache neben React Querys eigenem Cache. `clearObjectsCache()` muss manuell aufgerufen werden. Bei schnellen aufeinanderfolgenden Mutations (z.B. Batch-Edit von 100 Objekten) kann es zu kurzzeitigen Inkonsistenzen kommen.

---

## Security-Risiken

### Priorität 1: XSS-Vektoren (F-06, F-07, F-21)

Beide XSS-Vektoren erfordern Schreibzugriff auf ioBroker-Daten oder Docker-Konfiguration. Für ein internes Tool mit vertrauenswürdigen Nutzern ist das Risiko gering, aber nicht null: ein kompromittierter ioBroker-Adapter könnte einen State mit `data:`-URL setzen.

### Priorität 2: Dependency-Vulnerabilities (F-08)

`flatted` Prototype Pollution ist das einzig wirklich laufzeitrelevante Risiko. `flatted` ist eine transitive Dep von `recharts`. Upgrade auf `recharts@3.7.1+` sollte die `flatted`-Version aktualisieren.

### Priorität 3: Transport-Sicherheit (F-17 — mitigiert)

HTTPS via Reverse Proxy funktioniert jetzt korrekt. Direktverbindungen im lokalen Netz bleiben unverschlüsselt — für den Anwendungsfall akzeptabel.

---

## Performance-Risiken

### Kritischer Pfad: Initialer Ladevorgang (nach Performance-Sprint)

```
Browser öffnet App
  → 1× GET /objects (F-04 ✅) — einzelner Request
  → JSON.parse 1× Payload — Main Thread kurz blockiert
  → buildAliasReverseMap() — O(n) über alle Objekte
  → allStateIds useMemo — O(n) über alle Objekte
  → treeHistoryIds/treeSmartIds/danglingAliasCount useMemo — O(n)
```

Die O(n)-Berechnungen bleiben, aber sind unvermeidbar und bereits durch `useMemo` gecacht.

### Polling-Overhead

`useStateValues` pollt alle 30 Sekunden. Alte Seiten-Queries werden jetzt nach 60s bereinigt (F-19 ✅). Pagesize-Default auf 200 gesenkt (F-05 ✅) — maximal 4 parallele Batches statt 20.

**Langfristig:** WebSocket-basiertes State-Update statt Polling, wenn ioBroker's `socket.io`-Interface verfügbar ist.

---

## Empfohlene Roadmap

### Sofortmaßnahmen

1. ~~**F-02**~~ ✅ Bug-Fix `includeScripts` in `saveSettings()`
2. ~~**F-10**~~ ✅ `@tanstack/react-query` nach `dependencies`
3. ~~**F-04**~~ ✅ `getAllObjects()` auf 1 API-Call reduziert
4. ~~**F-05**~~ ✅ pageSize-Default auf 200 gesenkt
5. ~~**F-06, F-07**~~ ✅ XSS-Fixes (URL-Sanitization, DOMPurify in Import)
6. ~~**F-09**~~ ✅ nginx Security-Header
7. ~~**F-08**~~ ✅ `npm audit fix` + recharts upgrade
8. ~~**F-21**~~ ✅ Shell-Injection in entrypoint.sh behoben
9. ~~**F-23**~~ ✅ `document.execCommand` entfernt
10. **F-12** — Error Boundaries mit `react-error-boundary` — 1 Stunde

### Kurzfristig (nächste 2 Wochen)

9. **F-14** — `formatTimestamp`/`formatValue`/`hasSmartName` in `src/utils/format.ts` extrahieren
10. **F-01** — Vitest installieren, erste Tests für `filterObjectIds`, `loadAppSettings`, `getObjectsByPattern`
11. **F-23** — `document.execCommand` entfernen
12. **F-25** — `'iobroker-visible-cols'` Legacy-Key Migration abschließen

### Mittelfristig (1–2 Monate)

13. **F-11** — StateList.tsx aufteilen: Editable\*Cell in `src/components/cells/`, `usePortalDropdown` extrahieren
14. **F-20** — DateFormatDropdown und Utility-Funktionen aus App.tsx auslagern
15. **F-16** — Module-level Cache in `api/iobroker.ts` entfernen, React Query als Single Source of Truth
16. **F-01** — Test-Abdeckung für alle Mutations und Optimistic-Update-Rollbacks

### Langfristig (3–6 Monate)

17. **F-27, F-28** — Accessibility: `aria-label` auf alle Icon-Buttons, Status-Icons für Threshold
18. Script-Suche (F-13) in Web Worker auslagern (Batch-Yielding ist kurzfristige Lösung)
19. Performance-Audit mit React DevTools Profiler

---

*Initialer Report basiert auf Commit `fac708b`. Aktualisiert 2026-05-29 auf Basis von Commits bis `7f396f8` (Performance-Sprint + Security-Sprint: F-03–F-09, F-13, F-17, F-19, F-21, F-23, F-24).*

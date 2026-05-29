# Technical Audit Report — ioBroker Object Explorer

**Datum:** 2026-05-21 (aktualisiert 2026-05-29, S-Sprint 2026-05-29)  
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
| F-04 | **Fixed** | Performance | ~~CRITICAL~~ | API / Netzwerk | `src/api/iobroker.ts` | `getAllObjects()` nutzt 2 parallele Requests (`/objects` + `/objects?type=enum`). Enum-Objekte werden explizit geladen da `/objects` ohne Filter keine Enums liefert. Von 5 auf 2 Calls reduziert. | Netzwerklast reduziert, Race Condition beim Merge eliminiert. | — | — | — |
| F-05 | **Fixed** | Performance | ~~CRITICAL~~ | Rendering | `src/context/UIContext.tsx:41,95` | `pageSize`-Default und Fallback von 1000 auf 200 gesenkt (commit `73cecef`). Virtualisierung greift ab 120 Items. | Render-Blockierung bei Erstinstallation eliminiert. | — | — | — |
| F-06 | **Fixed** | Security | ~~HIGH~~ | XSS | `src/components/StateList.tsx` | URL-Role href via `URL`-Parser sanitized (commit `da7b9fa`): nur `http:`/`https:` werden als Link gerendert, `data:` und `javascript:` fallen auf Textdarstellung zurück. | XSS-Vektor eliminiert. | — | — | — |
| F-07 | **Fixed** | Security | ~~HIGH~~ | XSS | `src/components/ImportDatapointsModal.tsx` | `DOMPurify.sanitize()` vor `dangerouslySetInnerHTML` (commit `f2032af`). dompurify als Dependency ergänzt. | XSS bei bösartigem JSON-Import verhindert. | — | — | — |
| F-08 | **Fixed** | Security | ~~HIGH~~ | Dependency | `package.json` | `npm audit fix` + recharts 3.8.1 (commit `7f396f8`): flatted, rollup, minimatch, picomatch behoben. Verbleibend: 2 moderate in esbuild/vite (nur Build-Tool). | Alle 4 HIGH-Vulnerabilities eliminiert. | — | — | — |
| F-09 | **Fixed** | Security | ~~HIGH~~ | Misconfiguration | `nginx.conf` | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` ergänzt (commit `c3a43a6`). | Clickjacking-Schutz aktiv. | — | — | — |
| F-10 | **Fixed** | Architektur | ~~HIGH~~ | Dependencies | `package.json` | `@tanstack/react-query` befindet sich jetzt in `dependencies`. | — | — | — | — |
| F-11 | Offen | Architektur | HIGH | React-Architektur | `src/components/StateList.tsx` (3264 Z.) | 12+ Komponenten in einer Datei. Editable\*Cell-Komponenten identisch strukturiert — ~400 Zeilen Duplication. | Kognitiv nicht wartbar. IDE-Performance leidet. | Jede Editable\*Cell in eigene Datei unter `src/components/cells/`. `usePortalDropdown()`-Hook extrahieren. | L | Maintainability |
| F-12 | **Fixed** | Architektur | ~~HIGH~~ | React-Architektur | `src/App.tsx` | `react-error-boundary` installiert. `AppErrorFallback` mit Reload-Button auf App-Ebene; `fallback=null`-Boundary um alle Modals isoliert Modal-Crashes von der Hauptansicht. | App-Crash durch Fehler-Recovery ersetzt. | — | — | — |
| F-13 | **Fixed** | Performance | ~~HIGH~~ | API / Hauptthread | `src/api/iobroker.ts` | O(n×m)-Script-Suche in 200-ID-Batches aufgeteilt; `setTimeout(r,0)` yieldet zwischen Batches (commit `db716e5`). Langfristig: Web Worker. | Tab-Freeze verhindert. | — | — | — |
| F-14 | **Fixed** | Codequalität | ~~MEDIUM~~ | Code Duplication | `src/utils/format.ts` | `formatTimestamp`/`formatValue` → `src/utils/format.ts` extrahiert. `hasSmartName`-Kopie in StateList entfernt, Import aus api/iobroker.ts. ObjectEditModal nutzt jetzt `dateFormat`-Prop für Zeitstempel. | Duplikation vollständig beseitigt. | — | — | — |
| F-15 | **Fixed** | Codequalität | ~~MEDIUM~~ | Dead Code | `src/api/iobroker.ts` | `isDisplayable()` entfernt. Alle 5 Aufrufe durch direkte `!!obj`/`!obj`-Checks ersetzt. | Dead Code eliminiert. | — | — | — |
| F-16 | Offen | Codequalität | MEDIUM | Architecture | `src/api/iobroker.ts:61–62` | Module-level `objectsCache` parallel zu React Querys Cache. `clearObjectsCache()` muss manuell aufgerufen werden. Race Condition bei schnellen Mutations möglich. | Zwei Caches können desynchronisieren. | Module-level Cache entfernen. React Querys `queryClient.getQueryData()` als Single Source of Truth. | M | Stability |
| F-17 | **Mitigiert** | Security | ~~MEDIUM~~ → INFO | Transport | `src/api/iobroker.ts:5–11` | HTTPS-Zugriff via Reverse Proxy funktioniert jetzt korrekt (commit `95fcf56`): `getBaseUrl()` routet bei HTTPS immer über `/api/v1`, nginx übernimmt die HTTP-Verbindung serverseitig. Offen: Direktverbindungen über HTTP bleiben unverschlüsselt (im lokalen Netz akzeptabel). | Mixed Content behoben. | HTTPS-Termination per nginx für Remote-Zugriff (Architektur bereits vorbereitet). | — | Security |
| F-18 | **Fixed** | Codequalität | ~~MEDIUM~~ | TypeScript | `src/types/iobroker.ts` | `source?` und `engineType?` zu `IoBrokerObjectCommon` ergänzt. Alle `as unknown as Record<string, unknown>`-Casts entfernt. | Volle TypeScript-Sicherheit für Script-Properties. | — | — | — |
| F-19 | **Fixed** | Performance | ~~MEDIUM~~ | React | `src/hooks/useStates.ts` | `gcTime: 60_000` gesetzt, IDs im Query-Key sortiert (commit `27b7c21`). Alte Seiten-Queries werden nach 60s entfernt statt nach 5 min. | Bis zu 10 simultane Polling-Queries eliminiert. | — | — | — |
| F-20 | **Fixed** | Architektur | ~~MEDIUM~~ | React-Architektur | `src/context/UIContext.tsx` | `normalizeQuickPattern`-Duplikat in SettingsModal entfernt, Export aus UIContext. Alle Utility-Funktionen bereits in Context-Files konsolidiert. | Duplikation beseitigt. | — | — | — |
| F-21 | **Fixed** | Build / Security | ~~MEDIUM~~ | Docker / Config | `docker/entrypoint.sh` | `IOBROKER_HOST` wird jetzt via `printf` mit expliziter JSON-Struktur serialisiert (commit `c5b1f17`). Heredoc-Injection nicht mehr möglich. | Shell-Injection eliminiert. | — | — | — |
| F-22 | **Fixed** | Codequalität | ~~MEDIUM~~ | React | `src/components/StateList.tsx` | `useEffect` + `setTimeout(fn, 0)` durch `useLayoutEffect` ohne Timeout ersetzt in allen 3 Editable-Cells. | Race Condition eliminiert. | — | — | — |
| F-23 | **Fixed** | Security | ~~MEDIUM~~ | Deprecated API | `src/utils/clipboard.ts` | `document.execCommand('copy')` aus clipboard.ts und beiden inline-Fallbacks in StateList entfernt (commit `dd1a9b6`). Nur `navigator.clipboard.writeText()` wird verwendet. | Deprecated API vollständig entfernt. | — | — | — |
| F-24 | **Fixed** | Performance | ~~MEDIUM~~ | Netzwerk | `src/api/iobroker.ts` | Alle 4 Enum-Mutations (`updateRoomMembership`, `updateFunctionMembership` + Batch-Varianten) nutzen jetzt `getAllObjects()` statt `fetchApi('/objects?type=enum')` (commit `62dab5b`). | Bis zu 200 API-Fetches bei Batch-Edit von 100 Objekten eliminiert. | — | — | — |
| F-25 | **Fixed** | Codequalität | ~~MEDIUM~~ | localStorage | `src/context/UIContext.tsx` | Legacy-Key `'iobroker-visible-cols'` entfernt. `loadVisibleCols()` und `LS_KEY` aus StateList entfernt. `handleColChange` ruft `persistSettings()`. `LS_APP_SETTINGS` ist einzige Quelle. | Drei-Wege-State-Desynchronisation beseitigt. | — | — | — |
| F-26 | **Fixed** | Build | ~~MEDIUM~~ | DevOps | `vite.config.ts` | `VITE_ALLOWED_HOSTS=host1,host2` in `.env` überschreibt jetzt die hartcodierte Liste. Fallback auf bisherige Hosts bleibt erhalten. | DX für neue Deployment-Hosts ohne Code-Änderung. | — | — | — |
| F-27 | Offen | Accessibility | HIGH | A11y | `src/components/StateList.tsx`, `src/App.tsx` | 80+ Icon-Only-Buttons ohne `aria-label`. Nur `title`-Attribut vorhanden. | App für Screen-Reader-Nutzer nicht bedienbar. WCAG 2.1 AA nicht erfüllt. | `aria-label` auf alle Icon-Only-Buttons (Wert = `title`-Wert). | L | Stability |
| F-28 | **Fixed** | Accessibility | ~~MEDIUM~~ | A11y | `src/components/StateList.tsx` | `AlertTriangle`-Icon bei `exceeded` und `warn` Threshold-Status ergänzt. `aria-label` auf DE/EN lokalisiert. WCAG 2.1 Kriterium 1.4.1 erfüllt. | Colorblind-Nutzer erkennen Status ohne Farbe. | — | — | — |
| F-29 | **Fixed** | Architektur | ~~LOW~~ | Codequalität | `src/utils/i18n.ts` | `getLocalizedName(raw, lang?)` und `getAllNamesForSearch(raw)` in `src/utils/i18n.ts` konsolidiert. Lokale Definitionen in `api/iobroker.ts` entfernt. | Klare Benennung, keine Verwechslungsgefahr mehr. | — | — | — |
| F-30 | **Fixed** | Build | ~~LOW~~ | DX | `vite.config.ts`, `src/components/Layout.tsx` | `__APP_VERSION__` aus `package.json` via Vite `define` eingebettet. Wird dezent als `vX.Y.Z` im Header angezeigt. | App-Version jederzeit sichtbar. | — | — | — |

---

## Executive Summary

Das Projekt ist eine **funktionsreiche, intern gut strukturierte** React-Applikation für ioBroker-Administration. Der Entwickler demonstriert solides React-Wissen (TanStack Query, Optimistic Updates, Portal-basierte Dropdowns, TypeScript strict mode). Die App ist produktiv einsatzfähig.

**Seit dem initialen Audit behobene Punkte:** F-02 bis F-30 vollständig — einzige verbleibende offene Findings sind F-01 (Tests, XL), F-11 (StateList-Split, L) und F-27 (aria-label, L) sowie F-16 (Cache, M).

**Die verbleibenden Probleme:**

1. **Keine Tests (F-01)** — Die Codebase wächst aktiv ohne jegliches Sicherheitsnetz. Besonders kritisch bei `filterObjectIds`, `loadAppSettings` und allen Mutations mit Rollback.

2. **God Component StateList.tsx (F-11)** — 3264 Zeilen, 12+ Komponenten. Letzter großer Architektur-Schuldner.

Die Sicherheitslage hat sich erheblich verbessert: alle XSS-Vektoren geschlossen, Security-Header gesetzt, 4 HIGH-npm-Vulnerabilities behoben. Das Risikoprofil ist jetzt für ein internes Tool angemessen.

---

## Top 10 Offene Findings (nach Priorität)

| Rank | ID | Status | Titel | Warum kritisch |
|------|----|--------|-------|----------------|
| 1 | F-01 | Offen | Kein Test-Framework | Regressions bei jeder Änderung unerkennbar. Mutations können produktiv Daten beschädigen. |
| 2 | F-11 | Offen | StateList.tsx 3264 Zeilen | 12 Komponenten in 1 Datei. Maintainability-Grenze überschritten. |
| 3 | F-27 | Offen | Icon-Buttons ohne aria-label | App für Screen-Reader-Nutzer nicht bedienbar. WCAG 2.1 AA nicht erfüllt. |
| 4 | F-16 | Offen | Paralleler Cache-Layer | `objectsCache` + React Query Cache können desynchronisieren. |

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
| F-12 | ✅ Fixed | `react-error-boundary` mit App- und Modal-Boundary | — | App-Crash verhindert |
| F-14 | ✅ Fixed | `formatTimestamp`/`formatValue`/`hasSmartName` → `src/utils/format.ts` | — | Duplikation + Bug in ObjectEditModal |
| F-15 | ✅ Fixed | `isDisplayable()` entfernt, direkte Null-Checks | — | Dead-Code-Cleanup |
| F-18 | ✅ Fixed | Script-Properties in `IoBrokerObjectCommon` typisiert | — | TypeScript-Schutz |
| F-20 | ✅ Fixed | `normalizeQuickPattern`-Duplikat entfernt | — | Single Source of Truth |
| F-22 | ✅ Fixed | `useLayoutEffect` statt `setTimeout`-focus | — | Race Condition eliminiert |
| F-25 | ✅ Fixed | Legacy-Key `'iobroker-visible-cols'` entfernt | — | Desync verhindert |
| F-26 | ✅ Fixed | `allowedHosts` aus `VITE_ALLOWED_HOSTS` ENV | — | DX für neue Hosts |
| F-28 | ✅ Fixed | `AlertTriangle`-Icon bei Threshold + aria-label | — | WCAG 1.4.1 erfüllt |
| F-29 | ✅ Fixed | `getLocalizedName`/`getAllNamesForSearch` in `utils/i18n.ts` | — | Klare Benennung |
| F-30 | ✅ Fixed | App-Version im Header via Vite define | — | Diagnose nach Deploy |

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

*Initialer Report basiert auf Commit `fac708b`. Aktualisiert 2026-05-29 auf Basis von Commits bis `135030e` (Performance-Sprint + Security-Sprint + S-Sprint: F-02 bis F-30 vollständig abgearbeitet — nur F-01, F-11, F-16, F-27 noch offen).*

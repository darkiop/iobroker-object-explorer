# Performance-Analyse — iobroker-object-explorer

> **⚠️ Superseded (2026-07-21):** Zusammengeführt mit [2026-06-12-optimization-plan.md](2026-06-12-optimization-plan.md) und gegen den aktuellen Code neu verifiziert → **[2026-07-21-optimization-performance.md](../specs/2026-07-21-optimization-performance.md)**. Hier nur noch als Historie.

Stand: 2026-07-04. Reines Code-Review (React 18 + TanStack Query v5 + `@tanstack/react-virtual` + Tailwind + Vite), keine Änderungen vorgenommen. Referenzen sind `Datei:Zeile` aus dem gelesenen Code.

---

## 1. Re-Render-Hotspots

1. **`src/components/HostConnectedButton.tsx:16`** — `const { appSettings } = useUIContext();` nutzt den kombinierten Hook, der sowohl `AppSettingsCtx` (stabil) als auch `UIOverlayCtx` (volatil, ändert sich bei jedem Öffnen/Schließen von Settings/Shortcuts-Modal) abonniert. Die Komponente braucht aber nur `appSettings`. Jedes Öffnen/Schließen eines beliebigen Overlays rendert `HostConnectedButton` neu, obwohl sich `appSettings` nicht geändert hat.
   **Fix:** `useAppSettingsContext()` statt `useUIContext()` verwenden.
   **Wirkung:** niedrig (kleine Komponente, aber im Header immer gemountet).

2. **`src/components/Layout.tsx:40`** — gleiches Muster: `useUIContext()` statt gezielt `useAppSettingsContext()`/`useUIOverlayContext()`. `Layout` ist die App-Shell (Sidebar, Divider) — re-rendert bei jedem Modal-Toggle, obwohl es i. d. R. nur Settings-Werte für Breite/Sidebar-Status braucht.
   **Fix:** aufsplitten in die zwei granularen Hooks, nur dort `useUIOverlayContext()` einbinden wo `settingsOpen`/`shortcutsOpen` tatsächlich gebraucht werden.
   **Wirkung:** mittel (Layout ist Top-Level, re-rendert potenziell große Kindbäume falls nicht durch `memo` abgeschirmt).

3. **`src/App.tsx:157`** — `useUIContext()` im Root-Component. Da `App.tsx` ohnehin bei fast jeder Statusänderung rendert (Query-Daten, Panel-State etc.), ist das hier weniger kritisch, aber es bestätigt, dass die in `UIContext.tsx:270-273` extra bereitgestellte Trennung (`AppSettingsCtx` stabil / `UIOverlayCtx` volatil, s. Kommentar `UIContext.tsx:220-222` und `:244-246`) von den Verbrauchern nicht konsequent genutzt wird — nur `StateList.tsx:75` (`useAppSettingsContext`) macht es richtig.
   **Fix:** in `App.tsx` die beiden Contexts einzeln importieren und nur dort spreaden wo nötig.
   **Wirkung:** niedrig (Effekt vermutlich durch bestehende Downstream-`memo`s teilweise abgefangen).

4. **`src/context/FilterContext.tsx:460-496`** — der `value`-useMemo ist korrekt gebaut, aber die Deps-Liste enthält praktisch *alle* States des Providers (inkl. `roomFilters`, `functionFilters`, `quickPatterns` als `Set`-Objekte). Jede Interaktion mit Room/Function/Quick-Filtern erzeugt über `setRoomFilters(new Set(...))` etc. (z. B. `handleRoomToggle:342-355`) eine neue `Set`-Instanz und dadurch eine neue `value`-Identität — jede Komponente, die `useFilterContext()` konsumiert (auch für Felder, die sie gar nicht braucht, z. B. nur `pattern`), rendert mit. Es gibt keine Aufteilung wie bei `UIContext` in "volatil" vs. "stabil".
   **Fix:** analog zu `UIContext` in einen stabilen Kern (Pattern/Sort/Anzeige-Optionen) und einen volatilen Teil (Dropdown-`open`-Flags: `roomsOpen`, `functionsOpen`, `typesOpen`, `quickOpen`, `savedFiltersOpen`, `saveFilterPromptOpen`) aufteilen — letztere ändern sich pro Klick und haben mit Datenfilterung nichts zu tun.
   **Wirkung:** mittel — `FilterContext` wird von `StateList`, `StateTree`, Toolbar etc. konsumiert; jede Dropdown-Öffnung (`roomsOpen`/`functionsOpen`/`typesOpen`) löst potenziell eine Re-Render-Kaskade über den gesamten gefilterten Datenbereich aus.

5. **`src/context/PanelContext.tsx:18-26`** — `PanelContextProvider` bekommt `value` als Prop von außen (`FilterContext.tsx:498-508`, `panel1Value`) — dieses Objekt ist ein **Objektliteral, das bei jedem Render von `FilterContextProvider` neu erstellt wird** (nicht `useMemo`-isiert). Jede State-Änderung im `FilterContextProvider` (z. B. `treeSearch`, das nicht mal Teil von `panel1Value` ist) erzeugt eine neue `panel1Value`-Referenz und damit einen Rerender aller `usePanelContext()`-Konsumenten (`StateList.tsx:72`), selbst wenn keines der in `panel1Value` enthaltenen Felder sich geändert hat.
   **Fix:** `panel1Value` mit `useMemo` auf die enthaltenen Felder (`colFilters, pattern, treeFilter, sidebarToggleSeq, fulltextEnabled`) memoisieren.
   **Wirkung:** mittel — `StateList` ist die teuerste Komponente der App; unnötige Re-Renders hier sind der größte Hebel.

6. **`src/context/SelectionContext.tsx:39-47`** — `value` ist zwar gememoized, aber sämtliche 7 Felder liegen in einem Context, obwohl sie fachlich unabhängig sind (`selectedId` ändert sich oft, `enumManagerOpen`/`autoAliasDeviceId` selten). Jede Selektion einer Zeile rendert alle Konsumenten von `useSelectionContext()` neu, auch wenn sie nur an `enumManagerOpen` interessiert sind.
   **Fix:** ggf. splitten in `selectedId`-Context (hochfrequent) und "Modal-Trigger"-Context (niederfrequent) analog zu `UIContext`.
   **Wirkung:** niedrig — Konsumenten sind meist Modals, die ohnehin nur bei offenem Zustand rendern.

---

## 2. Memoization-Lücken

1. **`src/components/statelist/StateList.tsx:475-533`** (`displayItems`-`useMemo`) — korrekt gememoized, aber die Funktion baut bei jedem Trigger (`filteredIds`, `collapsedPrefixes`, …) zwei neue `Map`/`Set`-Strukturen (`childPrefixesMap`, `directLeavesMap`, `filteredIdSet`) komplett neu auf und rekursiert per `visit()` über den ganzen Baum. Bei > 1000 Zeilen mit `groupByPath=true` ist das O(n) pro Trigger — unvermeidbar bei diesem Datenmodell, aber `allSepPrefixes` (`StateList.tsx:432-446`) wird bereits bei jedem `filteredIds`-Wechsel neu berechnet und dann in `displayItems` erneut durchlaufen; die beiden Durchläufe ließen sich in einer Pass-Berechnung zusammenlegen.
   **Fix:** `allSepPrefixes`-Aufbau und `childPrefixesMap`/`directLeavesMap`-Aufbau in einem gemeinsamen `useMemo` zusammenfassen, um einen der beiden O(n)-Durchläufe zu sparen.
   **Wirkung:** mittel bei sehr großen Bäumen (>5000 Objekte) mit aktivem `groupByPath`.

2. **`src/components/statelist/StateList.tsx:781-803`** (`handleContainerKeyDown`) — als normale Funktion (nicht `useCallback`) definiert und direkt als `onKeyDown`-Prop an den Container gebunden (`StateList.tsx:888`). Da der Container aber nicht in `StateRow` liegt (kein Virtualisierungs-Overhead durch Prop-Identität), ist die Wirkung gering — aber inkonsistent zum Rest der Datei, wo Handler wie `handleCheckRow`/`handleRowContextMenu` bewusst `useCallback` bekommen (`StateList.tsx:571-626`).
   **Fix:** der Vollständigkeit halber `useCallback`, niedrige Priorität.
   **Wirkung:** niedrig.

3. **`src/components/statelist/StateList.tsx:1097` ff.** (Zeilen-Rendering-Schleife `visibleItems.map(...)`) — für `kind === 'sep'`-Zeilen werden bei jedem Render **komplett neue Inline-Closures** für `onDragOver`, `onDragEnter`, `onDrop`, `onClick`, `ref`-Callback erzeugt (`StateList.tsx:1106-1168`). Da Separator-Zeilen kein `React.memo` besitzen (im Gegensatz zu `StateRow`), ist das an sich kein Regressions-Bug, aber bei häufigen Scroll-getriggerten Re-Renders (z. B. durch `rowVirtualizer`) werden diese Objekte pro sichtbarer Sep-Zeile neu alloziert — bei tiefen Gruppenhierarchien mit vielen sichtbaren Ordnern spürbar.
   **Fix:** Separator-Zeile in eine eigene `React.memo`-Komponente auslagern (analog zu `StateRow`), Handler mit `useCallback` binden.
   **Wirkung:** mittel (betrifft besonders `groupByPath`-Nutzer mit tiefen Namensräumen).

4. **`src/components/statelist/StateRow.tsx:715-716`** (`rowVirtualizer` in `StateList.tsx`, `estimateSize: () => ROW_HEIGHT_PX[appSettings.rowHeight]`) — die Größenschätzfunktion selbst ist eine neue Closure bei jedem Render von `StateList` (kein `useCallback`), wird aber nur einmal beim Virtualizer-Setup verwendet; `useVirtualizer` selbst re-created bei jedem Render, da die Optionen als Objektliteral übergeben werden (`StateList.tsx:712-718`) — laut `@tanstack/react-virtual`-Doku ist das Standardverhalten (kein Re-Init-Problem), aber `estimateSize` ändert sich nicht dynamisch mit der Zeilenanzahl der echten DOM-Messung, sodass unterschiedliche `rowHeight`-Werte (`compact` 33px … `spacious` 52px, `UIContext.tsx:9-14`) nur die **initiale** Schätzung ändern; bereits gemessene/virtualisierte Items werden nicht neu vermessen, bis der Nutzer scrollt — kann zu kurzzeitigen Layout-Sprüngen führen, wenn `rowHeight` zur Laufzeit umgeschaltet wird.
   **Fix:** beim Wechsel von `appSettings.rowHeight` `rowVirtualizer.measure()` explizit aufrufen (falls von der Lib unterstützt) oder den Virtualizer per `key` remounten.
   **Wirkung:** niedrig (nur beim Live-Umschalten der Zeilenhöhe in den Settings betroffen, kein Dauerzustand).

5. **`src/components/statelist/StateRow.tsx:83-506`** — der `React.memo`-Comparator (Zeilen 466-505) ist gut gepflegt und deckt die meisten Felder ab — **fehlt aber**: `prev.showDesc === next.showDesc`, `prev.showObjectTypeIcons === next.showObjectTypeIcons`, `prev.showUnitInValue === next.showUnitInValue`, `prev.scriptSources === next.scriptSources`, `prev.rowHeight === next.rowHeight`. Diese Props werden zwar meist stabil pro Render-Zyklus übergeben, aber der Comparator lässt sie unkontrolliert durch — im Zweifel rendert eine Zeile nicht neu, obwohl sich z. B. `rowHeight` geändert hat (Bug in die andere Richtung: zu aggressive Memoisierung), oder sie rendert unnötig neu, wenn eine der ungeprüften Props sich zufällig ändert, aber alle geprüften gleich bleiben (kann in der Praxis kaum vorkommen, da diese Werte i. d. R. app-weit synchron gesetzt werden).
   **Fix:** fehlende Felder in den Comparator aufnehmen, insbesondere `rowHeight` (steuert `--row-py`, sichtbarer visueller Unterschied) und `scriptSources`.
   **Wirkung:** mittel — potenzieller visueller Bug: nach Wechsel der Zeilenhöhe in den Settings könnten einzelne, aus dem Viewport verschwundene und wieder eingeblendete Zeilen (recycled durch den Virtualizer) mit alter Padding-Höhe hängen bleiben, bis eine andere geprüfte Prop sie zum Neu-Rendern zwingt.

6. **`src/components/StateTree.tsx:142-145`** (`isExpandableFolder`, laut Sub-Agent-Recherche) — ruft `hasExpandableBranch()` (`StateTree.tsx:42-55`) rekursiv über den gesamten Teilbaum auf, pro Knoten. Das ist zwar mit `useMemo` gegen `allObjects` abgesichert (rendert nur bei Datenänderung neu), aber es gibt **keine globale Memoisierung über alle Knoten hinweg** — bei einem tiefen Baum mit tausenden Knoten wird bei jedem `allObjects`-Refetch (Phase 2, Socket-Objekt-Patches) der gesamte Baum erneut in $O(n^2)$ traversiert (jeder Knoten läuft erneut über seinen kompletten Teilbaum).
   **Fix:** einmalige Bottom-Up-Berechnung einer `Map<id, boolean>` "hasExpandableChild" auf Baum-Ebene statt pro-Knoten-Rekursion.
   **Wirkung:** mittel bis hoch bei sehr großen Installationen (>10.000 Objekte) mit aktivem Live-Push (Objekt-Änderungen kommen laufend über `useSocketIO`/`useLongPolling` rein und patchen `objects.all`, was `allObjects`-Referenz ändert und diese teure Neuberechnung re-triggert).

---

## 3. Query-Layer

1. **`src/hooks/useObjectQueries.ts:55-62`** (`useAllObjects`) und **`:13-20`** (`useStateObjectsFast`) — zwei komplett getrennte React-Query-Caches (`['objects','bootstrap']` vs. `queryKeys.objects.all`) für überlappende Daten (Phase 1 ist eine Teilmenge von Phase 2). Es gibt **keinen** `invalidateQueries`, der die beiden synchronisiert — wenn Phase 2 (`getAllObjects`, laut Sub-Agent in `api/iobroker.ts:350-391`) abschließt, bleibt die Phase-1-Query (`objects.bootstrap`) auf dem alten Stand, bis ein Socket/Longpolling-`objectChange`-Event sie patcht (`useSocketIO.ts:108-116`, `OBJECTS_BOOTSTRAP_KEY` wird dort separat mitgepatcht). Funktional korrekt gelöst über Live-Patch, aber führt zu **doppelt gehaltenem State** mit Drift-Potenzial, falls Live-Push mal ausfällt (z. B. reines Longpolling ohne Objekt-Events — `useLongPolling.ts` patcht laut Code nur `states.valuesRoot`/`states.detail`, **nicht** Objekt-Caches! Nur `useSocketIO.ts` hat `makeApplyObjectChange`).
   **Fix:** dokumentieren/prüfen, dass im Longpolling-Fallback Objekt-Änderungen (Rename, neues Property, Custom-Settings) am Ende nur über `objectsRefreshInterval`-Polling (`AppSettings`, `UIContext.tsx:45`) oder manuellen Refresh ankommen — ggf. UI-Hinweis.
   **Wirkung:** mittel (funktional, kein reines Performance-Problem, aber relevante Konsequenz der Zwei-Cache-Architektur).

2. **`src/hooks/useObjectQueries.ts:64-73`** (`useStateValues`) — `refetchInterval: 30_000` Default, `sortedIds = [...ids].sort()` wird bei **jedem Aufruf/Render** neu erzeugt (Zeile 66) und dient als Teil des `queryKey` (`queryKeys.states.values(sortedIds)`). Da `ids` bei Pagination/Scrolling häufig wechselt (`App.tsx` übergibt `pageIds`/`valueIds`), erzeugt das ständig neue Query-Keys mit vollem Refetch statt eines stabilen Keys mit `enabled`-Steuerung. Kein Caching-Vorteil zwischen ähnlichen Seiten (z. B. Seite vor/zurück mit überlappenden IDs erzeugt jeweils komplett neue Cache-Einträge statt einen bestehenden zu erweitern).
   **Fix:** Batch-Query so umbauen, dass einzelne States über `select`/`queryFn` granularer gecacht werden (z. B. pro-ID-Queries mit `useQueries` statt einer Sammel-Query je Seiten-ID-Liste), falls Pagination häufig überlappende ID-Sets erzeugt.
   **Wirkung:** niedrig bis mittel — abhängig von Paginierungsverhalten der Nutzer; bei stabilen Seiten (kein ständiges Blättern) kaum spürbar.

3. **`src/hooks/useObjectMutations.ts:117-125`** (`useCreateDatapoint`, `onSettled`) — `queryClient.invalidateQueries({ queryKey: queryKeys.objects.root })` invalidiert **die gesamte Objects-Root-Query-Familie** (alle gefilterten Objekt-Queries, Bootstrap, All) nach dem Anlegen eines einzelnen Datenpunkts, statt gezielt nur die betroffenen Caches per `setQueryData` zu patchen (wie es `useExtendObject`, `useDeleteObject`, `useRenameDatapoint`, `usePutObject` bereits vorbildlich tun, s. `useObjectMutations.ts:34-46`, `:139-155`, `:182-204`, `:206-219`). Ergebnis: Anlegen eines Datenpunkts löst einen kompletten Netzwerk-Refetch aller aktiven `objects.*`-Queries aus (inkl. evtl. teurer `getObjectsByPattern`-Requests) statt eines lokalen Cache-Updates.
   **Fix:** analog zu `useDeleteObject`/`useExtendObject` per `setQueriesData` das neu erstellte Objekt in alle passenden Caches einfügen statt `invalidateQueries`.
   **Wirkung:** mittel — jeder "Neuer Datenpunkt"-Vorgang triggert unnötige Vollabfragen.

4. **`src/hooks/useObjectMutations.ts:129-137`** (`useImportDatapoints`, `onSettled`) — gleiches Muster: `invalidateQueries({ queryKey: queryKeys.objects.root })` nach Bulk-Import. Bei großen Imports (viele Objekte) ist ein Full-Refetch nach dem eh schon großen Batch-Write ggf. gerechtfertigt (Konsistenz nach Bulk-Op), aber es könnte auch inkrementell gepatcht werden.
   **Fix:** optional, niedrige Priorität — Bulk-Operationen rechtfertigen eher einen Full-Refetch als Einzel-Mutationen.
   **Wirkung:** niedrig (seltene Operation).

5. **`src/hooks/useObjectQueries.ts:186-193`** (`useScriptUsedIds`) vs. **`:195-202`** (`useAllScriptSources`) — zwei Query-Hooks mit überlappendem Zweck (Skript-Quellen), unterschiedliche `staleTime` (`Infinity` vs. `5*60_000`) und unterschiedliche Keys (`queryKeys.scripts.sources` vs. `['scripts','sources-raw']`). Erhöht Verwirrungspotenzial und doppelte Netzwerklast, falls beide in unterschiedlichen Komponenten gleichzeitig aktiv sind (`StateList.tsx:105` nutzt `useAllScriptSources`, während `UIContext.tsx` scriptUsedIds separat über direkte API-Calls (`getScriptUsedIds`, nicht über React Query) verwaltet, s. `UIContext.tsx:337-348`).
   **Fix:** vereinheitlichen, ein Cache für Skript-Quellen.
   **Wirkung:** niedrig — funktional getrennt genutzt (Score-Feature vs. Icon-Spalte), aber Wartungsrisiko.

6. **Phase-1/Phase-2-Blockierung**: laut Sub-Agent-Recherche completar Phase 2 (`getAllObjects`) nullt nur den modul-internen In-Flight-Promise (`api/iobroker.ts` ~L355/383), löst **keinen** React-Query-Refetch/Invalidate von `objects.bootstrap` aus — Phase 1 bleibt UI-seitig unangetastet, kein sichtbares Blockieren/Doppel-Rendern durch Phase 2 selbst. Positiv zu vermerken (kein Finding, sondern Bestätigung, dass die zweiphasige Architektur wie dokumentiert nicht-blockierend arbeitet).

---

## 4. Virtualisierung

1. **`src/components/statelist/StateList.tsx:712-718`** — `useVirtualizer({ count, getScrollElement, estimateSize: () => ROW_HEIGHT_PX[appSettings.rowHeight], overscan: VIRTUAL_OVERSCAN, scrollPaddingStart: headerHeight })`. Das Optionsobjekt wird bei **jedem Render** von `StateList` neu erstellt (kein `useMemo`). `@tanstack/react-virtual` liest die Optionen zwar bei jedem Aufruf neu ein (das ist der vorgesehene Nutzungsmodus, kein Bug), aber `estimateSize` als Inline-Closure verhindert, dass die Bibliothek intern auf Referenzgleichheit prüfen und ggf. Neuberechnungen sparen kann.
   **Fix:** `estimateSize` mit `useCallback` binden (Deps: `appSettings.rowHeight`).
   **Wirkung:** niedrig.

2. **`src/components/statelist/StateListConstants.ts`** (`VIRTUAL_OVERSCAN`, referenziert in `StateList.tsx:716`) — Wert nicht eingesehen, aber sofern er (wie in vielen ähnlichen Projekten) hochgesetzt wurde, um Scroll-Ruckler bei schnellem Scrollen zu vermeiden, steigt die Anzahl gleichzeitig gemounteter `StateRow`-Instanzen linear mit — bei komplexen Zeilen (viele editierbare Zellen, Portale, Tooltips) potenziell teuer. Sollte mit dem Team abgeglichen werden, ob der Wert konservativ (typ. 5-10) oder zu hoch gewählt ist.
   **Wirkung:** unklar ohne Wertkenntnis — nicht bewertet (kein Fund, sondern Hinweis).

3. **`src/components/statelist/StateList.tsx:1097-1339`** — Separator-Zeilen (`kind === 'sep'`) sind **nicht virtualisiert getrennt von Row-Höhe** — sie zählen im `activeDisplayItems`-Array genauso wie normale Rows für `rowVirtualizer` (`count: activeDisplayItems.length`, Zeile 713), aber ihre tatsächliche Höhe (`py-1.5` ≈ 30-34px, hartkodiert in Tailwind-Klassen wie `StateList.tsx:1169193`) weicht von `ROW_HEIGHT_PX[rowHeight]` ab (33-52px je nach Dichte-Einstellung). Da `estimateSize` nur einen einzigen konstanten Wert für alle Items liefert (keine Item-spezifische Höhenfunktion), führt das bei aktivem `groupByPath` mit vielen Sep-Zeilen zu einer systematischen Diskrepanz zwischen geschätzter und tatsächlicher Scroll-Höhe — der Virtualizer korrigiert das zwar per Messung (ResizeObserver-basiert, Standardverhalten der Lib), aber es verursacht zusätzliche Re-Layout-Zyklen (Layout Thrashing) beim ersten Scrollen durch neue Bereiche, insbesondere bei `rowHeight: 'spacious'` (52px, größte Abweichung zu Sep-Höhe ~34px).
   **Fix:** `estimateSize` als Funktion von `activeDisplayItems[index].kind` implementieren (unterschiedliche Schätzhöhe für `sep` vs. `row`), um die Messkorrektur-Zyklen zu reduzieren.
   **Wirkung:** mittel bei tief gruppierten, sehr großen Namensräumen (viele sichtbare Ordner-Zeilen gemischt mit Datenzeilen).

---

## 5. Realtime-Transport

1. **`src/hooks/useSocketIO.ts:69-81`** (`makeApplyEvent`) und **`:95-117`** (`makeApplyObjectChange`) — beide patchen ausschließlich per `queryClient.setQueriesData`/`setQueryData`, **kein** `invalidateQueries` im gesamten Socket.IO-Hook. Vorbildlich umgesetzt, keine unnötigen Netzwerk-Roundtrips bei Live-Events.
2. **`src/hooks/useLongPolling.ts:160-175`** (`applyEvent`) — patcht ebenfalls nur `states.valuesRoot`/`states.detail` per `setQueriesData`/`setQueryData`, kein `invalidateQueries`. **Aber:** im Gegensatz zu `useSocketIO.ts` gibt es in `useLongPolling.ts` **keine Behandlung von Objekt-Änderungen** (kein Äquivalent zu `makeApplyObjectChange`) — der Long-Polling-Fallback aktualisiert nur State-Werte, nicht Objektstruktur-Änderungen (neue Rolle, Alias-Ziel, Name etc.). Nutzer im Long-Polling-Fallback (automatisch aktiv, wenn Socket.IO nicht erreichbar ist, s. `AppSettings.realtimeTransport`, `UIContext.tsx:53-56`) sehen Objekt-Änderungen erst nach manuellem Refresh oder `objectsRefreshInterval`-Polling.
   **Fix:** kein reines Performance-Fix, aber Feature-Lücke — falls gewünscht, müsste der REST-Adapter Objekt-Events überhaupt liefern (ggf. nicht Teil des Long-Polling-Protokolls, dann kein Fix möglich, nur Dokumentationshinweis).
   **Wirkung:** niedrig (funktionale Lücke, kein Perf-Problem im engeren Sinn) — hier der Vollständigkeit halber aufgeführt, da explizit nach `invalidateQueries` vs. surgical patches gefragt wurde: **Ergebnis ist positiv**, kein Refetch-Overhead in beiden Transport-Hooks.

---

## 6. Bundle

1. **`package.json`** — `recharts ^3.8.1` und `socket.io-client ^2.5.0` sind die größten Abhängigkeiten. `recharts` wird nur in `HistoryChart.tsx`/`HistoryModal.tsx` gebraucht.
   **Befund:** `src/App.tsx:14` — `HistoryModal` ist bereits per `lazy(() => import('./components/modals/HistoryModal'))` code-gesplittet; da `HistoryChart` (und damit `recharts`) nur von `HistoryModal` importiert wird, landet `recharts` vermutlich schon in einem separaten Chunk. **Kein Fund nötig, positiv zu vermerken.**
2. **`vite.config.ts`** — kein `build.rollupOptions.manualChunks` konfiguriert. Alle anderen Modals (`ObjectEditModal`, `SettingsModal`, `OptimizeModal`, `TreeStatsModal`, `EnumManagerModal`, `ImportDatapointsModal`, `VirtualFoldersModal`, `CreateAliasModal`, `AutoCreateAliasModal`, `AliasReplaceModal`, `CopyDatapointModal`, `RenameDatapointModal`, `MoveDatapointModal`, `NewDatapointModal`, `ValueEditModal`) sind **nicht** lazy-geladen — sie landen im initialen Hauptbundle, obwohl sie erst bei expliziter Nutzerinteraktion (Rechtsklick, Toolbar-Button) benötigt werden.
   **Fix:** zumindest die selten genutzten, größeren Modals (`OptimizeModal`, `TreeStatsModal`, `ImportDatapointsModal`, `SettingsModal`) per `React.lazy` + `Suspense` code-splitten, analog zu `HistoryModal` in `App.tsx:14`.
   **Wirkung:** mittel — verringert Time-to-Interactive beim initialen Laden, besonders relevant, da die App laut `AppSettings.objectsCacheReloads`/`objectsCacheTTL` (`UIContext.tsx:59-68`) ohnehin schon größere Objektmengen beim Start lädt; ein schlankeres JS-Bundle würde die Zeit bis zur ersten sinnvollen Interaktion (Tabelle laden) verkürzen.
3. **`socket.io-client ^2.5.0`** wird immer eagerly importiert (`useSocketIO.ts:3`, `import io from 'socket.io-client'`), auch wenn `AppSettings.realtimeTransport === 'longpolling'` fest eingestellt ist (`UIContext.tsx:53-56`) und Socket.IO nie zum Einsatz kommt. Kein dynamischer Import.
   **Fix:** `useSocketIO` intern per dynamischem `import('socket.io-client')` laden, nur wenn `realtimeTransport !== 'longpolling'` bzw. `enabled === true`.
   **Wirkung:** niedrig bis mittel — abhängig davon, wie viele Nutzer dauerhaft auf Long-Polling festgelegt sind; für die Standard-Konfiguration (`socketio` ist Default, `UIContext.tsx:120`) meist irrelevant.
4. Keine offensichtlich toten/unbenutzten Imports in den gelesenen Dateien gefunden (`StateList.tsx`, `StateRow.tsx`, Context-Dateien) — Imports werden konsistent verwendet.

---

## Zusammenfassung

| Bereich | Anzahl Findings |
|---|---|
| 1. Re-Render-Hotspots | 6 |
| 2. Memoization-Lücken | 6 |
| 3. Query-Layer | 6 |
| 4. Virtualisierung | 3 |
| 5. Realtime-Transport | 2 (beide überwiegend positiv, 1 funktionale Lücke) |
| 6. Bundle | 4 |

**Top 3 wirkungsvollste Fixes:**

1. **`PanelContext.tsx:18-26` / `FilterContext.tsx:498-508`** — `panel1Value` ist nicht memoized und wird bei jeder State-Änderung in `FilterContextProvider` neu erzeugt → löst Re-Renders in `StateList` (der teuersten Komponente) aus, obwohl sich die relevanten Felder oft gar nicht geändert haben. Trivialer `useMemo`-Fix mit potenziell großer Wirkung bei großen Tabellen.
2. **`useObjectMutations.ts:117-125`** (`useCreateDatapoint`) — `invalidateQueries` auf die komplette `objects.root`-Familie statt gezieltem Cache-Patch wie bei den anderen Mutationen; verursacht unnötigen Vollabruf aller aktiven Objekt-Queries nach jedem "Neuer Datenpunkt"-Vorgang.
3. **Fehlendes Code-Splitting der übrigen Modals** (`vite.config.ts` ohne `manualChunks`, nur `HistoryModal` ist lazy) — größter Hebel für Initial-Load-Performance, da aktuell alle ~15 Modal-Komponenten im Hauptbundle landen.

Sekundär, aber bei sehr großen Installationen (>10.000 Objekte) relevant: **`StateTree.tsx:142-145`** (`isExpandableFolder`/`hasExpandableBranch`) — pro-Knoten-Rekursion über den gesamten Teilbaum ohne globale Bottom-Up-Memoisierung, re-triggert bei jedem Live-Objekt-Patch über Socket.IO.

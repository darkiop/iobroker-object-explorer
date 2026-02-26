Im menübaum links direkt ein mpusehover pro zeile anzeigen (mit den entsprechende buttons die es gibt)

Optionen -> Sprache, Datumsformat, Standard Spalten, Schnellfilter

Übersetzung in Englisch



---

| ID | Beschreibung | Kategorie | Priorität | Aufwand | Status |
|---|---|---|---|---|---|
| FE-001 | Type Safety verbessern: 19+ unsichere `as unknown`/`as any`-Casts entfernen, v.a. bei Enum-Name-Parsing und API-Responses. | Code Quality | hoch | M | offen |
| FE-002 | `React.memo()` für `StateList` und `StateTree` einsetzen, da beide bei jedem App-Re-Render neu rendern trotz unveränderter Props. | Performance | hoch | M | umgesetzt |
| FE-003 | Input-Validierung hinzufügen: Regex für Object-IDs, Min/Max für numerische Felder, XSS-Escaping für Namen-Eingaben in allen Edit-Feldern. | Security | hoch | S | offen |
| FE-004 | XSS-Schutz für JSON-Editor und Alias/Function-Namen sicherstellen; keine Raw-HTML-Injection über Objektfelder möglich machen. | Security | hoch | S | offen |
| FE-005 | Spalten-Sortierung in StateList implementieren: Klick auf Spaltenheader sortiert aufsteigend/absteigend (ID, Name, Rolle, Raum, Wert, Einheit). | Feature | hoch | M | offen |
| FE-006 | Löschen-Button in Tabellenzeile: Rechts je Zeile ein Löschen-Icon, mit Confirmation Dialog; Mehrfachauswahl + Bulk-Delete prüfen. | Feature | hoch | M | offen |
| FE-007 | Fehlerbehandlung verbessern: Aussagekräftige Fehlermeldungen statt „API error", Toast-Notifications für Mutations-Erfolg/-Fehler. | Code Quality | hoch | M | offen |
| FE-008 | Virtualisierung (react-window o.ä.) für StateList einsetzen: Bei 1000+ Einträgen werden alle DOM-Knoten gerendert. | Performance | hoch | L | offen |
| FE-009 | Hardcodierte IP `10.4.0.20:8093` aus `vite.config.ts` in `.env.local` auslagern; Dev-Setup-Dokumentation aktualisieren. | DX | mittel | S | umgesetzt |
| FE-010 | Spaltenreihenfolge in Tabelle anpassen: ID, Name, Typ, Rolle, Funktion, Wert, Einheit, ACK, Letztes Update. | UX | mittel | S | offen |
| FE-011 | Typ-Spalte in Tabelle hinzufügen (folder/device/channel/state) mit entsprechendem Icon. | Feature | mittel | S | umgesetzt |
| FE-012 | Alias-Quelle/Ziel in Tabellenspalte ID anzeigen (zweite Zeile, kleinere Schrift); Quelle/Ziel anklickbar machen und im Baum anspringen. | Feature | mittel | M | offen |
| FE-013 | Schnellfilter-Buttons für alle Räume (`enum.rooms.*`) in der Sidebar einfügen. | Feature | mittel | M | umgesetzt |
| FE-014 | Einheit-Eingabe in Tabelle als durchsuchbares Dropdown (wie Raum/Funktion) statt freies Textfeld. | UX | mittel | S | umgesetzt |
| FE-015 | Doppelte `copyText()`-Implementierung aus `StateList.tsx` und `StateTree.tsx` in `src/utils/clipboard.ts` auslagern. | Code Quality | mittel | S | offen |
| FE-016 | QueryKey-Hierarchie nach TanStack React Query Best Practices strukturieren (z.B. `['objects', pattern]` statt loses String-Pattern). | Code Quality | mittel | S | offen |
| FE-017 | Column-Filter-Logik in `App.tsx` (~75 Zeilen verschachtelte if/filter) in separate Utility-Funktion `filterObjectIds()` auslagern. | Code Quality | mittel | S | offen |
| FE-018 | API-Batch-Größe in `getStatesBatch()` von 20 auf 50+ erhöhen und konfigurierbar machen. | Performance | mittel | S | umgesetzt |
| FE-019 | `useStateValues()`-Hook: Refetch pausieren wenn Tab/Window nicht sichtbar (Page Visibility API). | Performance | mittel | S | umgesetzt |
| FE-020 | `buildAliasReverseMap()` in QueryClient cachen statt bei jedem Re-Render neu berechnen. | Performance | mittel | S | umgesetzt |
| FE-021 | Keyboard-Navigation ergänzen: Arrow Keys in Tabelle, Tab für Fokus, Enter zum Öffnen des Modals. | UX | mittel | M | offen |
| FE-022 | Debouncing (300–500ms) für SearchBar und Column-Filter-Inputs statt sofortiger Filterung bei jedem Tastendruck. | UX | mittel | S | offen |
| FE-023 | E2E-Tests mit Playwright implementieren: Critical Paths Search→Select→Edit→Save abdecken. | Tooling | mittel | L | offen |
| FE-024 | HistoryChart: Downsampling für >1000 Datenpunkte implementieren, da Recharts bei großen Mengen stockt. | Performance | mittel | M | offen |
| FE-025 | Enum-Map-Parsing-Logik (`getRoomMap`, `getFunctionMap`) in gemeinsame Utility `parseEnumName()` zusammenführen. | Code Quality | niedrig | S | offen |
| FE-026 | Skeleton-Screens / Loading-States in StateList während Datenpunkt-Werte nachgeladen werden. | UX | niedrig | M | offen |
| FE-027 | State-Persistence im localStorage: Aktive Filterung, Spaltenbreiten und Seitennavigation über Sessions hinweg erhalten. | UX | niedrig | S | offen |
| FE-028 | Sidebar-Breite und Collapsed-Status im localStorage persistieren. | UX | niedrig | S | umgesetzt |
| FE-029 | Color-Coding für State-Werte: Boolean grün/rot, Zahlen mit Trend-Pfeilen (↑↓), Null-Werte gesondert hervorheben. | UX | niedrig | S | umgesetzt |
| FE-030 | Export-Funktion: Gefilterte Datenpunkt-Liste als JSON oder CSV exportieren. | Feature | niedrig | M | umgesetzt |
| FE-031 | Fulltext-Suche statt nur Pattern-Matching: Suche in Namen, Beschreibung und Alias-Zielen mit Relevanz-Ranking. | Feature | niedrig | L | umgesetzt |
| FE-032 | Progressive Web App (PWA): Service Worker + Offline-Unterstützung für gecachte Objekte. | Feature | niedrig | L | offen |
| FE-033 | Undo/Redo für Edits (Name, Rolle, Einheit, Raum, Funktion), besonders nach Batch-Operationen nützlich. | Feature | niedrig | L | offen |
| FE-034 | Lokalisierung (i18next): Deutsch ist hardcodiert; Englisch und weitere Sprachen ergänzen. | Feature | niedrig | L | offen |
| FE-035 | Multi-Datenpunkt-Vergleich im Chart: Mehrere History-fähige States gleichzeitig auf einer Zeitachse darstellen (z.B. Temperaturen verschiedener Räume). | Chart | hoch | L | umgesetzt |
| FE-036 | Sparkline-Miniaturchart in der Tabellenspalte „Wert": Kleiner Trendgraph der letzten 24h direkt in der Zeile für History-aktivierte Datenpunkte. | Chart | hoch | M | offen |
| FE-037 | Statistik-Panel im HistoryChart: Min/Max/Avg/Letzte-Wert-Zusammenfassung als Badges direkt über dem Chart anzeigen. | Chart | mittel | S | umgesetzt |
| FE-038 | Zoom & Pan im Chart: Mausrad-Zoom auf Zeitachse + Drag-to-Pan; Recharts `ReferenceArea` Brush als Navigationshilfe unter dem Chart. | Chart | mittel | M | offen |
| FE-039 | Boolean-States als Gantt-/Zeitbalken-Chart: Zeigt „An"-Perioden als farbige Balken statt als Linie — ideal für Schalter, Bewegungsmelder, Türen. | Chart | mittel | M | offen |
| FE-040 | Chart-Export als PNG: Button im HistoryModal der den Chart als Bilddatei herunterlädt (via html2canvas oder Recharts SVG-Export). | Chart | mittel | S | umgesetzt |
| FE-041 | History-Adapter auswählbar: Aktuell hardcodiert auf `sql.0`; Unterstützung für `influxdb.0` und `history.0` Adapter ergänzen. | Feature | mittel | M | offen |
| FE-042 | Batch-Bearbeitung: Mehrere selektierte Zeilen gleichzeitig editieren (gleiche Rolle, Einheit, Raum oder Funktion für alle setzen). | Feature | mittel | M | umgesetzt |
| FE-043 | Schwellwert-Highlighting: Benutzer definiert Min/Max-Schwellwerte pro Datenpunkt; Zeile leuchtet rot/gelb wenn Wert außerhalb liegt. | Feature | mittel | M | offen |
| FE-044 | Alias-Formel-Tester: Read/Write-Formeln im Alias-Tab direkt testbar machen — Eingabe eines Testwertes, Ausgabe des umgerechneten Resultats. | Feature | mittel | S | offen |
| FE-045 | Adapter-Gruppierung im Baum: Optionale Ansicht die Datenpunkte nach Adapter (hm-rpc.0, deconz.0, …) statt nach Pfadhierarchie gruppiert. | Feature | niedrig | L | offen |
| FE-046 | Periodischer Vergleich im Chart: Aktuellen Zeitraum mit gleichem Zeitraum letzte Woche/letzten Monat überlagern (gestrichelte Linie). | Chart | niedrig | M | umgesetzt |
| FE-047 | Verlaufsdaten-Import: CSV-Datei mit Zeitstempel+Wert hochladen und als History-Einträge in sql.0 importieren. | Feature | niedrig | L | offen |

Testen des Exports JSON

Tabellen Ansicht für History (mit Löschen Button)


-----

| ID | Beschreibung | Kategorie | Priorität | Aufwand | Status |
|---|---|---|---|---|---|
| FE-001 | Type Safety verbessern: unsichere as-Casts entfernen, v.a. bei Enum-Name-Parsing und API-Responses. | Code Quality | hoch | M | offen |
| FE-002 | React.memo() für StateList und StateTree einsetzen, da beide bei jedem App-Re-Render neu rendern trotz unveränderter Props. | Performance | hoch | M | umgesetzt |
| FE-003 | Input-Validierung hinzufügen: Regex für Object-IDs, Min/Max für numerische Felder, XSS-Escaping für Namen-Eingaben. | Security | hoch | S | offen |
| FE-004 | XSS-Schutz für JSON-Editor sicherstellen; keine Raw-HTML-Injection über Objektfelder möglich machen. | Security | hoch | S | offen |
| FE-005 | Spalten-Sortierung in StateList: Klick auf Spaltenheader sortiert aufsteigend/absteigend (ID, Name, Rolle, Raum, Wert, Einheit). | Feature | hoch | M | umgesetzt |
| FE-006 | Löschen-Button in Tabellenzeile: Löschen-Icon mit Confirmation Dialog; Mehrfachauswahl + Bulk-Delete. | Feature | hoch | M | umgesetzt |
| FE-007 | Fehlerbehandlung verbessern: Aussagekräftige Fehlermeldungen, Toast-Notifications für Mutations-Erfolg/-Fehler. | Code Quality | hoch | M | offen |
| FE-008 | Virtualisierung für StateList einsetzen: Bei 1000+ Einträgen werden alle DOM-Knoten gerendert. | Performance | hoch | L | offen |
| FE-009 | Hardcodierte IP aus vite.config.ts in .env.local auslagern; Dev-Setup-Dokumentation aktualisieren. | DX | mittel | S | umgesetzt |
| FE-010 | Spaltenreihenfolge in Tabelle anpassen: ID, Name, Typ, Rolle, Funktion, Wert, Einheit, ACK, Letztes Update. | UX | mittel | S | umgesetzt |
| FE-011 | Typ-Spalte in Tabelle hinzufügen (folder/device/channel/state) mit entsprechendem Icon. | Feature | mittel | S | umgesetzt |
| FE-012 | Alias-Quelle/Ziel in Tabellenspalte ID anzeigen; Quelle/Ziel anklickbar und im Baum anspringen. | Feature | mittel | M | umgesetzt |
| FE-013 | Schnellfilter-Buttons für alle Räume in der Sidebar einfügen. | Feature | mittel | M | umgesetzt |
| FE-014 | Einheit-Eingabe in Tabelle als durchsuchbares Dropdown statt freies Textfeld. | UX | mittel | S | umgesetzt |
| FE-015 | Doppelte copyText()-Implementierung in gemeinsame Utility auslagern. | Code Quality | mittel | S | umgesetzt |
| FE-016 | QueryKey-Hierarchie nach TanStack React Query Best Practices strukturieren. | Code Quality | mittel | S | umgesetzt |
| FE-017 | Column-Filter-Logik in App.tsx in separate Utility-Funktion filterObjectIds() auslagern. | Code Quality | mittel | S | umgesetzt |
| FE-018 | API-Batch-Größe in getStatesBatch() von 20 auf 50+ erhöhen und konfigurierbar machen. | Performance | mittel | S | umgesetzt |
| FE-019 | useStateValues()-Hook: Refetch pausieren wenn Tab/Window nicht sichtbar (Page Visibility API). | Performance | mittel | S | umgesetzt |
| FE-020 | buildAliasReverseMap() in QueryClient cachen statt bei jedem Re-Render neu berechnen. | Performance | mittel | S | umgesetzt |
| FE-021 | Keyboard-Navigation: Arrow Keys in Tabelle, Tab für Fokus, Enter zum Öffnen des Modals. | UX | mittel | M | offen |
| FE-022 | Debouncing (300–500ms) für SearchBar und Column-Filter-Inputs statt sofortiger Filterung. | UX | mittel | S | offen |
| FE-023 | E2E-Tests mit Playwright implementieren: Critical Paths Search→Select→Edit→Save abdecken. | Tooling | mittel | L | offen |
| FE-024 | HistoryChart: Downsampling für >1000 Datenpunkte implementieren, da Recharts bei großen Mengen stockt. | Performance | mittel | M | offen |
| FE-025 | Enum-Map-Parsing-Logik in gemeinsame Utility parseEnumName() zusammenführen. | Code Quality | niedrig | S | offen |
| FE-026 | Skeleton-Screens / Loading-States in StateList während Datenpunkt-Werte nachgeladen werden. | UX | niedrig | M | offen |
| FE-027 | State-Persistence im localStorage: Aktive Filterung und Seitennavigation über Sessions erhalten. | UX | niedrig | S | offen |
| FE-028 | Sidebar-Breite und Collapsed-Status im localStorage persistieren. | UX | niedrig | S | umgesetzt |
| FE-029 | Color-Coding für State-Werte: Boolean grün/rot, Zahlen mit Trend-Pfeilen, Null-Werte hervorheben. | UX | niedrig | S | umgesetzt |
| FE-030 | Export-Funktion: Gefilterte Datenpunkt-Liste als JSON oder CSV exportieren. | Feature | niedrig | M | umgesetzt |
| FE-031 | Fulltext-Suche: Suche in Namen, Beschreibung und Alias-Zielen mit Relevanz-Ranking. | Feature | niedrig | L | umgesetzt |
| FE-032 | Progressive Web App (PWA): Service Worker + Offline-Unterstützung für gecachte Objekte. | Feature | niedrig | L | offen |
| FE-033 | Undo/Redo für Edits (Name, Rolle, Einheit, Raum, Funktion), besonders nach Batch-Operationen. | Feature | niedrig | L | offen |
| FE-034 | Lokalisierung: Deutsch hardcodiert; Englisch und weitere Sprachen ergänzen. | Feature | niedrig | L | umgesetzt |
| FE-035 | Multi-Datenpunkt-Vergleich im Chart: Mehrere History-fähige States gleichzeitig auf einer Zeitachse. | Chart | hoch | L | umgesetzt |
| FE-036 | Sparkline-Miniaturchart in der Tabellenspalte Wert: Trendgraph der letzten 24h für History-aktivierte Datenpunkte. | Chart | hoch | M | offen |
| FE-037 | Statistik-Panel im HistoryChart: Min/Max/Avg/Letzte-Wert-Zusammenfassung als Badges über dem Chart. | Chart | mittel | S | umgesetzt |
| FE-038 | Zoom & Pan im Chart: Mausrad-Zoom auf Zeitachse + Drag-to-Pan. | Chart | mittel | M | umgesetzt |
| FE-039 | Boolean-States als Gantt-/Zeitbalken-Chart: An-Perioden als farbige Balken statt als Linie. | Chart | mittel | M | offen |
| FE-040 | Chart-Export als PNG: Button im HistoryModal der den Chart als Bilddatei herunterlädt. | Chart | mittel | S | umgesetzt |
| FE-041 | History-Adapter auswählbar: Aktuell hardcodiert auf sql.0; Unterstützung für influxdb.0 und history.0. | Feature | mittel | M | offen |
| FE-042 | Batch-Bearbeitung: Mehrere selektierte Zeilen gleichzeitig editieren (Rolle, Einheit, Raum, Funktion). | Feature | mittel | M | umgesetzt |
| FE-043 | Schwellwert-Highlighting: Min/Max-Schwellwerte pro Datenpunkt; Zeile leuchtet rot/gelb wenn Wert außerhalb liegt. | Feature | mittel | M | offen |
| FE-044 | Alias-Formel-Tester: Read/Write-Formeln im Alias-Tab direkt testbar machen. | Feature | mittel | S | offen |
| FE-045 | Adapter-Gruppierung im Baum: Optionale Ansicht die Datenpunkte nach Adapter gruppiert statt nach Pfadhierarchie. | Feature | niedrig | L | offen |
| FE-046 | Periodischer Vergleich im Chart: Aktuellen Zeitraum mit gleichem Zeitraum letzte Woche überlagern. | Chart | niedrig | M | umgesetzt |
| FE-047 | Verlaufsdaten-Import: CSV-Datei hochladen und als History-Einträge in sql.0 importieren. | Feature | niedrig | L | offen |
| FE-048 | ThemeContext value-Objekt mit useMemo stabilisieren: wird bei jedem Render neu erstellt. | Performance | mittel | S | umgesetzt |
| FE-049 | StateList selbst mit React.memo wrappen: rendert bei jedem App-State-Wechsel neu, obwohl Props stabil. | Performance | hoch | S | umgesetzt |
| FE-050 | StateList-Tabellenzeilen als eigene React.memo-Komponente (StateRow) mit benutzerdefiniertem Comparator. | Performance | hoch | L | umgesetzt |
| FE-051 | Editierbare Zellen in StateList mit React.memo wrappen: bis zu 400 Zellen ohne Memoisation. | Performance | hoch | M | umgesetzt |
| FE-052 | Layout.tsx Sidebar-Resize: handleMouseDown via useCallback + useRef für startWidth stabilisiert. | Performance | mittel | S | umgesetzt |
| FE-053 | hasAnyFilter in App.tsx mit useMemo stabilisieren als stabiles Prop für memoisisierte Kindkomponenten. | Performance | niedrig | S | umgesetzt |
| FE-054 | Datenpunkt umbenennen im Kontextmenü: Dialog für neue ID; POST zu neuer ID + DELETE alter ID. | Feature | mittel | M | umgesetzt |
| FE-055 | Datenpunkt verschieben im Kontextmenü: Pfad-Änderung mit Pfad-Validierung. | Feature | mittel | M | umgesetzt |
| FE-056 | JSON-Editor im Objekt-bearbeiten-Modal: prüfen ob vollständiges Objekt-JSON bearbeitbar und speicherbar. | Feature | mittel | S | offen |
| FE-057 | CLAUDE.md aktualisieren: Architektur-Beschreibung, neue Komponenten und aktuelle Stack-Entscheidungen. | DX | niedrig | S | offen |
| FE-058 | README.md aktualisieren: Features, Screenshots, Konfiguration und Entwicklungs-Setup dokumentieren. | DX | niedrig | M | offen |
| FE-059 | Alias: Verschiedene IDs für Lesen und Schreiben (common.alias.read und common.alias.write als separate IDs). | Feature | mittel | M | offen |
| FE-060 | MIT-Lizenzdatei erstellen: LICENSE-Datei mit aktuellem Jahr und Copyright-Inhaber anlegen. | DX | niedrig | S | offen |
| FE-061 | Bug: Ordner-Symbol fehlt im Objekt-Baum — Folder-Knoten zeigen kein Icon mehr. | Bug | hoch | S | offen |

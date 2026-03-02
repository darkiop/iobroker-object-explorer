# Features

## Suche & Filter

- Pattern-Suche mit Wildcard-Unterstützung (z.B. `alias.0.*`, `javascript.0.*`)
- Volltextsuche in ID, Name, Beschreibung und Alias-Zielen
- Schnellfilter-Buttons für häufige Namespaces in der Sidebar
- Schnellfilter-Buttons für alle konfigurierten Räume
- History-Filter: zeigt nur Datenpunkte mit aktiver History-Aufzeichnung
- SmartName-Filter: zeigt nur Datenpunkte mit konfiguriertem SmartHome-Namen
- Alle Filter kombinierbar; aktive Filter hervorgehoben, einzeln oder gesammelt löschbar
- Ordner-Scoping: Datenpunkte unterhalb eines Baum-Pfads in der Tabelle anzeigen

## Objektbaum (Sidebar)

- Hierarchische Darstellung der ioBroker-Objektstruktur (Ordner / Gerät / Kanal / Datenpunkt)
- Knotentypen mit unterschiedlichen Icons; History- und SmartName-Indikator
- Aufklappen / Zuklappen des gesamten Baums
- Einklappbare Sidebar mit Drag-Resize (180–600 px), Breite wird im localStorage gespeichert
- Hover-Aktionen: Scopen, Kopieren, Neuer Datenpunkt
- Rechtsklick-Kontextmenü: Als Filter setzen, Auswählen, ID kopieren, Objekt bearbeiten, Umbenennen, Verschieben, Datenpunkt löschen

## Tabelle

- Sortierung auf- / absteigend durch Klick auf Spaltenüberschrift
- Filterzeile direkt unter den Überschriften (ID, Name, Raum, Funktion, Rolle, Wert, Einheit)
- Icon-Spalten (Schreibschutz, History, SmartName, Alias) per Klick filtern
- Spaltenbreiten manuell verschiebbar; Doppelklick passt Breite auf Inhalt an
- Spalten ein-/ausblendbar über Spalten-Picker; Auswahl wird im localStorage gespeichert
- Alle Spaltenbreiten im localStorage gespeichert; Einstellungen zurücksetzbar
- Paginierung: konfigurierbare Seitengröße (25 / 50 / 100 / 200 / 500), gespeichert im localStorage
- Color-Coding für Werte: Boolean grün/rot, Null-Werte hervorgehoben

## Zeilenaktionen & Kontextmenü

- Klick auf Zeile öffnet StateDetail-Panel
- Rechtsklick-Kontextmenü: ID / Name / Wert kopieren, History anzeigen, Als Filter setzen, Raum/Funktion bearbeiten, Objekt bearbeiten, Datenpunkt kopieren, Umbenennen, Verschieben, Alias anlegen, Datenpunkt löschen
- Inline-Bearbeitung für Name, Rolle, Einheit und Wert direkt in der Tabelle
- Inline-Bearbeitung für Raum und Funktion mit Enum-Zuordnung (Portal-Dropdown)
- Mehrfachauswahl per Checkbox → Batch-Delete und Batch-Bearbeitung (Rolle, Einheit, Raum, Funktion)
- Einzel-Löschen mit Bestätigungs-Dialog

## Datenpunkt-Detail (StateDetail)

- Detail-Panel mit 5 s Polling; öffnet bei Klick auf Zeile
- Tab „Details": Metadaten (Name, Typ, Rolle, Einheit, Min/Max, Lese-/Schreibrecht), Live-Wert mit Ack/Qualität/Zeitstempel, Wert-Steuerung (Switch, Button, Zahl, Text, Boolean)
- Expertenmodus: freies Eingabefeld mit automatischer Typkonvertierung
- Integriertes Mini-History-Diagramm (wenn sql.0-History aktiv)
- Tab „Objekt": vollständige JSON-Ansicht
- Tab „Alias": Ziel-ID, Lese- und Schreib-Formel setzen oder entfernen

## Objekt bearbeiten (ObjectEditModal)

- Öffnet über Rechtsklick → „Objekt bearbeiten"
- Tab „Details": dieselben Controls wie StateDetail inkl. Expertenmodus
- Tab „JSON": Roher JSON-Editor mit Syntaxfehler-Anzeige; speichern via PUT
- Tab „Alias": Alias-Ziel, Lese- und Schreib-Formel
- Datenpunkt löschen direkt aus dem Modal

## Datenpunkte anlegen & verwalten

- Neuer Datenpunkt: ID, Name, Typ, Rolle, Einheit, Initialwert, Min/Max, Lesen/Schreiben; ID aus aktivem Suchpfad vorbelegt
- Datenpunkt kopieren: neue ID und Name vorbelegt; kopiert Typ, Rolle, Einheit, Lesen/Schreiben, Min/Max, Beschreibung, States-Mapping
- Datenpunkt umbenennen: Dialog mit neuer ID (POST + DELETE)
- Datenpunkt verschieben: Pfad-Änderung mit Validierung
- Alias anlegen: schlägt `alias.0.<quell-id>` vor; übernimmt Typ, Rolle, Einheit, Lesen/Schreiben

## Import / Export

- Export: gefilterte Datenpunkt-Liste als JSON (ID-keyed Object)
- Import: JSON-Editor mit Syntaxhighlight, Datei-Upload per Button oder Drag & Drop

## History-Diagramm

> Aktuell wird ausschließlich der **`sql.0`-Adapter** unterstützt.

- Zeitraum-Voreinstellungen: 1 h, 6 h, 24 h, 7 d, 30 d, 1 Jahr; manueller Datetime-Picker
- Diagrammtypen: Linie, Fläche, Balken
- Aggregation: Keine / Durchschnitt / Min+Max / Min / Max
- Statistik-Panel: Min / Max / Avg / Letzter Wert als Badges über dem Chart
- Multi-Datenpunkt-Vergleich: mehrere History-fähige States auf einer Zeitachse
- Periodischer Vergleich: aktuellen Zeitraum mit gleichem Zeitraum der Vorwoche überlagern
- Zoom & Pan: Mausrad-Zoom auf Zeitachse + Drag-to-Pan
- Chart-Export als PNG
- Einzelwert löschen (Klick-Modus), Zeitbereich löschen, alle History löschen (je mit Bestätigung)

## UI & Allgemein

- Dark / Light Mode mit Toggle im Header; gespeichert im localStorage
- Deutsch und Englisch (Sprache umschaltbar im Header)
- Responsive Layout; Sidebar einklappbar für mehr Tabellenbreite
- Lokaler Speicher löschbar (zurücksetzen aller gespeicherten Einstellungen)
- ioBroker-Host direkt im Browser konfigurierbar: Klick auf den Verbindungs-Badge im Header → `host:port` eingeben → Enter; Verbindungstest vor dem Speichern mit Statusanzeige (orange = Test läuft, rot = nicht erreichbar); Host wird im localStorage gespeichert

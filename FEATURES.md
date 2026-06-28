# Features

## Suche & Filter

- Pattern-Suche mit Wildcard-Unterstützung (z.B. `alias.0.*`, `javascript.0.*`)
- Volltextsuche in ID, Name, Beschreibung und Alias-Zielen
- Exakter Treffer-Modus (kein Wildcard-Fuzzy)
- ID-Suggest-Modus: Autovervollständigung für bekannte IDs
- Typ-Filter im Pattern: z.B. `type:state`, `type:channel`
- Raum-Filter und Funktions-Filter aus Pattern extrahiert
- Schnellfilter-Buttons für häufige Namespaces in der Sidebar (konfigurierbar)
- Schnellfilter-Buttons für alle konfigurierten Räume
- Schnellfilter-Buttons für alle konfigurierten Funktionen
- Schnellfilter-Buttons für Objekt-Typen
- History-Filter: zeigt nur Datenpunkte mit aktiver History-Aufzeichnung
- SmartName-Filter: zeigt nur Datenpunkte mit konfiguriertem SmartHome-Namen
- Dangling-Alias-Filter: zeigt nur `alias.0.*`-Einträge mit fehlendem Ziel-Datenpunkt
- Alle Filter kombinierbar; aktive Filter hervorgehoben, einzeln oder gesammelt löschbar
- Ordner-Scoping: Datenpunkte unterhalb eines Baum-Pfads in der Tabelle anzeigen
- Filter speichern & laden: benannte Filter-Sets persistent im localStorage
- Filterstatus über Sessions hinweg wiederhergestellt (Pattern, Seite, alle aktiven Filter)

## Objektbaum (Sidebar)

- Hierarchische Darstellung der ioBroker-Objektstruktur (Ordner / Gerät / Kanal / Datenpunkt)
- Zwei Anzeigemodi: Adapter-Sicht (Standard) und Pfad-Sicht
- Knotentypen mit unterschiedlichen Icons; History- und SmartName-Indikator
- Objekt-Zähler pro Namespace: konfigurierbar (aus / States / Objekte / beides)
- Aufklappen / Zuklappen des gesamten Baums
- Einklappbare Sidebar mit Drag-Resize (180–600 px), Breite wird im localStorage gespeichert
- Schriftgröße unabhängig von Tabelle einstellbar (small / normal / large / xl)
- Hover-Aktionen: Scopen, Kopieren, Neuer Datenpunkt
- Rechtsklick-Kontextmenü: Als Filter setzen, Auswählen, ID kopieren, Objekt bearbeiten, Umbenennen, Verschieben, Alias-Ziel ersetzen, Auto-Alias anlegen, Datenpunkt löschen

## Tabelle

- Sortierung auf- / absteigend durch Klick auf Spaltenüberschrift
- Filterzeile direkt unter den Überschriften (ID, Name, Raum, Funktion, Rolle, Wert, Einheit)
- Zeitstempel-Bereichsfilter (von / bis) für die Timestamp-Spalte
- Icon-Spalten (Schreibschutz, History, SmartName, Alias) per Klick filtern
- Spaltenbreiten manuell verschiebbar; Doppelklick passt Breite auf Inhalt an
- Benutzerdefinierte Default-, Min- und Max-Breiten pro Spalte konfigurierbar
- Spalten ein-/ausblendbar über Spalten-Picker; Auswahl wird im localStorage gespeichert
- Alle Spaltenbreiten im localStorage gespeichert; Einstellungen zurücksetzbar
- Schriftgröße konfigurierbar (small / normal / large / xl)
- Beschreibungs-Spalte ein-/ausblendbar
- Gruppierung nach Pfad-Präfix (optionales Klapp-Verhalten)
- Paginierung: konfigurierbare Seitengröße; ohne aktiven Filter werden alle Zeilen angezeigt
- Color-Coding für Werte: Boolean grün/rot, Null-Werte hervorgehoben
- Threshold-Highlighting: Wert-Zelle gelb (Warn) oder rot (Exceeded) bei Überschreitung von `common.min`/`common.max`
- Typ-Farben in der ID-Spalte (nach Objekt-Typ)

## Zeilenaktionen & Kontextmenü

- Klick auf Zeile öffnet ObjectEditModal
- Doppelklick auf Wert öffnet ValueEditModal (fokussierter Wert-Editor)
- Rechtsklick-Kontextmenü: ID / Name / Wert kopieren, History anzeigen, Als Filter setzen, Raum/Funktion bearbeiten, Objekt bearbeiten, Datenpunkt kopieren, Umbenennen, Verschieben, Alias anlegen, Alias-Ziel ersetzen, Datenpunkt löschen
- Inline-Bearbeitung für Name, Rolle, Einheit und Wert direkt in der Tabelle
- Inline-Bearbeitung für Raum und Funktion mit Enum-Zuordnung (Portal-Dropdown)
- Mehrfachauswahl per Checkbox → Batch-Delete und Batch-Bearbeitung (Rolle, Einheit, Raum, Funktion)
- Einzel-Löschen mit Bestätigungs-Dialog

## Wert-Editor (ValueEditModal)

- Öffnet per Doppelklick auf Wert-Zelle
- Typgerechte Eingabe mit automatischer Konvertierung (Zahl, Boolean, String)
- Ack-Flag setzbar
- Force-Write-Option (auch für Read-only-Datenpunkte)
- JSON-Syntaxhighlight bei JSON-Werten
- HTML-Vorschau bei HTML-Inhalten

## Objekt bearbeiten (ObjectEditModal)

- Öffnet über Zeilen-Klick oder Rechtsklick → „Objekt bearbeiten"
- Tab „Details": Metadaten (Name, Typ, Rolle, Einheit, Min/Max, Lese-/Schreibrecht), Live-Wert mit Ack/Qualität/Zeitstempel, Wert-Steuerung (Switch, Button, Zahl, Text, Boolean)
- Expertenmodus: freies Eingabefeld mit automatischer Typkonvertierung
- Integriertes Mini-History-Diagramm (wenn sql.0-History aktiv)
- Tab „Objekt": vollständige JSON-Ansicht mit Roheditor und Syntaxfehler-Anzeige; speichern via PUT
- Tab „Alias": Ziel-ID, Lese- und Schreib-Formel setzen oder entfernen; separate Read/Write-IDs
- Tab „Custom Settings": Adapter-spezifische Einstellungen (`common.custom`)
- Tab „Scripts": zeigt javascript.0-Skripte, die den aktuellen Datenpunkt referenzieren
- Datenpunkt löschen direkt aus dem Modal

## Datenpunkte anlegen & verwalten

- Neuer Datenpunkt: ID, Name, Typ, Rolle, Einheit, Initialwert, Min/Max, Lesen/Schreiben; ID aus aktivem Suchpfad vorbelegt
- Datenpunkt kopieren: neue ID und Name vorbelegt; kopiert Typ, Rolle, Einheit, Lesen/Schreiben, Min/Max, Beschreibung, States-Mapping
- Datenpunkt umbenennen: Dialog mit neuer ID (POST + DELETE)
- Datenpunkt verschieben: Pfad-Änderung mit Validierung
- Alias anlegen: schlägt `alias.0.<quell-id>` vor; übernimmt Typ, Rolle, Einheit, Lesen/Schreiben
- Alias-Ziel ersetzen (AliasReplaceModal): Suchen & Ersetzen in allen Alias-Read/Write-Zielen mit Vorschau
- Auto-Alias anlegen (AutoCreateAliasModal): alle State-Kinder eines Geräts auf einmal als `alias.0.*` anlegen, Raum/Funktion direkt zuweisen

## Enum-Manager

- Verwaltet Räume (`enum.rooms.*`) und Funktionen (`enum.functions.*`) in einem Modal
- Neue Enum-Einträge anlegen, bestehende umbenennen oder löschen
- Mitglieder pro Enum anzeigen und entfernen
- Bestätigungs-Dialog vor dem Löschen

## Namespace-Statistik (TreeStatsModal)

- Übersicht aller Namespaces mit Objekt-/State-/History-/SmartName-/Alias-Zählern
- Sortierbar nach jeder Spalte
- Balken-Visualisierung für relativen Anteil
- Namespace anklicken → direkt als Scope-Filter setzen
- Ganzen Namespace (Teilbaum) löschen mit Bestätigung
- Script-Analyse: welche Datenpunkte von javascript.0-Skripten verwendet werden

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

## Metadaten-Optimierung (OptimizeModal)

- Qualitätsscanner: prüft alle sichtbaren Datenpunkte auf fehlende Metadaten (Raum, Funktion, Rolle, Name, Beschreibung, Einheit, Min/Max, Typ, SmartName)
- Einzelne Prüfungen aktivierbar/deaktivierbar; Scope auf Namespace eingrenzbar
- Issues pro Datenpunkt inline behebbar (Eingabefelder direkt in der Tabellenzeile)
- Batch-Fix für alle markierten Datenpunkte auf einmal
- Direktlink zum ObjectEditModal für tiefere Bearbeitung

## Dual-Pane-Modus

- Zwei unabhängige Panels nebeneinander (Tabelle + Baum) umschaltbar über Einstellungen
- Jedes Panel hat eigenen Suchfilter, Baum-Navigation und Spalteneinstellungen
- Drag & Drop: Zeile aus Panel 1 auf `alias.0.*`-Namespace in Panel 2 ziehen → CreateAliasModal wird vorausgefüllt geöffnet (aktivierbar in Einstellungen)
- „In anderem Panel öffnen"-Aktion im Kontextmenü

## Echtzeit-Übertragung (Realtime Transport)

- **Socket.io** (Standard): verbindet sich mit dem `socketio`-Adapter (Standard-Port 8084, socket.io-client v2); Live-Updates für State-Werte und Objekte ohne Polling
  - Diff-basiertes Re-Subscribe: beim Filterwechsel werden nur neue/weggefallene Patterns (de)subscribt — keine Unterbrechung laufender Subscriptions
  - Ack-basierte Fehlerbehandlung: fehlgeschlagene Subscribes werden einmalig nach 5 s wiederholt
- **Long-Polling** (Fallback): REST-API `/states/subscribe`; automatisch aktiv, wenn Socket.io nicht erreichbar
- Automatischer Fallback: wenn Socket.io-Adapter nicht antwortet, aktiviert die App Long-Polling parallel und zeigt effektiven Transport im Status-Badge an
- Verbindungsstatus im Header (`HostConnectedButton`): Wifi-Icon (REST), Zap/Radio-Badge (Socket.io/Long-Polling) mit farbiger Statusanzeige; amber-Markierung wenn Fallback aktiv
- Realtime-Transport-Einstellung: Socket.io-Host/Port konfigurierbar; Umschaltung ohne Seiten-Reload

## Objekt-Cache (IndexedDB)

- Große `/objects`-Bulk-Payloads werden in IndexedDB gecacht
- Zwei-Phasen-Laden: Phase 1 holt sofort `type=state` (schnell, füllt Tabelle); Phase 2 lädt alle Typen parallel (vollständige Objektmap für Baum + Enums)
- Cache-Ablauf: konfigurierbar nach Anzahl Reloads (`objectsCacheReloads`: aus / 5 / 10 / 20 / 50) und nach Zeit (`objectsCacheTTL`: aus / 1h / 6h / 24h / 7d)
- `includeIdPrefixes`: bei Konfiguration werden nur Objekte mit bestimmten ID-Präfixen geladen — reduziert Payload bei großen ioBroker-Instanzen

## Einstellungen (SettingsModal)

- Verbindung: ioBroker-Host, Socket.io-Host/Port, Admin-Port, Realtime-Transport
- Anzeige: Sprache (DE/EN), Datumsformat (DE/US/ISO), Schriftgröße (Tabelle + Baum), Baumzähler-Modus, Beschreibung ein/aus, Gruppierung nach Pfad, Baum-Ansichtsmodus
- Spalten: sichtbare Spalten auswählen, benutzerdefinierte Breiten, Einheit in Wert-Spalte anzeigen (`showUnitInValue`)
- Filter: Schnellfilter-Buttons konfigurierbar, Script-IDs einbeziehen, Laden nur sichtbarer State-Werte (`loadOnlyVisibleStateValues`), ID-Präfix-Filter (`includeIdPrefixes`)
- Performance: Objekte-Auto-Refresh, Cache-Einstellungen (Reloads + TTL)
- Drag & Drop aktivieren (nur Dual-Pane)
- Änderungen im Einstellungs-Draft — erst aktiv nach „Speichern"; einige Toggles (expertMode, toolbarLabels, groupByPath) speichern sofort

## UI & Allgemein

- 6 Themes: Light, Dark, Abyss, Catppuccin Frappé, Catppuccin Macchiato, Catppuccin Mocha; Theme-Wechsel per Klick im Header; gespeichert im localStorage
- Deutsch und Englisch (Sprache umschaltbar im Header)
- Responsive Layout; Sidebar einklappbar für mehr Tabellenbreite
- Toast-Benachrichtigungen für Aktionen und Fehler
- Keyboard-Shortcuts-Übersicht (Modal)
- Lokaler Speicher löschbar (zurücksetzen aller gespeicherten Einstellungen)
- ioBroker-Host direkt im Browser konfigurierbar: Klick auf den Verbindungs-Badge im Header → `host:port` eingeben → Enter; Verbindungstest vor dem Speichern mit Statusanzeige; Host wird im localStorage gespeichert
- Auto-Refresh für Objekte: konfigurierbar (aus / 30s / 1min / 5min / 10min)
- ioBroker-Admin-Port konfigurierbar (Standard 8081) für direkte Admin-Links
- Script-IDs einbeziehen: javascript.0-Skripte auf verwendete Datenpunkte analysieren
- Docker-kompatibel: `nginx.conf` proxied REST-API und Socket.io; Runtime-Config via `window.__CONFIG__.ioBrokerHost` aus Umgebungsvariablen

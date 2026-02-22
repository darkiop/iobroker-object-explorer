# ioBroker Object Explorer

Ein React-Dashboard zum Durchsuchen, Verwalten und Überwachen von ioBroker-Datenpunkten über die REST-API. Dunkles Design, deutsche Benutzeroberfläche.

**Stack:** React 18 · TypeScript · TanStack React Query · Recharts · Tailwind CSS · Vite

---

## Starten

```bash
npm install
npm run dev        # Entwicklungsserver auf Port 5173
npm run build      # TypeScript-Check + Produktionsbuild
npm run lint       # ESLint
npx tsc --noEmit   # nur Type-Check
```

**Voraussetzungen:** ioBroker mit aktivem [REST API Adapter](https://github.com/ioBroker/ioBroker.rest-api) (Port `8093`), für Historydaten zusätzlich der `sql.0`-Adapter.

Der Vite-Dev-Server proxied `/api` → `http://10.4.0.20:8093` (konfigurierbar in `vite.config.ts`).

---

## Docker

```bash
docker build -t iobroker-object-explorer .
docker run -p 8080:80 iobroker-object-explorer
```

Der Nginx-Container proxied `/api` zur ioBroker REST API. Zieladresse kann in `nginx.conf` angepasst werden.

---

## Funktionsübersicht

### Suche & Filter

- **Pattern-Suche** mit Wildcard-Unterstützung (z.B. `alias.0.*`, `0_userdata.0.*`)
- **Schnellfilter-Buttons** für häufig verwendete Namespaces in der Seitenleiste
- Leere Eingabe entspricht `*` (alle Objekte)
- **History-Filter**: zeigt nur Datenpunkte mit aktivierter History-Aufzeichnung (Badge mit Trefferanzahl)
- **SmartName-Filter**: zeigt nur Datenpunkte mit konfiguriertem SmartHome-Namen (Badge mit Trefferanzahl)
- Beide Filter kombinierbar

---

### Objektbaum (Seitenleiste)

- Hierarchische Darstellung der ioBroker-Objektstruktur (Ordner / Gerät / Kanal / Datenpunkt)
- Knotentypen mit unterschiedlichen Icons: Ordner (gelb), Gerät (hellblau), Kanal (indigo), Datenpunkt ohne History (grün), Datenpunkt mit History (blau)
- **SmartName-Indikator**: Mikrofon-Icon an Datenpunkten mit konfiguriertem SmartName
- **Lupen-Symbol** an Ordnern: Setzt den Ordnerpfad als Suchfilter und klappt den Baum automatisch vollständig auf
- **Kopieren-Symbol**: Kopiert ID oder Muster (z.B. `ordner.*`) in die Zwischenablage mit visuellem Feedback
- **Aufklappen / Zuklappen**: Buttons in der Seitenleiste expandieren oder kollabieren den gesamten Baum
- Reagiert live auf History- und SmartName-Filter

---

### Datenpunkt-Tabelle

#### Spalten

| Spalte | Beschreibung |
|--------|-------------|
| **+** | Schaltfläche zum Anlegen neuer Datenpunkte (erste Spalte, immer sichtbar) |
| Schreibschutz | Schloss-Icon bei schreibgeschützten Datenpunkten |
| History | Klickbares History-Icon – öffnet das History-Modal direkt |
| SmartName | Mikrofon-Icon mit Tooltip des SmartName-Werts |
| ID | Monospace; Kopieren-Button bei Hover |
| Name | Inline bearbeitbar per Stift-Icon |
| Raum | Aus `enum.rooms.*` ermittelt |
| Rolle | Inline bearbeitbar mit Autovervollständigung |
| Wert | Rechtsbündig; auf 16 Zeichen gekürzt (Tooltip zeigt Vollwert) |
| Einheit | Einheit des Werts |
| Ack | Grüner (bestätigt) / gelber (unbestätigt) Punkt |
| Letztes Update | Zeitstempel `DD.MM.YYYY HH:MM:SS` |
| **Löschen** | Papierkorb-Icon mit Bestätigungs-Dialog (letzte Spalte, immer sichtbar) |

Alle Datenspalten (außer + und Löschen) können über das **Spalten-Picker-Dropdown** ein- und ausgeblendet werden. Die Auswahl wird in `localStorage` gespeichert.

#### Spalten-Management

- **Spaltenbreite ändern**: Ziehen am rechten Rand einer Spaltenüberschrift (Minimum 40 px)
- **Automatische Breite**: Doppelklick auf den Spaltenrand passt die Breite an den Inhalt an
- **100 % Strecken**: Dehnt alle Inhaltsspalten auf die verfügbare Containerbreite; Indikator-Spalten behalten ihre Fixbreite
- **Einstellungen zurücksetzen**: Stellt Standardbreiten, -sichtbarkeit und -filter wieder her
- Spaltenbreiten werden in `localStorage` gespeichert

#### Sortierung & Filterung

- Klick auf eine Spaltenüberschrift sortiert auf- oder absteigend (Pfeil-Indikator)
- **Spaltenfilter-Zeile** direkt unter den Überschriften: Freitext-Filter für ID, Name, Raum, Rolle, Wert und Einheit
- Aktive Filter werden mit blauer Umrandung hervorgehoben; einzeln per X oder gesammelt über die Toolbar löschbar
- Globale Filter (ID, Name, Raum, Rolle, Einheit) werden vor der Paginierung angewandt; der Wertfilter wirkt seitenlokal

#### Zeilenaktionen

- **Klick auf Zeile**: Öffnet das StateDetail-Modal mit Live-Wert und Objektmetadaten
- **History-Icon**: Öffnet das History-Modal direkt
- **Löschen-Icon** (ganz rechts): Zeigt Bestätigungs-Dialog vor dem unwiderruflichen Löschen

#### Toolbar

- **+ Button** (Tabellenkopf links): Öffnet das Formular für neue Datenpunkte; ID wird aus dem aktuellen Suchmuster vorbelegt
- **Anzahl-Anzeige**: Zentriert – zeigt Gesamtzahl der gefilterten Datenpunkte
- **100 %-Strecken**, **Filter löschen**, **Einstellungen zurücksetzen**, **Spalten-Picker**: rechtsbündig

#### Paginierung

- Konfigurierbare Seitengröße: 25 / 50 / 100 / 200 / 500 Einträge (gespeichert in `localStorage`)
- Navigation mit „Zurück" / „Weiter"; Anzeige von Seite, Bereich und Gesamtanzahl
- Suchänderungen setzen die Paginierung zurück

---

### Datenpunkt-Detail (StateDetail)

Öffnet sich als modales Overlay beim Klick auf eine Tabellenzeile; schließt mit ESC oder Klick außerhalb.

**Tab „Details"**

- Objektmetadaten (teils inline bearbeitbar): Name, Typ, Rolle, Einheit, Beschreibung, Min/Max, Lese-/Schreibrecht
- Echtzeitwerte mit 5 s Polling: aktueller Wert, Ack-Status, Qualität, Zeitstempel, letzter Änderungszeitpunkt, Quelle
- **Wert-Steuerung** (abhängig von Typ und Rolle):
  - Switch: Toggle-Button für `switch.*`-Rollen oder Boolean-Typen
  - Button: Auslöse-Button für `button.*`-Rollen
  - Zahl: Eingabefeld mit Einheit-Anzeige
  - Text: Texteingabe mit Senden-Schaltfläche
  - Boolean: Dropdown (true / false)
- **Expertenmodus**: Freies Eingabefeld mit automatischer Typkonvertierung (nur bei schreibbaren Datenpunkten)
- Integriertes Mini-History-Diagramm (wenn History für den Datenpunkt aktiviert ist)

**Tab „Objekt"**

- Vollständige JSON-Ansicht der Objektmetadaten; schreibgeschützt, scrollbar, Monospace

---

### History-Diagramm

**Zeitraum**
- Voreinstellungen: 1 h, 6 h, 24 h, 7 d, 30 d, 1 Jahr
- Manueller Modus: zwei Datetime-Picker für beliebigen Zeitraum

**Diagrammtypen**
- Linie (Standard), Fläche (mit Farbverlauf), Balken – umschaltbar per Schaltflächen-Gruppe

**Anzeigeoptionen**
- Datenpunkte ein-/ausblenden
- Aggregation: Keine / Durchschnitt / Min+Max / Min / Max

**Interaktion**
- Responsiv (füllt verfügbare Breite/Höhe)
- Dark/Light-Theme-Awareness
- X-Achse: Uhrzeit bei ≤ 24 h, sonst Datum + Uhrzeit
- Y-Achse mit Einheit; Hover-Tooltip mit Zeitstempel und Wert

**Löschen von Historydaten**
- **Einzelwert**: Aktivierungsmodus färbt Punkte rot; Klick auf Punkt löscht diesen Eintrag
- **Zeitbereich**: Löscht alle Einträge im aktuell sichtbaren Zeitraum
- **Alle**: Löscht die gesamte History des Datenpunkts
- Alle Aktionen erfordern eine Bestätigung

---

### History-Modal

- Großes Modal (80 vw × 75 vh) mit vollständig ausgefülltem History-Diagramm
- Öffnet beim Klick auf das History-Icon in der Tabelle
- Header zeigt Datenpunkt-ID (Monospace) + Schließen-Button
- Schließt per ESC oder Klick außerhalb

---

### Neuer Datenpunkt anlegen

| Feld | Pflicht | Beschreibung |
|------|---------|-------------|
| ID | ✓ | Vorbelegt aus Suchmuster (z.B. `javascript.0.` aus `javascript.0.*`); Duplikat-Validierung |
| Name | ✓ | Anzeigename |
| Typ | ✓ | number / string / boolean / mixed |
| Einheit | – | Freitext |
| Rolle | – | Autovervollständigung aus allen bekannten Rollen |
| Initialwert | – | Setzt den Wert direkt nach dem Anlegen |
| Min / Max | – | Nur bei Typ „number" |
| Lesbar / Schreibbar | – | Checkboxen, beide standardmäßig aktiviert |

---

### Datenpunkt löschen

- Papierkorb-Icon in der letzten Tabellenspalte
- Bestätigungs-Dialog zeigt die ID des zu löschenden Datenpunkts
- Löscht Objekt **und** Zustand unwiderruflich über `DELETE /v1/object/:id`
- Zeile verschwindet sofort aus der Tabelle (optimistisches Cache-Update)

---

### Theme-System

- Hell- und Dunkel-Modus per Toggle-Button im Header
- Standard: Dunkelmodus
- Persistenz in `localStorage`

---

## Datenfluss

```
SearchBar (Pattern-Eingabe)
  → useFilteredObjects()   – Objekte einmalig geladen, client-seitig gefiltert
  → useStateValues(ids)    – Batch-Fetch der aktuellen Seite (30 s Polling)
  → StateList              – Paginiert, sortiert, gefiltert
  → StateTree              – Hierarchische Navigation

Klick auf Zeile
  → StateDetail            – 5 s Polling Einzelwert + Objektmetadaten
  → HistoryChart           – History via sendTo sql.0 (immutable cache)

Klick auf History-Icon
  → HistoryModal           – Großes History-Diagramm
```

---

## API-Endpunkte

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| GET | `/v1/objects` | Alle Objekte laden |
| GET | `/v1/object/:id` | Einzelnes Objekt |
| PUT | `/v1/object/:id` | Objekt anlegen / aktualisieren |
| DELETE | `/v1/object/:id` | Objekt löschen |
| GET | `/v1/state/:id` | Einzelnen Zustand laden |
| PATCH | `/v1/state/:id` | Zustand setzen |
| POST | `/v1/command/sendTo` | Historydaten über `sql.0` abfragen / löschen |

---

## Lokaler Speicher

| Schlüssel | Inhalt |
|-----------|--------|
| `iobroker-visible-cols` | Sichtbare Tabellenspalten |
| `iobroker-col-widths` | Spaltenbreiten |
| `iobroker-page-size` | Bevorzugte Seitengröße |
| `theme` | `dark` oder `light` |

---

## Projektstruktur

| Pfad | Inhalt |
|------|--------|
| `src/types/iobroker.ts` | TypeScript-Interfaces |
| `src/api/iobroker.ts` | REST-API-Client mit Object-Cache |
| `src/hooks/useStates.ts` | React Query Hooks |
| `src/components/` | UI-Komponenten |
| `vite.config.ts` | Dev-Server + API-Proxy |
| `nginx.conf` | Nginx-Konfiguration für Docker |
| `Dockerfile` | Multi-Stage Build (Node → Nginx) |

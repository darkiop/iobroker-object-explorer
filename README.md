# ioBroker Object Explorer

Ein React-Dashboard zum Durchsuchen, Verwalten und Überwachen von ioBroker-Datenpunkten über die REST-API. Hell- und Dunkel-Modus, deutsche Benutzeroberfläche.

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

**Voraussetzungen:** ioBroker mit aktivem [REST API Adapter](https://github.com/ioBroker/ioBroker.rest-api) (Port `8093`). Für Historydaten wird aktuell **ausschließlich der `sql.0`-Adapter** unterstützt (History- und InfluxDB-Adapter werden nicht erkannt).

Der Vite-Dev-Server proxied `/api` → `http://10.4.0.20:8093` (konfigurierbar in `vite.config.ts`).

---

## Docker

```bash
docker build -t iobroker-object-explorer .
docker run -p 8080:80 \
  -e IOBROKER_HOST=10.4.0.20 \
  -e IOBROKER_PORT=8093 \
  iobroker-object-explorer
```

Der Nginx-Container proxied `/api` zur ioBroker REST API. Zieladresse und Port werden über Umgebungsvariablen (`IOBROKER_HOST`, `IOBROKER_PORT`) konfiguriert – der Entrypoint generiert beim Start `/config.js` mit `window.__CONFIG__`, das im Browser zur Anzeige der REST-API-Adresse im Header genutzt wird.

Alternativ über `docker-compose.yml`:

```yaml
environment:
  IOBROKER_HOST: 10.4.0.20
  IOBROKER_PORT: 8093
```

---

## Funktionsübersicht

### Layout & Navigation

- **Einklappbare Seitenleiste**: Button im Header klappt die Seitenleiste vollständig ein/aus (CSS-Animation), um der Tabelle mehr Platz zu geben
- **Drag-Resize**: Trennlinie zwischen Seitenleiste und Hauptbereich ist verschiebbar (180–600 px)
- **Hell-/Dunkel-Modus**: Toggle-Button im Header, gespeichert in `localStorage`

---

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
- **Rechtsklick-Kontextmenü**: ID kopieren, Als Filter setzen, Objekt bearbeiten, Datenpunkt löschen

---

### Datenpunkt-Tabelle

#### Spalten

| Spalte | Beschreibung |
|--------|-------------|
| **Checkbox** | Multi-Selektion für Sammelaktionen; ein-/ausblendbar (Standard: sichtbar) |
| **+** | Schaltfläche zum Anlegen neuer Datenpunkte (erste Spalte, immer sichtbar) |
| Schreibschutz | Schloss-Icon bei schreibgeschützten Datenpunkten |
| History | Klickbares History-Icon – öffnet das History-Modal direkt |
| SmartName | Mikrofon-Icon mit Tooltip des SmartName-Werts |
| Alias | Bernsteinfarbenes Link-Icon wenn ein Alias auf diesen Datenpunkt zeigt; bei mehreren Aliassen wird die Anzahl als Badge angezeigt; klickbar (springt zum Alias) |
| ID | Monospace; Kopieren-Button bei Hover |
| Name | Inline bearbeitbar per Stift-Icon |
| Raum | Aus `enum.rooms.*` ermittelt; per Klick editierbar (Dropdown mit allen verfügbaren Räumen) |
| Funktion | Aus `enum.functions.*` ermittelt; per Klick editierbar (Dropdown mit allen verfügbaren Funktionen) |
| Rolle | Inline bearbeitbar mit Autovervollständigung (Portal-Dropdown) |
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
- **Spaltenfilter-Zeile** direkt unter den Überschriften: Freitext-Filter für ID, Name, Raum, Funktion, Rolle, Wert und Einheit
- Icon-Spalten (Schreibschutz, History, SmartName, Alias) filtern per Klick ein/aus
- Aktive Filter werden mit blauer Umrandung hervorgehoben; einzeln per X oder gesammelt über die Toolbar löschbar

#### Zeilenaktionen

- **Klick auf Zeile**: Öffnet das StateDetail-Panel mit Live-Wert und Objektmetadaten
- **Rechtsklick auf Zeile**: Öffnet Kontextmenü (siehe unten)
- **History-Icon**: Öffnet das History-Modal direkt
- **Löschen-Icon** (ganz rechts): Zeigt Bestätigungs-Dialog vor dem unwiderruflichen Löschen
- **Checkbox**: Multi-Selektion für Sammel-Löschung

#### Rechtsklick-Kontextmenü (Tabelle)

| Eintrag | Aktion |
|---------|--------|
| ID kopieren | ID in Zwischenablage |
| Name kopieren | Anzeigename in Zwischenablage |
| Wert kopieren | Aktuellen Wert in Zwischenablage |
| History anzeigen | Öffnet History-Modal |
| Als Filter setzen | Setzt ID als Spaltenfilter |
| Raum bearbeiten | Öffnet Raum-Dropdown direkt |
| Funktion bearbeiten | Öffnet Funktions-Dropdown direkt |
| Objekt bearbeiten | Öffnet ObjectEditModal (Details / JSON / Alias) |
| Datenpunkt kopieren | Öffnet Kopier-Dialog |
| Alias anlegen | Öffnet Alias-Dialog (nur für Nicht-`alias.0.*`-Datenpunkte) |
| Datenpunkt löschen | Bestätigungs-Dialog zum Löschen |

#### Toolbar

- **+ Button** (Tabellenkopf links): Öffnet das Formular für neue Datenpunkte; ID wird aus dem aktuellen Suchmuster vorbelegt
- **Anzahl-Anzeige**: Zentriert – zeigt Gesamtzahl der gefilterten Datenpunkte
- **100 %-Strecken**, **Filter löschen**, **Einstellungen zurücksetzen**, **Spalten-Picker**: rechtsbündig

#### Paginierung

- Konfigurierbare Seitengröße: 25 / 50 / 100 / 200 / 500 Einträge (gespeichert in `localStorage`)
- Fußzeile: „Zurück" + Größenauswahl links · Seiteninformation zentriert · „Weiter" rechts

---

### Datenpunkt-Detail (StateDetail)

Öffnet sich als Panel beim Klick auf eine Tabellenzeile; schließt mit ESC oder ×-Button.

**Tab „Details"**

- Objektmetadaten (teils inline bearbeitbar): Name, Typ, Rolle, Einheit, Beschreibung, Min/Max, Lese-/Schreibrecht
- Echtzeitwerte mit 5 s Polling: aktueller Wert, Ack-Status, Qualität, Zeitstempel, letzter Änderungszeitpunkt, Quelle
- **Wert-Steuerung** (abhängig von Typ und Rolle):
  - Switch: Toggle-Button für `switch.*`-Rollen oder Boolean-Typen
  - Button: Auslöse-Button für `button.*`-Rollen
  - Zahl: Eingabefeld mit Einheit-Anzeige
  - Text: Texteingabe mit Senden-Schaltfläche
  - Boolean: Dropdown (true / false)
- **Expertenmodus** (Schraubenschlüssel-Icon): Freies Eingabefeld mit automatischer Typkonvertierung (nur bei schreibbaren Datenpunkten)
- Integriertes Mini-History-Diagramm (wenn History für den Datenpunkt aktiviert ist)

**Tab „Objekt"**

- Vollständige JSON-Ansicht der Objektmetadaten; schreibgeschützt, scrollbar, Monospace

**Tab „Alias"**

- Ziel-Datenpunkt (`alias.id`): ID des Quell-Datenpunkts, auf den dieser Alias zeigt
- Lese-Formel (`alias.read`): optionaler JavaScript-Ausdruck zur Konvertierung beim Lesen (`val`)
- Schreib-Formel (`alias.write`): optionaler JavaScript-Ausdruck zur Konvertierung beim Schreiben (`val`)
- Anzeige des aktuell gespeicherten Alias-Objekts
- Alias wird entfernt, wenn `alias.id` leer gelassen wird

---

### Objekt bearbeiten (ObjectEditModal)

Öffnet sich über **Rechtsklick → „Objekt bearbeiten"** in Tabelle und Baum.

- **Tab „Details"**: Dieselben editierbaren Felder und Wert-Controls wie im StateDetail-Panel; inklusive Expertenmodus und Mini-History
- **Tab „JSON"**: Roher JSON-Editor mit Syntaxfehler-Anzeige; direktes Speichern via `PUT`
- **Tab „Alias"**: Alias-Ziel, Lese- und Schreib-Formel setzen oder entfernen
- **Header-Buttons**: Expertenmodus-Toggle (Schraubenschlüssel), Datenpunkt löschen (Papierkorb)

---

### Alias anlegen

Öffnet sich über **Rechtsklick → „Alias anlegen"** (nur für Nicht-`alias.0.*`-Datenpunkte).

- Schlägt automatisch eine Alias-ID vor (`alias.0.<quell-id-ohne-adapter-prefix>`)
- Übernimmt Typ, Rolle, Einheit, Lese-/Schreibrecht des Quell-Datenpunkts
- Setzt `common.alias.id` auf die Quell-ID
- Alias-ID muss mit `alias.0.` beginnen (Validierung)

---

### Datenpunkt kopieren

Öffnet sich über **Rechtsklick → „Datenpunkt kopieren"**.

- Neue ID vorbelegt mit `<quell-id>_copy`; Name mit `<name> (Kopie)`
- Kopiert: Typ, Rolle, Einheit, Lesen/Schreiben, Min/Max, Beschreibung, States-Mapping

---

### History-Diagramm

> **Hinweis:** Aktuell wird für History-Abfragen und -Löschoperationen ausschließlich der **`sql.0`-Adapter** unterstützt. Datenpunkte ohne aktive `sql.0`-Aufzeichnung werden kein History-Icon anzeigen.

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

- Papierkorb-Icon in der letzten Tabellenspalte (Einzellöschung)
- **Mehrfachlöschung**: Datenpunkte per Checkbox auswählen → Sammel-Löschen mit Fortschrittsanzeige
- Bestätigungs-Dialog zeigt die ID(s) des zu löschenden Datenpunkts
- Löscht Objekt **und** Zustand unwiderruflich über `DELETE /v1/object/:id`

---

## Datenfluss

```
SearchBar (Pattern-Eingabe)
  → useAllObjects()         – Objekte einmalig geladen, client-seitig gefiltert
  → useStateValues(ids)     – Batch-Fetch der aktuellen Seite (30 s Polling)
  → StateList               – Paginiert, sortiert, gefiltert
  → StateTree               – Hierarchische Navigation

Klick auf Zeile
  → StateDetail             – 5 s Polling Einzelwert + Objektmetadaten
  → HistoryChart            – History via sendTo sql.0 (immutable cache)

Rechtsklick → Objekt bearbeiten
  → ObjectEditModal         – Details / JSON / Alias Tabs

Rechtsklick → Alias anlegen
  → CreateAliasModal        – Erstellt alias.0.* Objekt

Rechtsklick → Datenpunkt kopieren
  → CopyDatapointModal      – Dupliziert Datenpunkt mit neuer ID
```

---

## API-Endpunkte

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| GET | `/v1/objects` | Alle Objekte laden |
| GET | `/v1/object/:id` | Einzelnes Objekt |
| PUT | `/v1/object/:id` | Objekt anlegen / vollständig ersetzen |
| PATCH | `/v1/object/:id` | Objekt partiell aktualisieren (extend) |
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
| `src/types/iobroker.ts` | TypeScript-Interfaces (IoBrokerState, IoBrokerObject, …) |
| `src/api/iobroker.ts` | REST-API-Client mit globalem Object-Cache, Alias-Reverse-Map, Enum-Helpers |
| `src/hooks/useStates.ts` | React Query Hooks (Objekte, Zustände, History, Raum/Funktions-Enums, CRUD) |
| `src/context/ThemeContext.tsx` | Hell-/Dunkel-Modus-Kontext mit localStorage-Persistenz |
| `src/components/Layout.tsx` | App-Shell: Header, einklappbare Seitenleiste, Drag-Resize |
| `src/components/StateTree.tsx` | Hierarchischer Objektbaum mit Kontextmenü |
| `src/components/StateList.tsx` | Haupttabelle: Spalten, Sortierung, Filter, Kontextmenü, Paginierung |
| `src/components/StateDetail.tsx` | Detail-Panel (Details / Objekt / Alias Tabs) |
| `src/components/ObjectEditModal.tsx` | Bearbeitungs-Modal (Details / JSON / Alias Tabs) |
| `src/components/HistoryChart.tsx` | Recharts-Diagramm mit Zeitraum, Aggregation, Löschfunktionen |
| `src/components/HistoryModal.tsx` | Großes History-Modal |
| `src/components/NewDatapointModal.tsx` | Formular zum Anlegen neuer Datenpunkte |
| `src/components/CreateAliasModal.tsx` | Dialog zum Anlegen von Alias-Datenpunkten |
| `src/components/CopyDatapointModal.tsx` | Dialog zum Kopieren von Datenpunkten |
| `src/components/ContextMenu.tsx` | Portal-basiertes Rechtsklick-Menü |
| `src/components/ConfirmDialog.tsx` | Generischer Bestätigungs-Dialog |
| `src/components/MultiDeleteDialog.tsx` | Mehrfach-Lösch-Dialog mit Fortschritt |
| `vite.config.ts` | Dev-Server + API-Proxy |
| `nginx.conf` | Nginx-Konfiguration für Docker (SPA-Fallback, API-Proxy) |
| `Dockerfile` | Multi-Stage Build (Node 22 → Nginx Alpine) |
| `docker/entrypoint.sh` | Generiert `/config.js` aus Umgebungsvariablen beim Container-Start |

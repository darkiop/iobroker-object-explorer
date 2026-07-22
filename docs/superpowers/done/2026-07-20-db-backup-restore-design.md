# DB-Backup: Export vor dem Löschen und Restore

## Context

Die DB-Overview-Familie (`DbOverviewModal`, `DpValuesModal`, `OrphanValuesModal`) hat inzwischen vier
destruktive Aktionen, die Wert-Zeilen unwiderruflich aus der sql.0-Datenbank entfernen:

| Aktion | Ort | Umfang |
|---|---|---|
| Delete-all | `DbOverviewModal` (Zeilen-Button) | alle Werte eines Datenpunkts |
| 3M-Purge | `DpValuesModal` | Werte älter als 3 Monate |
| Dedupe | `DpValuesModal` | aufeinanderfolgende Gleichwerte |
| Orphan-Delete | `OrphanValuesModal` | Waisen-Zeilen einer (Tabelle, id)-Gruppe |

Keine davon hat ein Sicherheitsnetz. Ein Fehlklick kostet Jahre an History.

Exportiert werden kann heute nur: Objekt-Metadaten als JSON/CSV
([StateList.tsx:616](src/components/statelist/StateList.tsx#L616)) und die **aggregierten** Chart-Daten
eines History-Fensters ([HistoryChart.tsx:342](src/components/history/HistoryChart.tsx#L342)).
Ein Export der **Rohzeilen** aus der DB existiert nicht.

Ziel: Rohwerte vor dem Löschen sichern und wieder zurückspielen können.

## Nicht-Ziele

Bewusst außerhalb dieses Specs:

- CSV als Dump-Format (trägt das verschachtelte Serien-Schema nicht)
- Kompression, Upload, Zeitplanung
- Anlegen fehlender Datenpunkte beim Restore (Adapter-Hoheit)
- Downsampling / Aggregat-Archiv

## Ansatz

Eigene Backup-Schicht statt Inline-Code in den drei Modals. Die Format-Logik ist der Teil, der bei
einem Backup korrekt sein *muss* — sie liegt deshalb IO-frei in einem eigenen Modul und ist ohne
laufende DB testbar. Die bestehenden Modals (757 bzw. 956 Zeilen) wachsen dadurch kaum.

```
src/api/dbBackup.ts                       pure: buildDump, parseDump, validateDump, dumpFilename
src/api/iobroker.ts                       +3 Funktionen (Chunk-Fetch, Batch-Insert)
src/hooks/useDbBackup.ts                  Chunk-Loop, Progress-State, Download, Restore-Lauf
src/components/modals/DbBackupModal.tsx   Restore-UI
```

Verworfene Alternativen:

- **Inline in jedes Modal** — 4× dupliziert, Format-Logik nicht isoliert testbar.
- **Guard-Wrapper in der API-Schicht** (`deleteHistoryAll` dumpt intern vorher) — versteckter
  Datei-Download als Seiteneffekt einer Delete-Funktion, kein Progress-UI möglich, schwer testbar.

## Dump-Format

Eine JSON-Datei, zwei Serien-Varianten in einem Schema:

```jsonc
{
  "format": "iobroker-object-explorer/db-dump",
  "version": 1,
  "createdAt": 1753000000000,
  "source": { "db": "iobroker", "host": "…" },   // nur informativ
  "trigger": "delete-all" | "purge" | "dedupe" | "orphan-delete" | "manual",
  "truncated": false,        // true wenn der Cap gegriffen hat
  "series": [{
    "kind": "named",         // "named" | "orphan"
    "id": "alias.0.foo",     // nur kind=named
    "dbId": 4711,            // nur kind=orphan (numerische datapoints.id)
    "table": "ts_number",
    "type": "number",
    "range": { "from": 1690000000000, "to": 1753000000000 },
    "count": 12345,
    "rows": [[ts, val, ack, q, src]]   // Array-of-Arrays
  }]
}
```

**Zeilen als Arrays.** Bei 500k Zeilen spart `[1690000000000,21.5,1,0,null]` gegenüber
`{"ts":…,"val":…,…}` grob 60% Dateigröße. Die Spaltenreihenfolge ist über `version` festgenagelt.

**`q` und `src` kommen mit.** [insertDpValue](src/api/iobroker.ts#L1254) schreibt heute hart
`_from = 0, q = 0`. Ein Backup, das Qualitäts-Flags verliert, ist keins. Der Restore schreibt `q`
zurück und löst `src` über die `sources`-Tabelle auf; fehlt der Name dort, wird auf `_from = 0`
zurückgefallen und im Report gezählt. Kein Auto-Insert in `sources`.

**`kind: "orphan"` ist eine eigene Variante.** Waisen-Zeilen haben keinen Namen mehr, nur `table` +
numerische `dbId`. MariaDB kann die AUTO_INCREMENT-Lücke inzwischen neu vergeben haben, deshalb
prüft der Restore, ob `dbId` jetzt in `datapoints` existiert — wenn ja, wird die Serie **blockiert**,
nicht nur gewarnt. Sonst landen fremde Werte in einer fremden Zeitreihe.

## Export-Datenfluss

Neu in [src/api/iobroker.ts](src/api/iobroker.ts):

- `fetchDpRowsChunked(id, type, range, onChunk, cap)` — pagt über das vorhandene
  [getDpValues](src/api/iobroker.ts#L957) in 10k-Blöcken
- `fetchOrphanRowsChunked(table, dbId, onChunk, cap)` — dasselbe nach numerischer id; `getDpValues`
  ist für Waisen unbrauchbar, weil es über `datapoints.name` auflöst
- `insertDpValuesBatch(table, type, numId, rows)` — Multi-Row-`INSERT IGNORE`. `type` wird gebraucht,
  weil `dpValueSql()` typabhängig quotet; `_from` wird vom Aufrufer bereits als numerische
  `sources.id` (oder 0) übergeben, die Batch-Funktion löst keine Namen auf.

Pro Trigger:

| Trigger | Quelle | Extra-Queries |
|---|---|---|
| Delete-all | `fetchDpRowsChunked`, ganzer DP | ja, voller Scan |
| 3M-Purge | `fetchDpRowsChunked` mit `endTs = cutoff` | ja, nur Purge-Bereich |
| Dedupe | die Zeilen, die der Dedupe-Scan bereits geladen hat | **keine** |
| Orphan-Delete | `fetchOrphanRowsChunked` pro Gruppe | ja |

Der Dedupe-Scan muss `ts` und `val` ohnehin lesen, um Gleichwert-Folgen zu finden. Der Export greift
auf genau diese Zeilen zu, statt sie erneut zu holen.

**Cap.** Konstante `DB_DUMP_MAX_ROWS = 500_000` in `dbBackup.ts`. Vorab läuft immer ein
`getDpValueCount` für den Bereich. Über dem Cap erscheint ein Dialog mit drei Optionen: die neuesten
500k **innerhalb des betroffenen Bereichs** exportieren (`truncated: true`), ohne Export löschen,
oder abbrechen. Kein stilles Abschneiden.

Beim 3M-Purge ist der betroffene Bereich alles vor dem Cutoff — „neueste 500k" heißt dort also die
500k Zeilen direkt vor dem Cutoff; die ältesten Zeilen fallen aus dem Dump. Der Dialog benennt das
explizit, weil der Verlust sonst genau die Daten trifft, die man am ehesten archivieren wollte.

**Progress.** Der Hook liefert `{ phase: 'counting' | 'fetching' | 'writing', done, total }`; die
Modals rendern daraus einen Balken. Abbruch über `AbortController`, der die Chunk-Schleife nach dem
laufenden Block verlässt.

## Auto-Export-Gate

Neues Feld `dbBackupBeforeDelete: boolean` in `AppSettings`
([UIContext.tsx](src/context/UIContext.tsx)), Default **an**, Schalter im Settings-Modal unter
Connection.

Ablauf, identisch in allen vier Call-Sites:

1. Bestätigungsdialog zeigt zusätzlich „Wird vorher als `<dateiname>` gesichert"
2. User bestätigt
3. Export läuft mit Progress
4. Download erfolgt
5. **erst dann** der bestehende Delete-Aufruf

Scheitert Schritt 3 oder 4 (Fehler, Abbruch, Cap-Dialog abgebrochen), wird Schritt 5 übersprungen und
der Fehler im Dialog angezeigt. Ein Backup nach dem Löschen wäre wertlos; eines, das lautlos
scheitert, schlimmer als keins.

Bei `dbBackupBeforeDelete === false` entfällt Schritt 3/4 vollständig — der Dialog nennt dann keinen
Dateinamen.

## Restore

Einstieg: neuer Button in der DbOverview-Toolbar neben dem Orphan-Button, öffnet `DbBackupModal`.

1. Datei wählen → `parseDump()` + `validateDump()`
2. Preview-Tabelle: pro Serie ID bzw. `dbId`, Typ, Zeilenzahl, Zeitbereich, Status
3. Status pro Serie:
   - `ok` — Ziel existiert in `datapoints`
   - `missing` — ID nicht mehr in der DB; Serie wird übersprungen (kein Anlegen von Datenpunkten)
   - `blocked` — Orphan-Serie, deren `dbId` inzwischen wieder vergeben ist
   - `truncated` — Dump war abgeschnitten; nur Hinweis, blockiert nicht
4. Checkbox pro Serie, `ok` vorausgewählt
5. Bestätigen → Batch-Insert in 5k-Blöcken mit Progress
6. Report: eingefügt / übersprungen / geblockt, plus Anzahl nicht auflösbarer `src`

**Konflikte über `INSERT IGNORE`.** Der Primärschlüssel `(id, ts)` sorgt dafür, dass vorhandene
Zeilen unangetastet bleiben; `affectedRows` liefert die eingefügte Anzahl, übersprungen =
Blockgröße minus eingefügt. Das ergibt die gewünschte Skip-und-Report-Semantik, ohne eine halbe
Million Timestamps in den Browser zu laden, und ist atomar pro Block statt Check-Then-Insert mit
Race dazwischen.

## Fehlerbehandlung

**Export.** Bricht ein Chunk ab (sendTo-Timeout, Adapter weg), wird **kein** Teil-Dump
heruntergeladen — eine halbe Datei, die wie ein Backup aussieht, ist die gefährlichste Variante.
Stattdessen: Fehler im Dialog, kein Download, kein Delete. Erneuter Versuch möglich.

**Restore.** Blockweise; Blöcke vor dem Fehler bleiben eingefügt. Der Report nennt die zuletzt
erfolgreiche Position. Weil `INSERT IGNORE` idempotent ist, ist ein Neustart mit derselben Datei
gefahrlos. Kein Transaktions-Rollback — über sendTo nicht verlässlich zu haben.

**Escaping.** Der Batch-Insert baut SQL als String und schickt jeden Wert durch das vorhandene
[dpValueSql()](src/api/iobroker.ts#L1206) (quotet Strings, coerct Booleans zu 0/1, wirft bei
ungültigen Zahlen). Dumps sind benutzergewählte Dateien, also nicht vertrauenswürdiger Input.
`validateDump()` prüft vor dem Insert:

- `ts` — endliche positive Ganzzahl
- `ack` — 0 oder 1
- `q` — endliche nichtnegative Ganzzahl
- `table` — Whitelist `ts_number | ts_string | ts_bool`
- `dbId` — endliche Ganzzahl
- Zeilen-Arity — genau 5 Elemente

Tabellenname und numerische id werden nie direkt aus der Datei in SQL interpoliert, sondern erst
nach Whitelist- bzw. Zahlprüfung.

## Tests

`src/api/dbBackup.test.ts` (Vitest) — `dbBackup.ts` ist genau dafür IO-frei:

- Roundtrip `buildDump` → `parseDump` erhält alle Felder inkl. `q` und `src`
- `validateDump` weist ab: falscher Format-Tag, unbekannte Version, Tabelle außerhalb der Whitelist,
  falsche Zeilen-Arity, `ts` als String / negativ / NaN
- Orphan-Serie wird `blocked`, wenn `dbId` in der Live-`datapoints`-Menge liegt
- `truncated: true` wird durchgereicht und ist im Preview-Status sichtbar
- Zeilen-Array-Kodierung: Spaltenreihenfolge stabil, `null` in `src` überlebt

`src/hooks/useDbBackup.test.ts` mit gemocktem Fetch:

- Cap greift bei Überschreitung
- Abbruch beendet nach dem laufenden Block
- Progress zählt korrekt hoch
- Export-Fehler führt zu keinem Download und keinem Delete-Aufruf

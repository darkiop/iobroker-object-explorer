# DB-Overview: Mismatch zwischen sql.0-DB und Objekt-Konfiguration sichtbar machen

## Context

`DbOverviewModal` zeigt heute nur, was **in der sql.0-Datenbank gespeichert** ist (`getDpOverview()` via sendTo).
Ob auf dem zugehörigen ioBroker-Objekt das Logging überhaupt noch aktiv ist (`common.custom['sql.0'].enabled`),
wird nirgends geprüft — beide Seiten sind heute vollständig entkoppelt.

Dadurch bleiben zwei Problemfälle unsichtbar:

1. **Logging inaktiv** — ID liegt in der DB, aber `common.custom['sql.0'].enabled !== true`. Karteileiche:
   Daten belegen Platz, wachsen aber nicht mehr, und die History wirkt in der UI "eingefroren".
2. **Objekt fehlt** — ID liegt in der DB, aber es gibt gar kein Objekt mehr (Datenpunkt gelöscht/umbenannt).
   Echte Waise, die nur noch über die DB-Übersicht auffindbar ist.

Ziel: beide Zustände pro Zeile im `DbOverviewModal` erkennbar machen. **Rein diagnostisch** — keine neuen
Aktionen; Aufräumen passiert weiter bewusst über die bestehenden Rename-/Delete-Buttons.

## Ansatz

Join im Client. Kein neuer API-Aufruf nötig:

- DB-Seite: `rows` (bereits vorhanden in [DbOverviewModal.tsx:128](src/components/modals/DbOverviewModal.tsx#L128))
- Objekt-Seite: `useAllObjects()` aus [useObjectQueries.ts:55](src/hooks/useObjectQueries.ts#L55) — global gecached, `staleTime: Infinity`
- Logging-Check: bestehendes `hasHistory(obj)` aus [iobroker.ts:1018](src/api/iobroker.ts#L1018) (`common.custom['sql.0'].enabled === true`) — **wiederverwenden, nicht neu implementieren**

## Änderungen

Alles in **[src/components/modals/DbOverviewModal.tsx](src/components/modals/DbOverviewModal.tsx)** (eine Datei).

### 1. Status-Ableitung

```ts
type DpStatus = 'ok' | 'logging-off' | 'orphan' | 'unknown';
```

`useAllObjects()` einbinden, `statusById` als `useMemo<Map<string, DpStatus>>` über `rows`:

- `allObjects` noch nicht geladen → `'unknown'` (nichts anzeigen, keine falschen Warnungen während des Ladens)
- kein Objekt unter der ID → `'orphan'`
- `hasHistory(obj)` → `'ok'`, sonst `'logging-off'`

`unknown` ist wichtig: `useAllObjects` kann beim Öffnen des Modals noch laden, und ohne diesen Zustand
würde jede Zeile kurz als "Objekt fehlt" rot aufblitzen.

### 2. Status-Spalte

Synthetische Spalte analog zum bestehenden `'__count__'`-Muster (`handleSort`, `sorted`) — **nicht** in
das dynamische `columns`-Array aufnehmen, da dieses aus den Row-Keys gebildet wird
([Zeile 135-140](src/components/modals/DbOverviewModal.tsx#L135-L140)).

- Eigenes schmales `<th>` (~w-8) als **erste** Spalte vor `columns.map(...)`, sortierbar via `handleSort('__status__')`
- Eigenes `<td>` als erste Zelle in der Body-Row
- Icons (lucide, `size={13}`):
  - `logging-off` → `AlertTriangle`, amber — Tooltip EN: `Stored in sql.0, but logging is not enabled on the object` / DE: `In sql.0 gespeichert, aber Logging am Objekt nicht aktiv`
  - `orphan` → `Unlink`, rot — Tooltip EN: `Stored in sql.0, but the object no longer exists` / DE: `In sql.0 gespeichert, aber Objekt existiert nicht mehr`
  - `ok` / `unknown` → leere Zelle (kein grünes Icon; hält die Tabelle ruhig, Problemfälle stechen hervor)

Sortierung in `sorted` (Zeile 148-164) als Rang, damit `asc` die Probleme nach oben holt:
`orphan=0, logging-off=1, ok=2, unknown=3`.

### 3. Zeilen-Tönung

`<tr>`-className ([Zeile 324](src/components/modals/DbOverviewModal.tsx#L324)) per Status-Lookup.
Die Tönung muss ihre **eigene Hover-Variante mitbringen**, sonst kollidiert sie mit dem bestehenden
`hover:bg-gray-50 dark:hover:bg-gray-800/50` (beides Background-Utilities, Reihenfolge im Stylesheet entscheidet):

- `ok` / `unknown`: bestehende Klassen unverändert
- `logging-off`: `bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/20`
- `orphan`: `bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20`

### 4. i18n

Projekt-Konvention: keine Translation-Keys, sondern inline `isEn ? 'EN' : 'DE'` mit dem vorhandenen
`isEn` ([Zeile 27](src/components/modals/DbOverviewModal.tsx#L27)). Neue Strings genauso.

## Nicht in Scope

- Fall "Logging aktiv, aber keine DB-Daten" — bräuchte synthetische Zeilen ohne DB-Herkunft
- "Logging aktivieren"-Button, Batch-Delete verwaister IDs
- Header-Zählchips / Quick-Filter auf Status
- Andere sql-Instanzen als `sql.0` (`hasHistory` und das Modal sind beide sql.0-fix)

## Verifikation

1. `npx tsc --noEmit` und `npm run lint` sauber
2. `npm run dev` → Modal über Toolbar in `StateList` öffnen
3. Prüfen an echten Daten:
   - Datenpunkt mit aktivem sql.0-Logging → keine Tönung, leere Status-Zelle
   - In ioBroker bei einem geloggten Datenpunkt `custom sql.0` deaktivieren (Daten bleiben in DB) → Reload → Zeile amber + `AlertTriangle`, Tooltip korrekt
   - Falls eine verwaiste ID existiert (DB-Eintrag ohne Objekt) → rot + `Unlink`; alternativ über die vorhandene DB-Rename-Funktion eine ID auf einen nicht existierenden Namen umbenennen, um den Fall zu erzeugen
4. Klick auf Status-Header sortiert Probleme nach oben; erneuter Klick dreht die Richtung
5. Hover auf getönten Zeilen: Hintergrund wechselt sichtbar, Rename-/Delete-Icons erscheinen weiterhin
6. Dark Mode und Sprachumschaltung EN/DE gegenprüfen

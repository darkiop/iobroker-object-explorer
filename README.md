# ioBroker Object Explorer

React-Dashboard zum Durchsuchen und Verwalten von ioBroker-Datenpunkten via REST API.

## Features

- **Suche** nach Datenpunkten über Wildcard-Pattern (z. B. `alias.0.*`)
- **Baumansicht** zur hierarchischen Navigation
- **Tabellenliste** mit paginierten Zustandswerten (50 pro Seite)
- **Detailansicht** (Modal) mit Live-Wert (5s Polling), Metadaten und Schreibzugriff
- **Historychart** mit Linien-, Balken- und Flächendiagramm (via `sql.0`-Adapter)
- **Wert schreiben** direkt aus der Detailansicht
- **Metadaten bearbeiten**: Einheit und Rolle per Dropdown änderbar
- **Light/Dark Theme**

## Stack

| Paket | Version |
|---|---|
| React | 18 |
| TanStack React Query | 5 |
| Recharts | 3 |
| Tailwind CSS | 3 |
| Vite | 5 |
| TypeScript | 5.6 |

## Voraussetzungen

- ioBroker mit aktivem [REST API Adapter](https://github.com/ioBroker/ioBroker.rest-api) (Port `8093`)
- Für Historydaten: `sql.0`-Adapter

## Entwicklung

```bash
npm install
npm run dev       # Vite Dev-Server auf http://localhost:5173
```

Der Vite-Dev-Server proxyt `/api` automatisch zu `http://10.4.0.20:8093`.
Die Zieladresse kann in `vite.config.ts` geändert werden.

```bash
npm run build     # TypeScript-Check + Produktions-Build
npm run lint      # ESLint
npx tsc --noEmit  # nur Type-Check
```

## Docker

```bash
# Image bauen
docker build -t iobroker-object-explorer .

# Container starten
docker run -p 8080:80 iobroker-object-explorer
```

Danach erreichbar unter `http://localhost:8080`.

Der Nginx-Container proxyt `/api` zur ioBroker REST API (`http://10.4.0.20:8093`).
Die Zieladresse kann in `nginx.conf` angepasst werden.

## Architektur

```
SearchBar (Pattern-Eingabe)
  → useFilteredObjects()  → globaler Objects-Cache, client-seitig gefiltert
  → useStateValues(ids)   → Batch-Fetch (20er-Gruppen), 30s Polling
  → StateTree             → hierarchische Baumnavigation
  → StateList             → paginierte Tabelle
  → StateDetail (Modal)   → 5s Polling + HistoryChart
```

**Dateien:**

| Pfad | Inhalt |
|---|---|
| `src/types/iobroker.ts` | TypeScript-Interfaces |
| `src/api/iobroker.ts` | REST-API-Client |
| `src/hooks/useStates.ts` | React Query Hooks |
| `src/components/` | UI-Komponenten |
| `nginx.conf` | Nginx-Konfiguration für Docker |
| `Dockerfile` | Multi-Stage Build (Node → Nginx) |

# Projektkennzahlen — ioBroker Object Explorer

## Codebase

| Metrik | Wert |
|---|---|
| Quelldateien (`.ts` / `.tsx`) | 31 |
| Gesamte Codezeilen | ~10 900 |
| Komponenten (`src/components/`) | 20 |
| React-Query-Hooks (`useStates.ts`) | 28 Exporte |
| API-Funktionen (`src/api/iobroker.ts`) | 30 Exporte |
| TypeScript-Interfaces/Types | 6 (in `src/types/iobroker.ts`) |

## Größte Dateien

| Datei | Zeilen |
|---|---|
| `StateList.tsx` | 2 732 |
| `ObjectEditModal.tsx` | 1 218 |
| `App.tsx` | 1 086 |
| `HistoryChart.tsx` | 978 |
| `StateTree.tsx` | 636 |
| `api/iobroker.ts` | 485 |
| `hooks/useStates.ts` | 482 |

## Git-Historie

| Metrik | Wert |
|---|---|
| Commits gesamt | 236 |
| Projektzeitraum | 20. Feb 2026 – 5. März 2026 (~2 Wochen) |
| Beitragender | 1 (darkiop) |
| `feat`-Commits | 98 |
| `fix`-Commits | 58 |
| `refactor`-Commits | 8 |
| `chore`-Commits | 6 |
| Referenzierte FE-Tickets | 18 |

## Abhängigkeiten

**Runtime (5):** `react`, `react-dom`, `recharts`, `lucide-react`, `dompurify`

**Dev (11):** `vite`, `typescript`, `tailwindcss`, `@tanstack/react-query`, `eslint` + Plugins, `postcss`, `autoprefixer`

## API-Abdeckung

30 Funktionen in `src/api/iobroker.ts` decken ab:

- Objekte lesen / schreiben / löschen / umbenennen / importieren
- States lesen / schreiben (Einzel + Batch)
- History abfragen / Einträge löschen (sql.0)
- Enums: Räume & Funktionen lesen/bearbeiten (Einzel + Batch)
- Hilfsfunktionen: Units, Roles, Alias-Reverse-Map, SQL-Instanzen

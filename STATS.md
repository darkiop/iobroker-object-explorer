# Project Metrics — ioBroker Object Explorer

## Codebase

| Metric | Value |
|---|---|
| Source files (`.ts` / `.tsx`) | 40 |
| Lines of code — TypeScript/TSX | ~13 300 |
| Lines of code — all sources (incl. CSS/HTML/JSON) | ~18 000 |
| Components (`src/components/`) | 27 |
| React Query hooks (`useStates.ts`) | 32 exports |
| API functions (`src/api/iobroker.ts`) | 34 exports |
| TypeScript interfaces / types | 6 (in `src/types/iobroker.ts`) |

> Line counts exclude `node_modules/`, `dist/`, and `.git/`.

## Largest Files

| File | Lines |
|---|---|
| `StateList.tsx` | 2 878 |
| `App.tsx` | 1 610 |
| `ObjectEditModal.tsx` | 1 220 |
| `HistoryChart.tsx` | 978 |
| `StateTree.tsx` | 726 |
| `hooks/useStates.ts` | 547 |
| `api/iobroker.ts` | 518 |
| `ImportDatapointsModal.tsx` | 497 |
| `AutoCreateAliasModal.tsx` | 363 |
| `ValueEditModal.tsx` | 349 |

## Git History

| Metric | Value |
|---|---|
| Total commits | 283 |
| Project period | 20 Feb 2026 – 11 Mar 2026 (~3 weeks) |
| Contributors | 1 (darkiop) |
| `feat` commits | 125 |
| `fix` commits | 67 |
| `refactor` commits | 8 |
| `chore` commits | 8 |

## Dependencies

**Runtime (5):** `react`, `react-dom`, `recharts`, `lucide-react`, `dompurify`

**Dev (11):** `vite`, `typescript`, `tailwindcss`, `@tanstack/react-query`, `eslint` + plugins, `postcss`, `autoprefixer`

## API Coverage

34 functions in `src/api/iobroker.ts` cover:

- Read / write / delete / rename / import objects
- Read / write states (single + batch)
- Query history / delete entries (sql.0)
- Enums: read and edit rooms & functions (single + batch)
- Utilities: units, roles, alias reverse map, SQL instances

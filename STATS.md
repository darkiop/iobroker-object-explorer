# Project Metrics — ioBroker Object Explorer

## Codebase

| Metric | Value |
|---|---|
| Source files (`.ts` / `.tsx`) | 69 |
| Lines of code — TypeScript/TSX | ~15 400 |
| Lines of code — all sources (incl. CSS/HTML/JSON) | ~21 300 |
| Components (`src/components/`) | 37 |
| Context providers (`src/context/`) | 6 |
| React Query hooks (`useStates.ts`) | 35 exports |
| API functions (`src/api/iobroker.ts`) | 43 exports |
| TypeScript interfaces / types | 6 (in `src/types/iobroker.ts`) |

> Line counts exclude `node_modules/`, `dist/`, and `.git/`.

## Largest Files

| File | Lines |
|---|---|
| `StateList.tsx` | 1 677 |
| `ObjectEditModal.tsx` | 1 295 |
| `HistoryChart.tsx` | 984 |
| `StateTree.tsx` | 771 |
| `App.tsx` | 657 |
| `api/iobroker.ts` | 601 |
| `hooks/useStates.ts` | 596 |
| `SettingsModal.tsx` | 585 |
| `ImportDatapointsModal.tsx` | 498 |
| `context/FilterContext.tsx` | 399 |

## Git History

| Metric | Value |
|---|---|
| Total commits | 427 |
| Project period | 20 Feb 2026 – 30 May 2026 (~14.5 weeks) |
| Contributors | 1 (darkiop) |
| `feat` commits | 174 |
| `fix` commits | 110 |
| `docs` commits | 18 |
| `refactor` commits | 20 |
| `perf` commits | 13 |
| `chore` commits | 14 |

## Dependencies

**Runtime (9):** `react`, `react-dom`, `@tanstack/react-query`, `@tanstack/react-virtual`, `recharts`, `lucide-react`, `dompurify`, `expr-eval`, `react-error-boundary`

**Dev (14):** `vite`, `typescript`, `tailwindcss`, `eslint` + plugins, `postcss`, `autoprefixer`, `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`

## API Coverage

43 functions in `src/api/iobroker.ts` cover:

- Read / write / delete / rename / move / import objects
- Read / write states (single + batch)
- Query history / delete entries (sql.0)
- Enums: read and edit rooms & functions (single + batch)
- Subtree delete
- Script-used-ID analysis (javascript.0)
- Utilities: units, roles, alias reverse map, SQL instances

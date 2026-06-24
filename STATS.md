# Project Metrics — ioBroker Object Explorer

## Codebase

| Metric | Value |
|---|---|
| Source files (`.ts` / `.tsx`) | 89 (excl. test) / 94 total |
| Lines of code — TypeScript/TSX | ~21 500 |
| Lines of code — all sources (incl. CSS/HTML/JSON) | ~28 000 |
| Components (`src/components/`) | 49 `.tsx` / 53 total |
| Context providers (`src/context/`) | 6 |
| React Query hooks (`useObjectQueries.ts`) | 19 exports |
| API functions (`src/api/iobroker.ts`) | 57 exports |
| TypeScript interfaces / types | 6 (in `src/types/iobroker.ts`) |

> Line counts exclude `node_modules/`, `dist/`, and `.git/`.

## Largest Files

| File | Lines |
|---|---|
| `statelist/StateList.tsx` | 1 532 |
| `modals/SettingsModal.tsx` | 1 214 |
| `App.tsx` | 1 078 |
| `api/iobroker.ts` | 1 074 |
| `history/HistoryChart.tsx` | 962 |
| `StateTree.tsx` | 681 |
| `modals/HelpModal.tsx` | 641 |
| `modals/OptimizeModal.tsx` | 540 |
| `context/FilterContext.tsx` | 516 |
| `modals/ObjectEditModal.tsx` | 501 (Tabs extrahiert nach `tabs/`) |

## Git History

| Metric | Value |
|---|---|
| Total commits | 550 |
| Project period | 20 Feb 2026 – 24 Jun 2026 (~18 weeks) |
| Contributors | 1 (darkiop) |
| `feat` commits | 174 |
| `fix` commits | 110 |
| `docs` commits | 18 |
| `refactor` commits | 20 |
| `perf` commits | 13 |
| `chore` commits | 14 |

## Dependencies

**Runtime (10):** `react`, `react-dom`, `@tanstack/react-query`, `@tanstack/react-virtual`, `recharts`, `lucide-react`, `dompurify`, `expr-eval`, `react-error-boundary`, `socket.io-client`

**Dev (22):** `vite`, `vite-plugin-pwa`, `typescript`, `typescript-eslint`, `tailwindcss`, `eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `@eslint/js`, `globals`, `postcss`, `autoprefixer`, `vitest`, `@vitest/ui`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `@types/react`, `@types/react-dom`, `@types/dompurify`, `@vitejs/plugin-react`

## API Coverage

43 functions in `src/api/iobroker.ts` cover:

- Read / write / delete / rename / move / import objects
- Read / write states (single + batch)
- Query history / delete entries (sql.0)
- Enums: read and edit rooms & functions (single + batch)
- Subtree delete
- Script-used-ID analysis (javascript.0)
- Utilities: units, roles, alias reverse map, SQL instances

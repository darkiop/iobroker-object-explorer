# Project Metrics — ioBroker Object Explorer

## Codebase

| Metric | Value |
|---|---|
| Source files (`.ts` / `.tsx`) | 104 (excl. test) / 124 total |
| Lines of code — TypeScript/TSX | ~25 200 (excl. test) / ~27 100 total |
| Lines of code — all sources (incl. CSS/HTML/config) | ~28 100 |
| Components (`src/components/`) | 59 `.tsx` (excl. test) / 70 files total |
| Context providers (`src/context/`) | 6 |
| React Query hooks (`useObjectQueries.ts`) | 25 exports |
| API functions (`src/api/iobroker.ts`) | 87 exports (77 functions) |
| TypeScript interfaces / types | 6 (in `src/types/iobroker.ts`) |
| Test files | 20 (207 test cases) |

> Line counts exclude `node_modules/`, `dist/`, and `.git/`.

## Largest Files

| File | Lines |
|---|---|
| `api/iobroker.ts` | 1 703 |
| `statelist/StateList.tsx` | 1 542 |
| `modals/SettingsModal.tsx` | 1 242 |
| `App.tsx` | 1 151 |
| `history/HistoryChart.tsx` | 1 017 |
| `modals/DpValuesModal.tsx` | 956 |
| `modals/DbOverviewModal.tsx` | 757 |
| `modals/HelpModal.tsx` | 707 |
| `StateTree.tsx` | 660 |
| `statelist/StateRow.tsx` | 576 |
| `modals/ObjectEditModal.tsx` | 546 (Tabs extrahiert nach `tabs/`) |
| `modals/OptimizeModal.tsx` | 542 |
| `context/FilterContext.tsx` | 525 |
| `Layout.tsx` | 514 |

## Git History

| Metric | Value |
|---|---|
| Total commits | 662 |
| Project period | 20 Feb 2026 – 20 Jul 2026 (~21 weeks) |
| Contributors | 1 (Thorsten Walk / darkiop) |
| `feat` commits | 270 |
| `fix` commits | 168 |
| `refactor` commits | 46 |
| `docs` commits | 41 |
| `perf` commits | 25 |
| `chore` commits | 16 |
| `style` commits | 10 |
| `test` commits | 7 |
| `ci` commits | 1 |

## Dependencies

**Runtime (10):** `react`, `react-dom`, `@tanstack/react-query`, `@tanstack/react-virtual`, `recharts`, `lucide-react`, `dompurify`, `expr-eval`, `react-error-boundary`, `socket.io-client`

**Dev (23):** `vite`, `vite-plugin-pwa`, `typescript`, `typescript-eslint`, `tailwindcss`, `eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `@eslint/js`, `globals`, `postcss`, `autoprefixer`, `vitest`, `@vitest/ui`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/dompurify`, `@vitejs/plugin-react`, `rollup-plugin-visualizer`

## API Coverage

77 functions in `src/api/iobroker.ts` cover:

- Read / write / delete / rename / move / import objects
- Read / write states (single + batch)
- Query history / delete entries (sql.0)
- Enums: read and edit rooms & functions (single + batch)
- Subtree delete
- Script-used-ID analysis (javascript.0)
- Utilities: units, roles, alias reverse map, SQL instances
- **SQL database tooling:** DB stats, datapoint overview (`getDpOverview`), value browsing/editing (`getDpValues`, `updateDpValue`, `insertDpValue`), purge & dedupe, DP rename in DB, orphan value scan & delete (`getOrphanValueRows`, `deleteOrphanValueRows`)

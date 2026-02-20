# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `npm run dev` (Vite HMR, port 5173)
- **Build:** `npm run build` (TypeScript check + Vite bundle)
- **Lint:** `npm run lint`
- **Type check only:** `npx tsc --noEmit`

No test framework is configured.

## Architecture

React + TypeScript dashboard for browsing ioBroker smart home states via REST API. Dark theme, German language UI.

### Stack
React 18, TanStack React Query, Recharts, Tailwind CSS, Vite

### Data Flow
```
SearchBar (pattern input)
  → useFilteredObjects() → cached objects filtered client-side
  → useStateValues(pageIds) → batched fetch, 30s polling
  → StateList (paginated table) + StateTree (hierarchical nav)
  → on select → StateDetail (5s polling) + HistoryChart
```

### Layer Structure
- **`src/types/iobroker.ts`** — All TypeScript interfaces (IoBrokerState, IoBrokerObject, HistoryEntry, TreeNode)
- **`src/api/iobroker.ts`** — REST API client. Objects are cached once globally; states fetched individually or batched. History uses POST to `/api/v1/command/sendTo` via `sql.0` adapter
- **`src/hooks/useStates.ts`** — React Query hooks wrapping each API function with appropriate refetch intervals
- **`src/components/`** — UI components using Tailwind classes

### API Proxy
Vite proxies `/api` to the ioBroker REST API at `http://10.4.0.20:8093` (configured in `vite.config.ts`).

### Key Patterns
- Objects (metadata) are fetched once and cached in-memory for the app lifetime, then filtered client-side by wildcard pattern
- State values are fetched only for the current page (50 items), refreshed every 30s
- Selected state detail refreshes every 5s
- History data uses `staleTime: Infinity` (immutable once fetched)
- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters`

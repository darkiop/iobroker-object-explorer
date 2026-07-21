# Pause Communication Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a header Play/Pause button that stops all live ioBroker communication (object polling, state-value polling, and the Socket.io / long-polling realtime push channels) while paused, and resumes it when unpaused.

**Architecture:** A single ephemeral `paused` boolean lives in `AppContent` (React state, not persisted). Four pure helper functions in `src/utils/commPause.ts` translate `paused` into the effective React Query refetch intervals and transport-enable flags. `App.tsx` feeds those helpers into the existing `useAllObjects`, `useStateValues`, `useSocketIO`, and `useLongPolling` calls. A new Play/Pause button in `Layout.tsx` toggles the flag; while paused the manual-refresh button is disabled, the auto-refresh badge is hidden, and `HostConnectedButton` shows a distinct "Paused" badge instead of the transport status.

**Tech Stack:** React 18, TanStack React Query v5, TypeScript (strict, `noUnusedLocals`/`noUnusedParameters`), Vitest + `@testing-library/react`, Tailwind, lucide-react icons.

**Scope decisions (locked with the user):**
- Pause state is **ephemeral** — resets to running on reload. No `AppSettings` field, no localStorage.
- Pause stops **live traffic only** — object poll, state-value poll, realtime push, and the manual-refresh button. User-initiated writes (setState, object CRUD) stay enabled and are out of scope.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/utils/commPause.ts` | Pure helpers mapping `paused` → effective refetch intervals + transport enable flags. Single source of truth for pause gating. | Create |
| `src/utils/commPause.test.ts` | Unit tests for the helpers. | Create |
| `src/components/Layout.tsx` | Renders the Play/Pause button; disables the refresh button while paused; forwards `paused` to `HostConnectedButton`. | Modify |
| `src/components/HostConnectedButton.tsx` | Shows a "Paused" badge instead of the transport badge; hides the auto-refresh badge while paused. | Modify |
| `src/App.tsx` | Owns the `paused` state + toggle; wires the helpers into the query/transport hooks; passes `paused`/`onTogglePause` to `Layout`. | Modify |

Order of implementation is bottom-up so every intermediate state compiles: helper → HostConnectedButton → Layout → App → verification. All new component props are optional, so `Layout` and `HostConnectedButton` compile before `App` passes the new props.

---

## Task 1: Pure pause-gating helpers

**Files:**
- Create: `src/utils/commPause.ts`
- Test: `src/utils/commPause.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/commPause.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  STATES_POLL_MS,
  pausedObjectsRefetch,
  pausedStatesRefetch,
  pausedRealtimeEnabled,
  pausedLongPollEnabled,
} from './commPause'

describe('pausedObjectsRefetch', () => {
  it('returns false when paused, regardless of base', () => {
    expect(pausedObjectsRefetch(true, 30_000)).toBe(false)
    expect(pausedObjectsRefetch(true, false)).toBe(false)
  })
  it('returns the base interval when not paused', () => {
    expect(pausedObjectsRefetch(false, 30_000)).toBe(30_000)
    expect(pausedObjectsRefetch(false, false)).toBe(false)
  })
})

describe('pausedStatesRefetch', () => {
  it('returns false when paused', () => {
    expect(pausedStatesRefetch(true, false)).toBe(false)
    expect(pausedStatesRefetch(true, true)).toBe(false)
  })
  it('returns false when a realtime channel is connected', () => {
    expect(pausedStatesRefetch(false, true)).toBe(false)
  })
  it('returns the poll interval when running and no realtime channel', () => {
    expect(pausedStatesRefetch(false, false)).toBe(STATES_POLL_MS)
  })
})

describe('pausedRealtimeEnabled', () => {
  it('is false when paused even if socket transport is selected', () => {
    expect(pausedRealtimeEnabled(true, true)).toBe(false)
  })
  it('is true only when running and socket transport is selected', () => {
    expect(pausedRealtimeEnabled(false, true)).toBe(true)
    expect(pausedRealtimeEnabled(false, false)).toBe(false)
  })
})

describe('pausedLongPollEnabled', () => {
  it('is false when paused', () => {
    expect(pausedLongPollEnabled(true, false, false)).toBe(false)
    expect(pausedLongPollEnabled(true, true, true)).toBe(false)
  })
  it('is true when long polling is the chosen transport', () => {
    expect(pausedLongPollEnabled(false, false, false)).toBe(true)
  })
  it('is true when socket transport is selected but has failed', () => {
    expect(pausedLongPollEnabled(false, true, true)).toBe(true)
  })
  it('is false when socket transport is selected and healthy', () => {
    expect(pausedLongPollEnabled(false, true, false)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/commPause.test.ts`
Expected: FAIL — `Failed to resolve import "./commPause"` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/commPause.ts`:

```ts
/**
 * Pure helpers that translate the ephemeral `paused` flag into the effective
 * React Query refetch intervals and realtime-transport enable flags used in
 * App.tsx. Single source of truth so "pause = stop all live traffic" stays
 * consistent across the object poll, the state-value poll, and both push
 * transports.
 */

/** Poll interval (ms) for state values when no realtime push channel is connected. */
export const STATES_POLL_MS = 10_000;

/** Objects auto-refresh is suspended entirely while paused; otherwise the configured base interval. */
export function pausedObjectsRefetch(paused: boolean, base: number | false): number | false {
  return paused ? false : base;
}

/**
 * State-value polling is suspended while paused, and (as before) while a realtime
 * push channel is connected. Otherwise it polls every STATES_POLL_MS.
 */
export function pausedStatesRefetch(paused: boolean, realtimeConnected: boolean): number | false {
  if (paused) return false;
  return realtimeConnected ? false : STATES_POLL_MS;
}

/** Socket.io transport runs only when selected AND not paused. */
export function pausedRealtimeEnabled(paused: boolean, socketTransportSelected: boolean): boolean {
  return !paused && socketTransportSelected;
}

/**
 * Long polling runs when not paused and either long-polling is the chosen
 * transport or socket.io has failed (auto-fallback).
 */
export function pausedLongPollEnabled(
  paused: boolean,
  socketTransportSelected: boolean,
  socketFailed: boolean,
): boolean {
  return !paused && (!socketTransportSelected || socketFailed);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/commPause.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/commPause.ts src/utils/commPause.test.ts
git commit -m "feat: add commPause gating helpers for pause mode"
```

---

## Task 2: "Paused" badge in HostConnectedButton

**Files:**
- Modify: `src/components/HostConnectedButton.tsx`

This component currently renders (a) an auto-refresh badge when `objectsRefreshInterval !== 'off'`, and (b) a realtime transport badge. While paused, the auto-refresh badge is misleading (polling is off), and the transport badge would show "connecting…"/"unreachable" (transports disabled). Replace both with a single "Paused" badge.

- [ ] **Step 1: Add the `Pause` icon import**

In `src/components/HostConnectedButton.tsx`, change the lucide import on line 1 from:

```tsx
import { RefreshCw, AlertCircle, Plug, PlugZap, Zap, Radio } from 'lucide-react';
```

to:

```tsx
import { RefreshCw, AlertCircle, Plug, PlugZap, Zap, Radio, Pause } from 'lucide-react';
```

- [ ] **Step 2: Add the `paused` prop to the interface**

In the `Props` interface, add a `paused` field. Replace:

```tsx
interface Props {
  apiConnected: boolean;
  realtimeTransport?: 'longpolling' | 'socketio';
  realtimeStatus?: { supported: boolean | null; connected: boolean };
  /** true when socket.io was selected but unreachable and we auto-fell back to long polling */
  realtimeFallback?: boolean;
  lastUpdated?: number;
}
```

with:

```tsx
interface Props {
  apiConnected: boolean;
  realtimeTransport?: 'longpolling' | 'socketio';
  realtimeStatus?: { supported: boolean | null; connected: boolean };
  /** true when socket.io was selected but unreachable and we auto-fell back to long polling */
  realtimeFallback?: boolean;
  /** true when live communication is paused — replaces the auto-refresh + transport badges */
  paused?: boolean;
  lastUpdated?: number;
}
```

- [ ] **Step 3: Destructure `paused` in the signature**

Replace:

```tsx
export default function HostConnectedButton({ apiConnected, realtimeTransport, realtimeStatus, realtimeFallback = false, lastUpdated }: Props) {
```

with:

```tsx
export default function HostConnectedButton({ apiConnected, realtimeTransport, realtimeStatus, realtimeFallback = false, paused = false, lastUpdated }: Props) {
```

- [ ] **Step 4: Hide the auto-refresh badge while paused**

Replace the opening condition of the auto-refresh badge:

```tsx
      {objectsRefreshInterval && objectsRefreshInterval !== 'off' && (
```

with:

```tsx
      {!paused && objectsRefreshInterval && objectsRefreshInterval !== 'off' && (
```

- [ ] **Step 5: Show the "Paused" badge instead of the transport badge**

Replace the realtime transport badge condition:

```tsx
      {realtimeTransport && realtimeStatus && (() => {
```

with:

```tsx
      {paused ? (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
          title={language === 'en' ? 'Communication paused' : 'Kommunikation pausiert'}
        >
          <Pause size={10} />
          {language === 'en' ? 'Paused' : 'Pausiert'}
        </span>
      ) : realtimeTransport && realtimeStatus && (() => {
```

Note: the existing block ends with `})()}`. Since we changed `{realtimeTransport && realtimeStatus && (() => {` into `{paused ? (...) : realtimeTransport && realtimeStatus && (() => {`, the trailing `})()}` still closes the arrow-function IIFE and the JSX expression correctly — the ternary's false branch is the whole `realtimeTransport && realtimeStatus && (() => {...})()` expression. No change is needed at the closing `})()}`.

- [ ] **Step 6: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: PASS — no errors (the `paused` prop is optional; existing callers are unaffected).

- [ ] **Step 7: Commit**

```bash
git add src/components/HostConnectedButton.tsx
git commit -m "feat: add paused badge to HostConnectedButton"
```

---

## Task 3: Play/Pause button in Layout + disable refresh while paused

**Files:**
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Add `Play` and `Pause` icon imports**

In `src/components/Layout.tsx`, the lucide import is on line 3 and currently lists many icons ending with `Download`. Add `Play` and `Pause` to that list. Change:

```tsx
import { Sun, Moon, Eclipse, Flower2, PanelLeftClose, PanelLeftOpen, Settings, CircleHelp, Maximize, Minimize, RefreshCw, ExternalLink, Info, WifiOff, FilterX, Columns2, ArrowLeft, ArrowRight, Server, ChevronDown, Check, Download } from 'lucide-react';
```

to:

```tsx
import { Sun, Moon, Eclipse, Flower2, PanelLeftClose, PanelLeftOpen, Settings, CircleHelp, Maximize, Minimize, RefreshCw, ExternalLink, Info, WifiOff, FilterX, Columns2, ArrowLeft, ArrowRight, Server, ChevronDown, Check, Download, Play, Pause } from 'lucide-react';
```

- [ ] **Step 2: Add `paused` and `onTogglePause` to `LayoutProps`**

In the `LayoutProps` interface (starts at line 16), add two optional props. Insert them right after the existing `onManualRefresh?: () => void;` line:

```tsx
  onManualRefresh?: () => void;
  /** true when live communication is paused */
  paused?: boolean;
  /** toggles the paused flag */
  onTogglePause?: () => void;
```

- [ ] **Step 3: Destructure the new props in the function signature**

The `Layout` function signature (line 35) destructures props. Add `paused = false` and `onTogglePause` next to `onManualRefresh`. Replace:

```tsx
export default function Layout({ sidebar, children, apiConnected = true, realtimeTransport, realtimeStatus, realtimeFallback = false, browserOffline = false, lastUpdated, onManualRefresh, onConfirmScriptRefresh, headerExtra, onExtraReset, onFocusSearch }: LayoutProps) {
```

with:

```tsx
export default function Layout({ sidebar, children, apiConnected = true, realtimeTransport, realtimeStatus, realtimeFallback = false, browserOffline = false, lastUpdated, onManualRefresh, paused = false, onTogglePause, onConfirmScriptRefresh, headerExtra, onExtraReset, onFocusSearch }: LayoutProps) {
```

- [ ] **Step 4: Forward `paused` to `HostConnectedButton`**

The `<HostConnectedButton .../>` block is around line 295. Add the `paused` prop. Replace:

```tsx
          <HostConnectedButton
            apiConnected={apiConnected}
            realtimeTransport={realtimeTransport}
            realtimeStatus={realtimeStatus}
            realtimeFallback={realtimeFallback}
            lastUpdated={lastUpdated}
          />
```

with:

```tsx
          <HostConnectedButton
            apiConnected={apiConnected}
            realtimeTransport={realtimeTransport}
            realtimeStatus={realtimeStatus}
            realtimeFallback={realtimeFallback}
            paused={paused}
            lastUpdated={lastUpdated}
          />
```

- [ ] **Step 5: Render the Play/Pause button and disable refresh while paused**

The manual-refresh button block is around line 308. Replace:

```tsx
          {onManualRefresh && (
            <button
              onClick={onManualRefresh}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
              title={language === 'en' ? 'Refresh' : 'Aktualisieren'}
              aria-label={language === 'en' ? 'Refresh' : 'Aktualisieren'}
            >
              <RefreshCw size={16} />
            </button>
          )}
```

with:

```tsx
          {onTogglePause && (
            <button
              onClick={onTogglePause}
              className={`p-1.5 rounded-lg transition-colors ${paused ? 'text-amber-600 bg-amber-500/15 hover:bg-amber-500/25 dark:text-amber-400 dark:bg-amber-500/20 dark:hover:bg-amber-500/30' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700'}`}
              title={paused ? (language === 'en' ? 'Resume communication' : 'Kommunikation fortsetzen') : (language === 'en' ? 'Pause communication' : 'Kommunikation pausieren')}
              aria-label={paused ? (language === 'en' ? 'Resume communication' : 'Kommunikation fortsetzen') : (language === 'en' ? 'Pause communication' : 'Kommunikation pausieren')}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
          )}
          {onManualRefresh && (
            <button
              onClick={onManualRefresh}
              disabled={paused}
              className={`p-1.5 rounded-lg transition-colors ${paused ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700'}`}
              title={paused ? (language === 'en' ? 'Paused — resume to refresh' : 'Pausiert — zum Aktualisieren fortsetzen') : (language === 'en' ? 'Refresh' : 'Aktualisieren')}
              aria-label={language === 'en' ? 'Refresh' : 'Aktualisieren'}
            >
              <RefreshCw size={16} />
            </button>
          )}
```

- [ ] **Step 6: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: PASS — `paused`/`onTogglePause` are optional, so `App.tsx` (not yet passing them) still compiles.

- [ ] **Step 7: Commit**

```bash
git add src/components/Layout.tsx
git commit -m "feat: add play/pause button to Layout header"
```

---

## Task 4: Wire pause gating into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import the pause helpers**

Near the other hook/util imports (the `useSocketIO` import is on line 27), add an import for the helpers. After:

```tsx
import { useSocketIO } from './hooks/useSocketIO';
```

add:

```tsx
import { pausedObjectsRefetch, pausedStatesRefetch, pausedRealtimeEnabled, pausedLongPollEnabled } from './utils/commPause';
```

- [ ] **Step 2: Add the ephemeral `paused` state and toggle**

The realtime transport wiring is around lines 419–425. Immediately **before** the line `const useSocketTransport = appSettings.realtimeTransport === 'socketio';`, add:

```tsx
  // Ephemeral pause mode — stops all live communication (object poll, state-value
  // poll, and both realtime push transports). Not persisted: resets to running on reload.
  const [paused, setPaused] = useState(false);
  const togglePause = useCallback(() => setPaused((p) => !p), []);
```

(`useState`, `useCallback` are already imported at the top of `App.tsx`.)

- [ ] **Step 3: Gate the realtime transports through the helpers**

Replace the transport block (currently lines 419–425):

```tsx
  const useSocketTransport = appSettings.realtimeTransport === 'socketio';
  const sioStatus = useSocketIO(pageIds, useSocketTransport, appSettings.socketHost);
  const sioFailed = useSocketTransport && sioStatus.supported === false;
  const lpEnabled = !useSocketTransport || sioFailed;
  const lpStatusRaw = useLongPolling(lpEnabled ? pageIds : []);
  const lpStatus = useSocketTransport && !sioFailed ? sioStatus : lpStatusRaw;
  lpConnectedRef.current = lpStatus.connected;
```

with:

```tsx
  const useSocketTransport = appSettings.realtimeTransport === 'socketio';
  const socketEnabled = pausedRealtimeEnabled(paused, useSocketTransport);
  const sioStatus = useSocketIO(pageIds, socketEnabled, appSettings.socketHost);
  const sioFailed = socketEnabled && sioStatus.supported === false;
  const lpEnabled = pausedLongPollEnabled(paused, useSocketTransport, sioFailed);
  const lpStatusRaw = useLongPolling(lpEnabled ? pageIds : []);
  const lpStatus = socketEnabled && !sioFailed ? sioStatus : lpStatusRaw;
  lpConnectedRef.current = lpStatus.connected;
```

Rationale: when `paused`, `socketEnabled` is `false`, so `useSocketIO` disconnects and reports `{ supported: null, connected: false }`; `sioFailed` is `false`; `lpEnabled` is `false`, so `useLongPolling([])` disconnects; `lpStatus` resolves to the disconnected `lpStatusRaw`. All push channels are down.

- [ ] **Step 4: Gate the state-value poll through the helper**

Replace the `useStateValues` call (currently lines 427–430):

```tsx
  const { data: stateValues, refetch: refetchStateValues, dataUpdatedAt: statesUpdatedAt } = useStateValues(
    valueIds,
    lpStatus.connected ? false : 10_000,
  );
```

with:

```tsx
  const { data: stateValues, refetch: refetchStateValues, dataUpdatedAt: statesUpdatedAt } = useStateValues(
    valueIds,
    pausedStatesRefetch(paused, lpStatus.connected),
  );
```

- [ ] **Step 5: Gate the objects auto-refresh through the helper**

Replace the `useAllObjects` call (currently line 255):

```tsx
  const { data: allObjectsData, refetch: refetchAllObjects } = useAllObjects(objectsRefetchMs);
```

with:

```tsx
  const { data: allObjectsData, refetch: refetchAllObjects } = useAllObjects(pausedObjectsRefetch(paused, objectsRefetchMs));
```

- [ ] **Step 6: Gate the panel-2 state-value poll through the helper**

Replace the panel-2 `useStateValues` call (currently line 466):

```tsx
  const { data: p2StateValues } = useStateValues(p2PageIds, lpStatus.connected ? false : 10_000);
```

with:

```tsx
  const { data: p2StateValues } = useStateValues(p2PageIds, pausedStatesRefetch(paused, lpStatus.connected));
```

- [ ] **Step 7: Pass `paused` and `onTogglePause` to `Layout`**

The `<Layout ...>` opening tag has `onManualRefresh={handleManualRefresh}` on line 559. Add the two new props right after it. Replace:

```tsx
      onManualRefresh={handleManualRefresh}
```

with:

```tsx
      onManualRefresh={handleManualRefresh}
      paused={paused}
      onTogglePause={togglePause}
```

- [ ] **Step 8: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: PASS — no errors.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire pause mode into query and transport hooks"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the unit tests**

Run: `npm test`
Expected: PASS — the whole suite is green, including `src/utils/commPause.test.ts`.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: PASS — no new errors/warnings.

- [ ] **Step 3: Type-check + production build**

Run: `npm run build`
Expected: PASS — TypeScript check clean and Vite bundle succeeds.

- [ ] **Step 4: Manual smoke test in the dev server**

Run: `npm run dev`, open http://localhost:5173, then verify:

1. A **Pause** icon (⏸) appears in the header, left of the refresh icon.
2. In the browser **Network** tab, confirm periodic traffic while running — recurring `/polling` (long-polling) or a live Socket.io connection, plus `getStatesBatch` requests when a poll interval is active.
3. Click the Pause button. Expected:
   - The icon flips to **Play** (▶) and turns amber.
   - The refresh icon is greyed out / not clickable.
   - The header badge shows **"Paused" / "Pausiert"** (amber) instead of the Socket.io/Long-Polling badge; the amber auto-refresh badge (if `objectsRefreshInterval !== 'off'`) is hidden.
   - In the Network tab, the `/polling` long-poll requests / Socket.io frames stop and no new `getStatesBatch` polls fire. State values in the table freeze.
4. Click the Play button. Expected: communication resumes — the transport badge returns, the refresh button re-enables, and Network traffic + live value updates resume.
5. Reload the page while paused. Expected: the app comes back **running** (pause is ephemeral, not persisted).

- [ ] **Step 5: Commit any final touch-ups (if the smoke test surfaced fixes)**

```bash
git add -A
git commit -m "fix: pause mode smoke-test adjustments"
```

If the smoke test passed with no changes, skip this step.

---

## Self-Review

**1. Spec coverage**
- "Button für Play/Pause" → Task 3 (Layout header button, icon flips Play↔Pause).
- "Pause bedeutet Kommunikationsstop" → Task 4 gates all three live channels (object poll via `pausedObjectsRefetch`, state-value poll via `pausedStatesRefetch` incl. panel 2, realtime push via `pausedRealtimeEnabled`/`pausedLongPollEnabled`) plus disables manual refresh (Task 3) — verified in Task 5 Network-tab check.
- Ephemeral (locked decision) → `useState` in `AppContent`, no persistence; verified by the reload check in Task 5 Step 4.5.
- Live-traffic-only (locked decision) → mutations untouched; only intervals + transports + refresh button gated.

**2. Placeholder scan** — no TBD/TODO/"handle edge cases"/"similar to" placeholders; every code step shows complete code and every command lists expected output.

**3. Type consistency** — helper names are identical across Task 1 (definition), Task 4 (call sites), and the self-review: `pausedObjectsRefetch`, `pausedStatesRefetch`, `pausedRealtimeEnabled`, `pausedLongPollEnabled`, constant `STATES_POLL_MS`. Prop names `paused` / `onTogglePause` are consistent across `LayoutProps` (Task 3), the `Layout` call in `App.tsx` (Task 4), and the `Props.paused` forward into `HostConnectedButton` (Task 2/3). `pausedStatesRefetch` returns `STATES_POLL_MS` (10 000), matching the `10_000` literal it replaces at both `useStateValues` call sites.

# F-12: Replace `pattern=*` States Fallback with Namespace Patterns

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the `getStatesViaCommand` fallback in `src/api/iobroker.ts` from requesting the entire ioBroker states DB (`pattern=*`) when the bulk-by-id endpoint isn't supported. Instead, derive minimal per-namespace patterns from the requested IDs (reusing the existing `derivePatterns()` logic already used by the long-polling/socket.io transports) and fetch only those namespaces.

**Architecture:** Extract `derivePatterns()` (currently defined in `src/hooks/useLongPolling.ts:36-55`) into a new pure utility `src/utils/idPatterns.ts` so it can be imported from `src/api/iobroker.ts` without creating a hook→api→hook circular import. Rewrite `getStatesViaCommand(ids)` to issue one `command/getStates?pattern=<ns>.*` request per derived namespace (parallelized via `Promise.all`, same shape as the existing `getStateObjectsForNamespaces` helper at `iobroker.ts:309-312`), merge the results, then filter to the requested `ids` exactly as before.

**Tech Stack:** TypeScript, Vitest, existing `fetch`-based API client in `src/api/iobroker.ts`.

---

## Context

`findings.md` (F-12, HIGH/Performance) flags that `getStatesViaCommand` (`src/api/iobroker.ts:553-574`) falls back to `GET /command/getStates?pattern=*` — which transfers the **entire** states database — whenever the adapter doesn't support the bulk-by-id endpoint (`/state/id1,id2,...`). On large installations (50k+ states) this is a multi-MB response that blocks the main thread during JSON parsing and spikes memory, exactly the scenario `includeIdPrefixes` was built to avoid elsewhere in the app.

The fix reuses a pattern that already exists twice in the codebase:
- `derivePatterns(ids)` in `src/hooks/useLongPolling.ts:36-55` already turns a list of visible IDs into minimal `adapter.instance.*` patterns (e.g. `hm-rpc.0.foo.bar` → `hm-rpc.0.*`), deduped and sorted. It's already reused by `useSocketIO.ts:123`.
- `getStateObjectsForNamespaces` in `iobroker.ts:309-312` already shows the `Promise.all(namespaces.map(fetch...)).then(Object.assign)` merge pattern for namespace-scoped requests.

`getStatesBatch(ids)` (`iobroker.ts:576-629`, the only caller of `getStatesViaCommand`) already has the exact `ids` array in scope, so no new data plumbing (e.g. `allObjects`) is needed — `derivePatterns(ids)` slots in directly.

## Files

- **Create:** `src/utils/idPatterns.ts` — moved `derivePatterns()` (pure function, no new deps)
- **Create:** `src/utils/idPatterns.test.ts` — unit tests for the extracted function
- **Modify:** `src/hooks/useLongPolling.ts` — remove local `derivePatterns`, import from `src/utils/idPatterns.ts`
- **Modify:** `src/hooks/useSocketIO.ts:6` — import `derivePatterns` from `../utils/idPatterns` instead of `./useLongPolling`
- **Modify:** `src/api/iobroker.ts` — rewrite `getStatesViaCommand` to fetch per-namespace instead of `pattern=*`
- **Modify:** `src/api/iobroker.test.ts` — add coverage for the new per-namespace fallback behavior

## Task 1: Extract `derivePatterns` into a shared utility

**Files:**
- Create: `src/utils/idPatterns.ts`
- Create: `src/utils/idPatterns.test.ts`
- Modify: `src/hooks/useLongPolling.ts:31-55`
- Modify: `src/hooks/useSocketIO.ts:6`

- [ ] **Step 1: Write the failing test**

Create `src/utils/idPatterns.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { derivePatterns } from './idPatterns';

describe('derivePatterns', () => {
  it('returns empty array for empty input', () => {
    expect(derivePatterns([])).toEqual([]);
  });

  it('keeps a bare adapter name with no dots as-is', () => {
    expect(derivePatterns(['adaptername'])).toEqual(['adaptername']);
  });

  it('turns adapter.instance into adapter.instance.*', () => {
    expect(derivePatterns(['hm-rpc.0'])).toEqual(['hm-rpc.0.*']);
  });

  it('collapses deep IDs to the adapter.instance.* subtree', () => {
    expect(derivePatterns(['hm-rpc.0.MEQ123.1.STATE'])).toEqual(['hm-rpc.0.*']);
  });

  it('dedupes multiple IDs from the same namespace', () => {
    expect(derivePatterns(['hm-rpc.0.a.b', 'hm-rpc.0.c.d'])).toEqual(['hm-rpc.0.*']);
  });

  it('returns one pattern per distinct namespace, sorted', () => {
    expect(derivePatterns(['javascript.0.foo', 'hm-rpc.0.bar', 'alias.0.baz'])).toEqual([
      'alias.0.*',
      'hm-rpc.0.*',
      'javascript.0.*',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/idPatterns.test.ts`
Expected: FAIL — `Cannot find module './idPatterns'` (file doesn't exist yet)

- [ ] **Step 3: Create the utility**

Create `src/utils/idPatterns.ts`:

```ts
/**
 * Derive minimal namespace patterns from a list of visible IDs.
 * Uses adapter.instance level: "hm-rpc.0.MEQ123.1.STATE" → "hm-rpc.0.*"
 * Falls back to full id if only 1-2 segments.
 */
export function derivePatterns(ids: string[]): string[] {
  if (ids.length === 0) return [];
  const prefixes = new Set<string>();
  for (const id of ids) {
    const dot1 = id.indexOf('.');
    if (dot1 === -1) {
      prefixes.add(id);
      continue;
    }
    const dot2 = id.indexOf('.', dot1 + 1);
    if (dot2 === -1) {
      // Only adapter.instance — subscribe that subtree
      prefixes.add(`${id}.*`);
    } else {
      // adapter.instance.* covers the device/channel/state subtree
      prefixes.add(`${id.slice(0, dot2)}.*`);
    }
  }
  return [...prefixes].sort();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/idPatterns.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Point `useLongPolling.ts` at the shared utility**

In `src/hooks/useLongPolling.ts`, remove lines 31-55 (the JSDoc comment + `export function derivePatterns...` block) and add an import instead. The top of the file becomes:

```ts
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { IoBrokerState } from '../types/iobroker';
import { getBaseUrl } from '../api/iobroker';
import { queryKeys } from './queryKeys';
import { derivePatterns } from '../utils/idPatterns';
```

Delete the now-duplicated local definition (lines 31-55 in the original file) entirely — the import above supplies `derivePatterns` for the rest of the file (used at the original line 62).

- [ ] **Step 6: Point `useSocketIO.ts` at the shared utility**

In `src/hooks/useSocketIO.ts:6`, change:

```ts
import { derivePatterns } from './useLongPolling';
```

to:

```ts
import { derivePatterns } from '../utils/idPatterns';
```

- [ ] **Step 7: Run full test suite + typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS, no type errors, no broken imports

- [ ] **Step 8: Commit**

```bash
git add src/utils/idPatterns.ts src/utils/idPatterns.test.ts src/hooks/useLongPolling.ts src/hooks/useSocketIO.ts
git commit -m "refactor: extract derivePatterns into shared utils/idPatterns"
```

## Task 2: Make `getStatesViaCommand` fetch per-namespace instead of `pattern=*`

**Files:**
- Modify: `src/api/iobroker.ts:553-574` (`getStatesViaCommand`)
- Modify: `src/api/iobroker.test.ts` (new `describe` block)

- [ ] **Step 1: Write the failing test**

Add to `src/api/iobroker.test.ts` (new imports at top of file if not already present: `vi`, `beforeEach`, `afterEach` from `vitest`; check existing imports first and merge rather than duplicate). Add this new `describe` block at the end of the file:

```ts
describe('getStatesBatch fallback to per-namespace patterns', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.resetModules();
  });

  it('requests one command/getStates call per derived namespace, not pattern=*', async () => {
    const requestedUrls: string[] = [];

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);

      // Bulk-by-id endpoint: simulate "unsupported" (404) so the code falls
      // through to the command-based fallback under test.
      if (url.includes('/state/')) {
        return { ok: false, status: 404, statusText: 'Not Found' } as Response;
      }

      // Command-based fallback: return namespace-scoped fake states.
      if (url.includes('/command/getStates')) {
        const patternMatch = url.match(/pattern=([^&]+)/);
        const pattern = decodeURIComponent(patternMatch?.[1] ?? '');
        if (pattern === 'hm-rpc.0.*') {
          return {
            ok: true,
            json: async () => ({ result: { 'hm-rpc.0.foo': { val: 1, ack: true, ts: 0, lc: 0, from: 'x' } } }),
          } as Response;
        }
        if (pattern === 'javascript.0.*') {
          return {
            ok: true,
            json: async () => ({ result: { 'javascript.0.bar': { val: 2, ack: true, ts: 0, lc: 0, from: 'x' } } }),
          } as Response;
        }
        return { ok: true, json: async () => ({ result: {} }) } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    // Reset module-level support-detection flags by re-importing fresh.
    vi.resetModules();
    const { getStatesBatch } = await import('./iobroker');

    const result = await getStatesBatch(['hm-rpc.0.foo', 'javascript.0.bar']);

    expect(result).toEqual({
      'hm-rpc.0.foo': { val: 1, ack: true, ts: 0, lc: 0, from: 'x' },
      'javascript.0.bar': { val: 2, ack: true, ts: 0, lc: 0, from: 'x' },
    });

    const commandUrls = requestedUrls.filter((u) => u.includes('/command/getStates'));
    expect(commandUrls.length).toBe(2);
    expect(commandUrls.some((u) => u.includes('pattern=*') && !u.includes('pattern=%2A'))).toBe(false);
    expect(commandUrls.some((u) => u.includes(encodeURIComponent('hm-rpc.0.*')))).toBe(true);
    expect(commandUrls.some((u) => u.includes(encodeURIComponent('javascript.0.*')))).toBe(true);
  });
});
```

Note: `getBaseUrl()` must resolve to a stable base for the mocked URLs to match — check `src/api/iobroker.ts` top of file for how `getBaseUrl()` behaves with no connection configured (it should return a default like `/api/v1` or similar via `getConnections()`/localStorage default). If the test fails due to an unrelated `getBaseUrl()` dependency (e.g. it throws without a configured connection), read `getBaseUrl()`'s implementation and set up the minimal localStorage state the existing tests in this file already use (check `beforeEach` blocks earlier in `iobroker.test.ts` for a pattern to copy).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/iobroker.test.ts -t "per-namespace patterns"`
Expected: FAIL — either because `pattern=*` is still being requested (current behavior) or because the mock never sees a per-namespace pattern call

- [ ] **Step 3: Rewrite `getStatesViaCommand`**

In `src/api/iobroker.ts`, add the import (near the top, alongside other relative imports):

```ts
import { derivePatterns } from '../utils/idPatterns';
```

Replace `getStatesViaCommand` (lines 553-574) with:

```ts
async function fetchStatesForPattern(pattern: string): Promise<Record<string, IoBrokerState> | null> {
  const url = `${getBaseUrl()}/command/getStates?pattern=${encodeURIComponent(pattern)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const envelope: unknown = await res.json();
  if (typeof envelope !== 'object' || envelope === null) return null;
  const data = (envelope as { result?: unknown }).result;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  return data as Record<string, IoBrokerState>;
}

async function getStatesViaCommand(ids: string[]): Promise<Record<string, IoBrokerState> | null> {
  if (_commandStatesSupported === false) return null;
  try {
    const patterns = derivePatterns(ids);
    const perPattern = await Promise.all(patterns.map(fetchStatesForPattern));
    if (perPattern.some((r) => r === null)) {
      _commandStatesSupported = false;
      return null;
    }
    _commandStatesSupported = true;
    const all = Object.assign({}, ...perPattern) as Record<string, IoBrokerState>;
    const result: Record<string, IoBrokerState> = {};
    for (const id of ids) {
      if (id in all) result[id] = all[id];
    }
    return result;
  } catch {
    _commandStatesSupported = false;
    return null;
  }
}
```

Also update the comment above the call site in `getStatesBatch` (originally at lines 604-606) to reflect the new behavior:

```ts
  // Bulk endpoint unsupported by this adapter version: fetch per-namespace
  // patterns derived from the requested IDs (adapter.instance.* subtrees)
  // instead of the whole DB, then filter to the requested IDs.
  const commandResult = await getStatesViaCommand(ids);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/iobroker.test.ts -t "per-namespace patterns"`
Expected: PASS

- [ ] **Step 5: Run full test suite + typecheck + lint**

Run: `npx tsc --noEmit && npx vitest run && npm run lint`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/api/iobroker.ts src/api/iobroker.test.ts
git commit -m "fix: replace pattern=* states fallback with per-namespace patterns (F-12)"
```

## Verification

1. `npx tsc --noEmit` — no type errors.
2. `npx vitest run` — full suite green, including the two new test files/blocks.
3. `npm run lint` — clean.
4. Manual check against a real (or mocked) ioBroker instance without the bulk-by-id endpoint: open DevTools Network tab, trigger a state fetch, confirm requests go to `/command/getStates?pattern=<adapter>.<instance>.*` (one per visible namespace) instead of a single `/command/getStates?pattern=*`.
5. Re-read `findings.md` F-12 row and update its `Status` column from `OPEN` to `FIXED` (or equivalent) once verified — confirm with the user whether they want `findings.md` updated as part of this change or tracked separately.

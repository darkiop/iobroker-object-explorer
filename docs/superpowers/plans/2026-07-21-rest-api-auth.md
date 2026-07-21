# REST API Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the app talk to an ioBroker `rest-api` instance that has `auth: true`, using HTTP Basic Auth or a Bearer token stored per saved connection, and surface a 401/403 as a persistent toast that opens Settings.

**Architecture:** Credentials live on the existing `SavedConnection` records in `localStorage['iob-connections']` — auth is a property of *which host you are talking to*, not a global app setting. Connection storage moves out of the 1703-line `src/api/iobroker.ts` into a new `src/api/connections.ts` so a new `src/api/auth.ts` can read it without an import cycle. `auth.ts` exports `authFetch()`, a thin `fetch` wrapper that injects the `Authorization` header and publishes 401/403 to a throttled listener bus. Every existing raw `fetch()` against the ioBroker API is switched to `authFetch()`. A small `useAuthErrorToast()` hook subscribes to the bus and shows a persistent toast whose action button calls the existing `openSettings()`.

**Tech Stack:** React 18, TypeScript (strict, `noUnusedLocals`/`noUnusedParameters`), Vitest + @testing-library/react + jsdom, TanStack React Query v5.

---

## Security Notes (read before starting — these belong in the shipped UI text)

The probed target instance runs `rest-api` v4.0.2 with `secure: false`, i.e. plain HTTP.

1. **Credentials travel in cleartext.** Basic Auth over HTTP is base64, not encryption. Anything on the same network segment can read the username and password. The Settings UI must say this (Task 8 includes the exact string).
2. **Credentials are stored unencrypted.** `localStorage` is plaintext on disk and readable by any script running on the page. There is no secure alternative available to a pure browser SPA — do not add fake obfuscation (base64/XOR "encryption") that implies safety it does not provide.
3. **The socketio adapter accepts no credentials.** If socketio auth is enabled, realtime push cannot work from this app and the user must switch to long polling. Task 9 adds that warning to the connection editor.

Do not weaken these warnings while implementing.

---

## File Structure

| File | Responsibility |
|---|---|
| Create: `src/api/connections.ts` | `SavedConnection` type, localStorage keys, connection CRUD. Moved out of `iobroker.ts`. |
| Create: `src/api/connections.test.ts` | Round-trip tests for connection storage incl. new auth fields. |
| Create: `src/api/auth.ts` | `buildAuthHeader`, `authFetch`, throttled auth-error bus. |
| Create: `src/api/auth.test.ts` | Tests for header building, throttle, `authFetch` behavior. |
| Create: `src/hooks/useAuthErrorToast.ts` | Subscribes to the auth-error bus, shows toast with "Open settings" action. |
| Modify: `src/api/iobroker.ts` | Import from `connections.ts`; swap all `fetch(` → `authFetch(`. |
| Modify: `src/hooks/useLongPolling.ts:66,85,163` | Swap `fetch` → `authFetch`. |
| Modify: `src/hooks/useApiConnectivity.ts:15` | Swap `fetch` → `authFetch`. |
| Modify: `src/components/Layout.tsx:4-5` | Import connection helpers from `connections.ts`. |
| Modify: `src/components/modals/SettingsModal.tsx` | Auth fields in the per-connection editor; auth-aware host test; socketio warning. |
| Modify: `src/App.tsx` | Call `useAuthErrorToast()`. |
| Modify: `docs/api.md`, `README.md`, `src/components/modals/HelpModal.tsx` | Document the feature. |

---

### Task 1: Extract connection storage into `src/api/connections.ts`

Pure move + the new auth fields on the type. No behavior change. This exists so `auth.ts` can read the active connection without importing `iobroker.ts` (which will import `auth.ts` — a cycle).

**Files:**
- Create: `src/api/connections.ts`
- Modify: `src/api/iobroker.ts:1-63`
- Modify: `src/components/Layout.tsx:4-5`
- Modify: `src/components/modals/SettingsModal.tsx:11-12`
- Test: `src/api/connections.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/api/connections.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getConnections, setConnections, getActiveConnectionId, getActiveConnection } from './connections';
import type { SavedConnection } from './connections';

describe('connection storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an empty list when nothing is stored', () => {
    expect(getConnections()).toEqual([]);
  });

  it('round-trips connections including auth fields', () => {
    const conn: SavedConnection = {
      id: 'c1',
      name: 'Main',
      host: '10.4.0.20:8093',
      authMode: 'basic',
      authUser: 'admin',
      authPass: 'secret',
    };
    setConnections([conn]);
    expect(getConnections()).toEqual([conn]);
  });

  it('migrates a legacy ioBrokerHost entry into a default connection', () => {
    localStorage.setItem('ioBrokerHost', '10.4.0.20:8093');
    const list = getConnections();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Default');
    expect(list[0].host).toBe('10.4.0.20:8093');
  });

  it('getActiveConnection resolves the id stored under iob-active-connection-id', () => {
    const a: SavedConnection = { id: 'a', name: 'A', host: 'h1:8093' };
    const b: SavedConnection = { id: 'b', name: 'B', host: 'h2:8093', authMode: 'bearer', authToken: 'tok' };
    setConnections([a, b]);
    localStorage.setItem('iob-active-connection-id', 'b');
    expect(getActiveConnectionId()).toBe('b');
    expect(getActiveConnection()).toEqual(b);
  });

  it('getActiveConnection returns null when the active id does not exist', () => {
    setConnections([{ id: 'a', name: 'A', host: 'h1:8093' }]);
    localStorage.setItem('iob-active-connection-id', 'gone');
    expect(getActiveConnection()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/connections.test.ts`
Expected: FAIL — `Failed to resolve import "./connections"`.

- [ ] **Step 3: Create `src/api/connections.ts`**

```ts
export const LS_HOST_KEY = 'ioBrokerHost';
export const LS_CONNECTIONS_KEY = 'iob-connections';
export const LS_ACTIVE_CONNECTION_ID = 'iob-active-connection-id';

export type AuthMode = 'none' | 'basic' | 'bearer';

export interface SavedConnection {
  id: string;
  name: string;
  host: string;
  socketHost?: string;
  realtimeTransport?: 'longpolling' | 'socketio';
  adminPort?: number;
  /** Auth mechanism for the rest-api adapter. Undefined is treated as 'none'. */
  authMode?: AuthMode;
  /** Basic auth user. Stored in plaintext localStorage — see docs/api.md. */
  authUser?: string;
  /** Basic auth password. Stored in plaintext localStorage — see docs/api.md. */
  authPass?: string;
  /** Bearer token. Stored in plaintext localStorage — see docs/api.md. */
  authToken?: string;
}

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function getConnections(): SavedConnection[] {
  try {
    const raw = localStorage.getItem(LS_CONNECTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedConnection[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  // Migrate existing host to default connection
  const host = localStorage.getItem(LS_HOST_KEY) ?? window.__CONFIG__?.ioBrokerHost ?? '';
  if (host) {
    const conn: SavedConnection = { id: genId(), name: 'Default', host };
    try { localStorage.setItem(LS_CONNECTIONS_KEY, JSON.stringify([conn])); } catch { /* ignore */ }
    try { localStorage.setItem(LS_ACTIVE_CONNECTION_ID, conn.id); } catch { /* ignore */ }
    return [conn];
  }
  return [];
}

export function setConnections(connections: SavedConnection[]): void {
  try { localStorage.setItem(LS_CONNECTIONS_KEY, JSON.stringify(connections)); } catch { /* ignore */ }
}

export function getActiveConnectionId(): string | null {
  return localStorage.getItem(LS_ACTIVE_CONNECTION_ID);
}

export function getActiveConnection(): SavedConnection | null {
  const id = getActiveConnectionId();
  if (!id) return null;
  return getConnections().find((c) => c.id === id) ?? null;
}
```

- [ ] **Step 4: Remove the moved code from `src/api/iobroker.ts` and re-import**

Delete lines 5-46 of `src/api/iobroker.ts` (the three `LS_*` constants, the `SavedConnection` interface, `genId`, `getConnections`, `setConnections`, `getActiveConnectionId`). Keep `switchToConnection` — it depends on `clearObjectsCache`.

Add to the import block at the top of `src/api/iobroker.ts`:

```ts
import {
  LS_HOST_KEY,
  LS_ACTIVE_CONNECTION_ID,
  getConnections,
  setConnections,
  getActiveConnectionId,
} from './connections';
import type { SavedConnection } from './connections';
```

Then re-export so existing importers keep working while they are migrated:

```ts
export { getConnections, setConnections, getActiveConnectionId } from './connections';
export type { SavedConnection, AuthMode } from './connections';
```

- [ ] **Step 5: Point the two consumers at the new module**

In `src/components/Layout.tsx`, replace lines 4-5:

```ts
import { switchToConnection } from '../api/iobroker';
import { getConnections, getActiveConnectionId } from '../api/connections';
import type { SavedConnection } from '../api/connections';
```

In `src/components/modals/SettingsModal.tsx`, replace lines 11-12:

```ts
import { clearObjectsCache, switchToConnection } from '../../api/iobroker';
import { getConnections, setConnections, getActiveConnectionId } from '../../api/connections';
import type { SavedConnection } from '../../api/connections';
```

- [ ] **Step 6: Run tests and type check**

Run: `npx vitest run src/api/connections.test.ts && npx tsc --noEmit && npm run lint`
Expected: tests PASS, `tsc` prints nothing, lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/api/connections.ts src/api/connections.test.ts src/api/iobroker.ts src/components/Layout.tsx src/components/modals/SettingsModal.tsx
git commit -m "refactor(api): extract connection storage into connections.ts"
```

---

### Task 2: `buildAuthHeader()`

**Files:**
- Create: `src/api/auth.ts`
- Test: `src/api/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/api/auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildAuthHeader } from './auth';

describe('buildAuthHeader', () => {
  it('returns no header when the connection is null', () => {
    expect(buildAuthHeader(null)).toEqual({});
  });

  it('returns no header when authMode is undefined (legacy connection)', () => {
    expect(buildAuthHeader({ id: 'a', name: 'A', host: 'h:8093' })).toEqual({});
  });

  it('returns no header when authMode is none', () => {
    expect(buildAuthHeader({ id: 'a', name: 'A', host: 'h:8093', authMode: 'none' })).toEqual({});
  });

  it('builds a Basic header from user and password', () => {
    expect(
      buildAuthHeader({ id: 'a', name: 'A', host: 'h:8093', authMode: 'basic', authUser: 'admin', authPass: 'iobroker' })
    ).toEqual({ Authorization: `Basic ${btoa('admin:iobroker')}` });
  });

  it('encodes non-latin1 passwords as UTF-8 before base64', () => {
    const header = buildAuthHeader({
      id: 'a', name: 'A', host: 'h:8093', authMode: 'basic', authUser: 'admin', authPass: 'pässwörd',
    });
    // btoa('pässwörd') would throw; the UTF-8 path must produce a decodable value
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(header.Authorization.slice('Basic '.length)), (c) => c.charCodeAt(0))
    );
    expect(decoded).toBe('admin:pässwörd');
  });

  it('builds a Basic header when only the user is set', () => {
    expect(
      buildAuthHeader({ id: 'a', name: 'A', host: 'h:8093', authMode: 'basic', authUser: 'admin' })
    ).toEqual({ Authorization: `Basic ${btoa('admin:')}` });
  });

  it('returns no header for basic mode with neither user nor password', () => {
    expect(buildAuthHeader({ id: 'a', name: 'A', host: 'h:8093', authMode: 'basic' })).toEqual({});
  });

  it('builds a Bearer header and trims the token', () => {
    expect(
      buildAuthHeader({ id: 'a', name: 'A', host: 'h:8093', authMode: 'bearer', authToken: '  tok123  ' })
    ).toEqual({ Authorization: 'Bearer tok123' });
  });

  it('returns no header for bearer mode with a blank token', () => {
    expect(buildAuthHeader({ id: 'a', name: 'A', host: 'h:8093', authMode: 'bearer', authToken: '   ' })).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/auth.test.ts`
Expected: FAIL — `Failed to resolve import "./auth"`.

- [ ] **Step 3: Write the implementation**

Create `src/api/auth.ts`:

```ts
import type { SavedConnection } from './connections';

/** base64 of a UTF-8 string. Plain btoa() throws on characters above U+00FF. */
function base64Utf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Authorization header for a saved connection.
 * Returns an empty object when the connection has no usable credentials.
 */
export function buildAuthHeader(conn: SavedConnection | null): Record<string, string> {
  if (!conn) return {};
  switch (conn.authMode) {
    case 'basic': {
      const user = conn.authUser ?? '';
      const pass = conn.authPass ?? '';
      if (!user && !pass) return {};
      return { Authorization: `Basic ${base64Utf8(`${user}:${pass}`)}` };
    }
    case 'bearer': {
      const token = conn.authToken?.trim() ?? '';
      if (!token) return {};
      return { Authorization: `Bearer ${token}` };
    }
    default:
      return {};
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/auth.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/api/auth.ts src/api/auth.test.ts
git commit -m "feat(api): add buildAuthHeader for basic and bearer auth"
```

---

### Task 3: Throttled auth-error bus

Without throttling, a single expired session fires one toast per in-flight query — the app runs ~20 parallel requests on load.

**Files:**
- Modify: `src/api/auth.ts`
- Test: `src/api/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/api/auth.test.ts`:

```ts
import { beforeEach, vi } from 'vitest';
import { onAuthError, emitAuthError, resetAuthErrorThrottle, AUTH_ERROR_THROTTLE_MS } from './auth';

describe('auth error bus', () => {
  beforeEach(() => {
    resetAuthErrorThrottle();
    vi.useRealTimers();
  });

  it('notifies subscribers with the status code', () => {
    const seen: number[] = [];
    const off = onAuthError((status) => seen.push(status));
    emitAuthError(401);
    off();
    expect(seen).toEqual([401]);
  });

  it('stops notifying after unsubscribe', () => {
    const seen: number[] = [];
    const off = onAuthError((status) => seen.push(status));
    off();
    emitAuthError(401);
    expect(seen).toEqual([]);
  });

  it('suppresses repeat emissions inside the throttle window', () => {
    const seen: number[] = [];
    const off = onAuthError((status) => seen.push(status));
    emitAuthError(401);
    emitAuthError(401);
    emitAuthError(403);
    off();
    expect(seen).toEqual([401]);
  });

  it('emits again once the throttle window has elapsed', () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const off = onAuthError((status) => seen.push(status));
    emitAuthError(401);
    vi.advanceTimersByTime(AUTH_ERROR_THROTTLE_MS);
    emitAuthError(403);
    off();
    vi.useRealTimers();
    expect(seen).toEqual([401, 403]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/auth.test.ts`
Expected: FAIL — `onAuthError is not a function` / no export named `onAuthError`.

- [ ] **Step 3: Write the implementation**

Append to `src/api/auth.ts`:

```ts
/** Minimum gap between two auth-error notifications, in ms. */
export const AUTH_ERROR_THROTTLE_MS = 30_000;

type AuthErrorListener = (status: number) => void;

const authErrorListeners = new Set<AuthErrorListener>();
let lastAuthErrorAt: number | null = null;

/** Subscribe to 401/403 responses. Returns an unsubscribe function. */
export function onAuthError(listener: AuthErrorListener): () => void {
  authErrorListeners.add(listener);
  return () => { authErrorListeners.delete(listener); };
}

/**
 * Publish an auth failure. Throttled to one notification per
 * AUTH_ERROR_THROTTLE_MS so a burst of parallel requests yields one toast.
 */
export function emitAuthError(status: number): void {
  const now = Date.now();
  if (lastAuthErrorAt !== null && now - lastAuthErrorAt < AUTH_ERROR_THROTTLE_MS) return;
  lastAuthErrorAt = now;
  authErrorListeners.forEach((listener) => listener(status));
}

/** Clear the throttle. Called after credentials change, and by tests. */
export function resetAuthErrorThrottle(): void {
  lastAuthErrorAt = null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/auth.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/api/auth.ts src/api/auth.test.ts
git commit -m "feat(api): add throttled auth error bus"
```

---

### Task 4: `authFetch()` wrapper

**Files:**
- Modify: `src/api/auth.ts`
- Test: `src/api/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/api/auth.test.ts`:

```ts
import { authFetch } from './auth';
import { setConnections } from './connections';

function mockFetch(response: Partial<Response>) {
  const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, ...response } as Response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('authFetch', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAuthErrorThrottle();
    vi.unstubAllGlobals();
  });

  it('sends no Authorization header when no connection is active', async () => {
    const spy = mockFetch({});
    await authFetch('/api/v1/objects');
    const headers = spy.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBeNull();
  });

  it('injects the Authorization header of the active connection', async () => {
    setConnections([{ id: 'a', name: 'A', host: 'h:8093', authMode: 'basic', authUser: 'u', authPass: 'p' }]);
    localStorage.setItem('iob-active-connection-id', 'a');
    const spy = mockFetch({});
    await authFetch('/api/v1/objects');
    const headers = spy.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe(`Basic ${btoa('u:p')}`);
  });

  it('preserves headers and method passed by the caller', async () => {
    const spy = mockFetch({});
    await authFetch('/api/v1/object/x', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('PUT');
    expect(init.body).toBe('{}');
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json');
  });

  it('emits an auth error on 401', async () => {
    mockFetch({ ok: false, status: 401 });
    const seen: number[] = [];
    const off = onAuthError((status) => seen.push(status));
    await authFetch('/api/v1/objects');
    off();
    expect(seen).toEqual([401]);
  });

  it('emits an auth error on 403', async () => {
    mockFetch({ ok: false, status: 403 });
    const seen: number[] = [];
    const off = onAuthError((status) => seen.push(status));
    await authFetch('/api/v1/objects');
    off();
    expect(seen).toEqual([403]);
  });

  it('does not emit on other error statuses', async () => {
    mockFetch({ ok: false, status: 500 });
    const seen: number[] = [];
    const off = onAuthError((status) => seen.push(status));
    await authFetch('/api/v1/objects');
    off();
    expect(seen).toEqual([]);
  });

  it('returns the response unchanged', async () => {
    mockFetch({ ok: false, status: 401 });
    const res = await authFetch('/api/v1/objects');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/auth.test.ts`
Expected: FAIL — no export named `authFetch`.

- [ ] **Step 3: Write the implementation**

Append to `src/api/auth.ts` (and add `getActiveConnection` to the existing `./connections` import at the top of the file):

```ts
/**
 * fetch() with the active connection's Authorization header injected.
 * 401/403 responses are published on the auth-error bus; the response is
 * returned untouched so existing per-call error handling still applies.
 */
export async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(buildAuthHeader(getActiveConnection()))) {
    headers.set(key, value);
  }
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401 || res.status === 403) emitAuthError(res.status);
  return res;
}
```

The import line at the top of `src/api/auth.ts` becomes:

```ts
import { getActiveConnection } from './connections';
import type { SavedConnection } from './connections';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/auth.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Commit**

```bash
git add src/api/auth.ts src/api/auth.test.ts
git commit -m "feat(api): add authFetch wrapper injecting Authorization header"
```

---

### Task 5: Route `src/api/iobroker.ts` through `authFetch`

Mechanical swap of 11 call sites. No logic change.

**Files:**
- Modify: `src/api/iobroker.ts:80,299,540,556,698,1372,1381,1390,1408,1424,1444,1695`

- [ ] **Step 1: Add the import**

Add to the import block at the top of `src/api/iobroker.ts`:

```ts
import { authFetch } from './auth';
```

- [ ] **Step 2: Replace every API `fetch(` with `authFetch(`**

Run: `sed -i 's/\bawait fetch(`\${getBaseUrl()}/await authFetch(`${getBaseUrl()}/g; s/\bfetch(`\${getBaseUrl()}/authFetch(`${getBaseUrl()}/g' src/api/iobroker.ts`

Then handle the two call sites that fetch a pre-built `url` variable — lines 540 and 556 — by hand. Read each one and change `await fetch(url)` to `await authFetch(url)`. Confirm both are ioBroker API URLs (they are built from `getBaseUrl()` further up in the same functions); if either targets a non-ioBroker origin, leave it as plain `fetch`.

- [ ] **Step 3: Verify no API call site was missed**

Run: `grep -n "[^h]fetch(" src/api/iobroker.ts`
Expected: no output. Any hit is a missed call site — fix it before continuing.

- [ ] **Step 4: Run the full suite and type check**

Run: `npm test -- --run && npx tsc --noEmit && npm run lint`
Expected: all tests PASS, `tsc` silent, lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/api/iobroker.ts
git commit -m "feat(api): route all REST calls through authFetch"
```

---

### Task 6: Route the hooks through `authFetch`

**Files:**
- Modify: `src/hooks/useLongPolling.ts:66,85,163`
- Modify: `src/hooks/useApiConnectivity.ts:15`

- [ ] **Step 1: Update `useLongPolling.ts`**

Add to its imports:

```ts
import { authFetch } from '../api/auth';
```

Change the three call sites from `await fetch(` to `await authFetch(`, leaving URLs and options untouched:

```ts
const res = await authFetch(`${getBaseUrl()}/states/subscribe?sid=${sidRef.current}&method=polling`, {
```

```ts
const res = await authFetch(`${getBaseUrl()}/states/unsubscribe?sid=${sidRef.current}`, {
```

```ts
const res = await authFetch(`${getBaseUrl()}/polling?sid=${sidRef.current}${qs}`, {
```

- [ ] **Step 2: Update `useApiConnectivity.ts`**

Add to its imports:

```ts
import { authFetch } from '../api/auth';
```

Change line 15:

```ts
    const res = await authFetch(`${getApiBase()}/objects?pattern=system.config`, {
      signal: controller.signal,
    });
```

- [ ] **Step 3: Verify nothing was missed**

Run: `grep -rn "[^h]fetch(" src/hooks/`
Expected: no output.

- [ ] **Step 4: Run the full suite and type check**

Run: `npm test -- --run && npx tsc --noEmit && npm run lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useLongPolling.ts src/hooks/useApiConnectivity.ts
git commit -m "feat(hooks): route polling and connectivity checks through authFetch"
```

---

### Task 7: `useAuthErrorToast()` hook

**Files:**
- Create: `src/hooks/useAuthErrorToast.ts`
- Create: `src/hooks/useAuthErrorToast.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useAuthErrorToast.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuthErrorToast } from './useAuthErrorToast';
import { emitAuthError, resetAuthErrorThrottle } from '../api/auth';

const showToast = vi.fn();
const openSettings = vi.fn();

vi.mock('../context/ToastContext', () => ({ useToast: () => showToast }));
vi.mock('../context/UIContext', () => ({
  useUIOverlayContext: () => ({ openSettings }),
  useAppSettingsContext: () => ({ appSettings: { language: 'en' } }),
}));

describe('useAuthErrorToast', () => {
  beforeEach(() => {
    showToast.mockClear();
    openSettings.mockClear();
    resetAuthErrorThrottle();
  });

  it('shows an error toast with an action when a 401 is emitted', () => {
    renderHook(() => useAuthErrorToast());
    act(() => { emitAuthError(401); });
    expect(showToast).toHaveBeenCalledTimes(1);
    const [message, type, action] = showToast.mock.calls[0];
    expect(message).toMatch(/401/);
    expect(type).toBe('error');
    expect(action.label).toBeTruthy();
  });

  it('opens settings when the toast action is clicked', () => {
    renderHook(() => useAuthErrorToast());
    act(() => { emitAuthError(401); });
    const action = showToast.mock.calls[0][2];
    act(() => { action.onClick(); });
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useAuthErrorToast());
    unmount();
    resetAuthErrorThrottle();
    act(() => { emitAuthError(401); });
    expect(showToast).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useAuthErrorToast.test.tsx`
Expected: FAIL — `Failed to resolve import "./useAuthErrorToast"`.

- [ ] **Step 3: Write the implementation**

Create `src/hooks/useAuthErrorToast.ts`:

```ts
import { useEffect } from 'react';
import { onAuthError } from '../api/auth';
import { useToast } from '../context/ToastContext';
import { useUIOverlayContext, useAppSettingsContext } from '../context/UIContext';

/**
 * Turns 401/403 responses into a persistent toast that opens Settings.
 * Mount once, at app level.
 */
export function useAuthErrorToast(): void {
  const showToast = useToast();
  const { openSettings } = useUIOverlayContext();
  const { appSettings } = useAppSettingsContext();
  const isEn = appSettings.language === 'en';

  useEffect(() => {
    return onAuthError((status) => {
      showToast(
        isEn
          ? `ioBroker rejected the request (${status}). Check the credentials for this connection.`
          : `ioBroker hat die Anfrage abgelehnt (${status}). Zugangsdaten dieser Verbindung prüfen.`,
        'error',
        { label: isEn ? 'Open settings' : 'Einstellungen öffnen', onClick: openSettings }
      );
    });
  }, [showToast, openSettings, isEn]);
}
```

Hook names verified against `src/context/UIContext.tsx:263,269` — `useAppSettingsContext()` and `useUIOverlayContext()`. Language comes from `appSettings.language`, matching `SettingsModal.tsx:104`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useAuthErrorToast.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Mount the hook in `App.tsx`**

Add the import alongside the other hook imports:

```ts
import { useAuthErrorToast } from './hooks/useAuthErrorToast';
```

Call it near the other top-level hook calls in the `App` component body (next to `useApiConnectivity`):

```ts
  useAuthErrorToast();
```

- [ ] **Step 6: Run the full suite and type check**

Run: `npm test -- --run && npx tsc --noEmit && npm run lint`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useAuthErrorToast.ts src/hooks/useAuthErrorToast.test.tsx src/App.tsx
git commit -m "feat(ui): show a settings toast when ioBroker rejects auth"
```

---

### Task 8: Auth fields in the connection editor

**Files:**
- Modify: `src/components/modals/SettingsModal.tsx:89-93` (the `EditingConnForm` type), the editor JSX around line 915, and the save handler around line 945

- [ ] **Step 1: Extend the edit form type**

Replace the `EditingConnForm` type at `src/components/modals/SettingsModal.tsx:89-92`:

```ts
  type EditingConnForm = {
    id: string; name: string; host: string;
    socketHost: string; realtimeTransport: 'longpolling' | 'socketio'; adminPort: number;
    authMode: AuthMode; authUser: string; authPass: string; authToken: string;
  };
```

Add `AuthMode` to the type import from `../../api/connections`:

```ts
import type { SavedConnection, AuthMode } from '../../api/connections';
```

- [ ] **Step 2: Seed the new fields where the editor opens**

At `src/components/modals/SettingsModal.tsx:753`, the object passed to `setEditingConn`/`setOriginalEditingConn` gains four fields. Add them next to `adminPort: conn.adminPort ?? 8081,`:

```ts
                                      authMode: conn.authMode ?? 'none',
                                      authUser: conn.authUser ?? '',
                                      authPass: conn.authPass ?? '',
                                      authToken: conn.authToken ?? '',
```

- [ ] **Step 3: Extend the dirty check**

At `src/components/modals/SettingsModal.tsx:790-794`, add four clauses to the existing comparison chain:

```ts
                              editingConn.adminPort !== originalEditingConn.adminPort ||
                              editingConn.authMode !== originalEditingConn.authMode ||
                              editingConn.authUser !== originalEditingConn.authUser ||
                              editingConn.authPass !== originalEditingConn.authPass ||
                              editingConn.authToken !== originalEditingConn.authToken;
```

- [ ] **Step 4: Add the auth UI block**

Insert this directly after the "Admin port" block (which ends around line 937, before the `{/* Save / Cancel buttons */}` comment):

```tsx
                              {/* Authentication */}
                              <div className="flex flex-col gap-1.5">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Authentication (rest-api adapter)' : 'Authentifizierung (rest-api-Adapter)'}</span>
                                <select
                                  value={editingConn.authMode}
                                  onChange={(e) => setEditingConn((prev) => prev ? { ...prev, authMode: e.target.value as AuthMode } : prev)}
                                  className="px-2 py-1.5 text-xs rounded border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-blue-400"
                                >
                                  <option value="none">{isEn ? 'None (adapter option "auth" is off)' : 'Keine (Adapter-Option „auth“ ist aus)'}</option>
                                  <option value="basic">{isEn ? 'Basic Auth (user + password)' : 'Basic Auth (Benutzer + Passwort)'}</option>
                                  <option value="bearer">{isEn ? 'Bearer token' : 'Bearer-Token'}</option>
                                </select>

                                {editingConn.authMode === 'basic' && (
                                  <>
                                    <input
                                      value={editingConn.authUser}
                                      onChange={(e) => setEditingConn((prev) => prev ? { ...prev, authUser: e.target.value } : prev)}
                                      placeholder={isEn ? 'User' : 'Benutzer'}
                                      autoComplete="off"
                                      className="px-2 py-1.5 text-xs rounded border font-mono bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-blue-400"
                                    />
                                    <input
                                      type="password"
                                      value={editingConn.authPass}
                                      onChange={(e) => setEditingConn((prev) => prev ? { ...prev, authPass: e.target.value } : prev)}
                                      placeholder={isEn ? 'Password' : 'Passwort'}
                                      autoComplete="new-password"
                                      className="px-2 py-1.5 text-xs rounded border font-mono bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-blue-400"
                                    />
                                  </>
                                )}

                                {editingConn.authMode === 'bearer' && (
                                  <input
                                    type="password"
                                    value={editingConn.authToken}
                                    onChange={(e) => setEditingConn((prev) => prev ? { ...prev, authToken: e.target.value } : prev)}
                                    placeholder={isEn ? 'Access token' : 'Access-Token'}
                                    autoComplete="off"
                                    className="px-2 py-1.5 text-xs rounded border font-mono bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-blue-400"
                                  />
                                )}

                                {editingConn.authMode !== 'none' && (
                                  <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                                    {isEn
                                      ? 'Stored unencrypted in this browser. Over plain HTTP these credentials are sent in cleartext and can be read by anyone on the network — use only on a trusted network, or enable TLS on the rest-api adapter.'
                                      : 'Unverschlüsselt in diesem Browser gespeichert. Über einfaches HTTP werden diese Zugangsdaten im Klartext übertragen und sind im Netzwerk mitlesbar — nur in vertrauenswürdigen Netzen verwenden oder TLS im rest-api-Adapter aktivieren.'}
                                  </p>
                                )}
                              </div>
```

- [ ] **Step 5: Persist the new fields on save**

At `src/components/modals/SettingsModal.tsx:948`, extend the object spread that builds the updated connection:

```ts
                                        ? { ...c, name, host, socketHost: editingConn.socketHost.trim() || undefined, realtimeTransport: editingConn.realtimeTransport, adminPort: editingConn.adminPort,
                                            authMode: editingConn.authMode,
                                            authUser: editingConn.authMode === 'basic' ? editingConn.authUser : undefined,
                                            authPass: editingConn.authMode === 'basic' ? editingConn.authPass : undefined,
                                            authToken: editingConn.authMode === 'bearer' ? editingConn.authToken.trim() : undefined }
                                        : c
```

Clearing the fields of the non-selected mode keeps a stale password from lingering in `localStorage` after switching to Bearer.

In the same save handler, after `setConnections(updated);`, clear the throttle so the next failure toasts immediately:

```ts
                                    resetAuthErrorThrottle();
```

Add the import:

```ts
import { resetAuthErrorThrottle } from '../../api/auth';
```

- [ ] **Step 6: Verify by hand**

Run: `npm run dev`

Open Settings → Connection, edit a connection, set Basic Auth with a bogus user/password, save. Then in a terminal confirm the header is actually sent:

Run: `curl -s -o /dev/null -w "%{http_code}\n" -u wrong:wrong http://10.4.0.20:8093/v1/objects?pattern=system.config`
Expected: `200` — the target instance has `auth: false`, so it accepts any credentials. This only confirms the app is not broken by sending a header.

To confirm the header is actually attached, open devtools → Network, reload, click any request to `/v1/` and check that Request Headers contains `Authorization: Basic …`.

The live 401 path is covered by the unit tests in Tasks 4 and 7. **Do not set `auth: true` on the user's ioBroker instance to test this** — that is a config change to a running smart-home system and is outside the scope of this plan. If the user wants an end-to-end check, ask them to enable it themselves and report back.

- [ ] **Step 7: Run the full suite and type check**

Run: `npm test -- --run && npx tsc --noEmit && npm run lint`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/modals/SettingsModal.tsx
git commit -m "feat(settings): add per-connection basic and bearer auth fields"
```

---

### Task 9: Auth-aware connection test + socketio warning

The existing "Test" button in the connection editor calls the host with plain `fetch`, so it reports success against an authenticated instance that the app itself cannot reach. And socketio cannot carry credentials at all.

**Files:**
- Modify: `src/components/modals/SettingsModal.tsx` (host test handler, and the realtime transport block around line 880)

- [ ] **Step 1: Find the host test handler**

Run: `grep -n "connHostTesting\|testConnHostConnection\|setConnHostTestResult" src/components/modals/SettingsModal.tsx`

- [ ] **Step 2: Make the host test send the edited credentials**

In the host test handler, replace the bare `fetch(...)` of the probe URL with a call that carries the header built from the *in-progress form*, not the saved connection — the user is testing values they have not saved yet:

```ts
      const res = await fetch(probeUrl, {
        signal: controller.signal,
        headers: buildAuthHeader({
          id: editingConn.id,
          name: editingConn.name,
          host: editingConn.host,
          authMode: editingConn.authMode,
          authUser: editingConn.authUser,
          authPass: editingConn.authPass,
          authToken: editingConn.authToken,
        }),
      });
```

Keep the existing `probeUrl`, `controller`, and timeout logic exactly as they are — only the `headers` option is new. Add the import:

```ts
import { buildAuthHeader } from '../../api/auth';
```

- [ ] **Step 3: Report 401/403 distinctly**

In the same handler, where the result is currently classified, special-case the auth statuses so the user gets an actionable message instead of a generic failure:

```ts
      if (res.status === 401 || res.status === 403) {
        setConnHostTestResult('error');
        setConnHostTestError(isEn ? `Authentication failed (${res.status})` : `Authentifizierung fehlgeschlagen (${res.status})`);
        return;
      }
```

Place this immediately before the existing `res.ok` check.

- [ ] **Step 4: Warn that socketio cannot authenticate**

Insert directly after the realtime transport `<select>` block (which closes around line 882):

```tsx
                              {editingConn.realtimeTransport === 'socketio' && editingConn.authMode !== 'none' && (
                                <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                                  {isEn
                                    ? 'The socketio adapter accepts no credentials. If its own authentication is enabled, realtime push will fail — switch this connection to long polling.'
                                    : 'Der socketio-Adapter akzeptiert keine Zugangsdaten. Ist dessen Authentifizierung aktiv, schlägt Realtime-Push fehl — diese Verbindung auf Long Polling umstellen.'}
                                </p>
                              )}
```

- [ ] **Step 5: Run the full suite and type check**

Run: `npm test -- --run && npx tsc --noEmit && npm run lint`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/modals/SettingsModal.tsx
git commit -m "feat(settings): send credentials in the connection test and warn about socketio"
```

---

### Task 10: Documentation

**Files:**
- Modify: `docs/api.md:191-196`
- Modify: `README.md`
- Modify: `src/components/modals/HelpModal.tsx`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `docs/api.md`**

Replace the `## Authentication` section body (lines 193-195) with:

```markdown
- **Basic Auth:** `Authorization: Basic base64(user:pass)`
- **Bearer Token:** `Authorization: Bearer <token>`
- Extend token expiry: `GET /command/updateTokenExpiration?accessToken=<token>`

### Client implementation

Credentials are stored per saved connection (`localStorage['iob-connections']`, see `src/api/connections.ts`),
not in `AppSettings`. `authFetch()` in `src/api/auth.ts` injects the `Authorization` header on every REST call
and publishes 401/403 on a throttled bus (one notification per 30 s); `useAuthErrorToast()` turns that into a
persistent toast that opens Settings.

The rest-api adapter exposes **no token-issuance endpoint** — `/oauth/token`, `/login` and `/v1/login` all
return 404 on v4.0.2. A Bearer token must be obtained elsewhere and pasted into Settings.

> **Credentials are stored unencrypted** in `localStorage` and, when the adapter runs with `secure: false`,
> are transmitted in cleartext over HTTP. Use on trusted networks only, or enable TLS on the adapter.
```

- [ ] **Step 2: Update the README**

Run: `grep -n -i "trusted network\|no auth\|Verbindung\|Connection" README.md | head -20`

In the section that currently states the app has no authentication support, replace that claim with:

```markdown
Basic Auth and Bearer tokens are supported per connection (Settings → Connection). Credentials are stored
unencrypted in the browser and, without TLS on the rest-api adapter, are sent in cleartext — trusted networks only.
The socketio realtime transport cannot authenticate; use long polling against an authenticated instance.
```

- [ ] **Step 3: Update the in-app help**

Run: `grep -n -i "connection\|Verbindung" src/components/modals/HelpModal.tsx | head -20`

Add a bilingual entry to the Connection/Settings section describing the three auth modes and pointing at Settings → Connection, matching the surrounding `isEn ? … : …` style.

- [ ] **Step 4: Update `CLAUDE.md`**

In the **Realtime Transport** section, replace the line:

```markdown
- ⚠️ **No auth support** — trusted networks only.
```

with:

```markdown
- ⚠️ **socketio has no auth support** — REST supports Basic/Bearer per connection (`src/api/auth.ts`), socketio does not.
```

In the **Module Layers** section, add `src/api/connections.ts` and `src/api/auth.ts` next to `src/api/iobroker.ts`.

- [ ] **Step 5: Run the full suite**

Run: `npm test -- --run && npm run build`
Expected: tests PASS, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add docs/api.md README.md src/components/modals/HelpModal.tsx CLAUDE.md
git commit -m "docs: document per-connection REST API authentication"
```

---

## Out of Scope (YAGNI)

- **Token refresh / `updateTokenExpiration`.** No issuance endpoint exists on rest-api v4.0.2, so there is no session to refresh. A user pasting an expiring token will see the 401 toast — that is the designed behavior.
- **A dedicated login modal.** Rejected during brainstorming in favor of the toast → Settings route, which reuses the existing connection editor.
- **Encrypting credentials at rest.** A browser SPA has no key it can keep from an attacker who already runs script on the page. Obfuscation would imply safety that does not exist; the warning text is the honest mitigation.
- **Auth for socketio.** The adapter does not accept credentials. Task 9 warns instead.

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import io, { type Socket } from 'socket.io-client';
import type { IoBrokerState, IoBrokerObject } from '../types/iobroker';
import { queryKeys } from './queryKeys';
import { derivePatterns } from './useLongPolling';

/**
 * POC — Socket.IO transport as alternative to useLongPolling.
 *
 * Requires the `socketio` adapter (default port 8084) running alongside
 * the REST adapter.
 *
 * Validated live against socket.io adapter v2.x (10.4.0.20:8084):
 * `subscribe(pattern, cb)` acks (null, undefined); `stateChange(id, state)`
 * matches the (id, state) shape applyEvent expects 1:1.
 *
 * Status shape mirrors `LongPollingStatus` so the two transports are
 * interchangeable in `App.tsx` — selected via AppSettings.realtimeTransport.
 */

const CONNECT_TIMEOUT_MS = 5_000;

export interface SocketIOStatus {
  /** null = connecting/probing, true = connected at least once, false = failed/unsupported */
  supported: boolean | null;
  connected: boolean;
}

/**
 * Resolve the socketio adapter URL.
 * @param hostOverride explicit `host[:port]` from AppSettings.socketHost (empty = use heuristic)
 */
export function getSocketUrl(hostOverride?: string): string {
  const override = hostOverride?.trim();
  if (override) {
    return /^https?:\/\//.test(override) ? override : `http://${override}`;
  }
  // Docker mode: nginx proxies /socket.io/ → ioBroker:SOCKETIO_PORT.
  // Detected by window.__CONFIG__.ioBrokerHost being non-empty (set by entrypoint.sh).
  // Use same origin so the request goes through the nginx proxy — port 8084
  // does not need to be directly reachable from the browser.
  if (window.__CONFIG__?.ioBrokerHost) {
    return `${window.location.protocol}//${window.location.host}`;
  }
  // Dev fallback heuristic: same host as REST target, port 8084
  const raw = localStorage.getItem('ioBrokerHost');
  if (raw) {
    const host = raw.replace(/:\d+$/, '');
    return `http://${host}:8084`;
  }
  return `${window.location.protocol}//${window.location.hostname}:8084`;
}

type StateChangeHandler = (id: string, state: IoBrokerState | null) => void;

/**
 * Mirrors useLongPolling's applyEvent: pushes pushed state changes into
 * every active `states.values` batch query plus the detail query (if open).
 */
function makeApplyEvent(queryClient: ReturnType<typeof useQueryClient>): StateChangeHandler {
  return (id, state) => {
    if (!state) return;
    queryClient.setQueriesData<Record<string, IoBrokerState>>(
      { queryKey: queryKeys.states.valuesRoot },
      (old) => {
        if (!old || !(id in old)) return old;
        return { ...old, [id]: state };
      }
    );
    queryClient.setQueryData<IoBrokerState>(queryKeys.states.detail(id), state);
  };
}

type ObjectChangeHandler = (id: string, obj: IoBrokerObject | null) => void;

const OBJECTS_BOOTSTRAP_KEY = ['objects', 'bootstrap'] as const;

/**
 * Live-patches the object caches on `objectChange` events — keeps the table/tree
 * in sync when datapoints are created, deleted, or their `common` (name, role,
 * unit, min/max, alias target, ...) changes, without waiting for a manual/periodic
 * objects refresh. Patches `objects.all` (full set), `objects.bootstrap` (state-only
 * fast set used for client-side filtering) and the single-object detail query.
 * `obj === null` means the object was deleted.
 */
function makeApplyObjectChange(queryClient: ReturnType<typeof useQueryClient>): ObjectChangeHandler {
  const patchSet = (old: Record<string, IoBrokerObject> | undefined, id: string, obj: IoBrokerObject | null) => {
    if (!old) return old;
    if (obj) {
      if (old[id] === obj) return old;
      return { ...old, [id]: obj };
    }
    if (!(id in old)) return old;
    const next = { ...old };
    delete next[id];
    return next;
  };

  return (id, obj) => {
    queryClient.setQueryData<Record<string, IoBrokerObject>>(queryKeys.objects.all, (old) => patchSet(old, id, obj));
    queryClient.setQueryData<Record<string, IoBrokerObject>>(OBJECTS_BOOTSTRAP_KEY, (old) => patchSet(old, id, obj));
    if (obj) {
      queryClient.setQueryData<IoBrokerObject>(queryKeys.objects.detail(id), obj);
    } else {
      queryClient.removeQueries({ queryKey: queryKeys.objects.detail(id) });
    }
  };
}

export function useSocketIO(visibleIds: string[], enabled: boolean, hostOverride?: string): SocketIOStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SocketIOStatus>({ supported: null, connected: false });

  const patterns = derivePatterns(visibleIds);
  const patternsKey = patterns.join('\n');

  const socketRef = useRef<Socket | null>(null);
  // Patterns currently subscribed on the live socket — diffed against `patterns`
  // on every page/filter change so we only emit the delta, not a full
  // unsubscribe-everything + subscribe-everything round trip (avoids emit
  // bursts and a brief gap in the live stream for patterns that stay visible).
  const subscribedRef = useRef<string[]>([]);
  const subscribedObjectsRef = useRef<string[]>([]);
  // Always-current pattern list for the `connect`/`reconnect` handler — the
  // adapter forgets subscriptions across reconnects, so on (re)connect we
  // must (re)subscribe whatever is visible *right now*, not what it was when
  // the socket was created.
  const patternsRef = useRef<string[]>(patterns);
  patternsRef.current = patterns;
  // Set by the socket-lifecycle effect — lets the diff-resubscribe effect emit
  // with the same ack/retry handling without re-creating the socket.
  const emitWithAckRef = useRef<((event: 'subscribe' | 'unsubscribe' | 'subscribeObjects' | 'unsubscribeObjects', pattern: string) => void) | null>(null);

  const shouldConnect = enabled && patterns.length > 0;

  // ── Socket lifecycle — created once per (enabled, host); survives pattern changes ──
  useEffect(() => {
    if (!shouldConnect) {
      setStatus({ supported: null, connected: false });
      return;
    }

    const applyEvent = makeApplyEvent(queryClient);
    const applyObjectChange = makeApplyObjectChange(queryClient);
    let cancelled = false;

    const socket = io(getSocketUrl(hostOverride), {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 5_000,
      timeout: CONNECT_TIMEOUT_MS,
    });
    socketRef.current = socket;
    emitWithAckRef.current = (event, pattern) => emitWithAck(event, pattern);

    type SubEvent = 'subscribe' | 'unsubscribe' | 'subscribeObjects' | 'unsubscribeObjects';

    // ioBroker socket.io protocol: emit(event, pattern, cb?) → cb(err, result);
    // validated live (10.4.0.20:8084): success acks as (null, undefined).
    // We pass a callback to actually notice rejected subscriptions instead of
    // silently believing we're receiving live updates for a pattern we aren't.
    // One retry after 5s for failed *subscribe* attempts (transient adapter
    // hiccup); failed un-subscribes are logged only — nothing to recover.
    function emitWithAck(event: SubEvent, pattern: string, allowRetry = true) {
      socket.emit(event, pattern, (err?: unknown) => {
        if (cancelled || !err) return;
        console.warn(`[useSocketIO] "${event}" rejected for pattern "${pattern}":`, err);
        if (allowRetry && (event === 'subscribe' || event === 'subscribeObjects')) {
          setTimeout(() => {
            if (cancelled) return;
            emitWithAck(event, pattern, false);
          }, 5_000);
        }
      });
    }

    // Full (re)subscribe to whatever is visible *now* — used on (re)connect,
    // since the server-side subscription list is lost across reconnects.
    function resubscribeAll() {
      const next = patternsRef.current;
      for (const pattern of subscribedRef.current) emitWithAck('unsubscribe', pattern);
      for (const pattern of subscribedObjectsRef.current) emitWithAck('unsubscribeObjects', pattern);
      subscribedRef.current = [...next];
      subscribedObjectsRef.current = [...next];
      for (const pattern of next) {
        emitWithAck('subscribe', pattern);
        emitWithAck('subscribeObjects', pattern);
      }
    }

    function unsubscribeAll() {
      for (const pattern of subscribedRef.current) emitWithAck('unsubscribe', pattern);
      for (const pattern of subscribedObjectsRef.current) emitWithAck('unsubscribeObjects', pattern);
      subscribedRef.current = [];
      subscribedObjectsRef.current = [];
    }

    socket.on('connect', () => {
      if (cancelled) return;
      setStatus({ supported: true, connected: true });
      resubscribeAll();
    });

    socket.on('disconnect', () => {
      if (cancelled) return;
      setStatus(s => ({ ...s, connected: false }));
    });

    socket.on('connect_error', () => {
      if (cancelled) return;
      // Keep `supported: null` until we know — reconnection will keep retrying.
      // After repeated failures the consumer can fall back to long polling.
      setStatus(s => (s.supported === true ? { ...s, connected: false } : { supported: false, connected: false }));
    });

    // ioBroker socket.io protocol: on('stateChange', (id, state))
    socket.on('stateChange', (id: string, state: IoBrokerState | null) => {
      if (cancelled) return;
      applyEvent(id, state);
    });

    // ioBroker socket.io protocol: on('objectChange', (id, obj)) — obj === null means deleted
    socket.on('objectChange', (id: string, obj: IoBrokerObject | null) => {
      if (cancelled) return;
      applyObjectChange(id, obj);
    });

    return () => {
      cancelled = true;
      unsubscribeAll();
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      emitWithAckRef.current = null;
    };
  }, [queryClient, shouldConnect, hostOverride]);

  // ── Diff-based resubscribe — only emits the delta when the visible pattern set changes ──
  useEffect(() => {
    const socket = socketRef.current;
    const emit = emitWithAckRef.current;
    if (!socket || !socket.connected || !emit) return; // connect handler will (re)subscribe with current patterns

    const prev = subscribedRef.current;
    const next = patterns;
    const removed = prev.filter(p => !next.includes(p));
    const added = next.filter(p => !prev.includes(p));
    for (const pattern of removed) {
      emit('unsubscribe', pattern);
      emit('unsubscribeObjects', pattern);
    }
    for (const pattern of added) {
      emit('subscribe', pattern);
      emit('subscribeObjects', pattern);
    }
    if (removed.length || added.length) {
      subscribedRef.current = [...next];
      subscribedObjectsRef.current = [...next];
    }
  // patternsKey is the stable, joined representation of `patterns` — re-running
  // only when its content actually changes (not on every derivePatterns() re-creation).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patternsKey]);

  return status;
}

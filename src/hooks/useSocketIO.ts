import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import io, { type Socket } from 'socket.io-client';
import type { IoBrokerState } from '../types/iobroker';
import { queryKeys } from './queryKeys';
import { derivePatterns } from './useLongPolling';

/**
 * POC — Socket.IO transport as alternative to useLongPolling.
 *
 * Requires the `socketio` adapter (default port 8084) running alongside
 * the REST adapter. Derives the connection URL from a dedicated localStorage
 * key (`ioBrokerSocketHost`) — falls back to `<restHost-without-port>:8084`.
 *
 * Status shape mirrors `LongPollingStatus` so the two transports are
 * interchangeable in `App.tsx` (pick one based on a setting / probe result).
 *
 * NOT wired into the app yet — POC only. Validate against a real
 * `socketio` adapter instance before promoting beyond experimental.
 */

const LS_SOCKET_HOST_KEY = 'ioBrokerSocketHost';
const CONNECT_TIMEOUT_MS = 5_000;

export interface SocketIOStatus {
  /** null = connecting/probing, true = connected at least once, false = failed/unsupported */
  supported: boolean | null;
  connected: boolean;
}

function getSocketUrl(): string {
  const override = localStorage.getItem(LS_SOCKET_HOST_KEY);
  if (override) {
    return /^https?:\/\//.test(override) ? override : `http://${override}`;
  }
  // Fallback heuristic: same host as REST target, default socketio port 8084
  const raw = localStorage.getItem('ioBrokerHost') ?? window.__CONFIG__?.ioBrokerHost;
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

export function useSocketIO(visibleIds: string[], enabled: boolean): SocketIOStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SocketIOStatus>({ supported: null, connected: false });

  const patterns = derivePatterns(visibleIds);
  const patternsKey = patterns.join('\n');

  const socketRef = useRef<Socket | null>(null);
  const subscribedRef = useRef<string[]>([]);

  useEffect(() => {
    if (!enabled || patterns.length === 0) {
      setStatus({ supported: null, connected: false });
      return;
    }

    const applyEvent = makeApplyEvent(queryClient);
    let cancelled = false;

    const socket = io(getSocketUrl(), {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 5_000,
      timeout: CONNECT_TIMEOUT_MS,
    });
    socketRef.current = socket;

    function subscribeAll() {
      subscribedRef.current = [...patterns];
      for (const pattern of patterns) {
        // ioBroker socket.io protocol: emit('subscribe', pattern, cb?)
        socket.emit('subscribe', pattern);
      }
    }

    function unsubscribeAll() {
      for (const pattern of subscribedRef.current) {
        socket.emit('unsubscribe', pattern);
      }
      subscribedRef.current = [];
    }

    socket.on('connect', () => {
      if (cancelled) return;
      setStatus({ supported: true, connected: true });
      subscribeAll();
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

    return () => {
      cancelled = true;
      unsubscribeAll();
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  // patternsKey as stable dep — re-subscribes when visible page changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, patternsKey, enabled]);

  return status;
}

export { getSocketUrl as __getSocketUrlForTest };

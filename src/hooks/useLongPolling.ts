import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { IoBrokerState } from '../types/iobroker';
import { getBaseUrl } from '../api/iobroker';
import { queryKeys } from './queryKeys';

const POLLING_TIMEOUT_MS = 30_000;
const RECONNECT_INTERVAL_MS = 5_000;
const CLIENT_ABORT_BUFFER_MS = 1_500;

export interface LongPollingStatus {
  /** null = probing, true = REST API supports it, false = not supported */
  supported: boolean | null;
  connected: boolean;
}

type LongPollingEvent =
  | { id: string; state: IoBrokerState }
  | { id: string; obj: unknown }
  | { id: string }
  | { disconnect: true }
  | { error: string };

export function useLongPolling(): LongPollingStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LongPollingStatus>({ supported: null, connected: false });

  const terminateRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidRef = useRef('');
  const subscribedRef = useRef(false);

  useEffect(() => {
    terminateRef.current = false;

    function newSid() {
      sidRef.current = `${Date.now()}_${Math.round(Math.random() * 10_000)}`;
    }

    async function subscribe(): Promise<'ok' | 'unsupported' | 'error'> {
      subscribedRef.current = false;
      try {
        const res = await fetch(`${getBaseUrl()}/states/subscribe?sid=${sidRef.current}&method=polling`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'polling', pattern: '*' }),
        });
        if (res.status === 404) {
          const body = await res.text().catch(() => '');
          console.info(`[LongPolling] POST ${getBaseUrl()}/states/subscribe → 404 (body: ${body || '(empty)'}). Endpoint not available — falling back to 30s polling. Check: REST API adapter restarted after update? Running as web extension?`);
          return 'unsupported';
        }
        if (!res.ok) return 'error';
        subscribedRef.current = true;
        return 'ok';
      } catch {
        return 'error';
      }
    }

    async function unsubscribe() {
      if (!subscribedRef.current) return;
      subscribedRef.current = false;
      try {
        await fetch(`${getBaseUrl()}/states/unsubscribe?sid=${sidRef.current}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'polling', pattern: '*' }),
        });
      } catch { /* best effort */ }
    }

    function scheduleReconnect() {
      if (terminateRef.current || reconnectRef.current) return;
      reconnectRef.current = setTimeout(() => {
        reconnectRef.current = null;
        if (!terminateRef.current) void start();
      }, RECONNECT_INTERVAL_MS);
    }

    function applyEvent(data: LongPollingEvent) {
      if ('disconnect' in data) return; // handled by caller

      if ('state' in data && data.id) {
        // State changed — update all active batch queries that contain this ID
        queryClient.setQueriesData<Record<string, IoBrokerState>>(
          { queryKey: queryKeys.states.valuesRoot },
          (old) => {
            if (!old || !(data.id in old)) return old;
            return { ...old, [data.id]: data.state };
          }
        );
        // Also update detail query if open in edit modal
        queryClient.setQueryData<IoBrokerState>(queryKeys.states.detail(data.id), data.state);
      }
    }

    async function poll(isStart: boolean): Promise<'continue' | 'reconnect' | 'stop'> {
      const controller = new AbortController();
      abortRef.current = controller;
      const abortTimer = setTimeout(
        () => controller.abort(),
        POLLING_TIMEOUT_MS + CLIENT_ABORT_BUFFER_MS
      );

      try {
        const qs = isStart ? `&connect&timeout=${POLLING_TIMEOUT_MS}` : '';
        const res = await fetch(`${getBaseUrl()}/polling?sid=${sidRef.current}${qs}`, {
          signal: controller.signal,
        });
        clearTimeout(abortTimer);

        if (!res.ok) return 'reconnect';

        const text = await res.text();

        if (isStart) {
          if (text.trim() === '_') {
            setStatus({ supported: true, connected: true });
            return 'continue';
          }
          // Unexpected response — endpoint exists but behaves wrong
          setStatus({ supported: false, connected: false });
          return 'stop';
        }

        if (!text || text.trim() === '_') {
          // Empty heartbeat — keep going
          return 'continue';
        }

        let data: LongPollingEvent;
        try {
          data = JSON.parse(text) as LongPollingEvent;
        } catch {
          return 'continue';
        }

        if ('disconnect' in data) {
          setStatus(s => ({ ...s, connected: false }));
          return 'reconnect';
        }

        if ('error' in data) {
          console.warn('[LongPolling] server error:', data.error);
          return 'continue';
        }

        setStatus(s => s.connected ? s : { ...s, connected: true });
        applyEvent(data);
        return 'continue';
      } catch {
        clearTimeout(abortTimer);
        if (terminateRef.current) return 'stop';
        return 'reconnect';
      }
    }

    async function start() {
      newSid();

      const subResult = await subscribe();
      if (terminateRef.current) return;

      if (subResult === 'unsupported') {
        setStatus({ supported: false, connected: false });
        return;
      }
      if (subResult === 'error') {
        scheduleReconnect();
        return;
      }

      // Polling loop
      let isStart = true;
      while (!terminateRef.current) {
        const result = await poll(isStart);
        isStart = false;

        if (result === 'stop' || terminateRef.current) break;
        if (result === 'reconnect') {
          setStatus(s => ({ ...s, connected: false }));
          scheduleReconnect();
          break;
        }
      }
    }

    void start();

    return () => {
      terminateRef.current = true;
      abortRef.current?.abort();
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      void unsubscribe();
    };
  }, [queryClient]);

  return status;
}

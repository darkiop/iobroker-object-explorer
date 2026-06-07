import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { IoBrokerState } from '../types/iobroker';
import { getBaseUrl } from '../api/iobroker';
import { queryKeys } from './queryKeys';

const POLLING_TIMEOUT_MS = 30_000;
const RECONNECT_INTERVAL_MS = 5_000;
const CLIENT_ABORT_BUFFER_MS = 1_500;

// Module-level: some adapters support /states/subscribe but 404 on /states/unsubscribe.
// Once detected, skip unsubscribe calls entirely to avoid spamming devtools with 404s.
let _unsubscribeSupported: boolean | null = null;

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

export function useLongPolling(visibleIds: string[]): LongPollingStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LongPollingStatus>({ supported: null, connected: false });

  // Derive patterns and stringify for stable comparison
  const patterns = derivePatterns(visibleIds);
  const patternsKey = patterns.join('\n');

  const terminateRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidRef = useRef('');
  const subscribedPatternsRef = useRef<string[]>([]);

  useEffect(() => {
    if (patterns.length === 0) {
      // Nothing visible — stay disconnected, don't subscribe
      setStatus({ supported: null, connected: false });
      return;
    }

    terminateRef.current = false;

    function newSid() {
      sidRef.current = `${Date.now()}_${Math.round(Math.random() * 10_000)}`;
    }

    type SubscribeResult = 'ok' | 'unsupported' | 'error';

    async function subscribePattern(pattern: string): Promise<SubscribeResult> {
      try {
        const res = await fetch(`${getBaseUrl()}/states/subscribe?sid=${sidRef.current}&method=polling`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'polling', pattern }),
        });
        if (res.status === 404) {
          const body = await res.text().catch(() => '');
          console.info(`[LongPolling] 404 on subscribe (body: ${body || '(empty)'}). Falling back to interval polling.`);
          return 'unsupported';
        }
        return res.ok ? 'ok' : 'error';
      } catch {
        return 'error';
      }
    }

    async function unsubscribePattern(pattern: string): Promise<void> {
      if (_unsubscribeSupported === false) return;
      try {
        const res = await fetch(`${getBaseUrl()}/states/unsubscribe?sid=${sidRef.current}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'polling', pattern }),
        });
        if (res.status === 404) {
          _unsubscribeSupported = false;
          console.info('[LongPolling] 404 on unsubscribe — adapter lacks endpoint, skipping further unsubscribe calls.');
          return;
        }
        _unsubscribeSupported = true;
      } catch { /* best effort */ }
    }

    async function subscribe(): Promise<'ok' | 'unsupported' | 'error'> {
      subscribedPatternsRef.current = [];

      // Probe first pattern to detect endpoint support before firing all
      const firstResult = await subscribePattern(patterns[0]);
      if (firstResult === 'unsupported') return 'unsupported';
      if (firstResult === 'error') return 'error';

      // Subscribe remaining patterns in parallel
      const remaining = patterns.slice(1);
      const remainingResults = remaining.length > 0
        ? await Promise.all(remaining.map(subscribePattern))
        : [];

      // Track all successfully subscribed patterns
      const allResults: SubscribeResult[] = [firstResult, ...remainingResults];
      subscribedPatternsRef.current = patterns.filter((_, i) => allResults[i] === 'ok');

      return subscribedPatternsRef.current.length > 0 ? 'ok' : 'error';
    }

    async function unsubscribeAll() {
      const toUnsub = subscribedPatternsRef.current;
      subscribedPatternsRef.current = [];
      if (toUnsub.length === 0) return;
      await Promise.allSettled(toUnsub.map(unsubscribePattern));
    }

    function scheduleReconnect() {
      if (terminateRef.current || reconnectRef.current) return;
      reconnectRef.current = setTimeout(() => {
        reconnectRef.current = null;
        if (!terminateRef.current) void start();
      }, RECONNECT_INTERVAL_MS);
    }

    function applyEvent(data: LongPollingEvent) {
      if ('disconnect' in data) return;

      if ('state' in data && data.id) {
        // Update all active batch queries that contain this ID
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
          setStatus({ supported: false, connected: false });
          return 'stop';
        }

        if (!text || text.trim() === '_') return 'continue';

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
      void unsubscribeAll();
    };
  // patternsKey as stable dep — re-runs when visible page changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, patternsKey]);

  return status;
}

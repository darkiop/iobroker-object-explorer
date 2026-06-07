import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

function getApiBase(): string {
  if (window.location.protocol === 'https:') return '/api/v1';
  const raw = localStorage.getItem('ioBrokerHost') ?? window.__CONFIG__?.ioBrokerHost;
  if (raw && /^[\w.-]+(:\d{1,5})?$/.test(raw)) return `http://${raw}/v1`;
  return '/api/v1';
}

async function pingApi(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(`${getApiBase()}/objects?pattern=system.config`, {
      signal: controller.signal,
    });
    clearTimeout(id);
    return res.ok;
  } catch {
    return false;
  }
}

export interface ApiConnectivityState {
  browserOnline: boolean;
  apiReachable: boolean;
  isOnline: boolean;
}

export function useApiConnectivity(isLpConnected: () => boolean = () => false): ApiConnectivityState {
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine);
  const [apiReachable, setApiReachable] = useState(true);
  const queryClient = useQueryClient();

  const checkApi = useCallback(async () => {
    const reachable = await pingApi();
    setApiReachable(prev => {
      if (!prev && reachable) {
        queryClient.invalidateQueries();
      }
      return reachable;
    });
  }, [queryClient]);

  useEffect(() => {
    const onOnline = () => { setBrowserOnline(true); checkApi(); };
    const onOffline = () => { setBrowserOnline(false); setApiReachable(false); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [checkApi]);

  useEffect(() => {
    if (isLpConnected()) return;
    const ms = apiReachable ? 60_000 : 10_000;
    const id = setInterval(checkApi, ms);
    return () => clearInterval(id);
  }, [checkApi, apiReachable, isLpConnected]);

  return { browserOnline, apiReachable, isOnline: browserOnline && apiReachable };
}

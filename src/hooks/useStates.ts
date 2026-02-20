import { useQuery } from '@tanstack/react-query';
import { getObjectsByPattern, getStatesBatch, getState, getObject, getHistory } from '../api/iobroker';
import type { IoBrokerObject, IoBrokerState, HistoryOptions } from '../types/iobroker';

export function useFilteredObjects(pattern: string) {
  return useQuery({
    queryKey: ['objects', pattern],
    queryFn: () => getObjectsByPattern(pattern),
    enabled: pattern.length > 0,
  });
}

export function useStateValues(ids: string[]) {
  return useQuery({
    queryKey: ['stateValues', ids],
    queryFn: () => getStatesBatch(ids),
    enabled: ids.length > 0,
    refetchInterval: 30_000,
  });
}

export function useStateDetail(id: string | null) {
  return useQuery({
    queryKey: ['state', id],
    queryFn: () => getState(id!),
    enabled: !!id,
    refetchInterval: 5_000,
  });
}

export function useObjectDetail(id: string | null) {
  return useQuery({
    queryKey: ['object', id],
    queryFn: () => getObject(id!),
    enabled: !!id,
  });
}

export function useHistory(id: string | null, options: HistoryOptions | null) {
  return useQuery({
    queryKey: ['history', id, options?.start, options?.end, options?.aggregate],
    queryFn: () => getHistory(id!, options!),
    enabled: !!id && !!options,
    staleTime: Infinity,
  });
}

// Re-export types for convenience
export type { IoBrokerObject, IoBrokerState };

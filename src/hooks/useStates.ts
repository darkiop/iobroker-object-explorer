import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getObjectsByPattern, getStatesBatch, getState, getObject, getHistory, deleteHistoryEntry, deleteHistoryRange, deleteHistoryAll, extendObject, getAllRoles, getAllUnits, setState } from '../api/iobroker';
import type { IoBrokerObject, IoBrokerObjectCommon, IoBrokerState, HistoryOptions } from '../types/iobroker';

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

export function useDeleteHistory() {
  const queryClient = useQueryClient();
  return {
    deleteEntry: useMutation({
      mutationFn: ({ id, ts }: { id: string; ts: number }) => deleteHistoryEntry(id, ts),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history'] }),
    }),
    deleteRange: useMutation({
      mutationFn: ({ id, start, end }: { id: string; start: number; end: number }) => deleteHistoryRange(id, start, end),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history'] }),
    }),
    deleteAll: useMutation({
      mutationFn: ({ id }: { id: string }) => deleteHistoryAll(id),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history'] }),
    }),
  };
}

export function useExtendObject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, common }: { id: string; common: Partial<IoBrokerObjectCommon> }) =>
      extendObject(id, { common }),
    onSuccess: (_data, { id, common }) => {
      // Update single object detail cache immediately
      queryClient.setQueryData(['object', id], (old: IoBrokerObject | undefined) =>
        old ? { ...old, common: { ...old.common, ...common } } : old
      );
      // Update all objects list queries immediately (covers all patterns)
      queryClient.setQueriesData(
        { queryKey: ['objects'] },
        (old: Record<string, IoBrokerObject> | undefined) => {
          if (!old || !old[id]) return old;
          return { ...old, [id]: { ...old[id], common: { ...old[id].common, ...common } } };
        }
      );
    },
  });
}

export function useAllRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: getAllRoles,
    staleTime: Infinity,
  });
}

export function useAllUnits() {
  return useQuery({
    queryKey: ['units'],
    queryFn: getAllUnits,
    staleTime: Infinity,
  });
}

export function useSetState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, val }: { id: string; val: unknown }) => setState(id, val),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['state', id] });
    },
  });
}

// Re-export types for convenience
export type { IoBrokerObject, IoBrokerState };

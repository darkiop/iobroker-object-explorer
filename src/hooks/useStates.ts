import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { getObjectsByPattern, getStatesBatch, getState, getObject, getHistory, deleteHistoryEntry, deleteHistoryRange, deleteHistoryAll, extendObject, putFullObject, createObject, deleteObject, getAllRoles, getAllUnits, setState, getRoomMap, getAllObjects, getRoomEnums, updateRoomMembership, getFunctionMap, getFunctionEnums, updateFunctionMembership, buildAliasReverseMap } from '../api/iobroker';
import type { IoBrokerObject, IoBrokerObjectCommon, IoBrokerState, HistoryOptions } from '../types/iobroker';

function usePageVisible() {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const handler = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);
  return visible;
}

export function useFilteredObjects(pattern: string) {
  return useQuery({
    queryKey: ['objects', pattern],
    queryFn: () => getObjectsByPattern(pattern),
    enabled: pattern.length > 0,
  });
}

export function useAllObjects() {
  return useQuery({
    queryKey: ['objects', 'all'],
    queryFn: () => getAllObjects(),
    staleTime: Infinity,
  });
}

export function useStateValues(ids: string[]) {
  const pageVisible = usePageVisible();
  return useQuery({
    queryKey: ['stateValues', ids],
    queryFn: () => getStatesBatch(ids),
    enabled: ids.length > 0 && pageVisible,
    refetchInterval: 30_000,
  });
}

export function useAliasMap() {
  return useQuery({
    queryKey: ['objects', 'all'],
    queryFn: getAllObjects,
    staleTime: Infinity,
    select: buildAliasReverseMap,
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

export function useRoomMap() {
  return useQuery({
    queryKey: ['roomMap'],
    queryFn: getRoomMap,
    staleTime: Infinity,
  });
}

export function useSetState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, val }: { id: string; val: unknown }) => setState(id, val),
    onSuccess: (_data, { id, val }) => {
      queryClient.invalidateQueries({ queryKey: ['state', id] });
      queryClient.setQueriesData(
        { queryKey: ['stateValues'] },
        (old: Record<string, IoBrokerState> | undefined) => {
          if (!old || !(id in old)) return old;
          return { ...old, [id]: { ...old[id], val, ts: Date.now(), ack: false } };
        }
      );
    },
  });
}

export function useCreateDatapoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, common, initialValue }: { id: string; common: Partial<IoBrokerObjectCommon>; initialValue?: string }) => {
      await createObject(id, common);
      if (initialValue !== undefined && initialValue !== '') {
        await setState(id, initialValue);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['objects'] });
    },
  });
}

export function useDeleteObject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteObject(id),
    onSuccess: (_data, id) => {
      queryClient.setQueriesData(
        { queryKey: ['objects'] },
        (old: Record<string, IoBrokerObject> | undefined) => {
          if (!old || !(id in old)) return old;
          const next = { ...old };
          delete next[id];
          return next;
        }
      );
    },
  });
}

export function usePutObject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, obj }: { id: string; obj: IoBrokerObject }) => putFullObject(id, obj),
    onSuccess: (_data, { id, obj }) => {
      queryClient.setQueriesData(
        { queryKey: ['objects'] },
        (old: Record<string, IoBrokerObject> | undefined) =>
          old ? { ...old, [id]: obj } : old
      );
      queryClient.setQueryData(['object', id], obj);
    },
  });
}

export function useFunctionMap() {
  return useQuery({
    queryKey: ['functionMap'],
    queryFn: getFunctionMap,
    staleTime: Infinity,
  });
}

export function useFunctionEnums() {
  return useQuery({
    queryKey: ['functionEnums'],
    queryFn: getFunctionEnums,
    staleTime: Infinity,
  });
}

export function useUpdateFunctionMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ objectId, oldFnEnumId, newFnEnumId }: { objectId: string; oldFnEnumId: string | null; newFnEnumId: string | null }) =>
      updateFunctionMembership(objectId, oldFnEnumId, newFnEnumId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['objects'] });
      queryClient.invalidateQueries({ queryKey: ['functionMap'] });
    },
  });
}

export function useRoomEnums() {
  return useQuery({
    queryKey: ['roomEnums'],
    queryFn: getRoomEnums,
    staleTime: Infinity,
  });
}

export function useUpdateRoomMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ objectId, oldRoomEnumId, newRoomEnumId }: { objectId: string; oldRoomEnumId: string | null; newRoomEnumId: string | null }) =>
      updateRoomMembership(objectId, oldRoomEnumId, newRoomEnumId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['objects'] });
      queryClient.invalidateQueries({ queryKey: ['roomMap'] });
    },
  });
}

// Re-export types for convenience
export type { IoBrokerObject, IoBrokerState };

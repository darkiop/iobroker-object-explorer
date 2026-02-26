import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { getObjectsByPattern, getStatesBatch, getState, getObject, getHistory, deleteHistoryEntry, deleteHistoryRange, deleteHistoryAll, extendObject, putFullObject, createObject, deleteObject, getAllRoles, getAllUnits, setState, getRoomMap, getAllObjects, getRoomEnums, updateRoomMembership, updateRoomMembershipBatch, getFunctionMap, getFunctionEnums, updateFunctionMembership, updateFunctionMembershipBatch, buildAliasReverseMap } from '../api/iobroker';
import type { IoBrokerObject, IoBrokerObjectCommon, IoBrokerState, HistoryOptions } from '../types/iobroker';

const queryKeys = {
  objects: {
    root: ['objects'] as const,
    all: ['objects', 'all'] as const,
    filtered: (pattern: string, fulltext: boolean) => ['objects', 'filtered', pattern, fulltext] as const,
    detail: (id: string) => ['objects', 'detail', id] as const,
  },
  states: {
    valuesRoot: ['states', 'values'] as const,
    values: (ids: string[]) => ['states', 'values', ids] as const,
    detail: (id: string) => ['states', 'detail', id] as const,
  },
  history: {
    root: ['history'] as const,
    detail: (id: string, options: HistoryOptions) =>
      ['history', 'detail', id, options.start, options.end, options.aggregate] as const,
  },
  metadata: {
    roles: ['metadata', 'roles'] as const,
    units: ['metadata', 'units'] as const,
    roomMap: ['metadata', 'rooms', 'map'] as const,
    roomEnums: ['metadata', 'rooms', 'enums'] as const,
    functionMap: ['metadata', 'functions', 'map'] as const,
    functionEnums: ['metadata', 'functions', 'enums'] as const,
  },
};

function usePageVisible() {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const handler = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);
  return visible;
}

export function useFilteredObjects(pattern: string, fulltext = true) {
  return useQuery({
    queryKey: queryKeys.objects.filtered(pattern, fulltext),
    queryFn: () => getObjectsByPattern(pattern, fulltext),
    enabled: pattern.length > 0,
    staleTime: Infinity, // Objects only change via mutations (which invalidate the cache)
  });
}

export function useAllObjects() {
  return useQuery({
    queryKey: queryKeys.objects.all,
    queryFn: () => getAllObjects(),
    staleTime: Infinity,
  });
}

export function useStateValues(ids: string[]) {
  const pageVisible = usePageVisible();
  return useQuery({
    queryKey: queryKeys.states.values(ids),
    queryFn: () => getStatesBatch(ids),
    enabled: ids.length > 0 && pageVisible,
    refetchInterval: 30_000,
  });
}

export function useAliasMap() {
  return useQuery({
    queryKey: queryKeys.objects.all,
    queryFn: getAllObjects,
    staleTime: Infinity,
    select: buildAliasReverseMap,
  });
}

export function useStateDetail(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.states.detail(id) : [...queryKeys.states.detail('__none__')] as const,
    queryFn: () => getState(id!),
    enabled: !!id,
    refetchInterval: 5_000,
  });
}

export function useObjectDetail(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.objects.detail(id) : [...queryKeys.objects.detail('__none__')] as const,
    queryFn: () => getObject(id!),
    enabled: !!id,
  });
}

export function useHistory(id: string | null, options: HistoryOptions | null) {
  return useQuery({
    queryKey: id && options
      ? queryKeys.history.detail(id, options)
      : [...queryKeys.history.detail('__none__', { start: 0, end: 0, aggregate: 'none', count: 0 })] as const,
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
      onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.history.root }),
    }),
    deleteRange: useMutation({
      mutationFn: ({ id, start, end }: { id: string; start: number; end: number }) => deleteHistoryRange(id, start, end),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.history.root }),
    }),
    deleteAll: useMutation({
      mutationFn: ({ id }: { id: string }) => deleteHistoryAll(id),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.history.root }),
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
      queryClient.setQueryData(queryKeys.objects.detail(id), (old: IoBrokerObject | undefined) =>
        old ? { ...old, common: { ...old.common, ...common } } : old
      );
      // Update all objects list queries immediately (covers all patterns)
      queryClient.setQueriesData(
        { queryKey: queryKeys.objects.root },
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
    queryKey: queryKeys.metadata.roles,
    queryFn: getAllRoles,
    staleTime: Infinity,
  });
}

export function useAllUnits() {
  return useQuery({
    queryKey: queryKeys.metadata.units,
    queryFn: getAllUnits,
    staleTime: Infinity,
  });
}

export function useRoomMap() {
  return useQuery({
    queryKey: queryKeys.metadata.roomMap,
    queryFn: getRoomMap,
    staleTime: Infinity,
  });
}

export function useSetState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, val }: { id: string; val: unknown }) => setState(id, val),
    onSuccess: (_data, { id, val }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.states.detail(id) });
      queryClient.setQueriesData(
        { queryKey: queryKeys.states.valuesRoot },
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
    mutationFn: async ({ id, common, initialValue, objectType = 'state' }: { id: string; common: Partial<IoBrokerObjectCommon>; initialValue?: string; objectType?: 'state' | 'folder' | 'device' | 'channel' }) => {
      await createObject(id, common, objectType);
      if (objectType === 'state' && initialValue !== undefined && initialValue !== '') {
        await setState(id, initialValue);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.root });
    },
  });
}

export function useDeleteObject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteObject(id),
    onSuccess: (_data, id) => {
      queryClient.setQueriesData(
        { queryKey: queryKeys.objects.root },
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
        { queryKey: queryKeys.objects.root },
        (old: Record<string, IoBrokerObject> | undefined) =>
          old ? { ...old, [id]: obj } : old
      );
      queryClient.setQueryData(queryKeys.objects.detail(id), obj);
    },
  });
}

export function useFunctionMap() {
  return useQuery({
    queryKey: queryKeys.metadata.functionMap,
    queryFn: getFunctionMap,
    staleTime: Infinity,
  });
}

export function useFunctionEnums() {
  return useQuery({
    queryKey: queryKeys.metadata.functionEnums,
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
      queryClient.invalidateQueries({ queryKey: queryKeys.metadata.functionMap });
    },
  });
}

export function useUpdateFunctionMembershipBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ objectIds, newFnEnumId }: { objectIds: string[]; newFnEnumId: string | null }) =>
      updateFunctionMembershipBatch(objectIds, newFnEnumId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metadata.functionMap });
    },
  });
}

export function useRoomEnums() {
  return useQuery({
    queryKey: queryKeys.metadata.roomEnums,
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
      queryClient.invalidateQueries({ queryKey: queryKeys.metadata.roomMap });
    },
  });
}

export function useUpdateRoomMembershipBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ objectIds, newRoomEnumId }: { objectIds: string[]; newRoomEnumId: string | null }) =>
      updateRoomMembershipBatch(objectIds, newRoomEnumId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metadata.roomMap });
    },
  });
}

// Re-export types for convenience
export type { IoBrokerObject, IoBrokerState };

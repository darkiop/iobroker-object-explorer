import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deleteHistoryEntry, deleteHistoryRange, deleteHistoryAll, extendObject,
  putFullObject, createObject, deleteObject, deleteObjectsMany, renameDatapoint,
  setState, updateRoomMembership, updateFunctionMembership, importDatapoints,
  getScriptUsedIds, clearScriptUsedIdsCache,
} from '../api/iobroker';
import type { IoBrokerObject, IoBrokerObjectCommon, IoBrokerState } from '../types/iobroker';
import { queryKeys } from './queryKeys';

export function useDeleteHistory() {
  const queryClient = useQueryClient();
  return {
    deleteEntry: useMutation({
      mutationFn: ({ id, ts }: { id: string; ts: number }) => deleteHistoryEntry(id, ts),
      onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.history.root }),
    }),
    deleteRange: useMutation({
      mutationFn: ({ id, start, end }: { id: string; start: number; end: number }) => deleteHistoryRange(id, start, end),
      onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.history.root }),
    }),
    deleteAll: useMutation({
      mutationFn: ({ id }: { id: string }) => deleteHistoryAll(id),
      onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.history.root }),
    }),
  };
}

export function useExtendObject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, common }: { id: string; common: Partial<IoBrokerObjectCommon> }) =>
      extendObject(id, { common }),
    onSuccess: (_data, { id, common }) => {
      queryClient.setQueryData(queryKeys.objects.detail(id), (old: IoBrokerObject | undefined) =>
        old ? { ...old, common: { ...old.common, ...common } } : old
      );
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

export function useSetState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, val, ack }: { id: string; val: unknown; ack?: boolean }) => setState(id, val, ack),
    onMutate: async ({ id, val, ack }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.states.valuesRoot });
      await queryClient.cancelQueries({ queryKey: queryKeys.states.detail(id) });

      const prevBatch = queryClient.getQueriesData<Record<string, IoBrokerState>>({ queryKey: queryKeys.states.valuesRoot });
      const prevDetail = queryClient.getQueryData<IoBrokerState>(queryKeys.states.detail(id));

      const now = Date.now();

      queryClient.setQueriesData<Record<string, IoBrokerState>>(
        { queryKey: queryKeys.states.valuesRoot },
        (old) => {
          if (!old || !(id in old)) return old;
          return { ...old, [id]: { ...old[id], val, ts: now, ack: ack ?? false } };
        }
      );

      if (prevDetail) {
        queryClient.setQueryData<IoBrokerState>(
          queryKeys.states.detail(id),
          { ...prevDetail, val, ts: now, ack: ack ?? false }
        );
      }

      return { prevBatch, prevDetail };
    },
    onError: (_error, { id }, context) => {
      if (context?.prevBatch) {
        for (const [queryKey, data] of context.prevBatch) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      if (context?.prevDetail) {
        queryClient.setQueryData(queryKeys.states.detail(id), context.prevDetail);
      }
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.states.detail(id) });
    },
  });
}

export function useCreateDatapoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, common, initialValue, objectType = 'state', roomEnumId, functionEnumId }: {
      id: string;
      common: Partial<IoBrokerObjectCommon>;
      initialValue?: string;
      objectType?: 'state' | 'folder' | 'device' | 'channel';
      roomEnumId?: string | null;
      functionEnumId?: string | null;
    }) => {
      await createObject(id, common, objectType);
      if (objectType === 'state' && initialValue !== undefined && initialValue !== '') {
        await setState(id, initialValue);
      }
      if (roomEnumId) {
        await updateRoomMembership(id, null, roomEnumId);
      }
      if (functionEnumId) {
        await updateFunctionMembership(id, null, functionEnumId);
      }
    },
    onSuccess: (_data, { id, common, objectType = 'state' }) => {
      queryClient.setQueriesData(
        { queryKey: queryKeys.objects.root },
        (old: Record<string, IoBrokerObject> | undefined) => {
          if (!old) return old;
          return {
            ...old,
            [id]: {
              _id: id,
              type: objectType,
              common: common as IoBrokerObjectCommon,
              native: {},
            } as IoBrokerObject,
          };
        }
      );
    },
    onSettled: (_data, _error, vars) => {
      if (vars.roomEnumId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.metadata.roomMap });
      }
      if (vars.functionEnumId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.metadata.functionMap });
      }
    },
  });
}

export function useImportDatapoints() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data, existingIds }: { data: Record<string, IoBrokerObject>; existingIds?: Set<string> }) => importDatapoints(data, existingIds),
    onSettled: () => {
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

export function useDeleteSubtree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, allObjects }: { id: string; allObjects: Record<string, IoBrokerObject> }) => {
      const prefix = id + '.';
      const ids = Object.keys(allObjects).filter(k => k === id || k.startsWith(prefix));
      return deleteObjectsMany(ids.length > 0 ? ids : [id]);
    },
    onSuccess: (_data, { id, allObjects }) => {
      const prefix = id + '.';
      const idsToRemove = new Set(Object.keys(allObjects).filter(k => k === id || k.startsWith(prefix)));
      idsToRemove.add(id);
      queryClient.setQueriesData(
        { queryKey: queryKeys.objects.root },
        (old: Record<string, IoBrokerObject> | undefined) => {
          if (!old) return old;
          const next = { ...old };
          for (const k of idsToRemove) delete next[k];
          return next;
        }
      );
    },
  });
}

export function useRenameDatapoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ oldId, newId, obj, currentVal }: {
      oldId: string;
      newId: string;
      obj: IoBrokerObject;
      currentVal?: { val: unknown; ack?: boolean };
    }) => renameDatapoint(oldId, newId, obj, currentVal),
    onSuccess: (_data, { oldId, newId, obj }) => {
      queryClient.setQueriesData(
        { queryKey: queryKeys.objects.root },
        (old: Record<string, IoBrokerObject> | undefined) => {
          if (!old) return old;
          const next = { ...old };
          delete next[oldId];
          next[newId] = { ...obj, _id: newId };
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

export function useRefreshScriptUsedIds(allObjectIds: string[]) {
  const queryClient = useQueryClient();
  return () => {
    clearScriptUsedIdsCache();
    queryClient.invalidateQueries({ queryKey: queryKeys.scripts.sources });
    queryClient.fetchQuery({
      queryKey: queryKeys.scripts.sources,
      queryFn: () => getScriptUsedIds(allObjectIds, true),
      staleTime: 0,
    });
  };
}

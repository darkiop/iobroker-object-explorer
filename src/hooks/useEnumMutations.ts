import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  updateFunctionMembership, updateFunctionMembershipBatch,
  updateRoomMembership, updateRoomMembershipBatch,
  createEnumObject, renameEnumObject, deleteObject,
} from '../api/iobroker';
import { queryKeys } from './queryKeys';

export function useUpdateFunctionMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ objectId, oldFnEnumId, newFnEnumId }: { objectId: string; oldFnEnumId: string | null; newFnEnumId: string | null }) =>
      updateFunctionMembership(objectId, oldFnEnumId, newFnEnumId),
    onMutate: async ({ objectId, newFnEnumId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.metadata.functionMap });
      const prev = queryClient.getQueryData<Record<string, string>>(queryKeys.metadata.functionMap);
      const enums = queryClient.getQueryData<Array<{ id: string; name: string }>>(queryKeys.metadata.functionEnums) ?? [];
      const enumNameById = new Map(enums.map((entry) => [entry.id, entry.name]));
      const next: Record<string, string> = { ...(prev ?? {}) };
      if (newFnEnumId) {
        next[objectId] = enumNameById.get(newFnEnumId) ?? next[objectId] ?? '';
      } else {
        delete next[objectId];
      }
      queryClient.setQueryData(queryKeys.metadata.functionMap, next);
      return { prev };
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData(queryKeys.metadata.functionMap, context?.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metadata.functionMap });
    },
  });
}

export function useUpdateFunctionMembershipBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ objectIds, newFnEnumId }: { objectIds: string[]; newFnEnumId: string | null }) =>
      updateFunctionMembershipBatch(objectIds, newFnEnumId),
    onMutate: async ({ objectIds, newFnEnumId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.metadata.functionMap });
      const prev = queryClient.getQueryData<Record<string, string>>(queryKeys.metadata.functionMap);
      const enums = queryClient.getQueryData<Array<{ id: string; name: string }>>(queryKeys.metadata.functionEnums) ?? [];
      const enumNameById = new Map(enums.map((entry) => [entry.id, entry.name]));
      const next: Record<string, string> = { ...(prev ?? {}) };
      for (const objectId of objectIds) {
        if (newFnEnumId) {
          next[objectId] = enumNameById.get(newFnEnumId) ?? next[objectId] ?? '';
        } else {
          delete next[objectId];
        }
      }
      queryClient.setQueryData(queryKeys.metadata.functionMap, next);
      return { prev };
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData(queryKeys.metadata.functionMap, context?.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metadata.functionMap });
    },
  });
}

export function useUpdateRoomMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ objectId, oldRoomEnumId, newRoomEnumId }: { objectId: string; oldRoomEnumId: string | null; newRoomEnumId: string | null }) =>
      updateRoomMembership(objectId, oldRoomEnumId, newRoomEnumId),
    onMutate: async ({ objectId, newRoomEnumId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.metadata.roomMap });
      const prev = queryClient.getQueryData<Record<string, string>>(queryKeys.metadata.roomMap);
      const enums = queryClient.getQueryData<Array<{ id: string; name: string }>>(queryKeys.metadata.roomEnums) ?? [];
      const enumNameById = new Map(enums.map((entry) => [entry.id, entry.name]));
      const next: Record<string, string> = { ...(prev ?? {}) };
      if (newRoomEnumId) {
        next[objectId] = enumNameById.get(newRoomEnumId) ?? next[objectId] ?? '';
      } else {
        delete next[objectId];
      }
      queryClient.setQueryData(queryKeys.metadata.roomMap, next);
      return { prev };
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData(queryKeys.metadata.roomMap, context?.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metadata.roomMap });
    },
  });
}

export function useUpdateRoomMembershipBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ objectIds, newRoomEnumId }: { objectIds: string[]; newRoomEnumId: string | null }) =>
      updateRoomMembershipBatch(objectIds, newRoomEnumId),
    onMutate: async ({ objectIds, newRoomEnumId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.metadata.roomMap });
      const prev = queryClient.getQueryData<Record<string, string>>(queryKeys.metadata.roomMap);
      const enums = queryClient.getQueryData<Array<{ id: string; name: string }>>(queryKeys.metadata.roomEnums) ?? [];
      const enumNameById = new Map(enums.map((entry) => [entry.id, entry.name]));
      const next: Record<string, string> = { ...(prev ?? {}) };
      for (const objectId of objectIds) {
        if (newRoomEnumId) {
          next[objectId] = enumNameById.get(newRoomEnumId) ?? next[objectId] ?? '';
        } else {
          delete next[objectId];
        }
      }
      queryClient.setQueryData(queryKeys.metadata.roomMap, next);
      return { prev };
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData(queryKeys.metadata.roomMap, context?.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metadata.roomMap });
    },
  });
}

export function useCreateEnum() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ enumId, name }: { enumId: string; name: string }) => createEnumObject(enumId, name),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metadata.roomEnums });
      queryClient.invalidateQueries({ queryKey: queryKeys.metadata.functionEnums });
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
    },
  });
}

export function useRenameEnum() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ enumId, newName }: { enumId: string; newName: string }) => renameEnumObject(enumId, newName),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metadata.roomEnums });
      queryClient.invalidateQueries({ queryKey: queryKeys.metadata.functionEnums });
      queryClient.invalidateQueries({ queryKey: queryKeys.metadata.roomMap });
      queryClient.invalidateQueries({ queryKey: queryKeys.metadata.functionMap });
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
    },
  });
}

export function useDeleteEnum() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enumId: string) => deleteObject(enumId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metadata.roomEnums });
      queryClient.invalidateQueries({ queryKey: queryKeys.metadata.functionEnums });
      queryClient.invalidateQueries({ queryKey: queryKeys.metadata.roomMap });
      queryClient.invalidateQueries({ queryKey: queryKeys.metadata.functionMap });
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.all });
    },
  });
}

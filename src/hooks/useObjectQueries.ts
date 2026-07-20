import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  getObjectsByPattern, getStateObjectsFastCached, getStatesBatch, getState,
  getObject, getObjectFresh, getHistory, getDpOverview, getDbStats, getDpValues, getDpNumericIdMap, resolveDpNumericId, getAllRoles, getAllUnits,
  getRoomMap, getAllObjectsCached, getRoomEnums, getFunctionMap, getFunctionEnums,
  buildAliasReverseMap, getCustomSupportedInstances, getAllScriptSourcesCached,
  getScriptUsedIds, findScriptsUsingObject, compilePattern, isGlobPattern,
} from '../api/iobroker';
import type { IoBrokerState, HistoryOptions } from '../types/iobroker';
import { queryKeys, usePageVisible } from './queryKeys';

export function useStateObjectsFast() {
  return useQuery({
    queryKey: ['objects', 'bootstrap'] as const,
    queryFn: getStateObjectsFastCached,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useFilteredObjects(pattern: string, fulltext = true, exact = false, fieldFilters?: { id?: string; name?: string; desc?: string }) {
  const { data: fastObjects } = useStateObjectsFast();

  const placeholderData = useMemo<Record<string, import('../types/iobroker').IoBrokerObject> | undefined>(() => {
    if (!fastObjects) return undefined;
    if (pattern === '*') return fastObjects;
    if (isGlobPattern(pattern)) {
      try {
        const regex = compilePattern(pattern);
        const result: Record<string, import('../types/iobroker').IoBrokerObject> = {};
        for (const [id, obj] of Object.entries(fastObjects)) {
          if (regex.test(id)) result[id] = obj;
        }
        return result;
      } catch { return undefined; }
    }
    const q = pattern.toLowerCase();
    const result: Record<string, import('../types/iobroker').IoBrokerObject> = {};
    for (const [id, obj] of Object.entries(fastObjects)) {
      if (id.toLowerCase().includes(q)) result[id] = obj;
    }
    return result;
  }, [fastObjects, pattern]);

  return useQuery({
    queryKey: queryKeys.objects.filtered(pattern, fulltext, exact, fieldFilters),
    queryFn: () => getObjectsByPattern(pattern, fulltext, exact, fieldFilters),
    enabled: pattern.length > 0,
    staleTime: Infinity,
    placeholderData,
  });
}

export function useAllObjects(refetchInterval?: number | false) {
  return useQuery({
    queryKey: queryKeys.objects.all,
    queryFn: () => getAllObjectsCached(),
    staleTime: Infinity,
    refetchInterval: refetchInterval ?? false,
  });
}

export function useStateValues(ids: string[], refetchInterval: number | false = 30_000) {
  const pageVisible = usePageVisible();
  const sortedIds = [...ids].sort();
  return useQuery({
    queryKey: queryKeys.states.values(sortedIds),
    queryFn: () => getStatesBatch(ids),
    enabled: ids.length > 0 && pageVisible,
    refetchInterval: refetchInterval === false ? false : refetchInterval,
  });
}

export function useAliasMap() {
  return useQuery({
    queryKey: queryKeys.objects.all,
    queryFn: getAllObjectsCached,
    staleTime: Infinity,
    select: buildAliasReverseMap,
  });
}

export function useStateDetail(id: string | null) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: id ? queryKeys.states.detail(id) : [...queryKeys.states.detail('__none__')] as const,
    queryFn: () => getState(id!),
    enabled: !!id,
    refetchInterval: 30_000,
    initialData: () => {
      if (!id) return undefined;
      const batchCaches = queryClient.getQueriesData<Record<string, IoBrokerState>>({ queryKey: queryKeys.states.valuesRoot });
      for (const [, data] of batchCaches) {
        if (data && id in data) return data[id];
      }
      return undefined;
    },
  });
}

export function useObjectDetail(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.objects.detail(id) : [...queryKeys.objects.detail('__none__')] as const,
    queryFn: () => getObject(id!),
    enabled: !!id,
  });
}

export function useObjectFresh(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: id ? [...queryKeys.objects.detail(id), 'fresh'] as const : [...queryKeys.objects.detail('__none__'), 'fresh'] as const,
    queryFn: () => getObjectFresh(id!),
    enabled: !!id && enabled,
    staleTime: 0,
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

export function useDpOverview(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.history.dpOverview,
    queryFn: getDpOverview,
    enabled,
    staleTime: 60_000,
  });
}

export function useDpNumericIds(enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.history.dpOverview, 'numericIds'] as const,
    queryFn: getDpNumericIdMap,
    enabled,
    staleTime: 60_000,
  });
}

export function useDbStats(enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.history.dpOverview, 'stats'] as const,
    queryFn: getDbStats,
    enabled,
    staleTime: 60_000,
  });
}

export function useDpValues(
  id: string | null,
  type: unknown,
  page: number,
  pageSize: number,
  startTs?: number | null,
  endTs?: number | null,
) {
  return useQuery({
    queryKey: ['history', 'dpValues', id, String(type), page, pageSize, startTs ?? null, endTs ?? null] as const,
    queryFn: () => getDpValues(id!, type, pageSize, page * pageSize, startTs, endTs),
    enabled: !!id,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

// Numeric datapoints.id of a state — immutable for a given name, so never stale.
export function useDpNumericId(id: string | null) {
  return useQuery({
    queryKey: ['history', 'dpNumericId', id] as const,
    queryFn: () => resolveDpNumericId(id!),
    enabled: !!id,
    staleTime: Infinity,
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

export function useRoomEnums() {
  return useQuery({
    queryKey: queryKeys.metadata.roomEnums,
    queryFn: getRoomEnums,
    staleTime: Infinity,
  });
}

export function useCustomSupportedInstances() {
  return useQuery({
    queryKey: ['metadata', 'customSupportedInstances'] as const,
    queryFn: getCustomSupportedInstances,
    staleTime: 60_000,
  });
}

export function useScriptUsedIds(allObjectIds: string[], enabled = true) {
  return useQuery({
    queryKey: queryKeys.scripts.sources,
    queryFn: () => getScriptUsedIds(allObjectIds),
    staleTime: Infinity,
    enabled,
  });
}

export function useAllScriptSources(enabled = true) {
  return useQuery({
    queryKey: ['scripts', 'sources-raw'],
    queryFn: getAllScriptSourcesCached,
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useScriptUsages(objectId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.scripts.usages(objectId),
    queryFn: () => findScriptsUsingObject(objectId),
    enabled,
    staleTime: 60_000,
  });
}

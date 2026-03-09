import type { IoBrokerObject } from '../types/iobroker';

type ColumnFilterKey = 'id' | 'name' | 'room' | 'function' | 'type' | 'role' | 'unit' | 'write' | 'history' | 'smart' | 'alias';
type ColumnFilters = Partial<Record<ColumnFilterKey, string>>;

interface FilterObjectIdsParams {
  ids: string[];
  objects: Record<string, IoBrokerObject>;
  roomMap: Record<string, string>;
  functionMap: Record<string, string>;
  historyIds: Set<string>;
  smartIds: Set<string>;
  aliasMap: Map<string, string[]>;
  colFilters: ColumnFilters;
  roomFilters: Set<string>;
  functionFilters: Set<string>;
  quickPatterns: Set<string>;
  patternRoomFilter?: string | null;
  patternFunctionFilter?: string | null;
  danglingAliases?: boolean;
  allObjectIds?: Set<string>;
}

function quickPatternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function getNameLowerCase(obj: IoBrokerObject | undefined): string {
  const n = obj?.common?.name;
  if (typeof n === 'string') return n.toLowerCase();
  if (!n) return '';
  return String(n.de || n.en || Object.values(n)[0] || '').toLowerCase();
}

export function filterObjectIds({
  ids,
  objects,
  roomMap,
  functionMap,
  historyIds,
  smartIds,
  aliasMap,
  colFilters,
  roomFilters,
  functionFilters,
  quickPatterns,
  patternRoomFilter,
  patternFunctionFilter,
  danglingAliases,
  allObjectIds,
}: FilterObjectIdsParams): string[] {
  // Pre-compute filter values once before the single pass
  const fId = colFilters.id?.trim().toLowerCase() || null;
  const fName = colFilters.name?.trim().toLowerCase() || null;
  const fRoom = colFilters.room?.trim().toLowerCase() || null;
  const fFunction = colFilters.function?.trim().toLowerCase() || null;
  const fType = colFilters.type?.trim().toLowerCase() || null;
  const fRole = colFilters.role?.trim().toLowerCase() || null;
  const fUnit = colFilters.unit?.trim().toLowerCase() || null;
  const filterReadOnly = colFilters.write === '1';
  const filterHistory = colFilters.history === '1';
  const filterSmart = colFilters.smart === '1';
  const filterAlias = colFilters.alias === '1';
  const fPatternRoom = patternRoomFilter?.toLowerCase() ?? null;
  const fPatternFunction = patternFunctionFilter?.toLowerCase() ?? null;
  const quickRegexes = quickPatterns.size > 0 ? [...quickPatterns].map(quickPatternToRegex) : null;

  return ids.filter((id) => {
    if (fId && !id.toLowerCase().includes(fId)) return false;

    const obj = objects[id];

    if (fName && !getNameLowerCase(obj).includes(fName)) return false;

    const room = roomMap[id] || '';
    if (fRoom && !room.toLowerCase().includes(fRoom)) return false;
    if (roomFilters.size > 0 && !roomFilters.has(roomMap[id])) return false;
    if (fPatternRoom && !room.toLowerCase().includes(fPatternRoom)) return false;

    const func = functionMap[id] || '';
    if (fFunction && !func.toLowerCase().includes(fFunction)) return false;
    if (functionFilters.size > 0 && !functionFilters.has(functionMap[id])) return false;
    if (fPatternFunction && !func.toLowerCase().includes(fPatternFunction)) return false;

    if (fType && !(obj?.common?.type || obj?.type || '').toLowerCase().includes(fType)) return false;
    if (fRole && !(obj?.common?.role || '').toLowerCase().includes(fRole)) return false;
    if (fUnit && !(obj?.common?.unit || '').toLowerCase().includes(fUnit)) return false;

    if (filterReadOnly && obj?.common?.write !== false) return false;
    if (filterHistory && !historyIds.has(id)) return false;
    if (filterSmart && !smartIds.has(id)) return false;
    if (filterAlias && !aliasMap.has(id) && !obj?.common?.alias?.id) return false;

    if (danglingAliases) {
      if (!id.startsWith('alias.0.')) return false;
      const rawId = obj?.common?.alias?.id;
      const targets: string[] = typeof rawId === 'object'
        ? [rawId?.read, rawId?.write].filter((t): t is string => !!t)
        : rawId ? [rawId] : [];
      if (targets.length === 0) return true; // alias without any target defined = dangling
      if (allObjectIds) return targets.every((t) => !allObjectIds.has(t)); // all targets missing = dangling
      return false;
    }

    if (quickRegexes && !quickRegexes.some((rx) => rx.test(id))) return false;

    return true;
  });
}

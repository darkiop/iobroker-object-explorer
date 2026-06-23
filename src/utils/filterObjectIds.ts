import type { IoBrokerObject } from '../types/iobroker';
import { EMPTY_SENTINEL } from '../components/statelist/BatchComboControl';

export const NO_ROOM_SENTINEL = '__no_room__';

type ColumnFilterKey = 'id' | 'name' | 'room' | 'function' | 'type' | 'role' | 'unit' | 'write' | 'history' | 'custom' | 'smart' | 'alias' | 'scripts';
type ColumnFilters = Partial<Record<ColumnFilterKey, string>>;

interface FilterObjectIdsParams {
  ids: string[];
  objects: Record<string, IoBrokerObject>;
  roomMap: Record<string, string>;
  functionMap: Record<string, string>;
  historyIds: Set<string>;
  customIds: Set<string>;
  smartIds: Set<string>;
  aliasMap: Map<string, string[]>;
  colFilters: ColumnFilters;
  roomFilters: Set<string>;
  functionFilters: Set<string>;
  quickPatterns: Set<string>;
  patternRoomFilter?: string | null;
  patternFunctionFilter?: string | null;
  patternTypeFilter?: string | null;
  patternRoleFilter?: string | null;
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
  customIds,
  smartIds,
  aliasMap,
  colFilters,
  roomFilters,
  functionFilters,
  quickPatterns,
  patternRoomFilter,
  patternFunctionFilter,
  patternTypeFilter,
  patternRoleFilter,
  danglingAliases,
  allObjectIds,
}: FilterObjectIdsParams): string[] {
  // Pre-compute filter values once before the single pass
  const fId = colFilters.id?.trim().toLowerCase() || null;
  const fName = colFilters.name?.trim().toLowerCase() || null;
  const fRoomRaw = colFilters.room?.trim() || null;
  const fRoom = fRoomRaw === EMPTY_SENTINEL ? null : fRoomRaw?.toLowerCase() || null;
  const fRoomEmpty = fRoomRaw === EMPTY_SENTINEL;
  const fFunctionRaw = colFilters.function?.trim() || null;
  const fFunction = fFunctionRaw === EMPTY_SENTINEL ? null : fFunctionRaw?.toLowerCase() || null;
  const fFunctionEmpty = fFunctionRaw === EMPTY_SENTINEL;
  const fTypeRaw = colFilters.type?.trim() || null;
  const fType = fTypeRaw === EMPTY_SENTINEL ? null : fTypeRaw?.toLowerCase() || null;
  const fTypeEmpty = fTypeRaw === EMPTY_SENTINEL;
  const fRoleRaw = colFilters.role?.trim() || null;
  const fRole = fRoleRaw === EMPTY_SENTINEL ? null : fRoleRaw?.toLowerCase() || null;
  const fRoleEmpty = fRoleRaw === EMPTY_SENTINEL;
  const fUnitRaw = colFilters.unit?.trim() || null;
  const fUnit = fUnitRaw === EMPTY_SENTINEL ? null : fUnitRaw?.toLowerCase() || null;
  const fUnitEmpty = fUnitRaw === EMPTY_SENTINEL;
  const filterReadOnly = colFilters.write === '1';
  const filterHistory = colFilters.history === '1';
  const filterCustom = colFilters.custom === '1';
  const filterSmart = colFilters.smart === '1';
  const filterAlias = colFilters.alias === '1';
  const fPatternRoom = patternRoomFilter?.toLowerCase() ?? null;
  const fPatternFunction = patternFunctionFilter?.toLowerCase() ?? null;
  const fPatternType = patternTypeFilter?.toLowerCase() ?? null;
  const fPatternRole = patternRoleFilter?.toLowerCase() ?? null;
  const quickRegexes = quickPatterns.size > 0 ? [...quickPatterns].map(quickPatternToRegex) : null;

  return ids.filter((id) => {
    if (fId && !id.toLowerCase().includes(fId)) return false;

    const obj = objects[id];

    if (fName && !getNameLowerCase(obj).includes(fName)) return false;

    const room = roomMap[id] || '';
    if (fRoomEmpty && room !== '') return false;
    if (fRoom && !room.toLowerCase().includes(fRoom)) return false;
    if (roomFilters.size > 0 && !roomFilters.has(roomMap[id])) return false;
    if (fPatternRoom) {
      if (fPatternRoom === NO_ROOM_SENTINEL) { if (room !== '') return false; }
      else if (!room.toLowerCase().includes(fPatternRoom)) return false;
    }

    const func = functionMap[id] || '';
    if (fFunctionEmpty && func !== '') return false;
    if (fFunction && !func.toLowerCase().includes(fFunction)) return false;
    if (functionFilters.size > 0 && !functionFilters.has(functionMap[id])) return false;
    if (fPatternFunction && !func.toLowerCase().includes(fPatternFunction)) return false;

    const objType = (obj?.common?.type || obj?.type || '').toLowerCase();
    if (fTypeEmpty && objType !== '') return false;
    if (fType && !objType.includes(fType)) return false;
    if (fPatternType && !objType.includes(fPatternType)) return false;

    const objRole = (obj?.common?.role || '').toLowerCase();
    if (fRoleEmpty && objRole !== '') return false;
    if (fRole && !objRole.includes(fRole)) return false;
    if (fPatternRole && !objRole.includes(fPatternRole)) return false;
    const objUnit = (obj?.common?.unit || '').toLowerCase();
    if (fUnitEmpty && objUnit !== '') return false;
    if (fUnit && !objUnit.includes(fUnit)) return false;

    if (filterReadOnly && obj?.common?.write !== false) return false;
    if (filterHistory && !historyIds.has(id)) return false;
    if (filterCustom && !customIds.has(id)) return false;
    if (filterSmart && !smartIds.has(id)) return false;
    if (filterAlias && !aliasMap.has(id) && !obj?.common?.alias?.id) return false;

    if (danglingAliases) {
      if (!id.startsWith('alias.0.')) return false;
      if (obj?.type === 'folder' || obj?.type === 'channel' || obj?.type === 'device') return false;
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

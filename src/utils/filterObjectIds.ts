import type { IoBrokerObject } from '../types/iobroker';

type ColumnFilterKey = 'id' | 'name' | 'room' | 'function' | 'role' | 'unit' | 'write' | 'history' | 'smart' | 'alias';
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
}: FilterObjectIdsParams): string[] {
  let next = ids;

  if (colFilters.id?.trim()) {
    const f = colFilters.id.trim().toLowerCase();
    next = next.filter((id) => id.toLowerCase().includes(f));
  }

  if (colFilters.name?.trim()) {
    const f = colFilters.name.trim().toLowerCase();
    next = next.filter((id) => getNameLowerCase(objects[id]).includes(f));
  }

  if (colFilters.room?.trim()) {
    const f = colFilters.room.trim().toLowerCase();
    next = next.filter((id) => (roomMap[id] || '').toLowerCase().includes(f));
  }

  if (colFilters.function?.trim()) {
    const f = colFilters.function.trim().toLowerCase();
    next = next.filter((id) => (functionMap[id] || '').toLowerCase().includes(f));
  }

  if (colFilters.role?.trim()) {
    const f = colFilters.role.trim().toLowerCase();
    next = next.filter((id) => (objects[id]?.common?.role || '').toLowerCase().includes(f));
  }

  if (colFilters.unit?.trim()) {
    const f = colFilters.unit.trim().toLowerCase();
    next = next.filter((id) => (objects[id]?.common?.unit || '').toLowerCase().includes(f));
  }

  if (colFilters.write === '1') next = next.filter((id) => objects[id]?.common?.write === false);
  if (colFilters.history === '1') next = next.filter((id) => historyIds.has(id));
  if (colFilters.smart === '1') next = next.filter((id) => smartIds.has(id));
  if (colFilters.alias === '1') next = next.filter((id) => aliasMap.has(id) || !!objects[id]?.common?.alias?.id);

  if (roomFilters.size > 0) next = next.filter((id) => roomFilters.has(roomMap[id]));
  if (functionFilters.size > 0) next = next.filter((id) => functionFilters.has(functionMap[id]));

  if (quickPatterns.size > 0) {
    const quickRegexes = [...quickPatterns].map(quickPatternToRegex);
    next = next.filter((id) => quickRegexes.some((rx) => rx.test(id)));
  }

  return next;
}

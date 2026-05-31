import { useState, useEffect } from 'react';
import type { HistoryOptions } from '../types/iobroker';

export const queryKeys = {
  objects: {
    root: ['objects'] as const,
    all: ['objects', 'all'] as const,
    filtered: (pattern: string, fulltext: boolean, exact: boolean) => ['objects', 'filtered', pattern, fulltext, exact] as const,
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
  scripts: {
    usages: (objectId: string) => ['scripts', 'usages', objectId] as const,
    sources: ['scripts', 'sources'] as const,
  },
};

export function usePageVisible() {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const handler = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);
  return visible;
}

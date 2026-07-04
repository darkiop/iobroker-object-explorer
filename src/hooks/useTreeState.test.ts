import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTreeState } from './useTreeState';
import type { IoBrokerObject } from '../types/iobroker';
import type { AppSettings } from '../context/UIContext';

function makeObj(id: string, type: IoBrokerObject['type']): IoBrokerObject {
  return { _id: id, type, common: { name: id }, native: {} } as IoBrokerObject;
}

describe('useTreeState expandableSet', () => {
  it('marks a folder with a nested state as expandable, and a folder with only hidden children as not', () => {
    const allObjects: Record<string, IoBrokerObject> = {
      'adapter.0': makeObj('adapter.0', 'folder'),
      'adapter.0.deviceA': makeObj('adapter.0.deviceA', 'device'),
      'adapter.0.deviceA.state1': makeObj('adapter.0.deviceA.state1', 'state'),
      'adapter.0.emptyFolder': makeObj('adapter.0.emptyFolder', 'folder'),
    };
    const stateIds = ['adapter.0.deviceA.state1'];

    const { result } = renderHook(() =>
      useTreeState({
        stateIds,
        allObjects,
        historyIds: new Set<string>(),
        smartIds: new Set<string>(),
        treeSearch: '',
        historyOnly: false,
        smartOnly: false,
        treeExpandSignal: { depth: 0, seq: 0 },
        appSettings: { treeViewMode: 'path' } as AppSettings,
        persistSettings: () => {},
      })
    );

    expect(result.current.expandableSet.has('adapter.0')).toBe(true);
    expect(result.current.expandableSet.has('adapter.0.deviceA')).toBe(false);
  });
});

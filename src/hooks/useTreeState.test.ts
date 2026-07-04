import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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

  it('propagates expandability up through an intermediate node that is itself hidden by a filter', () => {
    // Chain: adapter.0 (folder) > folderX (folder) > deviceA (device, HIDDEN via showDevices=false)
    //        > channelB (channel, visible via showChannels=true) > state1 (leaf)
    // With showDevices=false, deviceA is not directly visible (shouldShowNodeType(deviceA) = false),
    // so deviceA's own expandable entry can ONLY come from the recursive childExpandable branch
    // (its child channelB is directly visible), not from childVisible. This forces the test to
    // actually exercise buildExpandableSet's OR-propagation through more than one hop, rather than
    // every ancestor being trivially expandable via a directly-visible child.
    const allObjects: Record<string, IoBrokerObject> = {
      'adapter.0': makeObj('adapter.0', 'folder'),
      'adapter.0.folderX': makeObj('adapter.0.folderX', 'folder'),
      'adapter.0.folderX.deviceA': makeObj('adapter.0.folderX.deviceA', 'device'),
      'adapter.0.folderX.deviceA.channelB': makeObj('adapter.0.folderX.deviceA.channelB', 'channel'),
      'adapter.0.folderX.deviceA.channelB.state1': makeObj('adapter.0.folderX.deviceA.channelB.state1', 'state'),
    };
    const stateIds = ['adapter.0.folderX.deviceA.channelB.state1'];

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

    act(() => { result.current.setShowDevices(false); });

    // deviceA itself is hidden (showDevices=false), so it's only in the expandable
    // set via its visible channel child — this is the direct childVisible case.
    expect(result.current.expandableSet.has('adapter.0.folderX.deviceA')).toBe(true);
    // folderX's only child, deviceA, is NOT directly visible (device type, hidden) —
    // folderX can only be expandable via the recursive childExpandable branch, since
    // deviceA is itself expandable (per the assertion above). This is the propagation
    // path the previous version of this test failed to exercise.
    expect(result.current.expandableSet.has('adapter.0.folderX')).toBe(true);
    // adapter.0's child folderX IS directly visible (folder, showFolders=true by default),
    // so this one alone would pass even without correct recursion — kept for completeness.
    expect(result.current.expandableSet.has('adapter.0')).toBe(true);
  });
});

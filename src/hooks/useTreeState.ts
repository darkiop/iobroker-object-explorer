import { useState, useMemo, useEffect, useRef } from 'react';
import type { IoBrokerObject, TreeNode } from '../types/iobroker';
import type { AppSettings } from '../context/UIContext';

function buildTree(ids: string[], structureIds: string[] = []): TreeNode {
  const root: TreeNode = { name: 'root', fullPath: '', children: new Map(), isLeaf: false, count: 0, totalCount: 0 };
  for (const id of ids) {
    root.count = (root.count ?? 0) + 1;
    root.totalCount = (root.totalCount ?? 0) + 1;
    const parts = id.split('.');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const fullPath = parts.slice(0, i + 1).join('.');
      if (!current.children.has(part)) {
        current.children.set(part, { name: part, fullPath, children: new Map(), isLeaf: i === parts.length - 1, count: 0, totalCount: 0 });
      }
      current = current.children.get(part)!;
      current.count = (current.count ?? 0) + 1;
      current.totalCount = (current.totalCount ?? 0) + 1;
      if (i === parts.length - 1) current.isLeaf = true;
    }
  }
  for (const id of structureIds) {
    const parts = id.split('.');
    let current = root;
    root.totalCount = (root.totalCount ?? 0) + 1;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const fullPath = parts.slice(0, i + 1).join('.');
      if (!current.children.has(part)) {
        current.children.set(part, { name: part, fullPath, children: new Map(), isLeaf: false, count: 0, totalCount: 0 });
      }
      current = current.children.get(part)!;
      current.totalCount = (current.totalCount ?? 0) + 1;
    }
  }
  return root;
}

function buildAdapterTree(ids: string[], structureIds: string[] = []): TreeNode {
  const root: TreeNode = { name: 'root', fullPath: '', children: new Map(), isLeaf: false, count: 0, totalCount: 0 };
  for (const id of ids) {
    root.count = (root.count ?? 0) + 1;
    root.totalCount = (root.totalCount ?? 0) + 1;
    const parts = id.split('.');
    const adapterKey = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0];
    if (!root.children.has(adapterKey)) {
      root.children.set(adapterKey, { name: adapterKey, fullPath: adapterKey, children: new Map(), isLeaf: false, count: 0, totalCount: 0 });
    }
    const adapterNode = root.children.get(adapterKey)!;
    adapterNode.count = (adapterNode.count ?? 0) + 1;
    adapterNode.totalCount = (adapterNode.totalCount ?? 0) + 1;
    const remaining = parts.slice(parts.length >= 2 ? 2 : 1);
    let current = adapterNode;
    for (let i = 0; i < remaining.length; i++) {
      const seg = remaining[i];
      const childPath = `${current.fullPath}.${seg}`;
      if (!current.children.has(seg)) {
        current.children.set(seg, { name: seg, fullPath: childPath, children: new Map(), isLeaf: i === remaining.length - 1, count: 0, totalCount: 0 });
      }
      current = current.children.get(seg)!;
      current.count = (current.count ?? 0) + 1;
      current.totalCount = (current.totalCount ?? 0) + 1;
      if (i === remaining.length - 1) current.isLeaf = true;
    }
  }
  for (const id of structureIds) {
    root.totalCount = (root.totalCount ?? 0) + 1;
    const parts = id.split('.');
    const adapterKey = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0];
    if (!root.children.has(adapterKey)) {
      root.children.set(adapterKey, { name: adapterKey, fullPath: adapterKey, children: new Map(), isLeaf: false, count: 0, totalCount: 0 });
    }
    const adapterNode = root.children.get(adapterKey)!;
    adapterNode.totalCount = (adapterNode.totalCount ?? 0) + 1;
    const remaining = parts.slice(parts.length >= 2 ? 2 : 1);
    let current = adapterNode;
    for (let i = 0; i < remaining.length; i++) {
      const seg = remaining[i];
      const childPath = `${current.fullPath}.${seg}`;
      if (!current.children.has(seg)) {
        current.children.set(seg, { name: seg, fullPath: childPath, children: new Map(), isLeaf: false, count: 0, totalCount: 0 });
      }
      current = current.children.get(seg)!;
      current.totalCount = (current.totalCount ?? 0) + 1;
    }
  }
  return root;
}

interface UseTreeStateParams {
  stateIds: string[];
  allObjects: Record<string, IoBrokerObject>;
  historyIds: Set<string>;
  smartIds: Set<string>;
  treeSearch: string;
  historyOnly: boolean;
  smartOnly: boolean;
  treeExpandSignal: { depth: number; seq: number } | null | undefined;
  appSettings: AppSettings;
  persistSettings: (s: AppSettings) => void;
}

export function useTreeState({
  stateIds,
  allObjects,
  historyIds,
  smartIds,
  treeSearch,
  historyOnly,
  smartOnly,
  treeExpandSignal,
  appSettings,
  persistSettings,
}: UseTreeStateParams) {
  const [expandSignal, setExpandSignal] = useState<{ depth: number; seq: number }>({ depth: 0, seq: 0 });
  const [showFolders, setShowFolders] = useState(true);
  const [showDevices, setShowDevices] = useState(true);
  const [showChannels, setShowChannels] = useState(true);
  const [treeViewMode, setTreeViewMode] = useState<'path' | 'adapter'>(appSettings.treeViewMode);

  const prevExpandSeqRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!treeExpandSignal) return;
    if (treeExpandSignal.seq === prevExpandSeqRef.current) return;
    prevExpandSeqRef.current = treeExpandSignal.seq;
    setExpandSignal(s => ({ depth: treeExpandSignal.depth, seq: s.seq + 1 }));
  }, [treeExpandSignal]);

  function handleTreeViewModeChange(m: 'adapter' | 'path') {
    setTreeViewMode(m);
    persistSettings({ ...appSettings, treeViewMode: m });
  }

  function matchesTreeSearch(id: string, lower: string): boolean {
    if (!lower) return true;
    const idLower = id.toLowerCase();
    if (lower.includes('.')) {
      return idLower === lower || idLower.startsWith(lower + '.');
    }
    const parts = id.split('.');
    const topLevel = treeViewMode === 'adapter'
      ? (parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0])
      : parts[0];
    return topLevel.toLowerCase().includes(lower);
  }

  const filteredIds = useMemo(() => {
    const lower = treeSearch.toLowerCase();
    return stateIds.filter((id) =>
      (!historyOnly || historyIds.has(id)) &&
      (!smartOnly || smartIds.has(id)) &&
      matchesTreeSearch(id, lower)
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateIds, historyOnly, historyIds, smartOnly, smartIds, treeSearch, treeViewMode]);

  const structureIds = useMemo(() => {
    const lower = treeSearch.toLowerCase();
    return Object.keys(allObjects).filter(id => {
      const t = allObjects[id]?.type;
      if (!(t === 'folder' || t === 'device' || t === 'channel' || t === 'instance')) return false;
      return matchesTreeSearch(id, lower);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allObjects, treeSearch, treeViewMode]);

  const tree = useMemo(
    () => treeViewMode === 'adapter' ? buildAdapterTree(filteredIds, structureIds) : buildTree(filteredIds, structureIds),
    [filteredIds, structureIds, treeViewMode]
  );

  const sortedChildren = useMemo(
    () => [...tree.children.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [tree.children]
  );

  return {
    expandSignal,
    showFolders, setShowFolders,
    showDevices, setShowDevices,
    showChannels, setShowChannels,
    treeViewMode, handleTreeViewModeChange,
    filteredIds,
    tree,
    sortedChildren,
  };
}

import { useState, useMemo, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Database, ChevronsDownUp, ChevronsUpDown, Copy, Check, Mic2, Search, Cpu, Layers } from 'lucide-react';
import type { TreeNode, IoBrokerObject } from '../types/iobroker';

interface StateTreeProps {
  stateIds: string[];
  allObjects: Record<string, IoBrokerObject>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSearch: (pattern: string) => void;
  historyOnly: boolean;
  onHistoryOnlyChange: (v: boolean) => void;
  smartOnly: boolean;
  onSmartOnlyChange: (v: boolean) => void;
  historyIds: Set<string>;
  smartIds: Set<string>;
  expandToDepth?: { depth: number; seq: number };
}

function buildTree(ids: string[]): TreeNode {
  const root: TreeNode = { name: 'root', fullPath: '', children: new Map(), isLeaf: false };

  for (const id of ids) {
    const parts = id.split('.');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const fullPath = parts.slice(0, i + 1).join('.');
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          fullPath,
          children: new Map(),
          isLeaf: i === parts.length - 1,
        });
      }
      current = current.children.get(part)!;
      if (i === parts.length - 1) {
        current.isLeaf = true;
      }
    }
  }

  return root;
}

function TreeNodeComponent({
  node,
  depth,
  selectedId,
  onSelect,
  onSearch,
  onFolderSearch,
  historyIds,
  smartIds,
  expandSignal,
  allObjects,
}: {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSearch: (pattern: string) => void;
  onFolderSearch: (pattern: string) => void;
  historyIds: Set<string>;
  smartIds: Set<string>;
  expandSignal: { depth: number; seq: number };
  allObjects: Record<string, IoBrokerObject>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasChildren = node.children.size > 0;
  const isFolder = hasChildren && !node.isLeaf;
  const isHistoryEnabled = node.isLeaf && historyIds.has(node.fullPath);
  const isSmartEnabled = node.isLeaf && smartIds.has(node.fullPath);
  const folderTypeRaw = isFolder
    ? (allObjects[node.fullPath]?.type ?? allObjects[node.fullPath]?.common?.type)
    : undefined;
  const childTypes = useMemo(() => {
    if (!isFolder) return new Set<string>();
    const types = new Set<string>();
    for (const child of node.children.values()) {
      const type = allObjects[child.fullPath]?.type ?? allObjects[child.fullPath]?.common?.type;
      if (type) types.add(type);
    }
    return types;
  }, [allObjects, isFolder, node.children]);
  const folderType = isFolder ? resolveFolderType(folderTypeRaw, childTypes) : undefined;
  const sortedChildren = useMemo(
    () => [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [node.children]
  );

  useEffect(() => {
    if (expandSignal.seq === 0) return;
    setExpanded(depth < expandSignal.depth);
  }, [expandSignal]);

  return (
    <div>
      <div
        className={`group/row flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-gray-200/50 dark:hover:bg-gray-700/50 rounded text-sm ${
          selectedId === node.fullPath ? 'bg-blue-600/30 text-blue-600 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
        }`}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        onClick={() => {
          if (node.isLeaf) {
            onSelect(node.fullPath);
          } else if (hasChildren) {
            setExpanded(!expanded);
          }
        }}
      >
        {isFolder && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="shrink-0 p-1 -ml-1 rounded hover:bg-gray-300/60 text-gray-400 hover:text-gray-600 dark:hover:bg-gray-600/60 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
        {!isFolder && <span className="w-5 shrink-0" />}
        {isFolder ? (
          folderType === 'device'
            ? <Cpu size={15} className="text-sky-500/80 shrink-0" title="device" />
            : folderType === 'channel'
              ? <Layers size={15} className="text-indigo-500/80 shrink-0" title="channel" />
              : (
                expanded
                  ? <FolderOpen size={15} className="text-yellow-500/80 shrink-0" title="folder" />
                  : <Folder size={15} className="text-yellow-600/70 shrink-0" title="folder" />
              )
        ) : isHistoryEnabled ? (
          <Database size={14} className="text-blue-400/80 shrink-0" />
        ) : (
          <FileText size={14} className="text-green-400/80 shrink-0" />
        )}
        <span className={`truncate ${node.isLeaf ? (isHistoryEnabled ? 'text-blue-500 dark:text-blue-400' : 'text-green-600 dark:text-green-400') : 'text-gray-600 font-medium dark:text-gray-400'}`}>
          {node.name}
        </span>
        {folderType && (
          <span className="text-[10px] uppercase text-gray-400 dark:text-gray-500 tracking-wide">
            {folderType}
          </span>
        )}
        {isSmartEnabled && (
          <span title="SmartName vorhanden"><Mic2 size={11} className="shrink-0 text-violet-500 dark:text-violet-400" /></span>
        )}
        {isFolder && (
          <button
            onClick={(e) => { e.stopPropagation(); onFolderSearch(`${node.fullPath}.*`); }}
            className="ml-auto shrink-0 opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-opacity"
            title={`Filter: ${node.fullPath}.*`}
          >
            <Search size={12} />
          </button>
        )}
        <button
            onClick={(e) => {
              e.stopPropagation();
              const text = node.isLeaf ? node.fullPath : `${node.fullPath}.*`;
              if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }).catch(() => fallbackCopy(text));
              } else {
                fallbackCopy(text);
              }
              function fallbackCopy(val: string) {
                const ta = document.createElement('textarea');
                ta.value = val;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }
            }}
            className={`${!isFolder ? 'ml-auto' : ''} shrink-0 opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-opacity`}
            title={node.fullPath}
          >
            {copied ? <Check size={12} className="text-green-500 dark:text-green-400" /> : <Copy size={12} />}
          </button>
      </div>
      {expanded &&
        sortedChildren.map((child) => (
          <TreeNodeComponent
            key={child.fullPath}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
            onSearch={onSearch}
            onFolderSearch={onFolderSearch}
            historyIds={historyIds}
            smartIds={smartIds}
            expandSignal={expandSignal}
            allObjects={allObjects}
          />
        ))}
    </div>
  );
}

function resolveFolderType(rawType: string | undefined, childTypes: Set<string>): 'folder' | 'device' | 'channel' {
  if (rawType === 'folder' || rawType === 'device' || rawType === 'channel') {
    return rawType;
  }
  if (childTypes.has('device') || childTypes.has('folder')) return 'folder';
  if (childTypes.has('channel')) return 'device';
  if (childTypes.has('state')) return 'channel';
  return 'folder';
}

export default function StateTree({ stateIds, allObjects, selectedId, onSelect, onSearch, historyOnly, onHistoryOnlyChange, smartOnly, onSmartOnlyChange, historyIds, smartIds, expandToDepth }: StateTreeProps) {
  const [expandSignal, setExpandSignal] = useState<{ depth: number; seq: number }>({ depth: 0, seq: 0 });

  function handleFolderSearch(pattern: string) {
    onSearch(pattern);
    setExpandSignal(s => ({ depth: 9999, seq: s.seq + 1 }));
  }

  useEffect(() => {
    if (!expandToDepth) return;
    setExpandSignal(s => ({ depth: expandToDepth.depth, seq: s.seq + 1 }));
  }, [expandToDepth]);

  const filteredIds = useMemo(() => {
    return stateIds.filter((id) =>
      (!historyOnly || historyIds.has(id)) &&
      (!smartOnly || smartIds.has(id))
    );
  }, [stateIds, historyOnly, historyIds, smartOnly, smartIds]);

  const tree = useMemo(() => buildTree(filteredIds), [filteredIds]);
  const sortedChildren = useMemo(
    () => [...tree.children.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [tree.children]
  );

  return (
    <div className="overflow-y-auto">
      <div className="px-2 py-1.5 flex flex-col gap-1.5">
        <div className="flex gap-1.5">
          <button
            onClick={() => onHistoryOnlyChange(!historyOnly)}
            className={`flex items-center gap-1 flex-1 px-2 py-1 text-xs rounded ${
              historyOnly
                ? 'bg-blue-600/20 text-blue-600 border border-blue-500/40 dark:text-blue-300'
                : 'bg-gray-200/50 text-gray-500 border border-gray-300/50 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-400 dark:border-gray-600/50 dark:hover:bg-gray-700'
            }`}
          >
            <Database size={12} className="shrink-0" />
            <span className="truncate">History</span>
            <span className={`ml-auto shrink-0 ${historyOnly ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>{historyIds.size}</span>
          </button>
          <button
            onClick={() => onSmartOnlyChange(!smartOnly)}
            className={`flex items-center gap-1 flex-1 px-2 py-1 text-xs rounded ${
              smartOnly
                ? 'bg-violet-600/20 text-violet-600 border border-violet-500/40 dark:text-violet-300'
                : 'bg-gray-200/50 text-gray-500 border border-gray-300/50 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-400 dark:border-gray-600/50 dark:hover:bg-gray-700'
            }`}
          >
            <Mic2 size={12} className="shrink-0" />
            <span className="truncate">SmartName</span>
            <span className={`ml-auto shrink-0 ${smartOnly ? 'text-violet-500 dark:text-violet-400' : 'text-gray-400 dark:text-gray-500'}`}>{smartIds.size}</span>
          </button>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setExpandSignal(s => ({ depth: 9999, seq: s.seq + 1 }))}
            className="flex items-center justify-center gap-1 flex-1 px-2 py-1 text-xs rounded bg-gray-200/50 text-gray-500 border border-gray-300/50 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-400 dark:border-gray-600/50 dark:hover:bg-gray-700"
            title="Alle aufklappen"
          >
            <ChevronsUpDown size={13} />
            Aufklappen
          </button>
          <button
            onClick={() => setExpandSignal(s => ({ depth: 0, seq: s.seq + 1 }))}
            className="flex items-center justify-center gap-1 flex-1 px-2 py-1 text-xs rounded bg-gray-200/50 text-gray-500 border border-gray-300/50 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-400 dark:border-gray-600/50 dark:hover:bg-gray-700"
            title="Alle zuklappen"
          >
            <ChevronsDownUp size={13} />
            Zuklappen
          </button>
        </div>
      </div>
      {filteredIds.length === 0 ? (
        <div className="text-gray-400 dark:text-gray-500 text-sm p-4">
          {stateIds.length === 0 ? 'Keine Datenpunkte geladen' : 'Keine Datenpunkte gefunden'}
        </div>
      ) : (
        sortedChildren.map((child) => (
          <TreeNodeComponent
            key={child.fullPath}
            node={child}
            depth={0}
            selectedId={selectedId}
            onSelect={onSelect}
            onSearch={onSearch}
            onFolderSearch={handleFolderSearch}
            historyIds={historyIds}
            smartIds={smartIds}
            expandSignal={expandSignal}
            allObjects={allObjects}
          />
        ))
      )}
    </div>
  );
}

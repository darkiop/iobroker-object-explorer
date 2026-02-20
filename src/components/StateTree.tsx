import { useState, useMemo, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Database, ChevronsDownUp, ChevronsUpDown, Copy, Check, Search } from 'lucide-react';
import { hasHistory } from '../api/iobroker';
import type { TreeNode, IoBrokerObject } from '../types/iobroker';

interface StateTreeProps {
  stateIds: string[];
  objects: Record<string, IoBrokerObject>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSearch: (pattern: string) => void;
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
  historyIds,
  expandSignal,
}: {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSearch: (pattern: string) => void;
  historyIds: Set<string>;
  expandSignal: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [copied, setCopied] = useState(false);
  const hasChildren = node.children.size > 0;
  const isFolder = hasChildren && !node.isLeaf;
  const isHistoryEnabled = node.isLeaf && historyIds.has(node.fullPath);
  const sortedChildren = useMemo(
    () => [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [node.children]
  );

  useEffect(() => {
    if (expandSignal === 0) return;
    setExpanded(expandSignal > 0);
  }, [expandSignal]);

  return (
    <div>
      <div
        className={`group/row flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-gray-700/50 rounded text-sm ${
          selectedId === node.fullPath ? 'bg-blue-600/30 text-blue-300' : 'text-gray-300'
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
          expanded
            ? <ChevronDown size={14} className="text-gray-500 shrink-0" />
            : <ChevronRight size={14} className="text-gray-500 shrink-0" />
        )}
        {!isFolder && <span className="w-3.5 shrink-0" />}
        {isFolder ? (
          expanded
            ? <FolderOpen size={15} className="text-yellow-500/80 shrink-0" />
            : <Folder size={15} className="text-yellow-600/70 shrink-0" />
        ) : isHistoryEnabled ? (
          <Database size={14} className="text-blue-400/80 shrink-0" />
        ) : (
          <FileText size={14} className="text-green-400/80 shrink-0" />
        )}
        <span className={`truncate ${node.isLeaf ? (isHistoryEnabled ? 'text-blue-400' : 'text-green-400') : 'text-gray-400 font-medium'}`}>
          {node.name}
        </span>
        {!node.isLeaf && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSearch(`${node.fullPath}.*`);
            }}
            className="shrink-0 opacity-0 group-hover/row:opacity-100 text-gray-500 hover:text-blue-400 transition-opacity"
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
            className="ml-auto shrink-0 opacity-0 group-hover/row:opacity-100 text-gray-500 hover:text-gray-300 transition-opacity"
            title={node.fullPath}
          >
            {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
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
            historyIds={historyIds}
            expandSignal={expandSignal}
          />
        ))}
    </div>
  );
}

export default function StateTree({ stateIds, objects, selectedId, onSelect, onSearch }: StateTreeProps) {
  const [historyOnly, setHistoryOnly] = useState(false);
  // positive = expand all, negative = collapse all, 0 = initial
  const [expandSignal, setExpandSignal] = useState(0);

  const historyIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, obj] of Object.entries(objects)) {
      if (hasHistory(obj)) set.add(id);
    }
    return set;
  }, [objects]);

  const filteredIds = useMemo(
    () => historyOnly ? stateIds.filter((id) => historyIds.has(id)) : stateIds,
    [stateIds, historyOnly, historyIds]
  );

  const tree = useMemo(() => buildTree(filteredIds), [filteredIds]);
  const sortedChildren = useMemo(
    () => [...tree.children.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [tree.children]
  );

  if (stateIds.length === 0) {
    return <div className="text-gray-500 text-sm p-4">Keine Datenpunkte geladen</div>;
  }

  return (
    <div className="overflow-y-auto">
      <div className="px-2 py-1.5 flex gap-1.5">
        <button
          onClick={() => setHistoryOnly(!historyOnly)}
          className={`flex items-center gap-1.5 flex-1 px-2 py-1 text-xs rounded ${
            historyOnly
              ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
              : 'bg-gray-700/50 text-gray-400 border border-gray-600/50 hover:bg-gray-700'
          }`}
        >
          <Database size={12} />
          Nur mit History
          <span className={`ml-auto ${historyOnly ? 'text-blue-400' : 'text-gray-500'}`}>{historyIds.size}</span>
        </button>
        <button
          onClick={() => setExpandSignal((s) => Math.abs(s) + 1)}
          className="px-2 py-1 text-xs rounded bg-gray-700/50 text-gray-400 border border-gray-600/50 hover:bg-gray-700"
          title="Alle aufklappen"
        >
          <ChevronsUpDown size={14} />
        </button>
        <button
          onClick={() => setExpandSignal((s) => -(Math.abs(s) + 1))}
          className="px-2 py-1 text-xs rounded bg-gray-700/50 text-gray-400 border border-gray-600/50 hover:bg-gray-700"
          title="Alle zuklappen"
        >
          <ChevronsDownUp size={14} />
        </button>
      </div>
      {filteredIds.length === 0 ? (
        <div className="text-gray-500 text-sm p-4">Keine Datenpunkte mit History</div>
      ) : (
        sortedChildren.map((child) => (
          <TreeNodeComponent
            key={child.fullPath}
            node={child}
            depth={0}
            selectedId={selectedId}
            onSelect={onSelect}
            onSearch={onSearch}
            historyIds={historyIds}
            expandSignal={expandSignal}
          />
        ))
      )}
    </div>
  );
}

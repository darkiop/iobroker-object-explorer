import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText } from 'lucide-react';
import type { TreeNode } from '../types/iobroker';

interface StateTreeProps {
  stateIds: string[];
  selectedId: string | null;
  onSelect: (id: string) => void;
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
}: {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.size > 0;
  const isFolder = hasChildren && !node.isLeaf;
  const sortedChildren = useMemo(
    () => [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [node.children]
  );

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-gray-700/50 rounded text-sm ${
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
        ) : (
          <FileText size={14} className="text-green-400/80 shrink-0" />
        )}
        <span className={node.isLeaf ? 'text-green-400' : 'text-gray-400 font-medium'}>
          {node.name}
        </span>
      </div>
      {expanded &&
        sortedChildren.map((child) => (
          <TreeNodeComponent
            key={child.fullPath}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

export default function StateTree({ stateIds, selectedId, onSelect }: StateTreeProps) {
  const tree = useMemo(() => buildTree(stateIds), [stateIds]);
  const sortedChildren = useMemo(
    () => [...tree.children.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [tree.children]
  );

  if (stateIds.length === 0) {
    return <div className="text-gray-500 text-sm p-4">Keine Datenpunkte geladen</div>;
  }

  return (
    <div className="overflow-y-auto">
      {sortedChildren.map((child) => (
        <TreeNodeComponent
          key={child.fullPath}
          node={child}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

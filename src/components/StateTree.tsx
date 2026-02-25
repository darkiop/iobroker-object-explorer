import { useState, useMemo, useEffect, memo } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Database, Copy, Check, Mic2, Search, Cpu, Layers, HardDrive, Pencil } from 'lucide-react';
import type { TreeNode, IoBrokerObject } from '../types/iobroker';
import ObjectEditModal from './ObjectEditModal';
import ContextMenu from './ContextMenu';
import type { ContextMenuEntry } from './ContextMenu';

function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => copyTextFallback(text));
  } else {
    copyTextFallback(text);
  }
}
function copyTextFallback(text: string) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

interface StateTreeProps {
  stateIds: string[];
  allObjects: Record<string, IoBrokerObject>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSearch: (pattern: string) => void;
  onTreeSelect: (prefix: string) => void;
  historyOnly: boolean;
  smartOnly: boolean;
  historyIds: Set<string>;
  smartIds: Set<string>;
  expandToDepth?: { depth: number; seq: number };
  treeFilter?: string | null;
  onClearTreeFilter?: () => void;
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
  onTreeSelect,
  historyIds,
  smartIds,
  expandSignal,
  allObjects,
  showStates,
  showFolders,
  showDevices,
  showChannels,
}: {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSearch: (pattern: string) => void;
  onFolderSearch: (pattern: string) => void;
  onTreeSelect: (prefix: string) => void;
  historyIds: Set<string>;
  smartIds: Set<string>;
  expandSignal: { depth: number; seq: number };
  allObjects: Record<string, IoBrokerObject>;
  showStates: boolean;
  showFolders: boolean;
  showDevices: boolean;
  showChannels: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const hasChildren = node.children.size > 0;
  const isFolder = hasChildren && !node.isLeaf;
  const isHistoryEnabled = node.isLeaf && historyIds.has(node.fullPath);
  const isSmartEnabled = node.isLeaf && smartIds.has(node.fullPath);
  const objectType = isFolder ? allObjects[node.fullPath]?.type : undefined;
  const sortedChildren = useMemo(
    () => [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [node.children]
  );

  useEffect(() => {
    if (expandSignal.seq === 0) return;
    setExpanded(depth < expandSignal.depth);
  }, [expandSignal]);

  if (node.isLeaf && !showStates) return null;

  const nodeFiltered = !node.isLeaf && (
    (objectType === 'device'  && !showDevices) ||
    (objectType === 'channel' && !showChannels) ||
    (objectType !== 'device' && objectType !== 'channel' && !showFolders)
  );

  // Non-leaf filtered: skip the row but still render children so the full tree is searched
  if (nodeFiltered) {
    return (
      <>
        {sortedChildren.map((child) => (
          <TreeNodeComponent
            key={child.fullPath}
            node={child}
            depth={depth}
            selectedId={selectedId}
            onSelect={onSelect}
            onSearch={onSearch}
            onFolderSearch={onFolderSearch}
            onTreeSelect={onTreeSelect}
            historyIds={historyIds}
            smartIds={smartIds}
            expandSignal={expandSignal}
            allObjects={allObjects}
            showStates={showStates}
            showFolders={showFolders}
            showDevices={showDevices}
            showChannels={showChannels}
          />
        ))}
      </>
    );
  }

  return (
    <div>
      {editOpen && (
        <ObjectEditModal
          id={node.fullPath}
          obj={allObjects[node.fullPath] ?? { _id: node.fullPath, type: 'folder', common: { name: node.name }, native: {} } as IoBrokerObject}
          onClose={() => setEditOpen(false)}
        />
      )}
      {ctxMenu && (() => {
        const items: ContextMenuEntry[] = [];
        if (node.isLeaf) {
          items.push({ icon: <Check size={13} />, label: 'Auswählen', onClick: () => onSelect(node.fullPath) });
          items.push({ separator: true } as const);
          items.push({ icon: <Copy size={13} />, label: 'ID kopieren', onClick: () => copyText(node.fullPath) });
          items.push({ separator: true } as const);
          items.push({ icon: <Search size={13} />, label: 'Als Filter setzen', onClick: () => onSearch(node.fullPath) });
        } else {
          items.push({ icon: <Search size={13} />, label: `Filter: ${node.fullPath}.*`, onClick: () => onFolderSearch(`${node.fullPath}.*`) });
          items.push({ separator: true } as const);
          items.push({ icon: <Copy size={13} />, label: 'ID kopieren', onClick: () => copyText(node.fullPath) });
          items.push({ icon: <Copy size={13} />, label: 'Muster kopieren', onClick: () => copyText(`${node.fullPath}.*`) });
          items.push({ separator: true } as const);
          items.push({ icon: <Pencil size={13} />, label: 'Objekt bearbeiten', onClick: () => setEditOpen(true) });
        }
        return <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={items} onClose={() => setCtxMenu(null)} />;
      })()}

      <div
        className={`group/row flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-gray-200/50 dark:hover:bg-gray-700/50 rounded text-sm ${
          selectedId === node.fullPath ? 'bg-blue-600/30 text-blue-600 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
        }`}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
        onClick={() => {
          if (node.isLeaf) {
            onSelect(node.fullPath);
          } else if (hasChildren) {
            setExpanded(!expanded);
            onTreeSelect(`${node.fullPath}.`);
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
          objectType === 'device' ? (
            <Cpu    size={15} className="text-sky-500/80    shrink-0" />
          ) : objectType === 'channel' ? (
            <Layers size={15} className="text-indigo-500/80 shrink-0" />
          ) : depth === 1 ? (
            <HardDrive size={15} className="text-amber-500/80 shrink-0" />
          ) : (
            expanded
              ? <FolderOpen size={15} className="text-yellow-500/80 shrink-0" />
              : <Folder     size={15} className="text-yellow-600/70 shrink-0" />
          )
        ) : isHistoryEnabled ? (
          <Database size={14} className="text-blue-400/80 shrink-0" />
        ) : (
          <FileText size={14} className="text-green-400/80 shrink-0" />
        )}
        <span className={`truncate ${node.isLeaf ? (isHistoryEnabled ? 'text-blue-500 dark:text-blue-400' : 'text-green-600 dark:text-green-400') : 'text-gray-600 font-medium dark:text-gray-400'}`}>
          {node.name}
        </span>
        {isFolder && objectType && (
          <span className="text-[10px] uppercase text-gray-400 dark:text-gray-500 tracking-wide shrink-0">
            {objectType}
          </span>
        )}
        {isSmartEnabled && (
          <span title="SmartName vorhanden"><Mic2 size={11} className="shrink-0 text-violet-500 dark:text-violet-400" /></span>
        )}
        {isFolder && (
          <button
            onClick={(e) => { e.stopPropagation(); setEditOpen(true); }}
            className="ml-auto shrink-0 opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-yellow-500 dark:text-gray-500 dark:hover:text-yellow-400 transition-opacity"
            title="Objekt bearbeiten"
          >
            <Pencil size={12} />
          </button>
        )}
        {isFolder && (
          <button
            onClick={(e) => { e.stopPropagation(); onFolderSearch(`${node.fullPath}.*`); }}
            className="shrink-0 opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-opacity"
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
            onTreeSelect={onTreeSelect}
            historyIds={historyIds}
            smartIds={smartIds}
            expandSignal={expandSignal}
            allObjects={allObjects}
            showStates={showStates}
            showFolders={showFolders}
            showDevices={showDevices}
            showChannels={showChannels}
          />
        ))}
    </div>
  );
}


function StateTree({ stateIds, allObjects, selectedId, onSelect, onSearch, onTreeSelect, historyOnly, smartOnly, historyIds, smartIds, expandToDepth, treeFilter, onClearTreeFilter }: StateTreeProps) {
  const [expandSignal, setExpandSignal] = useState<{ depth: number; seq: number }>({ depth: 0, seq: 0 });
  const [showStates,   setShowStates]   = useState(true);
  const [showFolders,  setShowFolders]  = useState(true);
  const [showDevices,  setShowDevices]  = useState(true);
  const [showChannels, setShowChannels] = useState(true);
  const [typesOpen,    setTypesOpen]    = useState(false);

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

  const typeItems = [
    { key: 'folders',  label: 'Folder',  active: showFolders,  set: setShowFolders,  icon: <Folder   size={11} />, color: 'text-yellow-600 dark:text-yellow-500' },
    { key: 'devices',  label: 'Device',  active: showDevices,  set: setShowDevices,  icon: <Cpu      size={11} />, color: 'text-sky-600 dark:text-sky-400'       },
    { key: 'channels', label: 'Channel', active: showChannels, set: setShowChannels, icon: <Layers   size={11} />, color: 'text-indigo-600 dark:text-indigo-400' },
    { key: 'states',   label: 'State',   active: showStates,   set: setShowStates,   icon: <FileText size={11} />, color: 'text-green-600 dark:text-green-400'   },
  ] as const;
  const hiddenCount = typeItems.filter((t) => !t.active).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Typ-Filter (collapsible) */}
      <div className="border-b border-gray-200 dark:border-gray-700 shrink-0">
        <button
          onClick={() => setTypesOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
        >
          <span className="flex items-center gap-1.5 font-medium">
            <Layers size={12} />
            Typ
            {hiddenCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 text-[10px]">
                {4 - hiddenCount}/4
              </span>
            )}
          </span>
          {typesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        {typesOpen && (
          <div className="px-3 pt-1.5 pb-3 flex flex-wrap gap-1.5">
            {typeItems.map(({ key, label, active, set, icon, color }) => (
              <button
                key={key}
                onClick={() => set((v) => !v)}
                title={active ? `${label}s ausblenden` : `${label}s einblenden`}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                  active
                    ? `bg-gray-200 dark:bg-gray-700 ${color} hover:bg-gray-300 dark:hover:bg-gray-600`
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-y-auto px-2 flex-1">
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
              onTreeSelect={onTreeSelect}
              historyIds={historyIds}
              smartIds={smartIds}
              expandSignal={expandSignal}
              allObjects={allObjects}
              showStates={showStates}
              showFolders={showFolders}
              showDevices={showDevices}
              showChannels={showChannels}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default memo(StateTree);

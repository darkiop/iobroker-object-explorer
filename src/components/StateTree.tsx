import { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { ChevronRight, ChevronDown, ChevronsUpDown, ChevronsDownUp, Folder, FolderOpen, FileText, Database, Copy, Check, Mic2, Search, Cpu, Layers, HardDrive, Pencil, LayoutList, LayoutGrid, Plus, FileCode2, Link2, UserRound, ShieldAlert, Download, Trash2, Filter } from 'lucide-react';
import type { TreeNode, IoBrokerObject } from '../types/iobroker';
import ObjectEditModal from './ObjectEditModal';
import ContextMenu from './ContextMenu';
import type { ContextMenuEntry } from './ContextMenu';
import ConfirmDialog from './ConfirmDialog';
import { useDeleteSubtree } from '../hooks/useStates';
import { copyText } from '../utils/clipboard';
import { useTreeState } from '../hooks/useTreeState';
import { useFilterContext } from '../context/FilterContext';
import { useSelectionContext } from '../context/SelectionContext';
import { useAppSettingsContext } from '../context/UIContext';

interface StateTreeProps {
  stateIds: string[];
  allObjects: Record<string, IoBrokerObject>;
  historyIds: Set<string>;
  smartIds: Set<string>;
  onCreateAtPath: (prefix: string) => void;
  onSearch: (pattern: string) => void;
  onTreeScope: (prefix: string) => void;
}


function shouldShowNodeType(
  node: TreeNode,
  allObjects: Record<string, IoBrokerObject>,
  showFolders: boolean,
  showDevices: boolean,
  showChannels: boolean
): boolean {
  if (node.isLeaf) return false;
  const objectType = allObjects[node.fullPath]?.type;
  if (objectType === 'device') return showDevices;
  if (objectType === 'channel') return showChannels;
  return showFolders;
}

function hasExpandableBranch(
  node: TreeNode,
  allObjects: Record<string, IoBrokerObject>,
  showFolders: boolean,
  showDevices: boolean,
  showChannels: boolean
): boolean {
  for (const child of node.children.values()) {
    if (child.isLeaf) continue;
    if (shouldShowNodeType(child, allObjects, showFolders, showDevices, showChannels)) return true;
    if (hasExpandableBranch(child, allObjects, showFolders, showDevices, showChannels)) return true;
  }
  return false;
}

const TreeNodeComponent = memo(function TreeNodeComponent({
  node,
  depth,
  selectedId,
  onSelect,
  onSearch,
  onTreeScope,
  onCreateAtPath,
  historyIds,
  smartIds,
  expandSignal,
  allObjects,
  showFolders,
  showDevices,
  showChannels,
  treeFilter,
  pattern,
  language,
  onOpenAliasReplace,
  onAutoCreateAlias,
  onAddToTreeFilter,
  nodeFontClass = 'text-sm',
  treeCountMode = 'objects' as 'off' | 'states' | 'objects' | 'both',
}: {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSearch: (pattern: string) => void;
  onTreeScope: (prefix: string) => void;
  onCreateAtPath: (prefix: string) => void;
  historyIds: Set<string>;
  smartIds: Set<string>;
  expandSignal: { depth: number; seq: number };
  allObjects: Record<string, IoBrokerObject>;
  showFolders: boolean;
  showDevices: boolean;
  showChannels: boolean;
  treeFilter: string | null;
  pattern?: string;
  language: 'en' | 'de';
  onOpenAliasReplace?: (initialStr?: string) => void;
  onAutoCreateAlias?: (deviceId: string) => void;
  onAddToTreeFilter: (path: string) => void;
  nodeFontClass?: string;
  treeCountMode?: 'off' | 'states' | 'objects' | 'both';
}) {
  const isEn = language === 'en';
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteSubtree = useDeleteSubtree();
  const { deleteCount, deleteStateCount } = useMemo(() => {
    if (!confirmDelete) return { deleteCount: 0, deleteStateCount: 0 };
    if (node.isLeaf) return { deleteCount: 1, deleteStateCount: 1 };
    const prefix = node.fullPath + '.';
    const ids = Object.keys(allObjects).filter((id) => id === node.fullPath || id.startsWith(prefix));
    const stateCount = ids.filter((id) => allObjects[id]?.type === 'state').length;
    return { deleteCount: ids.length, deleteStateCount: stateCount };
  }, [confirmDelete, node.isLeaf, node.fullPath, allObjects]);

  const exportSubtree = useCallback(() => {
    const prefix = node.fullPath + '.';
    const idsToExport = node.isLeaf
      ? [node.fullPath]
      : Object.keys(allObjects).filter((id) => id === node.fullPath || id.startsWith(prefix));
    const out: Record<string, IoBrokerObject> = {};
    for (const id of idsToExport) {
      const obj = allObjects[id];
      if (obj) out[id] = obj;
    }
    if (Object.keys(out).length === 0) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
    a.download = `iobroker-export-${node.fullPath.replace(/\./g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }, [node.isLeaf, node.fullPath, allObjects]);
  const hasChildren = node.children.size > 0;
  const objectType = !node.isLeaf ? allObjects[node.fullPath]?.type : undefined;
  const isFolder = !node.isLeaf && (hasChildren || objectType === 'folder' || objectType === 'device' || objectType === 'channel' || objectType === 'instance');
  const isExpandableFolder = isFolder && hasExpandableBranch(node, allObjects, showFolders, showDevices, showChannels);
  const isHistoryEnabled = node.isLeaf && historyIds.has(node.fullPath);
  const isSmartEnabled = node.isLeaf && smartIds.has(node.fullPath);
  const isActiveScope = (!!treeFilter && treeFilter === node.fullPath + '.') || (!!pattern && pattern === node.fullPath + '.*');
  const sortedChildren = useMemo(
    () => [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [node.children]
  );

  useEffect(() => {
    if (expandSignal.seq === 0) return;
    setExpanded(depth < expandSignal.depth);
  }, [expandSignal]);

  if (node.isLeaf) return null;

  const nodeFiltered = !node.isLeaf && (
    (objectType === 'device'  && !showDevices) ||
    (objectType === 'channel' && !showChannels) ||
    (objectType !== 'device' && objectType !== 'channel' && !showFolders)
  );
  const isHighlightedNamespace = !node.isLeaf && (
    /^(javascript|alias|0_userdata|system)(\.|$)/.test(node.fullPath)
  );
  const isTopJavascript = !node.isLeaf && /^javascript(\.[^.]+)?$/.test(node.fullPath);
  const isTopAlias = !node.isLeaf && /^alias(\.[^.]+)?$/.test(node.fullPath);
  const isTopUserdata = !node.isLeaf && /^0_userdata(\.[^.]+)?$/.test(node.fullPath);
  const isTopSystem = !node.isLeaf && /^system(\.[^.]+)?$/.test(node.fullPath);
  const namespaceRowClass = !isHighlightedNamespace
    ? ''
    : /^javascript(\.|$)/.test(node.fullPath)
      ? 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
      : /^alias(\.|$)/.test(node.fullPath)
        ? 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
        : /^0_userdata(\.|$)/.test(node.fullPath)
          ? 'bg-indigo-500/10 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
          : 'bg-red-500/10 text-red-700 dark:bg-red-500/15 dark:text-red-300';

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
            onTreeScope={onTreeScope}
            onCreateAtPath={onCreateAtPath}
            historyIds={historyIds}
            smartIds={smartIds}
            expandSignal={expandSignal}
            allObjects={allObjects}
            showFolders={showFolders}
            showDevices={showDevices}
            showChannels={showChannels}
            treeFilter={treeFilter}
            pattern={pattern}
            language={language}
            onAddToTreeFilter={onAddToTreeFilter}
            nodeFontClass={nodeFontClass}
            treeCountMode={treeCountMode}
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
          language={language}
          onClose={() => setEditOpen(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={isEn ? `Delete ${deleteCount} object${deleteCount !== 1 ? 's' : ''}` : `${deleteCount} Objekt${deleteCount !== 1 ? 'e' : ''} löschen`}
          description={node.isLeaf
            ? undefined
            : (isEn
                ? `${deleteStateCount} state${deleteStateCount !== 1 ? 's' : ''}, ${deleteCount - deleteStateCount} folder/device/channel will be permanently deleted:`
                : `${deleteStateCount} State${deleteStateCount !== 1 ? 's' : ''}, ${deleteCount - deleteStateCount} Ordner/Gerät/Kanal werden unwiderruflich gelöscht:`)}
          message={node.fullPath}
          onConfirm={() => { deleteSubtree.mutate({ id: node.fullPath, allObjects }); setConfirmDelete(false); }}
          onCancel={() => setConfirmDelete(false)}
          language={language}
        />
      )}
      {ctxMenu && (() => {
        const items: ContextMenuEntry[] = [];
        if (node.isLeaf) {
          items.push({ icon: <Search size={13} />, label: isEn ? 'Set as filter' : 'Als Filter setzen', onClick: () => onSearch(node.fullPath) });
          items.push({ icon: <Filter size={13} />, label: isEn ? 'Add path to tree filter' : 'Pfad zum Baum-Filter hinzufügen', onClick: () => onAddToTreeFilter(node.fullPath) });
          items.push({ separator: true } as const);
          items.push({ icon: <Check size={13} />, label: isEn ? 'Select' : 'Auswählen', onClick: () => onSelect(node.fullPath) });
          items.push({ separator: true } as const);
          items.push({ icon: <Copy size={13} />, label: isEn ? 'Copy ID' : 'ID kopieren', onClick: () => copyText(node.fullPath) });
          items.push({ separator: true } as const);
          items.push({ icon: <Download size={13} />, label: isEn ? 'Export (JSON)' : 'Exportieren (JSON)', onClick: exportSubtree });
          items.push({ separator: true } as const);
          items.push({ icon: <Trash2 size={13} />, label: isEn ? 'Delete object' : 'Objekt löschen', onClick: () => setConfirmDelete(true), danger: true });
        } else {
          items.push({ icon: <Search size={13} />, label: isEn ? `Show in table: ${node.fullPath}` : `In Tabelle anzeigen: ${node.fullPath}`, onClick: () => onTreeScope(`${node.fullPath}.`) });
          items.push({ icon: <Filter size={13} />, label: isEn ? 'Add path to tree filter' : 'Pfad zum Baum-Filter hinzufügen', onClick: () => onAddToTreeFilter(node.fullPath) });
          items.push({ separator: true } as const);
          items.push({ icon: <Copy size={13} />, label: isEn ? 'Copy ID' : 'ID kopieren', onClick: () => copyText(node.fullPath) });
          items.push({ icon: <Copy size={13} />, label: isEn ? 'Copy pattern' : 'Muster kopieren', onClick: () => copyText(`${node.fullPath}.*`) });
          items.push({ separator: true } as const);
          items.push({ icon: <Pencil size={13} />, label: isEn ? 'Edit object' : 'Objekt bearbeiten', onClick: () => setEditOpen(true) });
          // Auto-create aliases for any non-leaf node that has child states
          if (onAutoCreateAlias && node.count > 0 && !node.fullPath.startsWith('alias.')) {
            items.push({ separator: true } as const);
            items.push({ icon: <Link2 size={13} />, label: isEn ? 'Auto-create aliases…' : 'Aliases auto-erstellen…', onClick: () => onAutoCreateAlias(node.fullPath) });
          }
          // Find & Replace for alias.0.* nodes
          if (onOpenAliasReplace && node.fullPath.startsWith('alias.')) {
            items.push({ separator: true } as const);
            items.push({ icon: <Link2 size={13} />, label: isEn ? 'Find & Replace in targets…' : 'Ziele suchen & ersetzen…', onClick: () => {
              const rawTarget = allObjects[node.fullPath]?.common?.alias?.id;
              const initialStr = typeof rawTarget === 'string' ? rawTarget : (rawTarget?.read ?? rawTarget?.write ?? '');
              onOpenAliasReplace(initialStr);
            } });
          }
          items.push({ separator: true } as const);
          items.push({ icon: <Download size={13} />, label: isEn ? 'Export subtree (JSON)' : 'Unterstruktur exportieren (JSON)', onClick: exportSubtree });
          items.push({ separator: true } as const);
          items.push({ icon: <Trash2 size={13} />, label: isEn ? 'Delete object' : 'Objekt löschen', onClick: () => setConfirmDelete(true), danger: true });
        }
        return <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={items} onClose={() => setCtxMenu(null)} />;
      })()}

      <div
        className={`group/row flex items-center gap-1.5 px-2 py-1 cursor-pointer rounded ${nodeFontClass} ${
          selectedId === node.fullPath
            ? 'bg-blue-600/30 text-blue-600 dark:text-blue-300 hover:bg-blue-600/35'
            : `hover:bg-gray-200/50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300 ${namespaceRowClass}`
        }`}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
        onClick={() => {
          if (node.isLeaf) {
            onSelect(node.fullPath);
          } else if (isExpandableFolder) {
            setExpanded(!expanded);
          }
        }}
      >
        {isExpandableFolder ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="shrink-0 p-1 -ml-1 rounded hover:bg-gray-300/60 text-gray-400 hover:text-gray-600 dark:hover:bg-gray-600/60 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : isFolder ? (
          <span className="w-5 shrink-0" />
        ) : (
          <span className="w-5 shrink-0" />
        )}
        {isFolder ? (
          isTopJavascript ? (
            <FileCode2 size={15} className="text-amber-500/90 shrink-0" />
          ) : isTopAlias ? (
            <Link2 size={15} className="text-emerald-500/90 shrink-0" />
          ) : isTopUserdata ? (
            <UserRound size={15} className="text-indigo-500/90 shrink-0" />
          ) : isTopSystem ? (
            <ShieldAlert size={15} className="text-red-500/90 shrink-0" />
          ) : objectType === 'device' ? (
            <Cpu size={15} className="text-sky-500/80 shrink-0" />
          ) : objectType === 'channel' ? (
            <Layers size={15} className="text-indigo-500/80 shrink-0" />
          ) : node.fullPath.split('.').length === 2 ? (
            <HardDrive size={15} className="text-amber-500/80 shrink-0" />
          ) : (
            isExpandableFolder && expanded
              ? <FolderOpen size={15} className="text-yellow-500/80 shrink-0" />
              : <Folder size={15} className="text-yellow-600/70 shrink-0" />
          )
        ) : isHistoryEnabled ? (
          <Database size={14} className="text-blue-400/80 shrink-0" />
        ) : (
          <FileText size={14} className="text-green-400/80 shrink-0" />
        )}
        <span className={`truncate ${node.isLeaf ? (isHistoryEnabled ? 'text-blue-500 dark:text-blue-400' : 'text-green-600 dark:text-green-400') : (isHighlightedNamespace ? 'font-semibold' : 'text-gray-600 font-medium dark:text-gray-400')}`}>
          {node.name}
        </span>
        {treeCountMode !== 'off' && !node.isLeaf && (node.totalCount ?? 0) > 0 &&
         !(treeCountMode === 'states' && (node.count ?? 0) === 0) && (
          <span className="shrink-0 text-[10px] font-medium px-1 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 leading-none whitespace-nowrap">
            {treeCountMode === 'states' ? (node.count ?? 0) : treeCountMode === 'objects' ? node.totalCount : `${node.count ?? 0} / ${node.totalCount}`}
          </span>
        )}
        {isFolder && objectType && (
          <span className="text-[10px] uppercase text-gray-400 dark:text-gray-500 tracking-wide shrink-0">
            {objectType}
          </span>
        )}
        {isSmartEnabled && (
          <span title={isEn ? 'SmartName set' : 'SmartName vorhanden'}><Mic2 size={11} className="shrink-0 text-violet-500 dark:text-violet-400" /></span>
        )}
        {isFolder && (
          <button
            onClick={(e) => { e.stopPropagation(); setEditOpen(true); }}
            className="shrink-0 opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-yellow-500 dark:text-gray-500 dark:hover:text-yellow-400 transition-opacity"
            title={isEn ? 'Edit object' : 'Objekt bearbeiten'}
          >
            <Pencil size={12} />
          </button>
        )}
        {isFolder && (
          <button
            onClick={(e) => { e.stopPropagation(); onCreateAtPath(`${node.fullPath}.`); }}
            className="shrink-0 opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded p-1 transition-all"
            title={isEn ? `New datapoint under: ${node.fullPath}` : `Neuer Datenpunkt unter: ${node.fullPath}`}
          >
            <Plus size={14} />
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
        {isFolder && (
          <button
            onClick={(e) => { e.stopPropagation(); onTreeScope(`${node.fullPath}.`); }}
            className={`ml-auto shrink-0 rounded p-1 transition-all ${
              isActiveScope
                ? 'text-blue-600 dark:text-blue-300 bg-blue-500/25 dark:bg-blue-400/25'
                : 'opacity-0 group-hover/row:opacity-100 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20'
            }`}
            title={isEn ? `Show in table: ${node.fullPath}` : `In Tabelle anzeigen: ${node.fullPath}`}
          >
            <Search size={14} />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
          className="shrink-0 opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-opacity"
          title={isEn ? 'Delete object' : 'Objekt löschen'}
        >
          <Trash2 size={12} />
        </button>
      </div>
      {isExpandableFolder && expanded &&
        sortedChildren.map((child) => (
          <TreeNodeComponent
            key={child.fullPath}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
            onSearch={onSearch}
            onTreeScope={onTreeScope}
            onCreateAtPath={onCreateAtPath}
            historyIds={historyIds}
            smartIds={smartIds}
            expandSignal={expandSignal}
            allObjects={allObjects}
            showFolders={showFolders}
            showDevices={showDevices}
            showChannels={showChannels}
            treeFilter={treeFilter}
            pattern={pattern}
            language={language}
            onOpenAliasReplace={onOpenAliasReplace}
            onAutoCreateAlias={onAutoCreateAlias}
            onAddToTreeFilter={onAddToTreeFilter}
            nodeFontClass={nodeFontClass}
            treeCountMode={treeCountMode}
          />
        ))}
    </div>
  );
}, (prev, next) => {
  // Structural changes always require re-render
  if (
    prev.node !== next.node ||
    prev.depth !== next.depth ||
    prev.allObjects !== next.allObjects ||
    prev.historyIds !== next.historyIds ||
    prev.smartIds !== next.smartIds ||
    prev.expandSignal !== next.expandSignal ||
    prev.showFolders !== next.showFolders ||
    prev.showDevices !== next.showDevices ||
    prev.showChannels !== next.showChannels ||
    prev.treeFilter !== next.treeFilter ||
    prev.pattern !== next.pattern ||
    prev.language !== next.language ||
    prev.onSelect !== next.onSelect ||
    prev.onSearch !== next.onSearch ||
    prev.onTreeScope !== next.onTreeScope ||
    prev.onCreateAtPath !== next.onCreateAtPath ||
    prev.onOpenAliasReplace !== next.onOpenAliasReplace ||
    prev.onAutoCreateAlias !== next.onAutoCreateAlias ||
    prev.onAddToTreeFilter !== next.onAddToTreeFilter ||
    prev.nodeFontClass !== next.nodeFontClass ||
    prev.treeCountMode !== next.treeCountMode
  ) return false;

  if (prev.selectedId === next.selectedId) return true;

  // selectedId changed: skip re-render if neither old nor new selection is in this subtree
  if (prev.node.isLeaf) return true; // leaf nodes render null, never need re-render
  const path = prev.node.fullPath;
  const inSubtree = (id: string | null) => id !== null && (id === path || id.startsWith(path + '.'));
  if (!inSubtree(prev.selectedId) && !inSubtree(next.selectedId)) return true;
  return false;
});


function StateTree({ stateIds, allObjects, historyIds, smartIds, onCreateAtPath, onSearch, onTreeScope }: StateTreeProps) {
  const { treeFilter, treeSearch, setTreeSearch, treeExpandSignal, pattern, historyOnly, smartOnly } = useFilterContext();
  const { selectedId, setSelectedId, setAliasReplaceInitialStr, setAutoAliasDeviceId } = useSelectionContext();
  const { appSettings, persistSettings } = useAppSettingsContext();

  const language = appSettings.language;
  const isEn = language === 'en';
  const treeFontSize = appSettings.treeFontSize;
  const treeCountMode = appSettings.treeCountMode;
  const nodeFontClass = treeFontSize === 'small' ? 'text-xs' : treeFontSize === 'large' ? 'text-base' : treeFontSize === 'xl' ? 'text-lg' : 'text-sm';
  const onOpenAliasReplace = useCallback((initialStr?: string) => {
    setAliasReplaceInitialStr(initialStr ?? null);
  }, [setAliasReplaceInitialStr]);
  const onAutoCreateAlias = useCallback((deviceId: string) => {
    setAutoAliasDeviceId(deviceId);
  }, [setAutoAliasDeviceId]);

  const {
    expandSignal,
    showFolders, setShowFolders,
    showDevices, setShowDevices,
    showChannels, setShowChannels,
    treeViewMode, handleTreeViewModeChange,
    filteredIds,
    tree,
    sortedChildren,
  } = useTreeState({
    stateIds, allObjects, historyIds, smartIds,
    treeSearch, historyOnly, smartOnly, treeExpandSignal,
    appSettings, persistSettings,
  });

  const typeItems = [
    { key: 'folders',  label: 'Folder',  active: showFolders,  set: setShowFolders,  icon: <Folder   size={11} />, color: 'text-yellow-600 dark:text-yellow-500' },
    { key: 'devices',  label: 'Device',  active: showDevices,  set: setShowDevices,  icon: <Cpu      size={11} />, color: 'text-sky-600 dark:text-sky-400'       },
    { key: 'channels', label: 'Channel', active: showChannels, set: setShowChannels, icon: <Layers   size={11} />, color: 'text-indigo-600 dark:text-indigo-400' },
  ] as const;
  return (
    <>
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 pt-2 pb-5 shrink-0">
        <div className="relative">
          <Filter size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
          <input
            type="text"
            value={treeSearch}
            onChange={(e) => setTreeSearch(e.target.value)}
            placeholder={isEn ? 'Filter tree…' : 'Baum filtern…'}
            className="w-full pl-7 pr-6 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 border border-gray-300/60 dark:border-gray-600/60 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500"
          />
          {treeSearch && (
            <button
              onClick={() => setTreeSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ×
            </button>
          )}
        </div>
        <div className="flex gap-1 mt-2">
          <button
            onClick={() => setExpandSignal(s => ({ depth: 9999, seq: s.seq + 1 }))}
            className="flex items-center justify-center px-2 py-0.5 text-xs rounded border transition-colors bg-gray-200/50 text-gray-500 border-gray-300/50 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-300 dark:border-gray-600/50 dark:hover:bg-gray-700"
            title={isEn ? 'Expand all' : 'Alle aufklappen'}
          >
            <ChevronsUpDown size={12} />
          </button>
          <button
            onClick={() => setExpandSignal(s => ({ depth: 0, seq: s.seq + 1 }))}
            className="flex items-center justify-center px-2 py-0.5 text-xs rounded border transition-colors bg-gray-200/50 text-gray-500 border-gray-300/50 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-300 dark:border-gray-600/50 dark:hover:bg-gray-700"
            title={isEn ? 'Collapse all' : 'Alle zuklappen'}
          >
            <ChevronsDownUp size={12} />
          </button>
          <button
            onClick={() => handleTreeViewModeChange(treeViewMode === 'path' ? 'adapter' : 'path')}
            className={`flex items-center justify-center px-2 py-0.5 text-xs rounded border transition-colors ${
              treeViewMode === 'adapter'
                ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-400/40 hover:bg-blue-500/30'
                : 'bg-gray-200/50 text-gray-500 border-gray-300/50 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-300 dark:border-gray-600/50 dark:hover:bg-gray-700'
            }`}
            title={treeViewMode === 'adapter'
              ? (isEn ? 'Path view' : 'Pfad-Ansicht')
              : (isEn ? 'Adapter view' : 'Adapter-Ansicht')}
          >
            {treeViewMode === 'adapter' ? <LayoutList size={12} /> : <LayoutGrid size={12} />}
          </button>
          {typeItems.map(({ key, label, active, set, icon, color }) => (
            <button
              key={key}
              onClick={() => set((v) => !v)}
              title={active ? (isEn ? `Hide ${label}s` : `${label}s ausblenden`) : (isEn ? `Show ${label}s` : `${label}s einblenden`)}
              className={`flex items-center justify-center gap-1 flex-1 py-0.5 rounded text-xs transition-colors ${
                active
                  ? `bg-gray-200 dark:bg-gray-700 ${color} hover:bg-gray-300 dark:hover:bg-gray-600`
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 line-through hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-y-auto px-2 flex-1">
        {filteredIds.length === 0 ? (
          <div className="text-gray-400 dark:text-gray-500 text-sm p-4">
            {stateIds.length === 0
              ? (isEn ? 'No datapoints loaded' : 'Keine Datenpunkte geladen')
              : (isEn ? 'No datapoints found' : 'Keine Datenpunkte gefunden')}
          </div>
        ) : (
          sortedChildren.map((child) => (
            <TreeNodeComponent
              key={child.fullPath}
              node={child}
              depth={0}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSearch={onSearch}
              onTreeScope={onTreeScope}
              onCreateAtPath={onCreateAtPath}
              historyIds={historyIds}
              smartIds={smartIds}
              expandSignal={expandSignal}
              allObjects={allObjects}
              showFolders={showFolders}
              showDevices={showDevices}
              showChannels={showChannels}
              treeFilter={treeFilter}
              pattern={pattern}
              language={language}
              onOpenAliasReplace={onOpenAliasReplace}
              onAutoCreateAlias={onAutoCreateAlias}
              onAddToTreeFilter={setTreeSearch}
              nodeFontClass={nodeFontClass}
              treeCountMode={treeCountMode}
            />
          ))
        )}
      </div>
      <div className="flex items-center justify-center gap-3 px-3 py-1.5 border-t border-gray-200 dark:border-gray-700 shrink-0 bg-gray-50/50 dark:bg-gray-800/30">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {isEn ? 'Objects' : 'Objekte'}: <span className="font-semibold text-gray-700 dark:text-gray-200">{(tree.totalCount ?? 0).toLocaleString()}</span>
        </span>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          States: <span className="font-semibold text-gray-700 dark:text-gray-200">{(tree.count ?? 0).toLocaleString()}</span>
        </span>
      </div>
    </div>
    </>
  );
}

export default memo(StateTree);

import type { ToastType } from '../context/ToastContext';
import { createPortal } from 'react-dom';
import { X, History, Trash2, Plus, Link2, FileEdit, Download, ChevronDown, ChevronRight, BarChart2, Copy, Check, Search, Zap, FolderInput, PenLine, Columns2 } from 'lucide-react';
import NewDatapointModal from './NewDatapointModal';
import ImportDatapointsModal from './ImportDatapointsModal';
import OptimizeModal from './OptimizeModal';
import ObjectEditModal from './ObjectEditModal';
import CreateAliasModal from './CreateAliasModal';
import CopyDatapointModal from './CopyDatapointModal';
import RenameDatapointModal from './RenameDatapointModal';
import MoveDatapointModal from './MoveDatapointModal';
import HistoryModal from './HistoryModal';
import ConfirmDialog from './ConfirmDialog';
import MultiDeleteDialog from './MultiDeleteDialog';
import ValueEditModal from './ValueEditModal';
import TreeStatsModal from './TreeStatsModal';
import ContextMenu from './ContextMenu';
import type { ContextMenuEntry } from './ContextMenu';
import type { IoBrokerState, IoBrokerObject } from '../types/iobroker';
import type { ExtraSeries } from './HistoryChart';
import { hasHistory } from '../api/iobroker';
import { copyText, copyToClipboard } from '../utils/clipboard';
import { formatValue } from '../utils/format';
import { getObjectName } from './stateListUtils';

interface BatchProgress { done: number; total: number; }

export interface StateListModalsProps {
  isEn: boolean;
  language: 'en' | 'de';
  objects: Record<string, IoBrokerObject>;
  states: Record<string, IoBrokerState>;
  allObjects: Record<string, IoBrokerObject>;
  existingIds: Set<string>;
  allObjectIds: Set<string>;
  filteredIds: string[];
  checkedIds: Set<string>;
  pattern: string | null | undefined;
  roomEnums: Array<{ id: string; name: string }>;
  fnEnums: Array<{ id: string; name: string }>;
  collapsedPrefixes: Set<string> | null;
  allHistoryIds: Set<string>;
  allSmartIds: Set<string>;
  scriptUsedIds: Set<string> | null | undefined;
  scriptsFetching: boolean;
  includeScripts?: boolean;
  batchProgress: BatchProgress | null | undefined;
  onOpenInOtherPanel?: (id: string) => void;

  // Modal open state
  newDatapointOpen: boolean;
  newDatapointPrefix: string | null;
  newAliasOpen: boolean;
  importOpen: boolean;
  optimizeOpen: boolean;
  optimizePath: string | undefined;
  historyModalId: string | null;
  historyInitialExtra: ExtraSeries[];
  deletingId: string | null;
  deletingGroupPrefix: string | null;
  valueEditId: string | null;
  confirmResetLs: boolean;
  multiDeleteOpen: boolean;
  aliasSourceId: string | null;
  copySourceId: string | null;
  renameId: string | null;
  moveId: string | null;
  editObjId: string | null;
  editObjInitialTab: 'details' | 'json' | 'alias' | 'custom';
  ctxMenu: { x: number; y: number; id: string } | null;
  sepCtxMenu: { x: number; y: number; prefix: string } | null;
  showStats: boolean;

  // Close/action handlers
  onCloseNewDatapoint: () => void;
  onNewAliasCreated: (newId: string) => void;
  onCloseNewAlias: () => void;
  onCloseImport: () => void;
  onCloseOptimize: () => void;
  onOpenEditFromOptimize: (id: string) => void;
  onCloseHistory: () => void;
  onCloseValueEdit: () => void;
  onConfirmDeleteId: () => void;
  onCancelDeleteId: () => void;
  onConfirmResetLs: () => void;
  onCancelResetLs: () => void;
  onCloseMultiDelete: () => void;
  onDeleteOne: (id: string) => void;
  onDeleteAll: (ids: string[]) => void;
  onCloseAliasSource: () => void;
  onAliasSourceCreated: (newId: string) => void;
  onCloseCopySource: () => void;
  onCloseRename: () => void;
  onRenamed: (newId: string) => void;
  onCloseMove: () => void;
  onMoved: (newId: string) => void;
  onCloseEditObj: () => void;
  onOpenHistoryFromEdit: () => void;
  onCloseStats: () => void;
  onCloseCtxMenu: () => void;
  onCloseSepCtxMenu: () => void;

  // Context menu callbacks
  onCtxSetFilter: (id: string) => void;
  onCtxOptimize: (id: string) => void;
  onCtxEditRoom: (id: string) => void;
  onCtxEditFunction: (id: string) => void;
  onCtxEditObject: (id: string) => void;
  onCtxCopySource: (id: string) => void;
  onCtxRename: (id: string) => void;
  onCtxMove: (id: string) => void;
  onCtxCreateAlias: (id: string) => void;
  onCtxExportJson: (ids: string[]) => void;
  onCtxDelete: (id: string) => void;
  onCtxShowHistory: (id: string, secondaryId?: string) => void;

  // Sep context menu callbacks
  onSepSetFilter: (prefix: string) => void;
  onSepToggleCollapse: (prefix: string, isCollapsed: boolean) => void;
  onSepSelectAll: (prefix: string, groupIds: string[], allChecked: boolean) => void;
  onSepAutoAlias: (prefix: string) => void;
  onSepOptimize: (prefix: string) => void;
  onSepDelete: (prefix: string) => void;

  // Stats callbacks
  onStatsSelectNamespace: (ns: string) => void;
  onStatsIncludeScriptsChange: (v: boolean) => void;
  onStatsScriptUsedIdsChange: (ids: Set<string>) => void;
  onStatsRequestRefreshScripts: () => void;

  showToast: (msg: string, type?: ToastType) => void;
}

export default function StateListModals({
  isEn, language, objects, states, allObjects, existingIds, allObjectIds,
  filteredIds, checkedIds, pattern, roomEnums, fnEnums,
  collapsedPrefixes, allHistoryIds, allSmartIds,
  scriptUsedIds, scriptsFetching, includeScripts, batchProgress,
  onOpenInOtherPanel,
  newDatapointOpen, newDatapointPrefix, newAliasOpen, importOpen,
  optimizeOpen, optimizePath, historyModalId, historyInitialExtra,
  deletingId, deletingGroupPrefix, valueEditId, confirmResetLs,
  multiDeleteOpen, aliasSourceId, copySourceId, renameId, moveId,
  editObjId, editObjInitialTab, ctxMenu, sepCtxMenu, showStats,
  onCloseNewDatapoint, onNewAliasCreated, onCloseNewAlias,
  onCloseImport, onCloseOptimize, onOpenEditFromOptimize,
  onCloseHistory, onCloseValueEdit,
  onConfirmDeleteId, onCancelDeleteId,
  onConfirmResetLs, onCancelResetLs,
  onCloseMultiDelete, onDeleteOne, onDeleteAll,
  onCloseAliasSource, onAliasSourceCreated,
  onCloseCopySource, onCloseRename, onRenamed, onCloseMove, onMoved,
  onCloseEditObj, onOpenHistoryFromEdit,
  onCloseStats, onCloseCtxMenu, onCloseSepCtxMenu,
  onCtxSetFilter, onCtxOptimize, onCtxEditRoom, onCtxEditFunction,
  onCtxEditObject, onCtxCopySource, onCtxRename, onCtxMove,
  onCtxCreateAlias, onCtxExportJson, onCtxDelete, onCtxShowHistory,
  onSepSetFilter, onSepToggleCollapse, onSepSelectAll,
  onSepAutoAlias, onSepOptimize, onSepDelete,
  onStatsSelectNamespace, onStatsIncludeScriptsChange,
  onStatsScriptUsedIdsChange, onStatsRequestRefreshScripts,
  showToast,
}: StateListModalsProps) {
  function patternToInitialId(pat: string | null | undefined): string {
    if (!pat || pat === '*') return '';
    if (pat.endsWith('.*')) return pat.slice(0, -1);
    if (pat.endsWith('*')) return pat.slice(0, -1);
    return pat;
  }

  return (
    <>
      {newDatapointOpen && (
        <NewDatapointModal
          onClose={onCloseNewDatapoint}
          existingIds={existingIds}
          initialId={newDatapointPrefix !== null ? newDatapointPrefix + '.' : patternToInitialId(pattern)}
          language={language}
          allObjectIds={allObjectIds}
        />
      )}
      {newAliasOpen && (() => {
        const singleChecked = checkedIds.size === 1 ? [...checkedIds][0] : undefined;
        return (
          <CreateAliasModal
            sourceId={singleChecked ?? ''}
            sourceObj={singleChecked ? objects[singleChecked] : undefined}
            existingIds={allObjectIds}
            language={language}
            onClose={onCloseNewAlias}
            onCreated={(newId) => { onCloseNewAlias(); onNewAliasCreated(newId); }}
          />
        );
      })()}
      {importOpen && (
        <ImportDatapointsModal
          onClose={onCloseImport}
          language={language}
          existingIds={allObjectIds}
        />
      )}
      {optimizeOpen && (
        <OptimizeModal
          onClose={onCloseOptimize}
          language={language}
          allObjects={allObjects}
          roomMap={Object.fromEntries(roomEnums.map(r => [r.id, r.name]))}
          functionMap={Object.fromEntries(fnEnums.map(f => [f.id, f.name]))}
          roomEnums={roomEnums}
          fnEnums={fnEnums}
          initialPath={optimizePath}
          onOpenEdit={onOpenEditFromOptimize}
        />
      )}
      {historyModalId && (
        <HistoryModal
          stateId={historyModalId}
          unit={objects[historyModalId]?.common?.unit}
          objects={objects}
          language={language}
          initialExtraSeries={historyInitialExtra.length > 0 ? historyInitialExtra : undefined}
          onClose={onCloseHistory}
        />
      )}
      {valueEditId && (
        <ValueEditModal
          id={valueEditId}
          state={states[valueEditId]}
          obj={objects[valueEditId]}
          language={language}
          onClose={onCloseValueEdit}
        />
      )}
      {deletingId && (
        <ConfirmDialog
          title={isEn ? 'Delete 1 datapoint' : '1 Datenpunkt löschen'}
          message={deletingId}
          onConfirm={onConfirmDeleteId}
          onCancel={onCancelDeleteId}
          language={language}
        />
      )}
      {deletingGroupPrefix !== null && (() => {
        const groupIds = filteredIds.filter((id) => {
          const p = id.split('.');
          return (p.length > 1 ? p.slice(0, -1).join('.') : '') === deletingGroupPrefix;
        });
        return (
          <ConfirmDialog
            title={isEn ? `Delete group (${groupIds.length})` : `Gruppe löschen (${groupIds.length})`}
            message={deletingGroupPrefix || 'root'}
            onConfirm={() => { onDeleteAll(groupIds); onCancelDeleteId(); }}
            onCancel={onCancelDeleteId}
            language={language}
          />
        );
      })()}
      {confirmResetLs && (
        <ConfirmDialog
          title={isEn ? 'Reset local settings' : 'Lokale Einstellungen zurücksetzen'}
          description={isEn ? 'The following local storage entries will be deleted:' : 'Folgende Local-Storage-Einträge werden gelöscht:'}
          message="iobroker-col-widths"
          confirmLabel={isEn ? 'Reset' : 'Zurücksetzen'}
          onConfirm={onConfirmResetLs}
          onCancel={onCancelResetLs}
          language={language}
        />
      )}
      {multiDeleteOpen && (
        <MultiDeleteDialog
          ids={[...checkedIds]}
          onDeleteOne={onDeleteOne}
          onDeleteAll={onDeleteAll}
          onClose={onCloseMultiDelete}
          language={language}
        />
      )}
      {aliasSourceId && (
        <CreateAliasModal
          sourceId={aliasSourceId}
          sourceObj={objects[aliasSourceId]}
          existingIds={allObjectIds}
          language={language}
          onClose={onCloseAliasSource}
          onCreated={(newId) => onAliasSourceCreated(newId)}
        />
      )}
      {copySourceId && (
        <CopyDatapointModal
          sourceId={copySourceId}
          sourceObj={objects[copySourceId]}
          existingIds={existingIds}
          language={language}
          onClose={onCloseCopySource}
        />
      )}
      {renameId && objects[renameId] && (
        <RenameDatapointModal
          sourceId={renameId}
          sourceObj={objects[renameId]}
          sourceState={states[renameId]}
          existingIds={existingIds}
          language={language}
          onClose={onCloseRename}
          onRenamed={(newId) => { onCloseRename(); onRenamed(newId); }}
        />
      )}
      {moveId && objects[moveId] && (
        <MoveDatapointModal
          sourceId={moveId}
          sourceObj={objects[moveId]}
          sourceState={states[moveId]}
          existingIds={existingIds}
          language={language}
          onClose={onCloseMove}
          onMoved={(newId) => { onCloseMove(); onMoved(newId); }}
        />
      )}
      {editObjId && objects[editObjId] && (
        <ObjectEditModal
          id={editObjId}
          obj={objects[editObjId]}
          language={language}
          initialTab={editObjInitialTab}
          onClose={onCloseEditObj}
          onOpenHistory={hasHistory(objects[editObjId]) ? onOpenHistoryFromEdit : undefined}
        />
      )}

      {ctxMenu && (() => {
        const { x, y, id: ctxId } = ctxMenu;
        const ctxState = states[ctxId];
        const ctxObj = objects[ctxId];
        const ctxName = getObjectName(ctxObj);
        const items: ContextMenuEntry[] = [];
        items.push({ icon: <Copy size={13} />, label: isEn ? 'Copy ID' : 'ID kopieren', onClick: () => copyText(ctxId) });
        if (ctxName) items.push({ icon: <Copy size={13} />, label: isEn ? 'Copy name' : 'Name kopieren', onClick: () => copyText(ctxName) });
        if (ctxState) items.push({ icon: <Copy size={13} />, label: isEn ? 'Copy value' : 'Wert kopieren', onClick: () => copyText(formatValue(ctxState.val)) });
        items.push({ separator: true } as const);
        if (ctxObj && hasHistory(ctxObj)) {
          const secondaryId = checkedIds.size === 2 && checkedIds.has(ctxId)
            ? [...checkedIds].find(id => id !== ctxId && allHistoryIds.has(id))
            : undefined;
          items.push({ icon: <History size={13} />, label: isEn ? 'Show history' : 'History anzeigen', onClick: () => onCtxShowHistory(ctxId, secondaryId) });
          items.push({ separator: true } as const);
        }
        items.push({ icon: <Search size={13} />, label: isEn ? 'Set as filter' : 'Als Filter setzen', onClick: () => onCtxSetFilter(ctxId) });
        items.push({ icon: <BarChart2 size={13} />, label: isEn ? 'Set as filter & Optimize…' : 'Als Filter setzen & Optimieren…', onClick: () => onCtxOptimize(ctxId) });
        items.push({ icon: <Plus size={13} />, label: isEn ? 'Edit room' : 'Raum bearbeiten', onClick: () => onCtxEditRoom(ctxId) });
        items.push({ icon: <Zap size={13} />, label: isEn ? 'Edit function' : 'Funktion bearbeiten', onClick: () => onCtxEditFunction(ctxId) });
        items.push({ icon: <FileEdit size={13} />, label: isEn ? 'Edit object' : 'Objekt bearbeiten', onClick: () => onCtxEditObject(ctxId) });
        if (onOpenInOtherPanel) {
          items.push({ icon: <Columns2 size={13} />, label: isEn ? 'Open in other panel' : 'Im anderen Panel öffnen', onClick: () => { onOpenInOtherPanel(ctxId); onCloseCtxMenu(); } });
        }
        items.push({ separator: true } as const);
        items.push({ icon: <Copy size={13} />, label: isEn ? 'Copy datapoint' : 'Datenpunkt kopieren', onClick: () => onCtxCopySource(ctxId) });
        items.push({ icon: <PenLine size={13} />, label: isEn ? 'Rename datapoint' : 'Datenpunkt umbenennen', onClick: () => onCtxRename(ctxId) });
        items.push({ icon: <FolderInput size={13} />, label: isEn ? 'Move datapoint' : 'Datenpunkt verschieben', onClick: () => onCtxMove(ctxId) });
        if (!ctxId.startsWith('alias.0.')) {
          items.push({ icon: <Link2 size={13} />, label: isEn ? 'Create alias' : 'Alias anlegen', onClick: () => onCtxCreateAlias(ctxId) });
        }
        items.push({ separator: true } as const);
        const exportIds = checkedIds.has(ctxId) && checkedIds.size > 1 ? [...checkedIds] : [ctxId];
        const exportLabel = exportIds.length > 1
          ? (isEn ? `Export ${exportIds.length} datapoints (JSON)` : `${exportIds.length} Datenpunkte exportieren (JSON)`)
          : (isEn ? 'Export datapoint (JSON)' : 'Datenpunkt exportieren (JSON)');
        items.push({ icon: <Download size={13} />, label: exportLabel, onClick: () => onCtxExportJson(exportIds) });
        const copyJsonIds = checkedIds.has(ctxId) && checkedIds.size > 1 ? [...checkedIds] : [ctxId];
        const copyJsonLabel = copyJsonIds.length > 1
          ? (isEn ? `Copy ${copyJsonIds.length} datapoints as JSON` : `${copyJsonIds.length} Datenpunkte als JSON kopieren`)
          : (isEn ? 'Copy datapoint as JSON' : 'Datenpunkt als JSON kopieren');
        items.push({ icon: <Copy size={13} />, label: copyJsonLabel, onClick: () => {
          const result: Record<string, object> = {};
          for (const id of copyJsonIds) {
            const obj = objects[id] ?? { _id: id };
            const { enums: _enums, ...rest } = obj as unknown as Record<string, unknown>;
            result[id] = rest;
          }
          copyText(JSON.stringify(result, null, 2));
        }});
        items.push({ separator: true } as const);
        items.push({ icon: <Trash2 size={13} />, label: isEn ? 'Delete datapoint' : 'Datenpunkt löschen', onClick: () => onCtxDelete(ctxId), danger: true });
        return <ContextMenu x={x} y={y} items={items} onClose={onCloseCtxMenu} />;
      })()}

      {sepCtxMenu && (() => {
        const { x, y, prefix } = sepCtxMenu;
        const groupIds = filteredIds.filter((id) => {
          const p = id.split('.');
          return (p.length > 1 ? p.slice(0, -1).join('.') : '') === prefix;
        });
        const isCollapsed = collapsedPrefixes === null || collapsedPrefixes.has(prefix);
        const allChecked = groupIds.length > 0 && groupIds.every((id) => checkedIds.has(id));
        const sepItems: ContextMenuEntry[] = [];
        if (prefix) {
          sepItems.push({ icon: <Copy size={13} />, label: isEn ? 'Copy path' : 'Pfad kopieren', onClick: () => copyToClipboard(prefix).then(() => showToast(prefix, 'success')).catch(() => showToast(isEn ? 'Copy failed' : 'Kopieren fehlgeschlagen')) });
          sepItems.push({ icon: <Search size={13} />, label: isEn ? 'Set as filter' : 'Als Filter setzen', onClick: () => onSepSetFilter(prefix) });
          sepItems.push({ separator: true } as const);
        }
        sepItems.push({
          icon: isCollapsed ? <ChevronDown size={13} /> : <ChevronRight size={13} />,
          label: isCollapsed ? (isEn ? 'Expand group' : 'Gruppe aufklappen') : (isEn ? 'Collapse group' : 'Gruppe einklappen'),
          onClick: () => onSepToggleCollapse(prefix, isCollapsed),
        });
        sepItems.push({
          icon: allChecked ? <X size={13} /> : <Check size={13} />,
          label: allChecked
            ? (isEn ? `Deselect all (${groupIds.length})` : `Alle abwählen (${groupIds.length})`)
            : (isEn ? `Select all (${groupIds.length})` : `Alle auswählen (${groupIds.length})`),
          onClick: () => onSepSelectAll(prefix, groupIds, allChecked),
        });
        if (prefix) {
          sepItems.push({ separator: true } as const);
          sepItems.push({ icon: <Link2 size={13} />, label: isEn ? 'Auto-create aliases…' : 'Aliases auto-erstellen…', onClick: () => onSepAutoAlias(prefix) });
        }
        sepItems.push({ separator: true } as const);
        sepItems.push({
          icon: <BarChart2 size={13} />,
          label: isEn ? 'Optimize…' : 'Optimieren…',
          onClick: () => onSepOptimize(prefix),
        });
        sepItems.push({ separator: true } as const);
        sepItems.push({
          icon: <Trash2 size={13} />,
          label: isEn ? `Delete all datapoints (${groupIds.length})` : `Alle Datenpunkte löschen (${groupIds.length})`,
          onClick: () => onSepDelete(prefix),
          danger: true,
        });
        return <ContextMenu x={x} y={y} items={sepItems} onClose={onCloseSepCtxMenu} />;
      })()}

      {showStats && (
        <TreeStatsModal
          onClose={onCloseStats}
          allObjects={allObjects}
          historyIds={allHistoryIds}
          smartIds={allSmartIds}
          language={language}
          onSelectNamespace={onStatsSelectNamespace}
          scriptUsedIds={scriptUsedIds}
          scriptsFetching={scriptsFetching}
          includeScripts={includeScripts}
          onIncludeScriptsChange={onStatsIncludeScriptsChange}
          onScriptUsedIdsChange={onStatsScriptUsedIdsChange}
          onRequestRefreshScripts={onStatsRequestRefreshScripts}
        />
      )}
      {batchProgress && createPortal(
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 px-8 py-6 flex flex-col items-center gap-4 min-w-[240px]">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {isEn ? 'Applying changes…' : 'Änderungen werden angewendet…'}
            </p>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="h-2 rounded-full bg-blue-500 transition-all duration-150"
                style={{ width: `${Math.round((batchProgress.done / batchProgress.total) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
              {batchProgress.done} / {batchProgress.total}
            </p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

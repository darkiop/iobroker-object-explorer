import React from 'react';
import { X, History, Maximize2, Trash2, Plus, Link2, Download, Wand2, Upload, Tag, BarChart2, RotateCcw, EyeOff, Indent, FolderOpen, List, AlignLeft } from 'lucide-react';
import { isGlobPattern } from '../../api/iobroker';
import ColPicker from '../ui/ColPicker';
import type { SortKey } from './StateListColumns';
import type { IoBrokerObject } from '../../types/iobroker';
import type { ExtraSeries } from '../history/HistoryChart';

interface StateListToolbarProps {
  isEn: boolean;
  language: 'en' | 'de';
  showToolbarLabels: boolean;
  groupByPath: boolean;
  shortenGroupPaths: boolean;
  showDesc: boolean;
  hideAliasSubRows: boolean;
  treeFilter: string | null | undefined;
  pattern: string | null | undefined;
  fulltextEnabled: boolean;
  colFilters: Partial<Record<SortKey, string>>;
  checkedIds: Set<string>;
  checkedSepPrefix: string | null;
  pageSize: number;
  visibleCols: SortKey[];
  scriptsFetching: boolean;
  scriptLastUpdated: number | null | undefined;
  allHistoryIds: Set<string>;
  objects: Record<string, IoBrokerObject>;
  newMenuOpen: boolean;
  exportMenuOpen: boolean;
  newMenuRef: React.Ref<HTMLDivElement>;
  exportMenuRef: React.Ref<HTMLDivElement>;
  onNewMenuToggle: () => void;
  onNewDatapoint: () => void;
  onNewAlias: () => void;
  onExportMenuToggle: () => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onExportJsonClipboard: () => void;
  onImport: () => void;
  onEnums: () => void;
  onStats: () => void;
  onScriptRefresh: () => void;
  onOptimize: () => void;
  onAliasReplace: (initialStr: string) => void;
  onAutoAlias: (target: string) => void;
  onHistoryOpen: (primary: string, extra: ExtraSeries[]) => void;
  onDeleteSelected: () => void;
  onClearTreeFilter: () => void;
  onToggleShowDesc: () => void;
  onToggleHideAliasSubRows: () => void;
  onToggleGroupByPath: () => void;
  onToggleShortenGroupPaths: () => void;
  onFitToContainer: () => void;
  onResetLs: () => void;
  onPageSizeChange: (size: number) => void;
  onColChange: (cols: SortKey[]) => void;
}

export default function StateListToolbar({
  isEn, language, showToolbarLabels,
  groupByPath, shortenGroupPaths, showDesc, hideAliasSubRows,
  treeFilter, pattern, fulltextEnabled, colFilters,
  checkedIds, checkedSepPrefix, pageSize, visibleCols,
  scriptsFetching, scriptLastUpdated,
  allHistoryIds, objects,
  newMenuOpen, exportMenuOpen, newMenuRef, exportMenuRef,
  onNewMenuToggle, onNewDatapoint, onNewAlias,
  onExportMenuToggle, onExportCsv, onExportJson, onExportJsonClipboard,
  onImport, onEnums, onStats, onScriptRefresh, onOptimize,
  onAliasReplace, onAutoAlias, onHistoryOpen,
  onDeleteSelected, onClearTreeFilter,
  onToggleShowDesc, onToggleHideAliasSubRows, onToggleGroupByPath, onToggleShortenGroupPaths,
  onFitToContainer, onResetLs, onPageSizeChange, onColChange,
}: StateListToolbarProps) {
  const checkedArr = [...checkedIds];
  const historyChecked = checkedArr.filter(id => allHistoryIds.has(id));
  const historyEnabled = checkedArr.length >= 1 && checkedArr.length <= 2 && checkedArr.every(id => allHistoryIds.has(id));
  const hasAnyHistory = historyChecked.length > 0;

  const idFilter = colFilters.id?.trim() ?? '';
  const autoAliasTarget = (() => {
    const t = checkedSepPrefix
      ?? (treeFilter ? treeFilter.replace(/\.$/, '') : null)
      ?? (!isGlobPattern(idFilter) && idFilter.includes('.') ? idFilter : null);
    return t && t.startsWith('alias.') ? null : t;
  })();

  const hasAliasChecked = checkedArr.some((id) => id.startsWith('alias.'));

  function handleAliasReplace() {
    const firstAliasId = checkedArr.find((id) => id.startsWith('alias.'));
    const rawTarget = firstAliasId ? objects[firstAliasId]?.common?.alias?.id : undefined;
    const initialStr = typeof rawTarget === 'string' ? rawTarget : (rawTarget?.read ?? rawTarget?.write ?? '');
    onAliasReplace(initialStr);
  }

  function handleHistoryClick() {
    if (!historyEnabled) return;
    const [primary, secondary] = checkedArr;
    const extra: ExtraSeries[] = secondary ? [{
      id: secondary,
      label: (() => { const n = objects[secondary]?.common?.name; return (typeof n === 'string' ? n : (n?.de || n?.en)) || secondary.split('.').slice(-2).join('.'); })(),
      unit: objects[secondary]?.common?.unit,
    }] : [];
    onHistoryOpen(primary, extra);
  }

  return (
    <div className="flex items-center justify-between pl-1 pr-3 py-1 shrink-0 border-b border-gray-200 dark:border-gray-800">
      <div className="flex items-center gap-2">
        <div className="relative" ref={newMenuRef}>
          <button
            onClick={onNewMenuToggle}
            title={isEn ? 'New…' : 'Neu…'}
            className={`flex items-center gap-1.5 rounded-lg transition-colors ${newMenuOpen ? 'text-blue-600 bg-blue-500/15 dark:text-blue-400 dark:bg-blue-500/20' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-500/10 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-500/10'} ${showToolbarLabels ? 'px-2.5 py-1 text-xs font-medium' : 'justify-center w-7 h-7'}`}
          >
            <Plus size={16} />
            {showToolbarLabels && <span>{isEn ? 'New' : 'Neu'}</span>}
          </button>
          {newMenuOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg overflow-hidden min-w-[150px]">
              <button
                onClick={onNewDatapoint}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Plus size={13} />
                {isEn ? 'New datapoint' : 'Neuer Datenpunkt'}
              </button>
              <button
                onClick={onNewAlias}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Link2 size={13} />
                {isEn ? 'New alias' : 'Neuer Alias'}
              </button>
            </div>
          )}
        </div>
        <div className="relative" ref={exportMenuRef}>
          <button
            onClick={onExportMenuToggle}
            title={isEn ? 'Export' : 'Exportieren'}
            className={`flex items-center gap-1.5 rounded-lg transition-colors ${exportMenuOpen ? 'text-blue-600 bg-blue-500/15 dark:text-blue-400 dark:bg-blue-500/20' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-500/10 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-500/10'} ${showToolbarLabels ? 'px-2.5 py-1 text-xs font-medium' : 'justify-center w-7 h-7'}`}
          >
            <Download size={16} />
            {showToolbarLabels && <span>Export</span>}
          </button>
          {exportMenuOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg overflow-hidden min-w-[130px]">
              <button onClick={onExportCsv} className="px-3 py-1.5 text-xs text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">CSV</button>
              <button onClick={onExportJson} className="px-3 py-1.5 text-xs text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">JSON</button>
              <button onClick={onExportJsonClipboard} className="px-3 py-1.5 text-xs text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" title={isEn ? 'Copy filtered list as JSON to clipboard' : 'Gefilterte Liste als JSON in die Zwischenablage kopieren'}>{isEn ? 'JSON (Clipboard)' : 'JSON (Zwischenablage)'}</button>
            </div>
          )}
        </div>
        <button
          onClick={onImport}
          title={isEn ? 'Import datapoints (JSON)' : 'Datenpunkte importieren (JSON)'}
          className={`flex items-center gap-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-500/10 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-500/10 transition-colors ${showToolbarLabels ? 'px-2.5 py-1 text-xs font-medium' : 'justify-center w-7 h-7'}`}
        >
          <Upload size={16} />
          {showToolbarLabels && <span>Import</span>}
        </button>
        <button
          onClick={onEnums}
          title={isEn ? 'Manage enums (rooms & functions)' : 'Enums verwalten (Räume & Funktionen)'}
          className={`flex items-center gap-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-500/10 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-500/10 transition-colors ${showToolbarLabels ? 'px-2.5 py-1 text-xs font-medium' : 'justify-center w-7 h-7'}`}
        >
          <Tag size={15} />
          {showToolbarLabels && <span>{isEn ? 'Enums' : 'Enums'}</span>}
        </button>
        <button
          onClick={onStats}
          title={isEn ? 'Statistics' : 'Statistik'}
          className={`flex items-center gap-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-500/10 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-500/10 transition-colors ${showToolbarLabels ? 'px-2.5 py-1 text-xs font-medium' : 'justify-center w-7 h-7'}`}
        >
          <BarChart2 size={15} />
          {showToolbarLabels && <span>{isEn ? 'Statistics' : 'Statistik'}</span>}
        </button>
        <button
          onClick={onScriptRefresh}
          disabled={scriptsFetching}
          title={scriptLastUpdated
            ? `${isEn ? 'Refresh script usage index' : 'Skript-Index aktualisieren'} · ${isEn ? 'Last update' : 'Zuletzt'}: ${new Date(scriptLastUpdated).toLocaleTimeString()}`
            : isEn ? 'Refresh script usage index' : 'Skript-Index aktualisieren'}
          className={`flex items-center gap-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-500/10 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${showToolbarLabels ? 'px-2.5 py-1 text-xs font-medium' : 'justify-center w-7 h-7'}`}
        >
          <RotateCcw size={15} className={scriptsFetching ? 'animate-spin' : ''} />
          {showToolbarLabels && <span>{isEn ? 'Script Index' : 'Skript-Index'}</span>}
        </button>
        <button
          onClick={onOptimize}
          title={isEn ? 'Analyze datapoints' : 'Datenpunkte analysieren'}
          className={`flex items-center gap-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-500/10 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-500/10 transition-colors ${showToolbarLabels ? 'px-2.5 py-1 text-xs font-medium' : 'justify-center w-7 h-7'}`}
        >
          <Wand2 size={15} />
          {showToolbarLabels && <span>{isEn ? 'Optimize' : 'Optimieren'}</span>}
        </button>
        {hasAliasChecked && (
          <button
            onClick={handleAliasReplace}
            title={isEn ? 'Find & Replace in alias targets' : 'Alias-Ziele suchen & ersetzen'}
            className={`flex items-center gap-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-500/10 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-500/10 transition-colors ${showToolbarLabels ? 'px-2.5 py-1 text-xs font-medium' : 'justify-center w-7 h-7'}`}
          >
            <Link2 size={15} />
            {showToolbarLabels && <span>{isEn ? 'Alias Replace' : 'Alias Ersetzen'}</span>}
          </button>
        )}
        <button
          onClick={() => autoAliasTarget && onAutoAlias(autoAliasTarget)}
          disabled={!autoAliasTarget}
          title={autoAliasTarget
            ? (isEn ? `Auto-create aliases for: ${autoAliasTarget}` : `Aliases auto-erstellen für: ${autoAliasTarget}`)
            : (isEn ? 'Set a tree filter or ID filter to a device path first' : 'Zuerst einen Baum- oder ID-Filter auf einen Gerätepfad setzen')}
          className={`flex items-center gap-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-500/10 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${showToolbarLabels ? 'px-2.5 py-1 text-xs font-medium' : 'justify-center w-7 h-7'}`}
        >
          <Link2 size={15} />
          {showToolbarLabels && <span>{isEn ? 'Auto Alias' : 'Auto Alias'}</span>}
        </button>
        <button
          disabled={!historyEnabled}
          onClick={handleHistoryClick}
          title={
            historyEnabled
              ? (isEn ? 'History' : 'Verlauf')
              : hasAnyHistory
                ? (isEn ? 'Select 1–2 datapoints with history' : '1–2 Datenpunkte mit History auswählen')
                : (isEn ? 'No datapoint with history selected' : 'Kein Datenpunkt mit History ausgewählt')
          }
          className={`flex items-center gap-1.5 rounded-lg transition-colors disabled:cursor-not-allowed ${
            historyEnabled
              ? `text-gray-500 hover:text-blue-600 hover:bg-blue-500/10 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-500/10`
              : `text-gray-300 dark:text-gray-600`
          } ${showToolbarLabels ? 'px-2.5 py-1 text-xs font-medium' : 'justify-center w-7 h-7'}`}
        >
          <History size={15} />
          {showToolbarLabels && <span>History</span>}
        </button>
        {checkedIds.size > 0 && (
          <button
            onClick={onDeleteSelected}
            title={isEn ? 'Delete selected datapoints' : 'Ausgewählte Datenpunkte löschen'}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-red-600 bg-red-500/10 hover:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500/20 transition-colors"
          >
            <Trash2 size={13} />
            {isEn ? `Delete ${checkedIds.size}` : `${checkedIds.size} löschen`}
          </button>
        )}
      </div>
      <div className="flex flex-col items-center gap-0.5">
        {treeFilter && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/15 border border-blue-400/30 text-blue-600 dark:text-blue-400 text-sm font-mono max-w-[520px]">
            <span className="truncate">{treeFilter.replace(/\.$/, '')}</span>
            <button onClick={onClearTreeFilter} title="Filter entfernen" className="shrink-0 hover:text-blue-800 dark:hover:text-blue-200">
              <X size={10} />
            </button>
          </span>
        )}
        {fulltextEnabled && pattern && !isGlobPattern(pattern) && pattern !== '*' && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-violet-500/15 border border-violet-400/30 text-violet-600 dark:text-violet-400 text-sm font-mono max-w-[520px]">
            <span className="truncate">Volltext: {pattern}</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleShowDesc}
          title={showDesc
            ? (isEn ? 'Hide description in Name column' : 'Beschreibung in der Name-Spalte ausblenden')
            : (isEn ? 'Show description in Name column' : 'Beschreibung in der Name-Spalte anzeigen')}
          className={`p-2 rounded-lg transition-colors ${
            showDesc
              ? 'text-blue-600 bg-blue-500/15 hover:bg-blue-500/25 dark:text-blue-400 dark:hover:bg-blue-500/20'
              : 'text-gray-400 hover:text-blue-600 hover:bg-blue-500/10 dark:text-gray-500 dark:hover:text-blue-400 dark:hover:bg-blue-500/10'
          }`}
        >
          <AlignLeft size={17} />
        </button>
        <button
          onClick={onToggleHideAliasSubRows}
          title={hideAliasSubRows
            ? (isEn ? 'Show alias source/target lines' : 'Alias-Quell-/Zielzeilen anzeigen')
            : (isEn ? 'Hide alias source/target lines' : 'Alias-Quell-/Zielzeilen ausblenden')}
          className={`p-2 rounded-lg transition-colors ${
            hideAliasSubRows
              ? 'text-blue-600 bg-blue-500/15 hover:bg-blue-500/25 dark:text-blue-400 dark:hover:bg-blue-500/20'
              : 'text-gray-400 hover:text-blue-600 hover:bg-blue-500/10 dark:text-gray-500 dark:hover:text-blue-400 dark:hover:bg-blue-500/10'
          }`}
        >
          <EyeOff size={17} />
        </button>
        <button
          onClick={onToggleGroupByPath}
          title={groupByPath ? (isEn ? 'Switch to flat view' : 'Flache Ansicht') : (isEn ? 'Switch to grouped view' : 'Gruppierte Ansicht')}
          className={`p-2 rounded-lg transition-colors ${
            !groupByPath
              ? 'text-blue-600 bg-blue-500/15 hover:bg-blue-500/25 dark:text-blue-400 dark:hover:bg-blue-500/20'
              : 'text-gray-400 hover:text-blue-600 hover:bg-blue-500/10 dark:text-gray-500 dark:hover:text-blue-400 dark:hover:bg-blue-500/10'
          }`}
        >
          <span className="group/gbp">
            {groupByPath
              ? <><FolderOpen size={17} className="group-hover/gbp:hidden" /><List size={17} className="hidden group-hover/gbp:block" /></>
              : <><List size={17} className="group-hover/gbp:hidden" /><FolderOpen size={17} className="hidden group-hover/gbp:block" /></>
            }
          </span>
        </button>
        {groupByPath && (
          <button
            onClick={onToggleShortenGroupPaths}
            title={shortenGroupPaths ? (isEn ? 'Show full paths' : 'Vollständige Pfade anzeigen') : (isEn ? 'Shorten paths' : 'Pfade kürzen')}
            className={`p-2 rounded-lg transition-colors ${
              shortenGroupPaths
                ? 'text-blue-600 bg-blue-500/15 hover:bg-blue-500/25 dark:text-blue-400 dark:hover:bg-blue-500/20'
                : 'text-gray-400 hover:text-blue-600 hover:bg-blue-500/10 dark:text-gray-500 dark:hover:text-blue-400 dark:hover:bg-blue-500/10'
            }`}
          >
            <Indent size={17} />
          </button>
        )}
        <button
          onClick={onFitToContainer}
          title={isEn ? 'Stretch columns to 100%' : 'Spalten auf 100% strecken'}
          className="p-2 rounded-lg transition-colors text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700"
        >
          <Maximize2 size={17} />
        </button>
        <button
          onClick={onResetLs}
          title={isEn ? 'Reset settings (local storage)' : 'Einstellungen zurücksetzen'}
          className="p-2 rounded-lg transition-colors text-gray-400 hover:text-red-500 hover:bg-red-500/10 dark:text-gray-500 dark:hover:text-red-400 dark:hover:bg-red-500/10"
        >
          <RotateCcw size={17} />
        </button>
        {!groupByPath && pageSize !== undefined && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
            title={isEn ? 'Rows per page' : 'Zeilen pro Seite'}
            className="h-8 px-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-gray-300 focus:outline-none focus:border-blue-400 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:focus:border-blue-500 cursor-pointer"
          >
            {[200, 500, 1000, 3000].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
        <ColPicker visible={visibleCols} onChange={onColChange} language={language} />
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, BarChart2, ChevronUp, ChevronDown, Trash2, AlertTriangle, RotateCcw } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useDeleteSubtree, useScriptUsedIds, useRefreshScriptUsedIds } from '../hooks/useStates';
import type { IoBrokerObject } from '../types/iobroker';

interface Props {
  onClose: () => void;
  allObjects: Record<string, IoBrokerObject>;
  historyIds: Set<string>;
  smartIds: Set<string>;
  language: 'en' | 'de';
  onSelectNamespace?: (ns: string) => void;
}

type SortKey = 'ns' | 'total' | 'states' | 'structure' | 'history' | 'smart' | 'aliases' | 'scripts';

interface NsStats {
  ns: string;
  total: number;
  states: number;
  structure: number;
  history: number;
  smart: number;
  aliases: number;
  scripts: number;
}

export default function TreeStatsModal({ onClose, allObjects, historyIds, smartIds, language, onSelectNamespace }: Props) {
  useEscapeKey(onClose);
  const isEn = language === 'en';

  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [pendingDelete, setPendingDelete] = useState<NsStats | null>(null);

  const allObjectIds = useMemo(() => Object.keys(allObjects), [allObjects]);
  const deleteSubtree = useDeleteSubtree();
  const { data: scriptUsedIds, isFetching: scriptsFetching } = useScriptUsedIds(allObjectIds);
  const refreshScriptIds = useRefreshScriptUsedIds(allObjectIds);

  const { rows, totals } = useMemo(() => {
    const map = new Map<string, NsStats>();
    const empty = (): NsStats => ({ ns: '', total: 0, states: 0, structure: 0, history: 0, smart: 0, aliases: 0, scripts: 0 });

    for (const [id, obj] of Object.entries(allObjects)) {
      const parts = id.split('.');
      const ns = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0];
      if (!map.has(ns)) map.set(ns, { ...empty(), ns });
      const s = map.get(ns)!;
      s.total++;
      if (obj.type === 'state') s.states++;
      if (obj.type === 'folder' || obj.type === 'device' || obj.type === 'channel') s.structure++;
      if (historyIds.has(id)) s.history++;
      if (smartIds.has(id)) s.smart++;
      if (id.startsWith('alias.0.')) s.aliases++;
      if (scriptUsedIds?.has(id)) s.scripts++;
    }

    const allRows = Array.from(map.values());
    const totals: NsStats = allRows.reduce(
      (acc, r) => ({ ...acc, total: acc.total + r.total, states: acc.states + r.states, structure: acc.structure + r.structure, history: acc.history + r.history, smart: acc.smart + r.smart, aliases: acc.aliases + r.aliases, scripts: acc.scripts + r.scripts }),
      empty()
    );

    return { rows: allRows, totals };
  }, [allObjects, historyIds, smartIds, scriptUsedIds]);

  const maxTotal = useMemo(() => Math.max(...rows.map((r) => r.total), 1), [rows]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [rows, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function handleDeleteConfirm() {
    if (!pendingDelete) return;
    deleteSubtree.mutate({ id: pendingDelete.ns, allObjects });
    setPendingDelete(null);
  }

  const thClass = 'px-2 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-800 dark:hover:text-gray-200 whitespace-nowrap';
  const thRClass = 'px-2 py-2 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-800 dark:hover:text-gray-200 whitespace-nowrap';
  const tdClass = 'px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300';
  const tdRClass = 'px-2 py-1.5 text-xs text-right tabular-nums text-gray-700 dark:text-gray-300';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop-in bg-black/60 backdrop-blur-sm p-4"
      onClick={pendingDelete ? undefined : onClose}
    >
      <div
        className="w-full max-w-4xl bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <BarChart2 size={15} className="text-blue-500" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {isEn ? 'Object Tree Statistics' : 'Objektbaum-Statistik'}
            </h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              ({rows.length} {isEn ? 'namespaces' : 'Namespaces'})
            </span>
            {onSelectNamespace && (
              <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                — {isEn ? 'click row to filter' : 'Zeile klicken zum Filtern'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={refreshScriptIds}
              disabled={scriptsFetching}
              title={isEn ? 'Refresh script index (cached 1h)' : 'Skript-Index aktualisieren (1h gecacht)'}
              className="p-1 rounded text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
            >
              <RotateCcw size={14} className={scriptsFetching ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-y-auto flex-1 min-h-0">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white dark:bg-gray-900 z-10">
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className={thClass} onClick={() => handleSort('ns')}>
                  {isEn ? 'Namespace' : 'Namespace'}<SortIcon k="ns" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thRClass} onClick={() => handleSort('total')} style={{ minWidth: 140 }}>
                  {isEn ? 'Objects' : 'Objekte'}<SortIcon k="total" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thRClass} onClick={() => handleSort('states')}>
                  {isEn ? 'States' : 'States'}<SortIcon k="states" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thRClass} onClick={() => handleSort('structure')}>
                  {isEn ? 'Folders/Dev/Ch' : 'Ordner/Ger/Kan'}<SortIcon k="structure" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thRClass} onClick={() => handleSort('history')}>
                  {isEn ? 'History' : 'History'}<SortIcon k="history" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thRClass} onClick={() => handleSort('smart')}>
                  {isEn ? 'Smart' : 'Smart'}<SortIcon k="smart" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thRClass} onClick={() => handleSort('aliases')}>
                  {isEn ? 'Aliases' : 'Aliase'}<SortIcon k="aliases" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className={thRClass} onClick={() => handleSort('scripts')}>
                  {isEn ? 'Scripts' : 'Skripte'}<SortIcon k="scripts" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th className="px-2 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.ns}
                  className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 group ${onSelectNamespace ? 'cursor-pointer' : ''}`}
                  onClick={onSelectNamespace ? () => { onSelectNamespace(r.ns); onClose(); } : undefined}
                >
                  <td className={`${tdClass} font-mono`}>
                    {onSelectNamespace ? (
                      <span className="text-blue-600 dark:text-blue-400 hover:underline">{r.ns}</span>
                    ) : r.ns}
                  </td>
                  <td className={tdRClass} style={{ minWidth: 140 }}>
                    <div className="flex items-center justify-end gap-2">
                      <div className="flex-1 max-w-[80px] h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-400 dark:bg-blue-500"
                          style={{ width: `${(r.total / maxTotal) * 100}%` }}
                        />
                      </div>
                      <span className="w-10 text-right">{r.total}</span>
                    </div>
                  </td>
                  <td className={tdRClass}>{r.states}</td>
                  <td className={tdRClass}>{r.structure}</td>
                  <td className={`${tdRClass} ${r.history > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-600'}`}>
                    {r.history > 0 ? r.history : '—'}
                  </td>
                  <td className={`${tdRClass} ${r.smart > 0 ? 'text-violet-600 dark:text-violet-400' : 'text-gray-400 dark:text-gray-600'}`}>
                    {r.smart > 0 ? r.smart : '—'}
                  </td>
                  <td className={`${tdRClass} ${r.aliases > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-600'}`}>
                    {r.aliases > 0 ? r.aliases : '—'}
                  </td>
                  <td className={`${tdRClass} ${r.scripts > 0 ? 'text-green-600 dark:text-green-500' : 'text-gray-400 dark:text-gray-600'}`}>
                    {r.scripts > 0 ? r.scripts : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      title={isEn ? `Delete namespace ${r.ns}` : `Namespace ${r.ns} löschen`}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); setPendingDelete(r); }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 font-semibold">
                <td className={`${tdClass} text-gray-500 dark:text-gray-400`}>
                  {isEn ? 'Total' : 'Gesamt'}
                </td>
                <td className={tdRClass}>{totals.total}</td>
                <td className={tdRClass}>{totals.states}</td>
                <td className={tdRClass}>{totals.structure}</td>
                <td className={`${tdRClass} ${totals.history > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                  {totals.history}
                </td>
                <td className={`${tdRClass} ${totals.smart > 0 ? 'text-violet-600 dark:text-violet-400' : ''}`}>
                  {totals.smart}
                </td>
                <td className={`${tdRClass} ${totals.aliases > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                  {totals.aliases}
                </td>
                <td className={`${tdRClass} ${totals.scripts > 0 ? 'text-green-600 dark:text-green-500' : ''}`}>
                  {scriptUsedIds === undefined ? '…' : totals.scripts}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Inline delete confirmation */}
        {pendingDelete && (
          <div className="shrink-0 border-t border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-5 py-3 flex items-center gap-3">
            <AlertTriangle size={15} className="text-red-500 shrink-0" />
            <span className="text-xs text-red-700 dark:text-red-300 flex-1">
              {isEn
                ? `Delete namespace "${pendingDelete.ns}" and all ${pendingDelete.total} objects (${pendingDelete.states} states)?`
                : `Namespace „${pendingDelete.ns}" und alle ${pendingDelete.total} Objekte (${pendingDelete.states} States) löschen?`}
            </span>
            <button
              onClick={() => setPendingDelete(null)}
              className="px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {isEn ? 'Cancel' : 'Abbrechen'}
            </button>
            <button
              onClick={handleDeleteConfirm}
              className="px-3 py-1 text-xs rounded bg-red-600 hover:bg-red-700 text-white font-medium"
            >
              {isEn ? 'Delete' : 'Löschen'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function SortIcon({ k, sortKey, sortDir }: { k: SortKey; sortKey: SortKey; sortDir: 'asc' | 'desc' }) {
  if (k !== sortKey) return <span className="opacity-0 w-3 inline-block" />;
  return sortDir === 'asc'
    ? <ChevronUp size={11} className="inline-block ml-0.5 opacity-60" />
    : <ChevronDown size={11} className="inline-block ml-0.5 opacity-60" />;
}

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, FolderX, Search, Filter, Folder, Cpu, Layers } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import type { IoBrokerObject } from '../../types/iobroker';
import { ColoredId } from '../../utils/coloredId';
import { useCreateDatapoint } from '../../hooks/useObjectMutations';
import { useToast } from '../../context/ToastContext';

type ObjType = 'folder' | 'device' | 'channel';

interface Props {
  onClose: () => void;
  language: 'en' | 'de';
  allObjects: Record<string, IoBrokerObject>;
  onSetFilter: (id: string) => void;
}

export default function VirtualFoldersModal({ onClose, language, allObjects, onSetFilter }: Props) {
  useEscapeKey(onClose);
  const isEn = language === 'en';
  const [filter, setFilter] = useState('alias.0.');
  const [creating, setCreating] = useState<string | null>(null);
  const createDatapoint = useCreateDatapoint();
  const showToast = useToast();

  const virtualFolders = useMemo(() => {
    const seen = new Set<string>();
    for (const id of Object.keys(allObjects)) {
      const parts = id.split('.');
      for (let len = 3; len < parts.length; len++) {
        const prefix = parts.slice(0, len).join('.');
        seen.add(prefix);
      }
    }
    return [...seen].filter((p) => !allObjects[p]).sort();
  }, [allObjects]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return virtualFolders;
    return virtualFolders.filter((id) => id.toLowerCase().includes(q));
  }, [virtualFolders, filter]);

  function handleCreate(id: string, type: ObjType) {
    setCreating(id + ':' + type);
    const name = id.split('.').pop() ?? id;
    createDatapoint.mutate(
      { id, common: { name }, objectType: type },
      {
        onSuccess: () => showToast(`${id} → ${type}`, 'success'),
        onError: (err) => showToast(String(err), 'error'),
        onSettled: () => setCreating(null),
      }
    );
  }

  const CREATE_BTNS: { type: ObjType; icon: React.ReactNode; labelEn: string; labelDe: string; color: string }[] = [
    { type: 'folder',  icon: <Folder size={11} />, labelEn: 'folder',  labelDe: 'Ordner',  color: 'hover:text-yellow-500 dark:hover:text-yellow-400' },
    { type: 'device',  icon: <Cpu    size={11} />, labelEn: 'device',  labelDe: 'Gerät',   color: 'hover:text-sky-500 dark:hover:text-sky-400' },
    { type: 'channel', icon: <Layers size={11} />, labelEn: 'channel', labelDe: 'Kanal',   color: 'hover:text-indigo-500 dark:hover:text-indigo-400' },
  ];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col w-full max-w-2xl max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <FolderX size={18} className="text-yellow-500" />
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
              {isEn ? 'Virtual Folders' : 'Virtuelle Ordner'}
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 font-medium">
              {filtered.length}{filtered.length !== virtualFolders.length ? ` / ${virtualFolders.length}` : ''}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Description */}
        <p className="px-5 py-2.5 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800 shrink-0">
          {isEn
            ? 'These folder paths exist only because child objects use them as ID prefixes. No real ioBroker object exists for these IDs.'
            : 'Diese Ordnerpfade existieren nur, weil Kind-Objekte sie als ID-Präfix nutzen. Es gibt kein echtes ioBroker-Objekt für diese IDs.'}
        </p>

        {/* Filter */}
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-1.5">
            <Search size={13} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={isEn ? 'Filter by ID…' : 'Nach ID filtern…'}
              className="flex-1 bg-transparent text-xs text-gray-700 dark:text-gray-300 placeholder-gray-400 outline-none font-mono"
              autoFocus
            />
            {filter && (
              <button onClick={() => setFilter('')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 px-3 py-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500 gap-2">
              <FolderX size={32} className="opacity-40" />
              <span className="text-sm">{isEn ? 'No virtual folders found' : 'Keine virtuellen Ordner gefunden'}</span>
            </div>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {filtered.map((id) => (
                  <tr key={id} className="group hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded">
                    <td className="px-2 py-1 font-mono">
                      <ColoredId id={id} className="italic opacity-70" />
                    </td>
                    <td className="px-2 py-1 text-gray-400 dark:text-gray-500 text-right whitespace-nowrap">
                      {id.split('.').length - 1} {isEn ? 'levels' : 'Ebenen'}
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {CREATE_BTNS.map(({ type, icon, labelEn, labelDe, color }) => {
                          const key = id + ':' + type;
                          const busy = creating === key;
                          return (
                            <button
                              key={type}
                              onClick={() => handleCreate(id, type)}
                              disabled={busy || creating !== null}
                              title={`${isEn ? 'Create as' : 'Erstellen als'} ${isEn ? labelEn : labelDe}`}
                              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-gray-400 ${color} disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-transparent hover:border-current`}
                            >
                              {icon}
                              <span className="text-[10px]">{isEn ? labelEn : labelDe}</span>
                            </button>
                          );
                        })}
                        <button
                          onClick={() => { onSetFilter(id); onClose(); }}
                          title={isEn ? 'Set as ID filter in table' : 'Als ID-Filter in Tabelle setzen'}
                          className="ml-1 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                        >
                          <Filter size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

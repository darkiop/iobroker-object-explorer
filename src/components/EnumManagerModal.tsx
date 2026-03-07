import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight, ChevronDown, Pencil, Trash2, Plus, Check, Loader2 } from 'lucide-react';
import type { IoBrokerObject } from '../types/iobroker';
import { useCreateEnum, useRenameEnum, useDeleteEnum, useUpdateRoomMembership, useUpdateFunctionMembership } from '../hooks/useStates';

interface EnumManagerModalProps {
  allObjects: Record<string, IoBrokerObject>;
  language: 'en' | 'de';
  onClose: () => void;
}

type Tab = 'rooms' | 'functions';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'new';
}

function getLocalizedName(name: unknown, lang: 'en' | 'de'): string {
  if (!name) return '';
  if (typeof name === 'string') return name;
  if (typeof name === 'object' && name !== null) {
    const n = name as Record<string, string>;
    return n[lang] ?? n['en'] ?? n['de'] ?? Object.values(n)[0] ?? '';
  }
  return String(name);
}

interface EnumEntry {
  id: string;
  name: string;
  members: string[];
}

export default function EnumManagerModal({ allObjects, language, onClose }: EnumManagerModalProps) {
  const isEn = language === 'en';
  const [tab, setTab] = useState<Tab>('rooms');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newName, setNewName] = useState('');
  const [newError, setNewError] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);

  const createEnum = useCreateEnum();
  const renameEnum = useRenameEnum();
  const deleteEnum = useDeleteEnum();
  const updateRoom = useUpdateRoomMembership();
  const updateFn = useUpdateFunctionMembership();

  const prefix = tab === 'rooms' ? 'enum.rooms.' : 'enum.functions.';

  const enums: EnumEntry[] = Object.entries(allObjects)
    .filter(([id]) => id.startsWith(prefix))
    .map(([id, obj]) => ({
      id,
      name: getLocalizedName(obj.common?.name, language) || id,
      members: obj.common?.members ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    setExpandedId(null);
    setRenamingId(null);
    setNewName('');
    setNewError('');
    setDeleteConfirmId(null);
  }, [tab]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  function startRename(entry: EnumEntry) {
    setRenamingId(entry.id);
    setRenameValue(entry.name);
  }

  function commitRename() {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return; }
    renameEnum.mutate({ enumId: renamingId, newName: renameValue.trim() });
    setRenamingId(null);
  }

  function handleCreate() {
    const name = newName.trim();
    if (!name) { setNewError(isEn ? 'Name required' : 'Name erforderlich'); return; }
    const slug = slugify(name);
    const enumId = `${prefix}${slug}`;
    if (allObjects[enumId]) {
      setNewError(isEn ? `ID already exists: ${enumId}` : `ID bereits vorhanden: ${enumId}`);
      return;
    }
    setNewError('');
    createEnum.mutate({ enumId, name }, { onSuccess: () => setNewName('') });
  }

  function handleRemoveMember(memberId: string, enumId: string) {
    if (tab === 'rooms') {
      updateRoom.mutate({ objectId: memberId, oldRoomEnumId: enumId, newRoomEnumId: null });
    } else {
      updateFn.mutate({ objectId: memberId, oldFnEnumId: enumId, newFnEnumId: null });
    }
  }

  function getMemberLabel(memberId: string): string {
    const obj = allObjects[memberId];
    if (!obj) return memberId;
    const name = getLocalizedName(obj.common?.name, language);
    return name ? `${name} (${memberId})` : memberId;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {isEn ? 'Enum Management' : 'Enum-Verwaltung'}
          </h3>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-4 shrink-0">
          {(['rooms', 'functions'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t === 'rooms' ? (isEn ? 'Rooms' : 'Räume') : (isEn ? 'Functions' : 'Funktionen')}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {enums.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-gray-400 dark:text-gray-500 italic">
              {isEn ? 'No entries yet.' : 'Noch keine Einträge.'}
            </div>
          )}
          {enums.map((entry) => {
            const isExpanded = expandedId === entry.id;
            const isRenaming = renamingId === entry.id;
            const isDeleting = deleteConfirmId === entry.id;
            return (
              <div key={entry.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 group">
                  {/* Expand toggle */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  {/* Name / rename input */}
                  {isRenaming ? (
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }}
                      className="flex-1 text-xs px-1.5 py-0.5 rounded border border-blue-400 dark:border-blue-500 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 outline-none"
                    />
                  ) : (
                    <span
                      className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    >
                      {entry.name}
                    </span>
                  )}

                  {/* Member count badge */}
                  {!isRenaming && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                      {entry.members.length}
                    </span>
                  )}

                  {/* Actions */}
                  {!isRenaming && !isDeleting && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => startRename(entry)}
                        title={isEn ? 'Rename' : 'Umbenennen'}
                        className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(entry.id)}
                        title={isEn ? 'Delete' : 'Löschen'}
                        className="p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}

                  {/* Delete confirmation inline */}
                  {isDeleting && (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-red-500 dark:text-red-400">{isEn ? 'Delete?' : 'Löschen?'}</span>
                      <button
                        onClick={() => {
                          deleteEnum.mutate(entry.id);
                          setDeleteConfirmId(null);
                          if (expandedId === entry.id) setExpandedId(null);
                        }}
                        className="px-2 py-0.5 text-xs rounded bg-red-500 text-white hover:bg-red-600"
                      >
                        {deleteEnum.isPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="px-2 py-0.5 text-xs rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Expanded member list */}
                {isExpanded && (
                  <div className="pb-1 bg-gray-50/60 dark:bg-gray-800/30">
                    {entry.members.length === 0 && (
                      <div className="px-8 py-2 text-xs text-gray-400 dark:text-gray-500 italic">
                        {isEn ? 'No members' : 'Keine Mitglieder'}
                      </div>
                    )}
                    {entry.members.map((memberId) => (
                      <div key={memberId} className="flex items-center gap-2 px-8 py-1 group/member hover:bg-gray-100 dark:hover:bg-gray-800/50">
                        <span className="flex-1 text-xs text-gray-600 dark:text-gray-400 truncate" title={memberId}>
                          {getMemberLabel(memberId)}
                        </span>
                        <button
                          onClick={() => handleRemoveMember(memberId, entry.id)}
                          title={isEn ? 'Remove from enum' : 'Aus Enum entfernen'}
                          className="opacity-0 group-hover/member:opacity-100 p-0.5 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-opacity"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Create new */}
        <div className="px-3 py-2.5 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <Plus size={14} className="text-gray-400 shrink-0" />
            <input
              ref={newInputRef}
              type="text"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setNewError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder={tab === 'rooms' ? (isEn ? 'New room name…' : 'Neuer Raum…') : (isEn ? 'New function name…' : 'Neue Funktion…')}
              className="flex-1 text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-blue-400 dark:focus:border-blue-500"
            />
            <button
              onClick={handleCreate}
              disabled={createEnum.isPending}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
            >
              {createEnum.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              {isEn ? 'Add' : 'Hinzufügen'}
            </button>
          </div>
          {newError && <p className="mt-1 text-xs text-red-500 dark:text-red-400 pl-6">{newError}</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}

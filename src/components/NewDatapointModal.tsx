import { useState, useRef, useEffect } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';
import { useCreateDatapoint, useAllRoles } from '../hooks/useStates';
import { isValidIoBrokerId } from '../utils/validation';

const STATE_TYPES = ['number', 'string', 'boolean', 'mixed'] as const;
const OBJECT_TYPES = ['state', 'folder', 'device', 'channel'] as const;

interface Props {
  onClose: () => void;
  existingIds: Set<string>;
  initialId?: string;
  language?: 'en' | 'de';
}

export default function NewDatapointModal({ onClose, existingIds, initialId = '', language = 'en' }: Props) {
  const isEn = language === 'en';
  const [id, setId] = useState(initialId);
  const [name, setName] = useState('');
  const [objectType, setObjectType] = useState<typeof OBJECT_TYPES[number]>('state');
  const [stateType, setStateType] = useState<'number' | 'string' | 'boolean' | 'mixed'>('number');
  const [role, setRole] = useState('');
  const [unit, setUnit] = useState('');
  const [initialValue, setInitialValue] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [read, setRead] = useState(true);
  const [write, setWrite] = useState(true);
  const [roleSuggestionsOpen, setRoleSuggestionsOpen] = useState(false);
  const [idSuggestionsOpen, setIdSuggestionsOpen] = useState(false);
  const [idActiveIndex, setIdActiveIndex] = useState(-1);
  const [error, setError] = useState('');

  const { data: roles = [] } = useAllRoles();
  const createDatapoint = useCreateDatapoint();
  const idRef = useRef<HTMLInputElement>(null);

  const existingIdsSorted = useState(() => [...existingIds].sort())[0];
  const filteredIdSuggestions = id.trim()
    ? existingIdsSorted.filter((s) => s.toLowerCase().startsWith(id.toLowerCase())).slice(0, 30)
    : [];

  useEffect(() => {
    idRef.current?.focus();
  }, []);

  useEscapeKey(onClose);

  const filteredRoles = role.trim()
    ? roles.filter((r) => r.toLowerCase().includes(role.toLowerCase()))
    : roles;

  function validate(): string {
    if (!id.trim()) return isEn ? 'ID is required.' : 'ID ist erforderlich.';
    if (!isValidIoBrokerId(id)) return isEn ? 'Invalid ID format. Use only letters, digits, underscores, hyphens and dots (e.g. javascript.0.myValue).' : 'Ungültiges ID-Format. Nur Buchstaben, Ziffern, Unterstriche, Bindestriche und Punkte erlaubt (z.B. javascript.0.meinWert).';
    if (existingIds.has(id.trim())) return isEn ? `Datapoint "${id.trim()}" already exists.` : `Datenpunkt "${id.trim()}" existiert bereits.`;
    if (!name.trim()) return isEn ? 'Name is required.' : 'Name ist erforderlich.';
    if (stateType === 'number' && min.trim() !== '' && max.trim() !== '') {
      const minNum = Number(min);
      const maxNum = Number(max);
      if (!Number.isFinite(minNum)) return isEn ? 'Min must be a number.' : 'Min muss eine Zahl sein.';
      if (!Number.isFinite(maxNum)) return isEn ? 'Max must be a number.' : 'Max muss eine Zahl sein.';
      if (minNum >= maxNum) return isEn ? 'Min must be less than Max.' : 'Min muss kleiner als Max sein.';
    }
    return '';
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }

    createDatapoint.mutate(
      {
        id: id.trim(),
        objectType,
        common: objectType === 'state'
          ? {
              name: name.trim(),
              type: stateType,
              role: role.trim() || undefined,
              unit: stateType === 'boolean' ? undefined : (unit.trim() || undefined),
              min: stateType === 'number' && min.trim() !== '' ? Number(min) : undefined,
              max: stateType === 'number' && max.trim() !== '' ? Number(max) : undefined,
              read,
              write,
            }
          : {
              name: name.trim(),
            },
        initialValue: objectType === 'state' ? (initialValue.trim() || undefined) : undefined,
      },
      { onSuccess: onClose }
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{isEn ? 'New datapoint' : 'Neuer Datenpunkt'}</h2>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-3">
          {/* ID */}
          <div className="flex flex-col gap-1 relative">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">ID <span className="text-red-500">*</span></span>
            <input
              ref={idRef}
              type="text"
              value={id}
              onChange={(e) => { setId(e.target.value); setError(''); setIdActiveIndex(-1); setIdSuggestionsOpen(true); }}
              onFocus={() => setIdSuggestionsOpen(true)}
              onBlur={() => setTimeout(() => setIdSuggestionsOpen(false), 150)}
              onKeyDown={(e) => {
                if (!idSuggestionsOpen || filteredIdSuggestions.length === 0) return;
                if (e.key === 'ArrowDown') { e.preventDefault(); setIdActiveIndex((i) => Math.min(i + 1, filteredIdSuggestions.length - 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setIdActiveIndex((i) => Math.max(i - 1, -1)); }
                else if (e.key === 'Enter' && idActiveIndex >= 0) { e.preventDefault(); setId(filteredIdSuggestions[idActiveIndex]); setIdSuggestionsOpen(false); setIdActiveIndex(-1); }
                else if (e.key === 'Escape') { setIdSuggestionsOpen(false); }
              }}
              placeholder={isEn ? 'e.g. javascript.0.myValue' : 'z.B. javascript.0.meinWert'}
              className="px-2.5 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500 font-mono"
            />
            {idSuggestionsOpen && filteredIdSuggestions.length > 0 && (
              <ul className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg z-50 text-sm">
                {filteredIdSuggestions.map((s, i) => (
                  <li
                    key={s}
                    onMouseDown={() => { setId(s); setIdSuggestionsOpen(false); setIdActiveIndex(-1); }}
                    onMouseEnter={() => setIdActiveIndex(i)}
                    className={`px-2.5 py-1 cursor-pointer font-mono text-xs ${i === idActiveIndex ? 'bg-blue-600 text-white' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Name */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Name <span className="text-red-500">*</span></span>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder={isEn ? 'Display name' : 'Anzeigename'}
              className="px-2.5 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500"
            />
          </label>

          <div className="flex gap-3">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Object type' : 'Objekttyp'}</span>
              <select
                value={objectType}
                onChange={(e) => setObjectType(e.target.value as typeof OBJECT_TYPES[number])}
                className="px-2.5 py-1.5 h-[34px] text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500"
              >
                {OBJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            {objectType === 'state' && (
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'State type' : 'State-Typ'}</span>
                <select
                  value={stateType}
                  onChange={(e) => setStateType(e.target.value as typeof stateType)}
                  className="px-2.5 py-1.5 h-[34px] text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500"
                >
                  {STATE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            )}
          </div>

          {objectType === 'state' && (
            <>
              {stateType !== 'boolean' && (
                <div className="flex gap-3">
                  <label className="flex flex-col gap-1 flex-1">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Unit' : 'Einheit'}</span>
                    <input
                      type="text"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="°C, %, …"
                      className="px-2.5 py-1.5 h-[34px] text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500"
                    />
                  </label>
                </div>
              )}

              {/* Rolle */}
              <label className="flex flex-col gap-1 relative">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Role' : 'Rolle'}</span>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => { setRole(e.target.value); setRoleSuggestionsOpen(true); }}
                  onFocus={() => setRoleSuggestionsOpen(true)}
                  onBlur={() => setTimeout(() => setRoleSuggestionsOpen(false), 150)}
                  placeholder="value.temperature, switch, …"
                  className="px-2.5 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500"
                />
                {roleSuggestionsOpen && filteredRoles.length > 0 && (
                  <ul className="absolute top-full left-0 right-0 mt-1 max-h-36 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg z-50 text-sm">
                    {filteredRoles.slice(0, 50).map((r) => (
                      <li
                        key={r}
                        onMouseDown={() => { setRole(r); setRoleSuggestionsOpen(false); }}
                        className="px-2.5 py-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-mono text-xs"
                      >
                        {r}
                      </li>
                    ))}
                  </ul>
                )}
              </label>

              {/* Initialwert */}
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Initial value' : 'Initialwert'} <span className="text-gray-400 font-normal">({isEn ? 'optional' : 'optional'})</span></span>
                <input
                  type="text"
                  value={initialValue}
                  onChange={(e) => setInitialValue(e.target.value)}
                  placeholder="0"
                  className="px-2.5 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500"
                />
              </label>

              {/* Min / Max — nur bei State-Typ number */}
              {stateType === 'number' && (
                <div className="flex gap-3">
                  <label className="flex flex-col gap-1 flex-1">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Min <span className="text-gray-400 font-normal">({isEn ? 'optional' : 'optional'})</span></span>
                    <input
                      type="number"
                      value={min}
                      onChange={(e) => setMin(e.target.value)}
                      placeholder="0"
                      className="px-2.5 py-1.5 h-[34px] text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500"
                    />
                  </label>
                  <label className="flex flex-col gap-1 flex-1">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Max <span className="text-gray-400 font-normal">({isEn ? 'optional' : 'optional'})</span></span>
                    <input
                      type="number"
                      value={max}
                      onChange={(e) => setMax(e.target.value)}
                      placeholder="100"
                      className="px-2.5 py-1.5 h-[34px] text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500"
                    />
                  </label>
                </div>
              )}

              {/* Read / Write */}
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={read}
                    onChange={(e) => setRead(e.target.checked)}
                    className="sr-only"
                  />
                  <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    read
                      ? 'bg-blue-500 border-blue-500'
                      : 'bg-gray-100 dark:bg-gray-700 border-gray-400 dark:border-gray-500'
                  }`}>
                    {read && <Check size={11} className="text-white" strokeWidth={3} />}
                  </span>
                  <span className="text-sm text-gray-700 dark:text-gray-200">{isEn ? 'Readable' : 'Lesbar'}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={write}
                    onChange={(e) => setWrite(e.target.checked)}
                    className="sr-only"
                  />
                  <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    write
                      ? 'bg-blue-500 border-blue-500'
                      : 'bg-gray-100 dark:bg-gray-700 border-gray-400 dark:border-gray-500'
                  }`}>
                    {write && <Check size={11} className="text-white" strokeWidth={3} />}
                  </span>
                  <span className="text-sm text-gray-700 dark:text-gray-200">{isEn ? 'Writable' : 'Schreibbar'}</span>
                </label>
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {isEn ? 'Cancel' : 'Abbrechen'}
            </button>
            <button
              type="submit"
              disabled={createDatapoint.isPending}
              className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createDatapoint.isPending ? (isEn ? 'Create…' : 'Anlegen…') : (isEn ? 'Create' : 'Anlegen')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useCreateDatapoint, useAllRoles } from '../hooks/useStates';

const STATE_TYPES = ['number', 'string', 'boolean', 'mixed'] as const;

interface Props {
  onClose: () => void;
  existingIds: Set<string>;
}

export default function NewDatapointModal({ onClose, existingIds }: Props) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'number' | 'string' | 'boolean' | 'mixed'>('number');
  const [role, setRole] = useState('');
  const [unit, setUnit] = useState('');
  const [initialValue, setInitialValue] = useState('');
  const [roleSuggestionsOpen, setRoleSuggestionsOpen] = useState(false);
  const [error, setError] = useState('');

  const { data: roles = [] } = useAllRoles();
  const createDatapoint = useCreateDatapoint();
  const idRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    idRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const filteredRoles = role.trim()
    ? roles.filter((r) => r.toLowerCase().includes(role.toLowerCase()))
    : roles;

  function validate(): string {
    if (!id.trim()) return 'ID ist erforderlich.';
    if (existingIds.has(id.trim())) return `Datenpunkt "${id.trim()}" existiert bereits.`;
    if (!name.trim()) return 'Name ist erforderlich.';
    return '';
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }

    createDatapoint.mutate(
      {
        id: id.trim(),
        common: {
          name: name.trim(),
          type,
          role: role.trim() || undefined,
          unit: unit.trim() || undefined,
          read: true,
          write: true,
        },
        initialValue: initialValue.trim() || undefined,
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
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Neuer Datenpunkt</h2>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-3">
          {/* ID */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">ID <span className="text-red-500">*</span></span>
            <input
              ref={idRef}
              type="text"
              value={id}
              onChange={(e) => { setId(e.target.value); setError(''); }}
              placeholder="z.B. javascript.0.meinWert"
              className="px-2.5 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500 font-mono"
            />
          </label>

          {/* Name */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Name <span className="text-red-500">*</span></span>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="Anzeigename"
              className="px-2.5 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500"
            />
          </label>

          {/* Typ + Einheit nebeneinander */}
          <div className="flex gap-3">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Typ</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
                className="px-2.5 py-1.5 h-[34px] text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500"
              >
                {STATE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 w-28">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Einheit</span>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="°C, %, …"
                className="px-2.5 py-1.5 h-[34px] text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500"
              />
            </label>
          </div>

          {/* Rolle */}
          <label className="flex flex-col gap-1 relative">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Rolle</span>
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
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Initialwert <span className="text-gray-400 font-normal">(optional)</span></span>
            <input
              type="text"
              value={initialValue}
              onChange={(e) => setInitialValue(e.target.value)}
              placeholder="0"
              className="px-2.5 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500"
            />
          </label>

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
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={createDatapoint.isPending}
              className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createDatapoint.isPending ? 'Anlegen…' : 'Anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

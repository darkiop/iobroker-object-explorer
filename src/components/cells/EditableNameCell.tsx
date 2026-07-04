import React, { useState } from 'react';
import { Pencil, Check, X, Copy } from 'lucide-react';
import { useExtendObject } from '../../hooks/useStates';
import { useToast } from '../../context/ToastContext';
import { copyToClipboard } from '../../utils/clipboard';

const EditableNameCell = React.memo(function EditableNameCell({ id, name, desc, showDesc = true, textClassName = '', tdClassName = '' }: { id: string; name: string; desc?: string; showDesc?: boolean; textClassName?: string; tdClassName?: string }) {
  const showToast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const extend = useExtendObject();

  const [copied, setCopied] = useState(false);

  if (!editing) {
    return (
      <td data-col="name" className={`px-3 py-[var(--row-py)] overflow-hidden group/name align-middle ${tdClassName}`}>
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className={`truncate ${textClassName}`} title={name}>{name}</div>
            {showDesc && desc && <div className="truncate text-[10px] italic text-gray-400 dark:text-gray-500 leading-tight mt-1" title={desc}>{desc}</div>}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDraft(name);
              setEditing(true);
            }}
            className="opacity-0 group-hover/name:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity"
            title="Name bearbeiten"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              function done() { setCopied(true); setTimeout(() => setCopied(false), 1500); }
              copyToClipboard(name).then(done).catch(done);
            }}
            className="opacity-0 group-hover/name:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity"
            title="Name kopieren"
          >
            {copied ? <Check size={12} className="text-green-500 dark:text-green-400" /> : <Copy size={12} />}
          </button>
        </div>
      </td>
    );
  }

  return (
    <td data-col="name" className="px-3 py-1 overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              extend.mutate({ id, common: { name: draft } }, { onError: (err) => showToast('Speichern fehlgeschlagen: ' + String(err)) });
              setEditing(false);
            }
            if (e.key === 'Escape') setEditing(false);
          }}
          autoFocus
          disabled={extend.isPending}
          className="flex-1 min-w-0 bg-white text-gray-800 text-sm rounded px-2 py-0.5 border border-gray-300 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
        />
        <button
          onClick={() => {
            extend.mutate({ id, common: { name: draft } }, { onError: (err) => showToast('Speichern fehlgeschlagen: ' + String(err)) });
            setEditing(false);
          }}
          disabled={extend.isPending}
          className="text-green-500 hover:text-green-600 dark:text-green-400 dark:hover:text-green-300 shrink-0 disabled:opacity-50"
        >
          <Check size={14} />
        </button>
        <button
          onClick={() => setEditing(false)}
          disabled={extend.isPending}
          className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 disabled:opacity-50"
        >
          <X size={14} />
        </button>
      </div>
    </td>
  );
});

export default EditableNameCell;

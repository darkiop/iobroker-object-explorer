import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Pencil } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import { getEnumColor } from '../../utils/enumColor';

const EditableFunctionCell = React.memo(function EditableFunctionCell({ id, currentFnEnumId, fnName, fnEnums, onSelectFunction, forceEdit, onEditEnd, language = 'en' }: {
  id: string;
  currentFnEnumId: string | null;
  fnName: string;
  fnEnums: { id: string; name: string }[];
  onSelectFunction: (objectId: string, oldFnEnumId: string | null, newFnEnumId: string | null) => void;
  forceEdit?: boolean;
  onEditEnd?: () => void;
  language?: 'en' | 'de';
}) {
  const isEn = language === 'en';
  const [editing, setEditing] = useState(false);
  const [cellRect, setCellRect] = useState<DOMRect | null>(null);
  const cellRef = useRef<HTMLTableCellElement>(null);

  useEffect(() => {
    if (forceEdit && !editing) {
      if (cellRef.current) setCellRect(cellRef.current.getBoundingClientRect());
      setEditing(true);
    }
  }, [forceEdit]);

  function openEdit() {
    if (cellRef.current) setCellRect(cellRef.current.getBoundingClientRect());
    setEditing(true);
  }

  function close() {
    setEditing(false);
    onEditEnd?.();
  }

  function select(newFnEnumId: string | null) {
    onSelectFunction(id, currentFnEnumId, newFnEnumId);
    close();
  }

  return (
    <td
      ref={cellRef}
      data-col="function"
      className="px-3 py-[var(--row-py)] text-gray-500 dark:text-gray-400 text-xs overflow-hidden group/fn"
      onClick={(e) => { e.stopPropagation(); openEdit(); }}
    >
      <div className="flex items-center gap-1.5">
        {fnName && <Tooltip content={fnName}><span className={`truncate min-w-0 ${getEnumColor(fnName)}`}>{fnName}</span></Tooltip>}
        <Tooltip content={isEn ? 'Edit function' : 'Funktion bearbeiten'}>
          <Pencil
            size={12}
            className="ml-auto opacity-0 group-hover/fn:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity"
          />
        </Tooltip>
      </div>
      {editing && cellRect && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onMouseDown={close} />
          <div
            style={{ position: 'fixed', top: cellRect.bottom + 2, left: cellRect.left, zIndex: 9999, minWidth: 160 }}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <ul className="max-h-56 overflow-y-auto py-1">
              <li
                onMouseDown={(e) => { e.preventDefault(); select(null); }}
                className={`px-3 py-1.5 text-xs cursor-pointer flex items-center gap-1.5 ${
                  !currentFnEnumId
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 italic'
                }`}
              >
                {isEn ? 'No function' : 'Keine Funktion'}
              </li>
              {fnEnums.map((fn) => (
                <li
                  key={fn.id}
                  onMouseDown={(e) => { e.preventDefault(); select(fn.id); }}
                  className={`px-3 py-1.5 text-xs cursor-pointer ${
                    currentFnEnumId === fn.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {fn.name}
                </li>
              ))}
              {fnEnums.length === 0 && (
                <li className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500 italic">{isEn ? 'Loading…' : 'Lädt…'}</li>
              )}
            </ul>
          </div>
        </>,
        document.body
      )}
    </td>
  );
});

export default EditableFunctionCell;

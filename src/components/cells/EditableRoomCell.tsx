import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Pencil } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';

const EditableRoomCell = React.memo(function EditableRoomCell({ id, currentRoomEnumId, roomName, roomEnums, onSelectRoom, forceEdit, onEditEnd, language = 'en' }: {
  id: string;
  currentRoomEnumId: string | null;
  roomName: string;
  roomEnums: { id: string; name: string }[];
  onSelectRoom: (objectId: string, oldRoomEnumId: string | null, newRoomEnumId: string | null) => void;
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

  function select(newRoomEnumId: string | null) {
    onSelectRoom(id, currentRoomEnumId, newRoomEnumId);
    close();
  }

  return (
    <td
      ref={cellRef}
      data-col="room"
      className="px-3 py-[var(--row-py)] text-gray-500 dark:text-gray-400 text-xs overflow-hidden group/room"
      onClick={(e) => { e.stopPropagation(); openEdit(); }}
    >
      <div className="flex items-center gap-1.5">
        {roomName && <Tooltip content={roomName}><span className="truncate min-w-0">{roomName}</span></Tooltip>}
        <Tooltip content={isEn ? 'Edit room' : 'Raum bearbeiten'}>
          <Pencil
            size={12}
            className="ml-auto opacity-0 group-hover/room:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity"
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
                  !currentRoomEnumId
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 italic'
                }`}
              >
                {isEn ? 'No room' : 'Kein Raum'}
              </li>
              {roomEnums.map((room) => (
                <li
                  key={room.id}
                  onMouseDown={(e) => { e.preventDefault(); select(room.id); }}
                  className={`px-3 py-1.5 text-xs cursor-pointer ${
                    currentRoomEnumId === room.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {room.name}
                </li>
              ))}
              {roomEnums.length === 0 && (
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

export default EditableRoomCell;

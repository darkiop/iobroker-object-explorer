import { useMemo } from 'react';
import { X } from 'lucide-react';
import BatchComboControl from './BatchComboControl';
import type React from 'react';

interface EnumEntry { id: string; name: string }

interface StateListBatchBarProps {
  isEn: boolean;
  language: string;
  checkedIds: Set<string>;
  roles: string[];
  units: string[];
  roomEnums: EnumEntry[];
  fnEnums: EnumEntry[];
  batchRole: string;
  setBatchRole: (v: string) => void;
  batchUnit: string;
  setBatchUnit: (v: string) => void;
  batchRoomEnumId: string;
  setBatchRoomEnumId: (v: string) => void;
  batchFnEnumId: string;
  setBatchFnEnumId: (v: string) => void;
  batchDesc: string;
  setBatchDesc: (v: string) => void;
  batchDescClear: boolean;
  setBatchDescClear: React.Dispatch<React.SetStateAction<boolean>>;
  batchMin: string;
  setBatchMin: (v: string) => void;
  batchMax: string;
  setBatchMax: (v: string) => void;
  batchCanApply: boolean;
  onApply: () => void;
}

export default function StateListBatchBar({
  isEn, language, checkedIds,
  roles, units, roomEnums, fnEnums,
  batchRole, setBatchRole,
  batchUnit, setBatchUnit,
  batchRoomEnumId, setBatchRoomEnumId,
  batchFnEnumId, setBatchFnEnumId,
  batchDesc, setBatchDesc,
  batchDescClear, setBatchDescClear,
  batchMin, setBatchMin,
  batchMax, setBatchMax,
  batchCanApply, onApply,
}: StateListBatchBarProps) {
  const noRoomLabel = isEn ? '— No room —' : '— Kein Raum —';
  const noFunctionLabel = isEn ? '— No function —' : '— Keine Funktion —';
  const roomById = useMemo(() => new Map(roomEnums.map((r) => [r.id, r.name])), [roomEnums]);
  const roomNameOptions = useMemo(() => [noRoomLabel, ...roomEnums.map((r) => r.name)], [roomEnums, noRoomLabel]);
  const fnById = useMemo(() => new Map(fnEnums.map((f) => [f.id, f.name])), [fnEnums]);
  const fnNameOptions = useMemo(() => [noFunctionLabel, ...fnEnums.map((f) => f.name)], [fnEnums, noFunctionLabel]);

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 shrink-0 border-b border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 flex-wrap transition-all ${checkedIds.size > 0 ? 'visible' : 'invisible h-0 py-0 overflow-hidden border-0'}`}>
      <span className="text-xs text-blue-600 dark:text-blue-400 font-medium shrink-0 whitespace-nowrap">
        {checkedIds.size} {isEn ? 'selected:' : 'ausgewählt:'}
      </span>
      <BatchComboControl
        value={batchRole}
        onChange={setBatchRole}
        placeholder={isEn ? 'Role…' : 'Rolle…'}
        options={roles}
        className="w-32"
        language={language}
      />
      <BatchComboControl
        value={batchUnit}
        onChange={setBatchUnit}
        placeholder={isEn ? 'Unit…' : 'Einheit…'}
        options={units}
        className="w-32"
        language={language}
      />
      <BatchComboControl
        value={batchRoomEnumId === '' ? '' : (batchRoomEnumId === '__none__' ? noRoomLabel : (roomById.get(batchRoomEnumId) ?? ''))}
        onChange={(name) => {
          if (name.trim() === '') { setBatchRoomEnumId(''); return; }
          if (name === noRoomLabel) { setBatchRoomEnumId('__none__'); return; }
          const hit = roomEnums.find((r) => r.name === name);
          setBatchRoomEnumId(hit ? hit.id : '');
        }}
        placeholder={isEn ? 'Room…' : 'Raum…'}
        options={roomNameOptions}
        className="w-32"
        language={language}
      />
      <BatchComboControl
        value={batchFnEnumId === '' ? '' : (batchFnEnumId === '__none__' ? noFunctionLabel : (fnById.get(batchFnEnumId) ?? ''))}
        onChange={(name) => {
          if (name.trim() === '') { setBatchFnEnumId(''); return; }
          if (name === noFunctionLabel) { setBatchFnEnumId('__none__'); return; }
          const hit = fnEnums.find((f) => f.name === name);
          setBatchFnEnumId(hit ? hit.id : '');
        }}
        placeholder={isEn ? 'Function…' : 'Funktion…'}
        options={fnNameOptions}
        className="w-32"
        language={language}
      />
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={batchDesc}
          onChange={(e) => { setBatchDesc(e.target.value); if (batchDescClear) setBatchDescClear(false); }}
          disabled={batchDescClear}
          placeholder={batchDescClear ? (isEn ? '— clear —' : '— löschen —') : (isEn ? 'Description…' : 'Beschreibung…')}
          className={`h-7 w-36 px-2 text-xs rounded border bg-gray-50/70 dark:bg-gray-800/70 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400 ${batchDescClear ? 'border-red-400 dark:border-red-600 opacity-60' : 'border-gray-300 dark:border-gray-600'}`}
        />
        <button
          type="button"
          onClick={() => { setBatchDescClear((v) => !v); setBatchDesc(''); }}
          title={isEn ? 'Clear description on all selected' : 'Beschreibung bei allen Ausgewählten löschen'}
          className={`h-7 px-1.5 text-xs rounded border transition-colors ${batchDescClear ? 'border-red-400 bg-red-500/10 text-red-500 dark:border-red-600 dark:text-red-400' : 'border-gray-300 dark:border-gray-600 text-gray-400 hover:text-red-500 hover:border-red-400'}`}
        >
          <X size={11} />
        </button>
      </div>
      <input
        type="number"
        value={batchMin}
        onChange={(e) => setBatchMin(e.target.value)}
        placeholder="Min"
        className="h-7 w-20 px-2 text-xs rounded border border-gray-300 dark:border-gray-600 bg-gray-50/70 dark:bg-gray-800/70 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <input
        type="number"
        value={batchMax}
        onChange={(e) => setBatchMax(e.target.value)}
        placeholder="Max"
        className="h-7 w-20 px-2 text-xs rounded border border-gray-300 dark:border-gray-600 bg-gray-50/70 dark:bg-gray-800/70 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        onClick={onApply}
        disabled={!batchCanApply}
        className="h-7 px-2.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isEn ? 'Apply' : 'Anwenden'}
      </button>
    </div>
  );
}

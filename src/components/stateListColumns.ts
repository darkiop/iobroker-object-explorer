export type SortKey = 'checkbox' | 'write' | 'alias' | 'id' | 'name' | 'room' | 'function' | 'type' | 'role' | 'value' | 'unit' | 'ack' | 'ts' | 'history' | 'smart' | 'relevanz';
export type DateFormatSetting = 'de' | 'us' | 'iso';

export const ALL_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'checkbox', label: 'Auswahl' },
  { key: 'write',   label: 'Schreibschutz' },
  { key: 'history', label: 'History' },
  { key: 'smart',   label: 'SmartName' },
  { key: 'alias',   label: 'Alias' },
  { key: 'id',      label: 'ID' },
  { key: 'name',    label: 'Name' },
  { key: 'room',      label: 'Raum' },
  { key: 'function',  label: 'Funktion' },
  { key: 'type',    label: 'Typ' },
  { key: 'role',    label: 'Rolle' },
  { key: 'value',   label: 'Wert' },
  { key: 'unit',    label: 'Einheit' },
  { key: 'ack',     label: 'Ack' },
  { key: 'ts',      label: 'Letztes Update' },
];

export function getColumnLabel(key: SortKey, language: 'en' | 'de' = 'de'): string {
  const isEn = language === 'en';
  switch (key) {
    case 'checkbox': return isEn ? 'Selection' : 'Auswahl';
    case 'write': return isEn ? 'Read only' : 'Schreibschutz';
    case 'history': return 'History';
    case 'smart': return 'SmartName';
    case 'alias': return 'Alias';
    case 'id': return 'ID';
    case 'name': return 'Name';
    case 'room': return isEn ? 'Room' : 'Raum';
    case 'function': return isEn ? 'Function' : 'Funktion';
    case 'role': return isEn ? 'Role' : 'Rolle';
    case 'value': return isEn ? 'Value' : 'Wert';
    case 'unit': return isEn ? 'Unit' : 'Einheit';
    case 'ack': return 'ACK';
    case 'ts': return isEn ? 'Last Update' : 'Letztes Update';
    case 'type': return isEn ? 'Type' : 'Typ';
    case 'relevanz': return isEn ? 'Relevance' : 'Relevanz';
    default: return key;
  }
}

export const DEFAULT_COLS: SortKey[] = ['checkbox', 'write', 'history', 'smart', 'alias', 'id', 'name', 'room', 'function', 'type', 'role', 'value', 'unit', 'ack', 'ts'];

/** Columns whose width is user-configurable (excludes fixed icon columns) */
export const CONFIGURABLE_WIDTH_COLS: SortKey[] = ['id', 'name', 'room', 'function', 'type', 'role', 'value', 'unit', 'ack', 'ts', 'relevanz'];

export const BUILTIN_DEFAULT_WIDTHS: Record<SortKey, number> = {
  checkbox: 28, write: 22, history: 22, smart: 22, alias: 30,
  id: 350, name: 220, room: 110, function: 110, type: 70, role: 130, value: 100,
  unit: 70, ack: 50, ts: 155, relevanz: 100,
};

export const BUILTIN_MAX_WIDTHS: Partial<Record<SortKey, number>> = {
  id: 600, name: 400, room: 200, function: 200, type: 100, role: 220,
  value: 180, unit: 120, ack: 50, ts: 180, relevanz: 200,
};

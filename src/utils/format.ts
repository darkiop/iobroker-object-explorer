import type { DateFormatSetting } from '../components/statelist/StateListColumns';

export function formatTimestamp(ts: number, dateFormat: DateFormatSetting = 'de'): string {
  if (!Number.isFinite(ts)) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  const day = p(d.getDate());
  const month = p(d.getMonth() + 1);
  const year = d.getFullYear();
  const time = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  if (dateFormat === 'iso') return `${year}-${month}-${day} ${time}`;
  if (dateFormat === 'us') return `${month}/${day}/${year} ${time}`;
  return `${day}.${month}.${year} ${time}`;
}

export function formatValue(val: unknown, pretty = false): string {
  if (val === undefined) return '—';
  if (val === null) return 'null';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return val.toString();
  if (typeof val === 'bigint') return val.toString();
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val, null, pretty ? 2 : undefined);
  } catch {
    return String(val);
  }
}

export interface ExtraSeries {
  id: string;
  label: string;
  unit?: string;
}

export const SERIES_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export type ChartType = 'line' | 'area' | 'bar';
export type ViewMode = 'chart' | 'table';
export type CompareOffset = null | '1w' | '1m';

export type ConfirmAction =
  | { type: 'entry'; ts: number; val: number }
  | { type: 'range'; start: number; end: number }
  | { type: 'all' };

export const CHART_TYPES: { value: ChartType; labelDe: string; labelEn: string }[] = [
  { value: 'line', labelDe: 'Linie', labelEn: 'Line' },
  { value: 'area', labelDe: 'Fläche', labelEn: 'Area' },
  { value: 'bar', labelDe: 'Balken', labelEn: 'Bar' },
];

export const PRESETS = [
  { label: '1h', ms: 60 * 60 * 1000 },
  { label: '6h', ms: 6 * 60 * 60 * 1000 },
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
  { label: '1y', ms: 365 * 24 * 60 * 60 * 1000 },
] as const;

export const AGGREGATES = [
  { value: 'none', labelDe: 'Keine', labelEn: 'None' },
  { value: 'average', labelDe: 'Durchschnitt', labelEn: 'Average' },
  { value: 'minmax', labelDe: 'Min/Max', labelEn: 'Min/Max' },
  { value: 'min', labelDe: 'Min', labelEn: 'Min' },
  { value: 'max', labelDe: 'Max', labelEn: 'Max' },
] as const;

export const COMPARE_OFFSETS: { value: CompareOffset; labelDe: string; labelEn: string }[] = [
  { value: '1w', labelDe: 'Vorwoche', labelEn: 'Previous week' },
  { value: '1m', labelDe: 'Vormonat', labelEn: 'Previous month' },
];

export function toLocalDatetime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTime(ts: number, rangeMs: number, dateFormat: 'de' | 'us' | 'iso' = 'de'): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  const time = `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (rangeMs <= 24 * 60 * 60 * 1000) {
    return time;
  }
  const day = p(d.getDate());
  const month = p(d.getMonth() + 1);
  const year = d.getFullYear();
  if (dateFormat === 'iso') return `${year}-${month}-${day} ${time}`;
  if (dateFormat === 'us') return `${month}/${day} ${time}`;
  return `${day}.${month}. ${time}`;
}

export function formatTooltipTime(ts: number, dateFormat: 'de' | 'us' | 'iso' = 'de'): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  const day = p(d.getDate());
  const month = p(d.getMonth() + 1);
  const year = d.getFullYear();
  const time = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  if (dateFormat === 'iso') return `${year}-${month}-${day} ${time}`;
  if (dateFormat === 'us') return `${month}/${day}/${year} ${time}`;
  return `${day}.${month}.${year} ${time}`;
}

export function makeAxes(dark: boolean, isEn: boolean, dateFormat: 'de' | 'us' | 'iso' = 'de') {
  const axisStroke = dark ? '#6b7280' : '#9ca3af';
  const tickColor = dark ? '#6b7280' : '#4b5563';
  return {
    xAxis: (rangeMs: number) => ({
      dataKey: 'ts' as const,
      type: 'number' as const,
      domain: ['dataMin', 'dataMax'] as [string, string],
      tickFormatter: (ts: number) => formatTime(ts, rangeMs, dateFormat),
      stroke: axisStroke,
      tick: { fontSize: 11, fill: tickColor },
    }),
    yAxis: (unit?: string) => ({
      stroke: axisStroke,
      tick: { fontSize: 11, fill: tickColor },
      tickFormatter: (v: number) => unit ? `${v} ${unit}` : String(v),
      width: 70,
    }),
    tooltip: (unit?: string, hasCompare?: boolean, compareOffsetMs?: number) => ({
      contentStyle: {
        backgroundColor: dark ? '#1f2937' : '#ffffff',
        border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`,
        borderRadius: 6,
      },
      labelStyle: { color: dark ? '#9ca3af' : '#6b7280' },
      itemStyle: { color: '#60a5fa' },
      labelFormatter: (ts: unknown) => formatTooltipTime(ts as number, dateFormat),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (value: unknown, name: string | number | undefined, props?: any) => {
        const v = value as number | undefined;
        const payloadTs = typeof props?.payload?.ts === 'number' ? props.payload.ts as number : undefined;
        if (hasCompare && name === 'valComp') {
          const originalTs = payloadTs != null && compareOffsetMs ? payloadTs - compareOffsetMs : undefined;
          const timeStr = originalTs != null ? formatTooltipTime(originalTs, dateFormat) : '';
          const label = `${isEn ? 'Compare' : 'Vergleich'}${timeStr ? ` (${timeStr})` : ''}`;
          return [unit && v !== undefined ? `${v} ${unit}` : v ?? '', label] as [string | number, string];
        }
        if (hasCompare && name === 'val') {
          const timeStr = payloadTs != null ? formatTooltipTime(payloadTs, dateFormat) : '';
          const label = `${isEn ? 'Today' : 'Heute'}${timeStr ? ` (${timeStr})` : ''}`;
          return [unit && v !== undefined ? `${v} ${unit}` : v ?? '', label] as [string | number, string];
        }
        return [unit && v !== undefined ? `${v} ${unit}` : v ?? '', isEn ? 'Value' : 'Wert'] as [string | number, string];
      },
    }),
    gridStroke: dark ? '#374151' : '#e5e7eb',
  };
}

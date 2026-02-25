import { useState, useMemo, useCallback, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import {
  ComposedChart,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Trash2, CircleDot, Download, GitCompareArrows, ChevronDown, ChevronRight } from 'lucide-react';
import { useHistory, useDeleteHistory } from '../hooks/useStates';
import type { HistoryOptions } from '../types/iobroker';

export interface ExtraSeries {
  id: string;
  label: string;
  unit?: string;
}

interface HistoryChartProps {
  stateId: string;
  unit?: string;
  fillHeight?: boolean;
  extraSeries?: ExtraSeries[];
  settingsCollapsible?: boolean;
}

const SERIES_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

type ChartType = 'line' | 'area' | 'bar';
type CompareOffset = null | '1w' | '1m';

type ConfirmAction =
  | { type: 'entry'; ts: number; val: number }
  | { type: 'range'; start: number; end: number }
  | { type: 'all' };

const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: 'line', label: 'Linie' },
  { value: 'area', label: 'Fläche' },
  { value: 'bar', label: 'Balken' },
];

const PRESETS = [
  { label: '1h', ms: 60 * 60 * 1000 },
  { label: '6h', ms: 6 * 60 * 60 * 1000 },
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
  { label: '1y', ms: 365 * 24 * 60 * 60 * 1000 },
] as const;

const AGGREGATES = [
  { value: 'none', label: 'Keine' },
  { value: 'average', label: 'Durchschnitt' },
  { value: 'minmax', label: 'Min/Max' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
] as const;

const COMPARE_OFFSETS: { value: CompareOffset; label: string }[] = [
  { value: '1w', label: 'Vorwoche' },
  { value: '1m', label: 'Vormonat' },
];

function toLocalDatetime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTime(ts: number, rangeMs: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  const time = `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (rangeMs <= 24 * 60 * 60 * 1000) {
    return time;
  }
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${time}`;
}

function formatTooltipTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function makeAxes(dark: boolean) {
  const axisStroke = dark ? '#6b7280' : '#9ca3af';
  const tickColor = dark ? '#6b7280' : '#4b5563';
  return {
    xAxis: (rangeMs: number) => ({
      dataKey: 'ts' as const,
      type: 'number' as const,
      domain: ['dataMin', 'dataMax'] as [string, string],
      tickFormatter: (ts: number) => formatTime(ts, rangeMs),
      stroke: axisStroke,
      tick: { fontSize: 11, fill: tickColor },
    }),
    yAxis: (unit?: string) => ({
      stroke: axisStroke,
      tick: { fontSize: 11, fill: tickColor },
      tickFormatter: (v: number) => unit ? `${v} ${unit}` : String(v),
      width: 70,
    }),
    tooltip: (unit?: string, hasCompare?: boolean) => ({
      contentStyle: {
        backgroundColor: dark ? '#1f2937' : '#ffffff',
        border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`,
        borderRadius: 6,
      },
      labelStyle: { color: dark ? '#9ca3af' : '#6b7280' },
      itemStyle: { color: '#60a5fa' },
      labelFormatter: (ts: unknown) => formatTooltipTime(ts as number),
      formatter: (value: number | undefined, name: string) => {
        const label = hasCompare && name === 'valComp' ? 'Vergleich' : 'Wert';
        return [unit && value !== undefined ? `${value} ${unit}` : value ?? '', label] as [string | number, string];
      },
    }),
    gridStroke: dark ? '#374151' : '#e5e7eb',
  };
}

function ConfirmDialog({ message, onConfirm, onCancel, isPending }: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 rounded-lg">
      <div className="bg-white border border-gray-200 rounded-lg p-4 max-w-sm mx-4 shadow-xl dark:bg-gray-800 dark:border-gray-600">
        <p className="text-gray-800 dark:text-gray-200 text-sm mb-4">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="px-3 py-1.5 text-xs rounded bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            Abbrechen
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
          >
            {isPending ? 'Löschen...' : 'Löschen'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HistoryChart({ stateId, unit, fillHeight = false, extraSeries, settingsCollapsible = false }: HistoryChartProps) {
  const { dark } = useTheme();
  const axes = makeAxes(dark);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [rangeMs, setRangeMs] = useState<number | null>(24 * 60 * 60 * 1000);
  const [customStart, setCustomStart] = useState(() => toLocalDatetime(Date.now() - 24 * 60 * 60 * 1000));
  const [customEnd, setCustomEnd] = useState(() => toLocalDatetime(Date.now()));
  const [aggregate, setAggregate] = useState<HistoryOptions['aggregate']>('none');
  const [chartType, setChartType] = useState<ChartType>('line');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [showDots, setShowDots] = useState(false);
  const [compareOffset, setCompareOffset] = useState<CompareOffset>(null);
  const [settingsOpen, setSettingsOpen] = useState(!settingsCollapsible);

  const { deleteEntry, deleteRange, deleteAll } = useDeleteHistory();
  const isPending = deleteEntry.isPending || deleteRange.isPending || deleteAll.isPending;

  const options = useMemo<HistoryOptions>(() => {
    if (rangeMs !== null) {
      const now = Date.now();
      return { start: now - rangeMs, end: now, count: 500, aggregate };
    }
    return {
      start: new Date(customStart).getTime(),
      end: new Date(customEnd).getTime(),
      count: 500,
      aggregate,
    };
  }, [rangeMs, customStart, customEnd, aggregate]);

  const compareOptions = useMemo<HistoryOptions | null>(() => {
    if (!compareOffset) return null;
    const offsetMs = compareOffset === '1w' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    return { ...options, start: options.start - offsetMs, end: options.end - offsetMs };
  }, [options, compareOffset]);

  const effectiveRangeMs = options.end - options.start;

  const { data, isLoading, isError } = useHistory(stateId, options);
  const { data: compareData } = useHistory(stateId, compareOptions);

  // Extra series — always exactly 4 hook calls (React hooks rule)
  const es = extraSeries ?? [];
  const { data: ed0 } = useHistory(es[0]?.id ?? null, options);
  const { data: ed1 } = useHistory(es[1]?.id ?? null, options);
  const { data: ed2 } = useHistory(es[2]?.id ?? null, options);
  const { data: ed3 } = useHistory(es[3]?.id ?? null, options);
  const hasMultiSeries = es.length > 0;

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((e) => ({ ts: e.ts, val: e.val }));
  }, [data]);

  const stats = useMemo(() => {
    const nums = chartData.map(p => p.val).filter((v): v is number => typeof v === 'number');
    if (nums.length === 0) return null;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    const last = nums[nums.length - 1];
    return { min, max, avg, last, count: nums.length };
  }, [chartData]);

  const mergedChartData = useMemo(() => {
    if (!compareData || !compareOffset) return chartData.map(p => ({ ts: p.ts, val: p.val, valComp: undefined as number | undefined }));
    const offsetMs = compareOffset === '1w' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    const currentMap = new Map(chartData.map(p => [p.ts, p.val]));
    const compMap = new Map(compareData.map(e => [e.ts + offsetMs, e.val]));
    const allTs = new Set([...currentMap.keys(), ...compMap.keys()]);
    return [...allTs].sort((a, b) => a - b).map(ts => ({
      ts,
      val: currentMap.get(ts),
      valComp: compMap.get(ts),
    }));
  }, [chartData, compareData, compareOffset]);

  const multiChartData = useMemo(() => {
    if (!hasMultiSeries) return null;
    const extraDataArrays = [ed0, ed1, ed2, ed3].slice(0, es.length)
      .map(d => (d ?? []).map(e => ({ ts: e.ts, val: typeof e.val === 'number' ? e.val : undefined as number | undefined })));
    const allSeries = [chartData, ...extraDataArrays];
    const maps = allSeries.map(s => new Map(s.map(p => [p.ts, p.val])));
    const allTs = new Set(allSeries.flatMap(s => s.map(p => p.ts)));
    const keys = ['val', 'v1', 'v2', 'v3', 'v4'];
    return [...allTs].sort((a, b) => a - b).map(ts => {
      const row: Record<string, unknown> = { ts };
      maps.forEach((m, i) => { row[keys[i]] = m.get(ts); });
      return row;
    });
  }, [hasMultiSeries, chartData, ed0, ed1, ed2, ed3, es.length]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChartClick = useCallback((state: any) => {
    if (!deleteMode || !state) return;
    // Recharts v3: activePayload oder activeTooltipIndex nutzen
    const payload = state.activePayload?.[0]?.payload;
    if (payload?.ts !== undefined && payload?.val !== undefined) {
      setConfirmAction({ type: 'entry', ts: payload.ts, val: payload.val });
      return;
    }
    // Fallback: über activeTooltipIndex
    const idx = state.activeTooltipIndex;
    if (idx != null && chartData[idx]) {
      const point = chartData[idx];
      setConfirmAction({ type: 'entry', ts: point.ts, val: point.val });
    }
  }, [deleteMode, chartData]);

  function handleConfirm() {
    if (!confirmAction) return;
    const onDone = () => setConfirmAction(null);
    if (confirmAction.type === 'entry') {
      deleteEntry.mutate({ id: stateId, ts: confirmAction.ts }, { onSuccess: onDone });
    } else if (confirmAction.type === 'range') {
      deleteRange.mutate({ id: stateId, start: confirmAction.start, end: confirmAction.end }, { onSuccess: onDone });
    } else {
      deleteAll.mutate({ id: stateId }, { onSuccess: onDone });
    }
  }

  function getConfirmMessage(): string {
    if (!confirmAction) return '';
    if (confirmAction.type === 'entry') {
      return `Wert ${confirmAction.val}${unit ? ' ' + unit : ''} vom ${formatTooltipTime(confirmAction.ts)} löschen?`;
    }
    if (confirmAction.type === 'range') {
      return `Alle Daten von ${formatTooltipTime(confirmAction.start)} bis ${formatTooltipTime(confirmAction.end)} löschen?`;
    }
    return `Alle History-Daten für diesen Datenpunkt unwiderruflich löschen?`;
  }

  function handleExportPng() {
    const container = chartContainerRef.current;
    if (!container) return;
    const svg = container.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = svg.clientWidth || 800;
      canvas.height = svg.clientHeight || 300;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = dark ? '#111827' : '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const link = document.createElement('a');
      link.download = `${stateId}_history.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = url;
  }

  const dotProps = deleteMode
    ? { r: 3, fill: '#ef4444', stroke: '#991b1b', strokeWidth: 1, cursor: 'pointer' as const }
    : showDots
      ? { r: 2.5, fill: '#3b82f6', stroke: '#1d4ed8', strokeWidth: 1 }
      : { r: 0 };
  const activeDotProps = deleteMode
    ? { r: 6, fill: '#ef4444', stroke: '#fca5a5', strokeWidth: 2 }
    : { r: 5, fill: '#3b82f6', stroke: '#93c5fd', strokeWidth: 2 };

  function renderChart() {
    const xProps = axes.xAxis(effectiveRangeMs);
    const yProps = axes.yAxis(unit);
    const tooltipProps = axes.tooltip(unit, !!compareOffset);
    const data = compareOffset ? mergedChartData : chartData;

    // Multi-series mode: ComposedChart with one Line per series
    if (hasMultiSeries && multiChartData) {
      const seriesMeta = [
        { key: 'val', label: stateId.split('.').slice(-2).join('.'), unit, color: SERIES_COLORS[0] },
        ...es.map((s, i) => ({ key: `v${i + 1}`, label: s.label, unit: s.unit, color: SERIES_COLORS[i + 1] ?? '#6b7280' })),
      ];
      return (
        <ComposedChart data={multiChartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={axes.gridStroke} />
          <XAxis {...xProps} />
          <YAxis {...yProps} />
          <Tooltip
            contentStyle={{ backgroundColor: dark ? '#1f2937' : '#ffffff', border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`, borderRadius: 6 }}
            labelStyle={{ color: dark ? '#9ca3af' : '#6b7280' }}
            labelFormatter={(ts: unknown) => formatTooltipTime(ts as number)}
            formatter={(value: unknown, name: string) => {
              const s = seriesMeta.find(x => x.key === name);
              const v = value as number | undefined;
              return [s?.unit && v != null ? `${v} ${s.unit}` : (v ?? ''), s?.label ?? name] as [string | number, string];
            }}
          />
          {seriesMeta.map(({ key, color }) => (
            <Line key={key} type="monotone" dataKey={key} stroke={color} strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} connectNulls={false} />
          ))}
        </ComposedChart>
      );
    }

    if (chartType === 'bar') {
      return (
        <BarChart data={data} onClick={handleChartClick}>
          <CartesianGrid strokeDasharray="3 3" stroke={axes.gridStroke} />
          <XAxis {...xProps} />
          <YAxis {...yProps} />
          <Tooltip {...tooltipProps} />
          <Bar dataKey="val" fill={deleteMode ? '#ef4444' : '#3b82f6'} cursor={deleteMode ? 'pointer' : undefined} />
          {compareOffset && (
            <Bar dataKey="valComp" fill="#9ca3af" opacity={0.5} />
          )}
        </BarChart>
      );
    }

    if (chartType === 'area') {
      return (
        <ComposedChart data={data} onClick={handleChartClick}>
          <CartesianGrid strokeDasharray="3 3" stroke={axes.gridStroke} />
          <XAxis {...xProps} />
          <YAxis {...yProps} />
          <Tooltip {...tooltipProps} />
          <defs>
            <linearGradient id="valGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="val"
            stroke="#3b82f6"
            strokeWidth={1.5}
            fill="url(#valGradient)"
            dot={dotProps}
            activeDot={activeDotProps}
          />
          {compareOffset && (
            <Line
              type="monotone"
              dataKey="valComp"
              stroke="#f97316"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              activeDot={{ r: 4 }}
            />
          )}
        </ComposedChart>
      );
    }

    return (
      <ComposedChart data={data} onClick={handleChartClick}>
        <CartesianGrid strokeDasharray="3 3" stroke={axes.gridStroke} />
        <XAxis {...xProps} />
        <YAxis {...yProps} />
        <Tooltip {...tooltipProps} />
        <Line
          type="monotone"
          dataKey="val"
          stroke="#3b82f6"
          strokeWidth={1.5}
          dot={dotProps}
          activeDot={activeDotProps}
        />
        {compareOffset && (
          <Line
            type="monotone"
            dataKey="valComp"
            stroke="#f97316"
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 4 }}
          />
        )}
      </ComposedChart>
    );
  }

  return (
    <div className={`relative ${fillHeight ? 'h-full flex flex-col' : 'mt-4'}`}>
      <div className={`flex flex-col gap-2 mb-3 ${fillHeight ? 'shrink-0' : ''}`}>
        {settingsCollapsible && (
          <button
            onClick={() => setSettingsOpen((o) => !o)}
            className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors self-start"
          >
            {settingsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Einstellungen
          </button>
        )}
        {settingsOpen && <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setRangeMs(p.ms)}
                className={`px-2 py-1 text-xs rounded ${
                  rangeMs === p.ms
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => {
                setRangeMs(null);
                setCustomStart(toLocalDatetime(options.start));
                setCustomEnd(toLocalDatetime(options.end));
              }}
              className={`px-2 py-1 text-xs rounded ${
                rangeMs === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Manuell
            </button>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex gap-1">
              {CHART_TYPES.map((ct) => (
                <button
                  key={ct.value}
                  onClick={() => setChartType(ct.value)}
                  className={`px-2 py-1 text-xs rounded ${
                    chartType === ct.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {ct.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowDots(!showDots)}
              className={`px-2 py-1 text-xs rounded ${
                showDots
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              title="Datenpunkte anzeigen"
            >
              <CircleDot size={14} />
            </button>
            <select
              value={aggregate}
              onChange={(e) => setAggregate(e.target.value as HistoryOptions['aggregate'])}
              className="bg-gray-200 text-gray-700 text-xs rounded px-2 py-1 border border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600"
            >
              {AGGREGATES.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            {/* Comparison buttons */}
            <div className="flex items-center gap-1">
              <GitCompareArrows size={13} className="text-gray-400 dark:text-gray-500" />
              {COMPARE_OFFSETS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCompareOffset(compareOffset === c.value ? null : c.value)}
                  className={`px-2 py-1 text-xs rounded ${
                    compareOffset === c.value
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                  title={`Vergleich mit ${c.label}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {/* Export PNG */}
            <button
              onClick={handleExportPng}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              title="Chart als PNG exportieren"
            >
              <Download size={12} />
              PNG
            </button>
            <button
              onClick={() => setDeleteMode(!deleteMode)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${
                deleteMode
                  ? 'bg-red-600/30 text-red-300 border border-red-500/40'
                  : 'bg-gray-200 text-red-500 hover:bg-red-100 dark:bg-gray-700 dark:text-red-400 dark:hover:bg-red-900/30 dark:hover:text-red-300'
              }`}
              title="Einzelwert löschen — Datenpunkt im Chart anklicken"
            >
              <Trash2 size={12} />
              Einzelwert
            </button>
            <button
              onClick={() => setConfirmAction({ type: 'range', start: options.start, end: options.end })}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-gray-200 text-red-500 hover:bg-red-100 dark:bg-gray-700 dark:text-red-400 dark:hover:bg-red-900/30 dark:hover:text-red-300"
              title="Zeitbereich löschen"
            >
              <Trash2 size={12} />
              Zeitbereich
            </button>
            <button
              onClick={() => setConfirmAction({ type: 'all' })}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-gray-200 text-red-500 hover:bg-red-100 dark:bg-gray-700 dark:text-red-400 dark:hover:bg-red-900/30 dark:hover:text-red-300"
              title="Alle History-Daten löschen"
            >
              <Trash2 size={12} />
              Alle
            </button>
          </div>
        </div>}
        {settingsOpen && rangeMs === null && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 dark:text-gray-500">Von</label>
            <input
              type="datetime-local"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-gray-200 text-gray-700 text-xs rounded px-2 py-1 border border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600"
            />
            <label className="text-xs text-gray-400 dark:text-gray-500">Bis</label>
            <input
              type="datetime-local"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-gray-200 text-gray-700 text-xs rounded px-2 py-1 border border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600"
            />
          </div>
        )}
        {settingsOpen && compareOffset && (
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
            <span className="inline-block w-6 h-0.5 border-t-2 border-dashed border-orange-400" />
            <span>
              Vergleich: {compareOffset === '1w' ? 'Vorwoche' : 'Vormonat'} (orange gestrichelt)
            </span>
          </div>
        )}
      </div>

      {hasMultiSeries && (
        <div className="flex items-center gap-3 flex-wrap mb-2">
          {[
            { color: SERIES_COLORS[0], label: stateId.split('.').slice(-2).join('.'), unit },
            ...es.map((s, i) => ({ color: SERIES_COLORS[i + 1] ?? '#6b7280', label: s.label, unit: s.unit })),
          ].map(({ color, label, unit: u }) => (
            <span key={label} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <span className="inline-block w-5 border-t-2 rounded" style={{ borderColor: color }} />
              <span>{label}{u ? ` (${u})` : ''}</span>
            </span>
          ))}
        </div>
      )}

      {stats && !isLoading && (
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {([
            { label: 'Min',   value: stats.min,   cls: 'text-blue-600 dark:text-blue-400 bg-blue-500/10' },
            { label: 'Max',   value: stats.max,   cls: 'text-red-600 dark:text-red-400 bg-red-500/10' },
            { label: 'Avg',   value: stats.avg,   cls: 'text-violet-600 dark:text-violet-400 bg-violet-500/10' },
            { label: 'Letzt', value: stats.last,  cls: 'text-green-600 dark:text-green-400 bg-green-500/10' },
          ] as { label: string; value: number; cls: string }[]).map(({ label, value, cls }) => (
            <span key={label} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono ${cls}`}>
              <span className="opacity-60 font-sans text-[10px] uppercase tracking-wide">{label}</span>
              {Number.isInteger(value) ? value : value.toFixed(2)}
              {unit && <span className="opacity-60">{unit}</span>}
            </span>
          ))}
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">{stats.count} Messpunkte</span>
        </div>
      )}

      {isLoading ? (
        <div className={`flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm ${fillHeight ? 'flex-1' : 'h-48'}`}>
          <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Lade History-Daten...
        </div>
      ) : isError ? (
        <div className={`flex items-center justify-center text-red-400 text-sm ${fillHeight ? 'flex-1' : 'h-48'}`}>
          Fehler beim Laden der History-Daten
        </div>
      ) : chartData.length === 0 ? (
        <div className={`flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm ${fillHeight ? 'flex-1' : 'h-48'}`}>
          Keine History-Daten im Zeitraum gefunden
        </div>
      ) : (
        <div ref={chartContainerRef} className={fillHeight ? 'flex-1 min-h-0' : ''}>
          <ResponsiveContainer width="100%" height={fillHeight ? '100%' : 250}>
            {renderChart()}
          </ResponsiveContainer>
        </div>
      )}

      {confirmAction && (
        <ConfirmDialog
          message={getConfirmMessage()}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
          isPending={isPending}
        />
      )}
    </div>
  );
}

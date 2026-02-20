import { useState, useMemo, useCallback } from 'react';
import {
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
import { Trash2, CircleDot } from 'lucide-react';
import { useHistory, useDeleteHistory } from '../hooks/useStates';
import type { HistoryOptions } from '../types/iobroker';

interface HistoryChartProps {
  stateId: string;
  unit?: string;
}

type ChartType = 'line' | 'area' | 'bar';

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
] as const;

const AGGREGATES = [
  { value: 'none', label: 'Keine' },
  { value: 'average', label: 'Durchschnitt' },
  { value: 'minmax', label: 'Min/Max' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
] as const;

function toLocalDatetime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTime(ts: number, rangeMs: number): string {
  const d = new Date(ts);
  if (rangeMs <= 24 * 60 * 60 * 1000) {
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) +
    ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatTooltipTime(ts: number): string {
  return new Date(ts).toLocaleString('de-DE');
}

const SHARED_AXES = {
  xAxis: (rangeMs: number) => ({
    dataKey: 'ts' as const,
    type: 'number' as const,
    domain: ['dataMin', 'dataMax'] as [string, string],
    tickFormatter: (ts: number) => formatTime(ts, rangeMs),
    stroke: '#6b7280',
    tick: { fontSize: 11 },
  }),
  yAxis: (unit?: string) => ({
    stroke: '#6b7280',
    tick: { fontSize: 11 },
    tickFormatter: (v: number) => unit ? `${v} ${unit}` : String(v),
    width: 70,
  }),
  tooltip: (unit?: string) => ({
    contentStyle: { backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 6 },
    labelStyle: { color: '#9ca3af' },
    itemStyle: { color: '#60a5fa' },
    labelFormatter: (ts: number) => formatTooltipTime(ts),
    formatter: (value: number) => [unit ? `${value} ${unit}` : value, 'Wert'] as [string | number, string],
  }),
};

function ConfirmDialog({ message, onConfirm, onCancel, isPending }: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 rounded-lg">
      <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 max-w-sm mx-4 shadow-xl">
        <p className="text-gray-200 text-sm mb-4">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="px-3 py-1.5 text-xs rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50"
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

export default function HistoryChart({ stateId, unit }: HistoryChartProps) {
  const [rangeMs, setRangeMs] = useState<number | null>(24 * 60 * 60 * 1000);
  const [customStart, setCustomStart] = useState(() => toLocalDatetime(Date.now() - 24 * 60 * 60 * 1000));
  const [customEnd, setCustomEnd] = useState(() => toLocalDatetime(Date.now()));
  const [aggregate, setAggregate] = useState<HistoryOptions['aggregate']>('none');
  const [chartType, setChartType] = useState<ChartType>('line');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [showDots, setShowDots] = useState(false);

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

  const effectiveRangeMs = options.end - options.start;

  const { data, isLoading, isError } = useHistory(stateId, options);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((e) => ({ ts: e.ts, val: e.val }));
  }, [data]);

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

  const dotProps = deleteMode
    ? { r: 3, fill: '#ef4444', stroke: '#991b1b', strokeWidth: 1, cursor: 'pointer' as const }
    : showDots
      ? { r: 2.5, fill: '#3b82f6', stroke: '#1d4ed8', strokeWidth: 1 }
      : { r: 0 };
  const activeDotProps = deleteMode
    ? { r: 6, fill: '#ef4444', stroke: '#fca5a5', strokeWidth: 2 }
    : { r: 5, fill: '#3b82f6', stroke: '#93c5fd', strokeWidth: 2 };

  function renderChart() {
    const xProps = SHARED_AXES.xAxis(effectiveRangeMs);
    const yProps = SHARED_AXES.yAxis(unit);
    const tooltipProps = SHARED_AXES.tooltip(unit);

    if (chartType === 'bar') {
      return (
        <BarChart data={chartData} onClick={handleChartClick}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis {...xProps} />
          <YAxis {...yProps} />
          <Tooltip {...tooltipProps} />
          <Bar dataKey="val" fill={deleteMode ? '#ef4444' : '#3b82f6'} cursor={deleteMode ? 'pointer' : undefined} />
        </BarChart>
      );
    }

    if (chartType === 'area') {
      return (
        <AreaChart data={chartData} onClick={handleChartClick}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
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
        </AreaChart>
      );
    }

    return (
      <LineChart data={chartData} onClick={handleChartClick}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
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
      </LineChart>
    );
  }

  return (
    <div className="mt-4 relative">
      <div className="flex flex-col gap-2 mb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setRangeMs(p.ms)}
                className={`px-2 py-1 text-xs rounded ${
                  rangeMs === p.ms
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
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
          <div className="flex gap-2 items-center">
          <div className="flex gap-1">
            {CHART_TYPES.map((ct) => (
              <button
                key={ct.value}
                onClick={() => setChartType(ct.value)}
                className={`px-2 py-1 text-xs rounded ${
                  chartType === ct.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
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
            className="bg-gray-700 text-gray-300 text-xs rounded px-2 py-1 border border-gray-600"
          >
            {AGGREGATES.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
          <button
            onClick={() => setDeleteMode(!deleteMode)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${
              deleteMode
                ? 'bg-red-600/30 text-red-300 border border-red-500/40'
                : 'bg-gray-700 text-red-400 hover:bg-red-900/30 hover:text-red-300'
            }`}
            title="Einzelwert löschen — Datenpunkt im Chart anklicken"
          >
            <Trash2 size={12} />
            Einzelwert
          </button>
          <button
            onClick={() => setConfirmAction({ type: 'range', start: options.start, end: options.end })}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-gray-700 text-red-400 hover:bg-red-900/30 hover:text-red-300"
            title="Zeitbereich löschen"
          >
            <Trash2 size={12} />
            Zeitbereich
          </button>
          <button
            onClick={() => setConfirmAction({ type: 'all' })}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-gray-700 text-red-400 hover:bg-red-900/30 hover:text-red-300"
            title="Alle History-Daten löschen"
          >
            <Trash2 size={12} />
            Alle
          </button>
          </div>
        </div>
        {rangeMs === null && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Von</label>
            <input
              type="datetime-local"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-gray-700 text-gray-300 text-xs rounded px-2 py-1 border border-gray-600"
            />
            <label className="text-xs text-gray-500">Bis</label>
            <input
              type="datetime-local"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-gray-700 text-gray-300 text-xs rounded px-2 py-1 border border-gray-600"
            />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
          <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Lade History-Daten...
        </div>
      ) : isError ? (
        <div className="flex items-center justify-center h-48 text-red-400 text-sm">
          Fehler beim Laden der History-Daten
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
          Keine History-Daten vorhanden
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          {renderChart()}
        </ResponsiveContainer>
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

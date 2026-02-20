import { useState, useMemo } from 'react';
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
import { useHistory } from '../hooks/useStates';
import type { HistoryOptions } from '../types/iobroker';

interface HistoryChartProps {
  stateId: string;
  unit?: string;
}

type ChartType = 'line' | 'area' | 'bar';

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

export default function HistoryChart({ stateId, unit }: HistoryChartProps) {
  const [rangeMs, setRangeMs] = useState(24 * 60 * 60 * 1000);
  const [aggregate, setAggregate] = useState<HistoryOptions['aggregate']>('none');
  const [chartType, setChartType] = useState<ChartType>('line');

  const options = useMemo<HistoryOptions>(() => {
    const now = Date.now();
    return {
      start: now - rangeMs,
      end: now,
      count: 500,
      aggregate,
    };
  }, [rangeMs, aggregate]);

  const { data, isLoading, isError } = useHistory(stateId, options);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((e) => ({ ts: e.ts, val: e.val }));
  }, [data]);

  function renderChart() {
    const xProps = SHARED_AXES.xAxis(rangeMs);
    const yProps = SHARED_AXES.yAxis(unit);
    const tooltipProps = SHARED_AXES.tooltip(unit);

    if (chartType === 'bar') {
      return (
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis {...xProps} />
          <YAxis {...yProps} />
          <Tooltip {...tooltipProps} />
          <Bar dataKey="val" fill="#3b82f6" />
        </BarChart>
      );
    }

    if (chartType === 'area') {
      return (
        <AreaChart data={chartData}>
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
            dot={false}
            activeDot={{ r: 4, fill: '#3b82f6' }}
          />
        </AreaChart>
      );
    }

    return (
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis {...xProps} />
        <YAxis {...yProps} />
        <Tooltip {...tooltipProps} />
        <Line
          type="monotone"
          dataKey="val"
          stroke="#3b82f6"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 4, fill: '#3b82f6' }}
        />
      </LineChart>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
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
        </div>
        <div className="flex gap-2">
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
          <select
            value={aggregate}
            onChange={(e) => setAggregate(e.target.value as HistoryOptions['aggregate'])}
            className="bg-gray-700 text-gray-300 text-xs rounded px-2 py-1 border border-gray-600"
          >
            {AGGREGATES.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>
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
    </div>
  );
}

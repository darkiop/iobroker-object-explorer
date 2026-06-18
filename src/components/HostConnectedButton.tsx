import { RefreshCw, AlertCircle, Wifi, WifiOff, Zap, Radio } from 'lucide-react';
import { useUIContext } from '../context/UIContext';

const LS_HOST_KEY = 'ioBrokerHost';

interface Props {
  apiConnected: boolean;
  realtimeTransport?: 'longpolling' | 'socketio';
  realtimeStatus?: { supported: boolean | null; connected: boolean };
  /** true when socket.io was selected but unreachable and we auto-fell back to long polling */
  realtimeFallback?: boolean;
  lastUpdated?: number;
  onManualRefresh?: () => void;
}

export default function HostConnectedButton({ apiConnected, realtimeTransport, realtimeStatus, realtimeFallback = false, lastUpdated, onManualRefresh }: Props) {
  const { appSettings } = useUIContext();
  const language = appSettings.language;
  const objectsRefreshInterval = appSettings.objectsRefreshInterval;

  const currentHost = localStorage.getItem(LS_HOST_KEY) ?? window.__CONFIG__?.ioBrokerHost ?? '';

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div className={`flex flex-col leading-tight px-2 py-0.5 rounded-md text-xs font-mono ${
        apiConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
      }`}>
        <span className="inline-flex items-center gap-1.5">
          {apiConnected ? <Wifi size={13} className="shrink-0" /> : <WifiOff size={13} className="shrink-0" />}
          {currentHost || '—'}
        </span>
        {lastUpdated && (
          <span className="text-[10px] opacity-60 text-right">
            {new Date(lastUpdated).toLocaleTimeString()}
          </span>
        )}
      </div>
      {onManualRefresh && (
        <button
          onClick={onManualRefresh}
          className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title={language === 'en' ? 'Refresh' : 'Aktualisieren'}
        >
          <RefreshCw size={16} />
        </button>
      )}
      {objectsRefreshInterval && objectsRefreshInterval !== 'off' && (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
          title={language === 'en' ? `Objects auto-refresh every ${objectsRefreshInterval}` : `Objekte werden alle ${objectsRefreshInterval} aktualisiert`}
        >
          <RefreshCw size={10} className="animate-spin" style={{ animationDuration: '3s' }} />
          {objectsRefreshInterval}
        </span>
      )}
      {realtimeTransport && realtimeStatus && (() => {
        const isSocketIO = realtimeTransport === 'socketio';
        const { supported, connected } = realtimeStatus;
        const colorCls = connected
          ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
          : supported === false
            ? 'bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400'
            : 'bg-gray-500/10 text-gray-500 dark:bg-gray-500/15 dark:text-gray-400';
        const label = isSocketIO ? 'Socket.io' : 'Long-Polling';
        const stateText = connected
          ? (language === 'en' ? 'connected' : 'verbunden')
          : supported === false
            ? (language === 'en' ? 'unreachable' : 'nicht erreichbar')
            : (language === 'en' ? 'connecting…' : 'verbinde…');
        const fallbackText = realtimeFallback
          ? (language === 'en'
              ? ' (auto-fallback: Socket.io unreachable, using Long-Polling)'
              : ' (Auto-Fallback: Socket.io nicht erreichbar, nutze Long-Polling)')
          : '';
        return (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded ${colorCls} ${realtimeFallback ? 'ring-1 ring-amber-400/60' : ''}`}
            title={(language === 'en'
              ? `Realtime updates via ${label}: ${stateText}${fallbackText}`
              : `Live-Updates über ${label}: ${stateText}${fallbackText}`)}
          >
            {isSocketIO ? <Zap size={10} /> : <Radio size={10} />}
            {label}
            {realtimeFallback && <AlertCircle size={10} className="text-amber-500" />}
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                connected ? 'bg-emerald-500' : supported === false ? 'bg-red-500' : 'bg-gray-400 animate-pulse'
              }`}
            />
          </span>
        );
      })()}
    </div>
  );
}

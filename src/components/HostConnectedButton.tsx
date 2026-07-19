import { RefreshCw, AlertCircle, Plug, PlugZap, Zap, Radio, Pause } from 'lucide-react';
import { useUIContext } from '../context/UIContext';

const LS_HOST_KEY = 'ioBrokerHost';

interface Props {
  apiConnected: boolean;
  realtimeTransport?: 'longpolling' | 'socketio';
  realtimeStatus?: { supported: boolean | null; connected: boolean };
  /** true when socket.io was selected but unreachable and we auto-fell back to long polling */
  realtimeFallback?: boolean;
  /** true when live communication is paused — replaces the auto-refresh + transport badges */
  paused?: boolean;
  lastUpdated?: number;
}

export default function HostConnectedButton({ apiConnected, realtimeTransport, realtimeStatus, realtimeFallback = false, paused = false, lastUpdated }: Props) {
  const { appSettings } = useUIContext();
  const language = appSettings.language;
  const objectsRefreshInterval = appSettings.objectsRefreshInterval;

  const currentHost = localStorage.getItem(LS_HOST_KEY) ?? window.__CONFIG__?.ioBrokerHost ?? '';

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div
        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-mono ${
          apiConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
        }`}
        title={lastUpdated ? `${language === 'en' ? 'Last update' : 'Letztes Update'}: ${new Date(lastUpdated).toLocaleTimeString()}` : undefined}
      >
        {apiConnected ? <PlugZap size={13} className="shrink-0" /> : <Plug size={13} className="shrink-0" />}
        {currentHost || '—'}
      </div>
      {!paused && objectsRefreshInterval && objectsRefreshInterval !== 'off' && (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
          title={language === 'en' ? `Objects auto-refresh every ${objectsRefreshInterval}` : `Objekte werden alle ${objectsRefreshInterval} aktualisiert`}
        >
          <RefreshCw size={10} className="animate-spin" style={{ animationDuration: '3s' }} />
          {objectsRefreshInterval}
        </span>
      )}
      {paused ? (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
          title={language === 'en' ? 'Communication paused' : 'Kommunikation pausiert'}
        >
          <Pause size={10} />
          {language === 'en' ? 'Paused' : 'Pausiert'}
        </span>
      ) : realtimeTransport && realtimeStatus && (() => {
        const isSocketIO = realtimeTransport === 'socketio';
        const { supported, connected } = realtimeStatus;
        const colorCls = connected
          ? 'text-emerald-600 dark:text-emerald-400'
          : supported === false
            ? 'text-red-600 dark:text-red-400'
            : 'text-gray-500 dark:text-gray-400';
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
            className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 ${colorCls} ${realtimeFallback ? 'ring-1 ring-amber-400/60 rounded' : ''}`}
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

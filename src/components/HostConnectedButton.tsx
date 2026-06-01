import { useState, useRef, useEffect } from 'react';
import { Pencil, Loader2, AlertCircle, Check, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { validateHost, validatePort } from '../utils/validation';
import { useUIContext } from '../context/UIContext';

const LS_HOST_KEY = 'ioBrokerHost';

interface Props {
  apiConnected: boolean;
  lastUpdated?: number;
  onManualRefresh?: () => void;
}

export default function HostConnectedButton({ apiConnected, lastUpdated, onManualRefresh }: Props) {
  const { appSettings } = useUIContext();
  const language = appSettings.language;
  const objectsRefreshInterval = appSettings.objectsRefreshInterval;

  const currentHost = localStorage.getItem(LS_HOST_KEY) ?? window.__CONFIG__?.ioBrokerHost ?? '';
  const [editingHost, setEditingHost] = useState(false);
  const [hostIp, setHostIp] = useState('');
  const [hostPort, setHostPort] = useState('8093');
  const [hostTesting, setHostTesting] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const hostIpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingHost) {
      const colonIdx = currentHost.lastIndexOf(':');
      setHostIp(colonIdx > 0 ? currentHost.slice(0, colonIdx) : currentHost);
      setHostPort(colonIdx > 0 ? currentHost.slice(colonIdx + 1) : '8093');
      setHostError(null);
      hostIpRef.current?.select();
    }
  }, [editingHost, currentHost]);

  async function testAndSave() {
    const ip = hostIp.trim();
    const port = hostPort.trim();
    if (!ip) { setEditingHost(false); return; }
    const ipError = validateHost(ip);
    if (ipError) { setHostError(ipError); return; }
    const portError = validatePort(port);
    if (portError) { setHostError(portError); return; }
    const val = `${ip}:${port}`;
    if (val === currentHost) { setEditingHost(false); return; }
    setHostTesting(true);
    setHostError(null);
    try {
      const res = await fetch(`http://${val}/v1/objects?limit=1`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      localStorage.setItem(LS_HOST_KEY, val);
      window.location.reload();
    } catch {
      setHostError(language === 'en' ? 'Host not reachable' : 'Host nicht erreichbar');
      setHostTesting(false);
      hostIpRef.current?.focus();
    }
  }

  if (editingHost) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); void testAndSave(); }} className="flex flex-col items-center gap-0.5">
        <div className="flex items-center gap-1">
          <input
            ref={hostIpRef}
            value={hostIp}
            onChange={(e) => { setHostIp(e.target.value); setHostError(null); }}
            onBlur={() => { if (!hostTesting) setTimeout(() => setEditingHost(false), 150); }}
            onKeyDown={(e) => { if (e.key === 'Escape') setEditingHost(false); }}
            disabled={hostTesting}
            className={`px-2 py-0.5 rounded-md text-sm font-mono border bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none w-36 transition-colors ${hostTesting ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20' : hostError ? 'border-red-400' : 'border-blue-400'}`}
            placeholder="10.4.0.33"
          />
          <span className="text-gray-400 dark:text-gray-500 text-sm">:</span>
          <input
            value={hostPort}
            onChange={(e) => { setHostPort(e.target.value); setHostError(null); }}
            onBlur={() => { if (!hostTesting) setTimeout(() => setEditingHost(false), 150); }}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => { if (e.key === 'Escape') setEditingHost(false); }}
            disabled={hostTesting}
            className={`px-2 py-0.5 rounded-md text-sm font-mono border bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none w-16 transition-colors ${hostTesting ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20' : hostError ? 'border-red-400' : 'border-blue-400'}`}
            placeholder="8093"
          />
          <button
            type="submit"
            disabled={hostTesting}
            className="p-0.5 rounded text-blue-500 hover:text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 disabled:opacity-40 transition-colors shrink-0"
          >
            {hostTesting ? <Loader2 size={14} className="animate-spin text-orange-400" /> : <Check size={14} />}
          </button>
          {hostError && <AlertCircle size={14} className="text-red-400 shrink-0" />}
        </div>
        {hostError && <span className="text-xs text-red-400">{hostError}</span>}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        onClick={() => setEditingHost(true)}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 ${
          apiConnected
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-red-500 dark:text-red-400'
        }`}
        title={language === 'en' ? 'Click to change host' : 'Klicken zum Ändern'}
      >
        {apiConnected
          ? <Wifi size={13} className="shrink-0" />
          : <WifiOff size={13} className="shrink-0" />
        }
        {apiConnected ? currentHost || '—' : (currentHost || '—')}
        {lastUpdated && (
          <span className="ml-1 text-[10px] font-mono opacity-60">
            {new Date(lastUpdated).toLocaleTimeString()}
          </span>
        )}
        {onManualRefresh && (
          <RefreshCw
            size={11}
            className="opacity-50 hover:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); onManualRefresh(); }}
          />
        )}
        <Pencil size={11} className="opacity-50" />
      </button>
      {objectsRefreshInterval && objectsRefreshInterval !== 'off' && (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
          title={language === 'en' ? `Objects auto-refresh every ${objectsRefreshInterval}` : `Objekte werden alle ${objectsRefreshInterval} aktualisiert`}
        >
          <RefreshCw size={10} className="animate-spin" style={{ animationDuration: '3s' }} />
          {objectsRefreshInterval}
        </span>
      )}
    </div>
  );
}

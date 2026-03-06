import { useState, useCallback, useRef, useEffect } from 'react';
import { Sun, Moon, PanelLeftClose, PanelLeftOpen, Settings, CircleHelp, Pencil, Loader2, AlertCircle, Check } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import LanguageDropdown from './LanguageDropdown';
import { validateHost, validatePort } from '../utils/validation';

const LS_HOST_KEY = 'ioBrokerHost';

interface LayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  onSidebarToggle?: () => void;
  onOpenSettings?: () => void;
  onLanguageChange?: (language: 'en' | 'de') => void;
  language?: 'en' | 'de';
  apiConnected?: boolean;
  onShowShortcuts?: () => void;
}

const LS_SIDEBAR_WIDTH = 'iobroker-explorer-sidebar-width';
const LS_SIDEBAR_COLLAPSED = 'iobroker-explorer-sidebar-collapsed';

export default function Layout({
  sidebar,
  children,
  onSidebarToggle,
  onOpenSettings,
  onLanguageChange,
  language = 'en',
  apiConnected = true,
  onShowShortcuts,
}: LayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = parseInt(localStorage.getItem(LS_SIDEBAR_WIDTH) ?? '', 10);
    return Number.isFinite(stored) ? Math.max(180, Math.min(600, stored)) : 360;
  });
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem(LS_SIDEBAR_COLLAPSED) === 'true'
  );
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const sidebarWidthRef = useRef(sidebarWidth);
  const { dark, toggle } = useTheme();

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

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setCollapsed((c) => {
          const next = !c;
          localStorage.setItem(LS_SIDEBAR_COLLAPSED, String(next));
          if (onSidebarToggle) setTimeout(onSidebarToggle, 210);
          return next;
        });
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onSidebarToggle]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const editable = (e.target as HTMLElement).isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || editable) return;
      if (e.key === '?') {
        e.preventDefault();
        onShowShortcuts?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onShowShortcuts]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarWidthRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const newWidth = startWidth.current + (e.clientX - startX.current);
      setSidebarWidth(Math.max(180, Math.min(600, newWidth)));
    };

    const handleMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setSidebarWidth((w) => { localStorage.setItem(LS_SIDEBAR_WIDTH, String(w)); return w; });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="relative flex items-center justify-between px-4 py-3 bg-gray-100 border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setCollapsed((c) => { const next = !c; localStorage.setItem(LS_SIDEBAR_COLLAPSED, String(next)); return next; }); if (onSidebarToggle) setTimeout(onSidebarToggle, 210); }}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
            title={collapsed ? (language === 'en' ? 'Expand sidebar' : 'Sidebar ausklappen') : (language === 'en' ? 'Collapse sidebar' : 'Sidebar einklappen')}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <img src="/favicon.svg" alt="" className="w-6 h-6 shrink-0" />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">ioBroker Object Explorer</h1>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
          {editingHost ? (
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
                  title={language === 'en' ? 'Apply' : 'Übernehmen'}
                >
                  {hostTesting ? <Loader2 size={14} className="animate-spin text-orange-400" /> : <Check size={14} />}
                </button>
                {hostError && <AlertCircle size={14} className="text-red-400 shrink-0" />}
              </div>
              {hostError && <span className="text-xs text-red-400">{hostError}</span>}
            </form>
          ) : (
            <button
              onClick={() => { setEditingHost(true); }}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-semibold font-mono shadow-sm border transition-colors ${
                apiConnected
                  ? 'border-emerald-300/80 dark:border-emerald-700/70 bg-emerald-100/80 dark:bg-emerald-900/35 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200/80 dark:hover:bg-emerald-800/50'
                  : 'border-red-300/80 dark:border-red-700/70 bg-red-100/80 dark:bg-red-900/35 text-red-700 dark:text-red-300 hover:bg-red-200/80 dark:hover:bg-red-800/50'
              }`}
              title={language === 'en' ? 'Click to change host' : 'Klicken zum Ändern'}
            >
              {apiConnected
                ? (language === 'en' ? 'Connected to' : 'Verbunden mit')
                : (language === 'en' ? 'Not connected to' : 'Nicht verbunden mit')
              }: {currentHost || '—'}
              <Pencil size={11} className="opacity-50" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <LanguageDropdown value={language} onChange={(next) => onLanguageChange?.(next)} compact />
          <button
            onClick={toggle}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
            title={dark ? 'Light Mode' : 'Dark Mode'}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
            title={language === 'en' ? 'Settings' : 'Einstellungen'}
          >
            <Settings size={16} />
          </button>
          <button
            onClick={onShowShortcuts}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
            title={language === 'en' ? 'Keyboard shortcuts' : 'Tastenkürzel'}
          >
            <CircleHelp size={16} />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className="border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900 overflow-hidden shrink-0 transition-[width] duration-200"
          style={{ width: collapsed ? 0 : sidebarWidth }}
        >
          {sidebar}
        </aside>

        {/* Resize Handle – nur wenn ausgeklappt */}
        {!collapsed && (
          <div
            className="w-1 shrink-0 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500/70 transition-colors"
            onMouseDown={handleMouseDown}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-hidden p-4 flex flex-col">{children}</main>
      </div>
    </div>
  );
}

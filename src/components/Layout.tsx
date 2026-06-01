import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Sun, Moon, Gem, PanelLeftClose, PanelLeftOpen, Settings, CircleHelp, Maximize, Minimize, RefreshCw, ExternalLink, Info, WifiOff, Wifi } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import LanguageDropdown from './LanguageDropdown';
import { useUIContext } from '../context/UIContext';
import { useFilterContext } from '../context/FilterContext';

const LS_HOST_KEY = 'ioBrokerHost';

interface LayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  apiConnected?: boolean;
  browserOffline?: boolean;
  lastUpdated?: number;
  onManualRefresh?: () => void;
  onConfirmScriptRefresh?: () => void;
}

const LS_SIDEBAR_WIDTH = 'iobroker-explorer-sidebar-width';
const LS_SIDEBAR_COLLAPSED = 'iobroker-explorer-sidebar-collapsed';

export default function Layout({ sidebar, children, apiConnected = true, browserOffline = false, lastUpdated, onManualRefresh, onConfirmScriptRefresh }: LayoutProps) {
  const {
    appSettings, confirmScriptRefresh,
    setConfirmScriptRefresh, handleLanguageChange, openSettings, setShortcutsOpen,
  } = useUIContext();
  const { handleSidebarToggle } = useFilterContext();
  const language = appSettings.language;
  const adminPort = appSettings.adminPort;
  const objectsRefreshInterval = appSettings.objectsRefreshInterval;
  const onSidebarToggle = handleSidebarToggle;
  const onOpenSettings = openSettings;
  const onLanguageChange = handleLanguageChange;
  const onShowShortcuts = () => setShortcutsOpen(true);
  const onCancelScriptRefresh = () => setConfirmScriptRefresh(false);
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
  const { theme, cycle } = useTheme();
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  }

  const currentHost = localStorage.getItem(LS_HOST_KEY) ?? window.__CONFIG__?.ioBrokerHost ?? '';

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
    <>
    <div className="h-screen flex flex-col bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="relative flex items-center justify-between px-4 py-3 bg-gray-100 border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setCollapsed((c) => { const next = !c; localStorage.setItem(LS_SIDEBAR_COLLAPSED, String(next)); return next; }); if (onSidebarToggle) setTimeout(onSidebarToggle, 210); }}
            className={`p-1.5 rounded-lg transition-colors ${collapsed ? 'text-blue-600 bg-blue-500/15 hover:bg-blue-500/25 dark:text-blue-400 dark:bg-blue-500/20 dark:hover:bg-blue-500/30' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700'}`}
            title={collapsed ? (language === 'en' ? 'Expand sidebar' : 'Sidebar ausklappen') : (language === 'en' ? 'Collapse sidebar' : 'Sidebar einklappen')}
            aria-label={collapsed ? (language === 'en' ? 'Expand sidebar' : 'Sidebar ausklappen') : (language === 'en' ? 'Collapse sidebar' : 'Sidebar einklappen')}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <img src="/favicon.svg" alt="" className="w-6 h-6 shrink-0" />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">ioBroker Object Explorer</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-gray-400 dark:text-gray-600 select-none" title="App version">v{__APP_VERSION__}</span>
          <LanguageDropdown value={language} onChange={(next) => onLanguageChange?.(next)} compact />
          {currentHost && (
            <a
              href={`http://${currentHost.split(':')[0]}:${adminPort}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
              title={language === 'en' ? 'Open ioBroker Admin' : 'ioBroker Admin öffnen'}
              aria-label={language === 'en' ? 'Open ioBroker Admin' : 'ioBroker Admin öffnen'}
            >
              <ExternalLink size={16} />
            </a>
          )}
          <button
            onClick={cycle}
            className="p-1.5 rounded-lg transition-colors text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700"
            title={theme === 'light' ? 'Dark Mode' : theme === 'dark' ? 'Obsidian Mode' : 'Light Mode'}
            aria-label={theme === 'light' ? 'Dark Mode' : theme === 'dark' ? 'Obsidian Mode' : 'Light Mode'}
          >
            {theme === 'light' ? <Moon size={16} /> : theme === 'dark' ? <Gem size={16} /> : <Sun size={16} />}
          </button>
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
            title={language === 'en' ? 'Settings' : 'Einstellungen'}
            aria-label={language === 'en' ? 'Settings' : 'Einstellungen'}
          >
            <Settings size={16} />
          </button>
          <button
            onClick={onShowShortcuts}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
            title={language === 'en' ? 'Help' : 'Hilfe'}
            aria-label={language === 'en' ? 'Help' : 'Hilfe'}
          >
            <CircleHelp size={16} />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
            title={isFullscreen ? (language === 'en' ? 'Exit fullscreen' : 'Vollbild beenden') : (language === 'en' ? 'Fullscreen' : 'Vollbild')}
            aria-label={isFullscreen ? (language === 'en' ? 'Exit fullscreen' : 'Vollbild beenden') : (language === 'en' ? 'Fullscreen' : 'Vollbild')}
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
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
        <main className="flex-1 overflow-hidden flex flex-col bg-white dark:bg-gray-900">
          <div className="flex-1 overflow-hidden p-0 flex flex-col">{children}</div>
        </main>
      </div>
    </div>
    {confirmScriptRefresh && createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancelScriptRefresh}>
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-sm mx-4 p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start gap-3">
            <Info size={18} className="text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
                {language === 'en' ? 'Refresh script index?' : 'Skript-Index aktualisieren?'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {language === 'en'
                  ? 'This scans the source code of all scripts and may take several seconds depending on the number of scripts and datapoints.'
                  : 'Dieser Vorgang durchsucht den gesamten Quellcode aller Skripte und kann je nach Anzahl der Skripte und Datenpunkte mehrere Sekunden dauern.'}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancelScriptRefresh}
              className="px-4 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {language === 'en' ? 'Cancel' : 'Abbrechen'}
            </button>
            <button
              onClick={onConfirmScriptRefresh}
              className="px-4 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              {language === 'en' ? 'Continue' : 'Fortfahren'}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    {(browserOffline || !apiConnected) && createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4 px-8 py-7 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl max-w-sm w-full mx-4 text-center">
          {browserOffline
            ? <WifiOff size={36} className="text-gray-400 dark:text-gray-500" />
            : <WifiOff size={36} className="text-amber-500 animate-pulse" />
          }
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
              {browserOffline
                ? (language === 'en' ? 'No internet connection' : 'Keine Internetverbindung')
                : (language === 'en' ? 'ioBroker unreachable' : 'ioBroker nicht erreichbar')
              }
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {browserOffline
                ? (language === 'en' ? 'Check your network and try again.' : 'Netzwerkverbindung prüfen und erneut versuchen.')
                : (language === 'en' ? 'Retrying in the background…' : 'Verbindung wird im Hintergrund wiederhergestellt…')
              }
            </p>
          </div>
          {!browserOffline && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 font-mono">
              <RefreshCw size={11} className="animate-spin" style={{ animationDuration: '2s' }} />
              {currentHost}
            </div>
          )}
        </div>
      </div>,
      document.body
    )}
    </>
  );
}

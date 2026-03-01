import { useState, useCallback, useRef, useEffect } from 'react';
import { Sun, Moon, PanelLeftClose, PanelLeftOpen, Settings, CircleHelp } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import LanguageDropdown from './LanguageDropdown';

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
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
          <span className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-semibold font-mono shadow-sm border ${
            apiConnected
              ? 'border-emerald-300/80 dark:border-emerald-700/70 bg-emerald-100/80 dark:bg-emerald-900/35 text-emerald-700 dark:text-emerald-300'
              : 'border-red-300/80 dark:border-red-700/70 bg-red-100/80 dark:bg-red-900/35 text-red-700 dark:text-red-300'
          }`}>
            {apiConnected
              ? (language === 'en' ? 'Connected to' : 'Verbunden mit')
              : (language === 'en' ? 'Not connected to' : 'Nicht verbunden mit')
            }: {window.__CONFIG__?.ioBrokerHost ?? '—'}
          </span>
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

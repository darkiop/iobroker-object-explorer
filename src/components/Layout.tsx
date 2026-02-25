import { useState, useCallback, useRef } from 'react';
import { Sun, Moon, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface LayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  onSidebarToggle?: () => void;
}

export default function Layout({ sidebar, children, onSidebarToggle }: LayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const [collapsed, setCollapsed] = useState(false);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const { dark, toggle } = useTheme();

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarWidth;
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
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [sidebarWidth]);

  return (
    <div className="h-screen flex flex-col bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-gray-100 border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setCollapsed((c) => !c); if (onSidebarToggle) setTimeout(onSidebarToggle, 210); }}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
            title={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <img src="/favicon.svg" alt="" className="w-6 h-6 shrink-0" />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">ioBroker Object Explorer</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 dark:text-gray-500">REST-API: {window.__CONFIG__?.ioBrokerHost ?? '—'}</span>
          <button
            onClick={toggle}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
            title={dark ? 'Light Mode' : 'Dark Mode'}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
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

import { useState, useCallback, useRef } from 'react';

interface LayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export default function Layout({ sidebar, children }: LayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

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
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-white">ioBroker Explorer</h1>
          <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded">POC</span>
        </div>
        <span className="text-xs text-gray-500">REST-API: 10.4.0.20:8093</span>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className="border-r border-gray-700 bg-gray-850 overflow-y-auto shrink-0"
          style={{ width: sidebarWidth }}
        >
          {sidebar}
        </aside>

        {/* Resize Handle */}
        <div
          className="w-1 shrink-0 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500/70 transition-colors"
          onMouseDown={handleMouseDown}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4">{children}</main>
      </div>
    </div>
  );
}

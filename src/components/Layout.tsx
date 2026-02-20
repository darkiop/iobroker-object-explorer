interface LayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export default function Layout({ sidebar, children }: LayoutProps) {
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
        <aside className="w-72 border-r border-gray-700 bg-gray-850 overflow-y-auto shrink-0">
          {sidebar}
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4">{children}</main>
      </div>
    </div>
  );
}

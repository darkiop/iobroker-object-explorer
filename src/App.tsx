import { useState, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import SearchBar from './components/SearchBar';
import StateTree from './components/StateTree';
import StateList from './components/StateList';
import StateDetail from './components/StateDetail';
import { useFilteredObjects, useStateValues } from './hooks/useStates';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

const PAGE_SIZE = 50;

function AppContent() {
  const [pattern, setPattern] = useState('alias.0.*');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const { data: objects, isLoading: objectsLoading, error: objectsError } = useFilteredObjects(pattern);

  const objectIds = useMemo(
    () => (objects ? Object.keys(objects).sort() : []),
    [objects]
  );

  const totalCount = objectIds.length;
  const pageStart = page * PAGE_SIZE;
  const pageIds = useMemo(
    () => objectIds.slice(pageStart, pageStart + PAGE_SIZE),
    [objectIds, pageStart]
  );
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // State-Werte nur für die aktuelle Seite laden
  const { data: stateValues } = useStateValues(pageIds);

  const handleSearch = (newPattern: string) => {
    setPattern(newPattern);
    setPage(0);
    setSelectedId(null);
  };

  return (
    <Layout
      sidebar={
        <div className="flex flex-col h-full">
          <div className="p-3 border-b border-gray-700">
            <SearchBar onSearch={handleSearch} initialPattern={pattern} />
            <div className="mt-2 text-xs text-gray-500">
              {objectsLoading ? 'Objekte laden...' : `${totalCount} Datenpunkte`}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            <StateTree stateIds={objectIds} objects={objects || {}} selectedId={selectedId} onSelect={setSelectedId} onSearch={handleSearch} />
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4 h-full">
        {objectsError && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg p-3 text-sm">
            Fehler: {objectsError.message}
          </div>
        )}

        {selectedId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setSelectedId(null)}
          >
            <div
              className="w-full max-w-4xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <StateDetail stateId={selectedId} onClose={() => setSelectedId(null)} />
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0">
          <StateList
            ids={pageIds}
            states={stateValues || {}}
            objects={objects || {}}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between py-2 px-1 border-t border-gray-700 shrink-0">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 text-sm bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Zurück
            </button>
            <span className="text-xs text-gray-500">
              Seite {page + 1} von {totalPages} ({pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, totalCount)} von {totalCount})
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 text-sm bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Weiter
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

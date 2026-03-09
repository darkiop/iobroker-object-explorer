import { useState, useRef, useCallback } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { createPortal } from 'react-dom';
import { X, Upload, AlertTriangle, FileJson, FilePlus, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { useImportDatapoints } from '../hooks/useStates';
import type { ImportResult, ImportItemResult } from '../api/iobroker';
import { useTheme } from '../context/ThemeContext';
import type { IoBrokerObject } from '../types/iobroker';

interface Props {
  onClose: () => void;
  language?: 'en' | 'de';
  existingIds?: Set<string>;
}

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightJson(code: string, dark: boolean): string {
  const c = dark
    ? { key: '#79b8ff', str: '#9ecbff', num: '#f8e45c', kw: '#b392f0', punct: '#8b949e' }
    : { key: '#0550ae', str: '#0a3069', num: '#953800', kw: '#8250df', punct: '#57606a' };

  let result = '';
  let i = 0;
  const n = code.length;

  while (i < n) {
    const ch = code[i];

    if (ch === '"') {
      let j = i + 1;
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === '"') { j++; break; }
        j++;
      }
      const str = escHtml(code.slice(i, j));
      let k = j;
      while (k < n && (code[k] === ' ' || code[k] === '\t')) k++;
      const isKey = code[k] === ':';
      result += `<span style="color:${isKey ? c.key : c.str}">${str}</span>`;
      i = j;
      continue;
    }

    if ((ch === '-' && i + 1 < n && code[i + 1] >= '0' && code[i + 1] <= '9') || (ch >= '0' && ch <= '9')) {
      let j = i;
      if (code[j] === '-') j++;
      while (j < n && code[j] >= '0' && code[j] <= '9') j++;
      if (j < n && code[j] === '.') { j++; while (j < n && code[j] >= '0' && code[j] <= '9') j++; }
      if (j < n && (code[j] === 'e' || code[j] === 'E')) {
        j++;
        if (j < n && (code[j] === '+' || code[j] === '-')) j++;
        while (j < n && code[j] >= '0' && code[j] <= '9') j++;
      }
      result += `<span style="color:${c.num}">${escHtml(code.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    if (ch === 't' && code.startsWith('true', i)) { result += `<span style="color:${c.kw}">true</span>`; i += 4; continue; }
    if (ch === 'f' && code.startsWith('false', i)) { result += `<span style="color:${c.kw}">false</span>`; i += 5; continue; }
    if (ch === 'n' && code.startsWith('null', i)) { result += `<span style="color:${c.kw}">null</span>`; i += 4; continue; }

    if ('{}[],:'.includes(ch)) {
      result += `<span style="color:${c.punct}">${escHtml(ch)}</span>`;
      i++;
      continue;
    }

    result += escHtml(ch);
    i++;
  }

  return result;
}

function JsonEditor({ value, onChange, dark }: { value: string; onChange: (v: string) => void; dark: boolean }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const syncScroll = useCallback(() => {
    if (preRef.current && textareaRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  const highlighted = highlightJson(value, dark) + '\n';

  const sharedStyle: React.CSSProperties = {
    fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", Consolas, "Courier New", monospace',
    fontSize: '12.5px',
    lineHeight: '1.6',
    padding: '10px 12px',
    margin: 0,
    tabSize: 2,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    overflowWrap: 'break-word',
  };

  return (
    <div
      className="relative rounded border border-gray-300 dark:border-gray-600 overflow-hidden"
      style={{ height: '340px', background: dark ? '#0d1117' : '#f6f8fa' }}
    >
      <pre
        ref={preRef}
        aria-hidden="true"
        style={{
          ...sharedStyle,
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          color: dark ? '#e6edf3' : '#24292f',
          background: 'transparent',
        }}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        spellCheck={false}
        autoComplete="off"
        style={{
          ...sharedStyle,
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          resize: 'none',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'transparent',
          caretColor: dark ? '#e6edf3' : '#24292f',
          overflow: 'auto',
        }}
      />
    </div>
  );
}

function validateImportData(json: string): { data: Record<string, IoBrokerObject>; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { data: {}, error: e instanceof Error ? e.message : 'Invalid JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { data: {}, error: 'JSON must be an object (Record<id, object>)' };
  }
  return { data: parsed as Record<string, IoBrokerObject>, error: '' };
}

export default function ImportDatapointsModal({ onClose, language = 'en', existingIds }: Props) {
  const isEn = language === 'en';
  const { dark } = useTheme();
  const [json, setJson] = useState('');
  const [parseError, setParseError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  const importMutation = useImportDatapoints();
  const [isDragOver, setIsDragOver] = useState(false);
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileLoad(file: File) {
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      setParseError(isEn ? 'Only .json files are supported.' : 'Nur .json-Dateien werden unterstützt.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') handleJsonChange(text);
    };
    reader.readAsText(file);
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileLoad(file);
    e.target.value = '';
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setIsDragOver(true); }
  function handleDragLeave(e: React.DragEvent) { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileLoad(file);
  }

  useEscapeKey(onClose);

  function handleJsonChange(value: string) {
    setJson(value);
    setParseError('');
    setResult(null);
  }

  function handleCreateEmptyJson() {
    const template = {
      '0_userdata.0.my_datapoint': {
        _id: '0_userdata.0.my_datapoint',
        type: 'state',
        common: { name: 'My Datapoint', type: 'number', role: 'value', read: true, write: false },
        native: {},
      },
    };
    handleJsonChange(JSON.stringify(template, null, 2));
  }

  function handleImport() {
    const { data, error } = validateImportData(json);
    if (error) { setParseError(error); return; }
    if (Object.keys(data).length === 0) { setParseError(isEn ? 'No datapoints found in JSON.' : 'Keine Datenpunkte im JSON gefunden.'); return; }

    const skippedIds = (!allowOverwrite && existingIds)
      ? Object.keys(data).filter((id) => existingIds.has(id))
      : [];
    const dataToImport = skippedIds.length > 0
      ? Object.fromEntries(Object.entries(data).filter(([id]) => !existingIds!.has(id)))
      : data;

    const skippedItems: ImportItemResult[] = skippedIds.map((id) => ({ id, status: 'skipped' }));

    if (Object.keys(dataToImport).length === 0) {
      setResult({ items: skippedItems, created: 0, updated: 0, skipped: skippedIds.length, errors: 0 });
      return;
    }

    importMutation.mutate({ data: dataToImport, existingIds: allowOverwrite ? existingIds : undefined }, {
      onSuccess: (res) => setResult({
        ...res,
        items: [...res.items, ...skippedItems],
        skipped: skippedIds.length,
      }),
    });
  }

  // Pre-check: parse JSON to show which IDs are new vs existing
  const preview = (() => {
    if (!json.trim() || result) return null;
    try {
      const p = JSON.parse(json);
      if (typeof p !== 'object' || !p || Array.isArray(p)) return null;
      const ids = Object.keys(p);
      if (ids.length === 0) return null;
      const newIds = existingIds ? ids.filter((id) => !existingIds.has(id)) : ids;
      const existing = existingIds ? ids.filter((id) => existingIds.has(id)) : [];
      return { ids, newIds, existing };
    } catch { return null; }
  })();

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop-in bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-blue-500" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {isEn ? 'Import Datapoints' : 'Datenpunkte importieren'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto flex-1">

          {/* Result view — shown after import */}
          {result ? (
            <div className="flex flex-col gap-3">
              {/* Summary badges */}
              <div className="flex items-center gap-3 flex-wrap">
                {result.created > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium">
                    <CheckCircle2 size={13} />
                    {result.created} {isEn ? 'created' : 'erstellt'}
                  </div>
                )}
                {result.updated > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium">
                    <RefreshCw size={13} />
                    {result.updated} {isEn ? 'updated' : 'aktualisiert'}
                  </div>
                )}
                {result.skipped > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-medium">
                    <XCircle size={13} />
                    {result.skipped} {isEn ? 'skipped' : 'übersprungen'}
                  </div>
                )}
                {result.errors > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-medium">
                    <XCircle size={13} />
                    {result.errors} {isEn ? 'failed' : 'fehlgeschlagen'}
                  </div>
                )}
              </div>

              {/* Per-item table */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="overflow-y-auto" style={{ maxHeight: '380px' }}>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">{isEn ? 'Datapoint ID' : 'Datenpunkt-ID'}</th>
                        <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium w-32">{isEn ? 'Status' : 'Status'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {result.items.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-300 break-all">{item.id}</td>
                          <td className="px-3 py-1.5">
                            {item.status === 'created' && (
                              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                <CheckCircle2 size={11} /> {isEn ? 'Created' : 'Erstellt'}
                              </span>
                            )}
                            {item.status === 'updated' && (
                              <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                                <RefreshCw size={11} /> {isEn ? 'Updated' : 'Aktualisiert'}
                              </span>
                            )}
                            {item.status === 'skipped' && (
                              <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500">
                                <XCircle size={11} /> {isEn ? 'Skipped' : 'Übersprungen'}
                              </span>
                            )}
                            {item.status === 'error' && (
                              <span className="flex flex-col gap-0.5">
                                <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                                  <XCircle size={11} /> {isEn ? 'Error' : 'Fehler'}
                                </span>
                                {item.error && <span className="text-red-500 dark:text-red-400 break-all">{item.error}</span>}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isEn
                  ? 'Paste a JSON object where keys are datapoint IDs and values are the full ioBroker object definitions.'
                  : 'JSON-Objekt einfügen, bei dem die Schlüssel Datenpunkt-IDs und die Werte vollständige ioBroker-Objektdefinitionen sind.'}
              </p>

              <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFileInputChange} />
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 px-4 py-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                  isDragOver
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <FileJson size={20} className={isDragOver ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'} />
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  {isDragOver
                    ? (isEn ? 'Drop file here' : 'Datei hier ablegen')
                    : (isEn ? 'Drag & drop a .json file or click to select' : '.json-Datei hierher ziehen oder klicken zum Auswählen')}
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">JSON</span>
                  <div className="flex items-center gap-2">
                    {preview && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {preview.ids.length} {isEn ? 'object(s)' : 'Objekt(e)'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleCreateEmptyJson}
                      className="flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <FilePlus size={12} />
                      {isEn ? 'Empty template' : 'Leeres Template'}
                    </button>
                  </div>
                </div>
                <JsonEditor value={json} onChange={handleJsonChange} dark={dark} />
              </div>

              {/* Pre-check: new vs existing */}
              {preview && existingIds && (
                <div className="flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-wrap">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{isEn ? 'Pre-check' : 'Vorprüfung'}</span>
                    {preview.newIds.length > 0 && (
                      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <CheckCircle2 size={11} /> {preview.newIds.length} {isEn ? 'new' : 'neu'}
                      </span>
                    )}
                    {preview.existing.length > 0 && (
                      <span className={`flex items-center gap-1 text-xs ${allowOverwrite ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'}`}>
                        {allowOverwrite ? <RefreshCw size={11} /> : <XCircle size={11} />}
                        {preview.existing.length} {allowOverwrite
                          ? (isEn ? 'will be overwritten' : 'werden überschrieben')
                          : (isEn ? 'will be skipped' : 'werden übersprungen')}
                      </span>
                    )}
                    {/* Overwrite checkbox */}
                    {preview.existing.length > 0 && (
                      <label className="ml-auto flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={allowOverwrite}
                          onChange={(e) => setAllowOverwrite(e.target.checked)}
                          className="w-3.5 h-3.5 accent-amber-500"
                        />
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {isEn ? 'Overwrite existing' : 'Vorhandene überschreiben'}
                        </span>
                      </label>
                    )}
                  </div>
                  {preview.existing.length > 0 && (
                    <div className="overflow-y-auto px-3 py-2" style={{ maxHeight: '100px' }}>
                      {preview.existing.map((id) => (
                        <div key={id} className={`text-xs font-mono ${allowOverwrite ? 'text-amber-700 dark:text-amber-300' : 'text-gray-400 dark:text-gray-500 line-through'}`}>{id}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {parseError && (
                <div className="flex items-start gap-2 px-3 py-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <AlertTriangle size={14} className="text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600 dark:text-red-400 font-mono break-all">{parseError}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {result ? (isEn ? 'Close' : 'Schließen') : (isEn ? 'Cancel' : 'Abbrechen')}
          </button>
          {!result && (
            <button
              type="button"
              onClick={handleImport}
              disabled={importMutation.isPending || !json.trim()}
              className="flex items-center gap-2 px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload size={14} />
              {importMutation.isPending
                ? (isEn ? 'Importing…' : 'Importiere…')
                : (isEn ? 'Import' : 'Importieren')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

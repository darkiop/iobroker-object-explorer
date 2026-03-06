import { useState, useRef, useCallback } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { createPortal } from 'react-dom';
import { X, Upload, CheckCircle, AlertTriangle, FileJson, FilePlus } from 'lucide-react';
import { useImportDatapoints } from '../hooks/useStates';
import { useTheme } from '../context/ThemeContext';
import type { IoBrokerObject } from '../types/iobroker';

interface Props {
  onClose: () => void;
  language?: 'en' | 'de';
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
      style={{ height: '400px', background: dark ? '#0d1117' : '#f6f8fa' }}
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

export default function ImportDatapointsModal({ onClose, language = 'en' }: Props) {
  const isEn = language === 'en';
  const { dark } = useTheme();
  const [json, setJson] = useState('');
  const [parseError, setParseError] = useState('');
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);

  const importMutation = useImportDatapoints();
  const [isDragOver, setIsDragOver] = useState(false);
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

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
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
        common: {
          name: 'My Datapoint',
          type: 'number',
          role: 'value',
          read: true,
          write: false,
        },
        native: {},
      },
    };
    handleJsonChange(JSON.stringify(template, null, 2));
  }

  function handleImport() {
    const { data, error } = validateImportData(json);
    if (error) { setParseError(error); return; }
    const count = Object.keys(data).length;
    if (count === 0) { setParseError(isEn ? 'No datapoints found in JSON.' : 'Keine Datenpunkte im JSON gefunden.'); return; }

    importMutation.mutate(data, {
      onSuccess: (res) => setResult(res),
    });
  }

  const objectCount = (() => {
    if (!json.trim()) return 0;
    try { const p = JSON.parse(json); return typeof p === 'object' && p && !Array.isArray(p) ? Object.keys(p).length : 0; } catch { return 0; }
  })();

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col"
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
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {isEn
              ? 'Paste a JSON object where keys are datapoint IDs and values are the full ioBroker object definitions.'
              : 'JSON-Objekt einfügen, bei dem die Schlüssel Datenpunkt-IDs und die Werte vollständige ioBroker-Objektdefinitionen sind.'}
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFileInputChange}
          />
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
              isDragOver
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            }`}
          >
            <FileJson size={22} className={isDragOver ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'} />
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
                {objectCount > 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {objectCount} {isEn ? 'object(s)' : 'Objekt(e)'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleCreateEmptyJson}
                  className="flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  title={isEn ? 'Insert empty template with required fields' : 'Leeres Template mit Pflichtfeldern einfügen'}
                >
                  <FilePlus size={12} />
                  {isEn ? 'Empty template' : 'Leeres Template'}
                </button>
              </div>
            </div>
            <JsonEditor value={json} onChange={handleJsonChange} dark={dark} />
          </div>

          {parseError && (
            <div className="flex items-start gap-2 px-3 py-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <AlertTriangle size={14} className="text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-600 dark:text-red-400 font-mono break-all">{parseError}</p>
            </div>
          )}

          {result && (
            <div className={`flex flex-col gap-2 px-3 py-2.5 rounded border ${result.errors.length === 0 ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}>
              <div className="flex items-center gap-2">
                <CheckCircle size={14} className={result.errors.length === 0 ? 'text-green-500' : 'text-amber-500'} />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
                  {isEn ? `${result.imported} datapoint(s) imported` : `${result.imported} Datenpunkt(e) importiert`}
                  {result.errors.length > 0 && `, ${result.errors.length} ${isEn ? 'error(s)' : 'Fehler'}`}
                </span>
              </div>
              {result.errors.length > 0 && (
                <ul className="flex flex-col gap-0.5 max-h-28 overflow-y-auto">
                  {result.errors.map((err, i) => (
                    <li key={i} className="text-xs text-red-600 dark:text-red-400 font-mono break-all">{err}</li>
                  ))}
                </ul>
              )}
            </div>
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

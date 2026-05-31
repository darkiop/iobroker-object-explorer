import { RefreshCw, FileCode2, CircleCheck, CirclePause, Copy, ExternalLink } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { copyToClipboard } from '../../utils/clipboard';

interface ScriptUsage {
  scriptId: string;
  scriptName: string;
  enabled: boolean;
  engineType?: string;
}

interface ScriptsTabProps {
  id: string;
  language: 'en' | 'de';
  adminBaseUrl: string;
  scriptUsages: ScriptUsage[] | undefined;
  scriptsFetching: boolean;
  refetchScripts: () => void;
}

export default function ScriptsTab({ id, language, adminBaseUrl, scriptUsages, scriptsFetching, refetchScripts }: ScriptsTabProps) {
  const isEn = language === 'en';
  const showToast = useToast();

  return (
    <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto flex-1">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {isEn
            ? `ioBroker scripts that reference "${id}" in their source code.`
            : `ioBroker-Skripte, die "${id}" im Quellcode referenzieren.`}
        </p>
        <button
          onClick={() => refetchScripts()}
          disabled={scriptsFetching}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
          title={isEn ? 'Reload' : 'Neu laden'}
        >
          <RefreshCw size={11} className={scriptsFetching ? 'animate-spin' : ''} />
          {isEn ? 'Reload' : 'Neu laden'}
        </button>
      </div>
      {scriptsFetching && !scriptUsages && (
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          <RefreshCw size={13} className="animate-spin" />
          {isEn ? 'Searching scripts…' : 'Skripte werden durchsucht…'}
        </div>
      )}
      {scriptUsages && scriptUsages.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-gray-400 dark:text-gray-500">
          <FileCode2 size={28} className="opacity-30" />
          <span className="text-xs">{isEn ? 'No scripts found that reference this ID.' : 'Keine Skripte gefunden, die diese ID referenzieren.'}</span>
          <span className="text-[11px] text-gray-400/70 dark:text-gray-600">{isEn ? 'Note: only script source code is searched (text match).' : 'Hinweis: nur der Quellcode wird durchsucht (Textsuche).'}</span>
        </div>
      )}
      {scriptUsages && scriptUsages.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {scriptUsages.map((s) => (
            <div key={s.scriptId} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              {s.enabled
                ? <CircleCheck size={14} className="text-green-500 shrink-0" />
                : <CirclePause size={14} className="text-gray-400 dark:text-gray-500 shrink-0" />
              }
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">{s.scriptName}</span>
                <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500 truncate">{s.scriptId}</span>
                {s.engineType && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-600">{s.engineType}</span>
                )}
              </div>
              <button
                onClick={() => { const name = s.scriptId.split('.').pop() ?? s.scriptId; copyToClipboard(name).then(() => showToast(name, 'success')).catch(() => {}); }}
                className="shrink-0 p-1.5 rounded text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title={isEn ? 'Copy script ID' : 'Skript-ID kopieren'}
              >
                <Copy size={13} />
              </button>
              <a
                href={`${adminBaseUrl}/#tab-javascript`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 p-1.5 rounded text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                title={isEn ? 'Open JavaScript tab in Admin' : 'JavaScript-Tab im Admin öffnen'}
              >
                <ExternalLink size={13} />
              </a>
            </div>
          ))}
          <p className="text-[11px] text-gray-400 dark:text-gray-600 pt-1">
            {isEn
              ? 'Results are text matches — false positives possible (comments, strings, dead code).'
              : 'Ergebnisse sind Textsuchen — falsch-positive möglich (Kommentare, Strings, toter Code).'}
          </p>
        </div>
      )}
    </div>
  );
}

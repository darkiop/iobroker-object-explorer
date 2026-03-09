import { useEscapeKey } from '../hooks/useEscapeKey';
import { createPortal } from 'react-dom';
import { X, Keyboard, Search } from 'lucide-react';

interface Props {
  onClose: () => void;
  language?: 'en' | 'de';
}

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

interface Shortcut {
  keys: string[];
  descEn: string;
  descDe: string;
}

interface SearchCommand {
  example: string;
  descEn: string;
  descDe: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: [isMac ? '⌘ B' : 'Ctrl B'], descEn: 'Toggle sidebar', descDe: 'Seitenleiste ein-/ausblenden' },
  { keys: ['?'], descEn: 'Show keyboard shortcuts', descDe: 'Tastenkürzel anzeigen' },
  { keys: ['Esc'], descEn: 'Close modal / deselect', descDe: 'Modal schließen / Auswahl aufheben' },
  { keys: ['↑', '↓'], descEn: 'Navigate rows in table', descDe: 'Zeilen in Tabelle navigieren' },
  { keys: ['←', '→'], descEn: 'Previous / next page', descDe: 'Vorherige / nächste Seite' },
  { keys: ['Enter'], descEn: 'Open focused row', descDe: 'Fokussierte Zeile öffnen' },
];

const SEARCH_COMMANDS: SearchCommand[] = [
  { example: 'hm-rpc.*', descEn: 'Wildcard ID pattern', descDe: 'Wildcard-ID-Muster' },
  { example: 'room:Wohnzimmer', descEn: 'Filter by room', descDe: 'Nach Raum filtern' },
  { example: 'function:Licht', descEn: 'Filter by function', descDe: 'Nach Funktion filtern' },
  { example: 'type:state', descEn: 'Filter by object type', descDe: 'Nach Objekttyp filtern' },
  { example: 'role:value.temperature', descEn: 'Filter by role', descDe: 'Nach Rolle filtern' },
  { example: 'room:Bad function:Licht', descEn: 'Combine commands', descDe: 'Befehle kombinieren' },
];

export default function KeyboardShortcutsModal({ onClose, language = 'en' }: Props) {
  const isEn = language === 'en';

  useEscapeKey(onClose);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop-in bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
            <Keyboard size={15} className="text-gray-400" />
            {isEn ? 'Keyboard shortcuts' : 'Tastenkürzel'}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Shortcuts list */}
        <div className="px-5 pt-4 pb-2 space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.descEn} className="grid grid-cols-[1fr_200px] items-center gap-4">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {isEn ? s.descEn : s.descDe}
              </span>
              <div className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-medium bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 shadow-sm"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="mx-5 my-3 border-t border-gray-200 dark:border-gray-700" />

        {/* Search commands */}
        <div className="px-5 pb-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            <Search size={11} />
            {isEn ? 'Search commands' : 'Suchbefehle'}
          </div>
          <div className="space-y-1.5">
            {SEARCH_COMMANDS.map((c) => (
              <div key={c.example} className="grid grid-cols-[1fr_200px] items-center gap-4">
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {isEn ? c.descEn : c.descDe}
                </span>
                <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 whitespace-nowrap">
                  {c.example}
                </code>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

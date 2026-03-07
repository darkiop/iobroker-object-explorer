import { useEscapeKey } from '../hooks/useEscapeKey';
import { createPortal } from 'react-dom';
import { X, Keyboard } from 'lucide-react';

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

const SHORTCUTS: Shortcut[] = [
  { keys: [isMac ? '⌘ B' : 'Ctrl B'], descEn: 'Toggle sidebar', descDe: 'Seitenleiste ein-/ausblenden' },
  { keys: ['?'], descEn: 'Show keyboard shortcuts', descDe: 'Tastenkürzel anzeigen' },
  { keys: ['Esc'], descEn: 'Close modal / deselect', descDe: 'Modal schließen / Auswahl aufheben' },
  { keys: ['↑', '↓'], descEn: 'Navigate rows in table', descDe: 'Zeilen in Tabelle navigieren' },
  { keys: ['←', '→'], descEn: 'Previous / next page', descDe: 'Vorherige / nächste Seite' },
  { keys: ['Enter'], descEn: 'Open focused row', descDe: 'Fokussierte Zeile öffnen' },
];

export default function KeyboardShortcutsModal({ onClose, language = 'en' }: Props) {
  const isEn = language === 'en';

  useEscapeKey(onClose);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-sm"
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
        <div className="px-5 py-4 space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.descEn} className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {isEn ? s.descEn : s.descDe}
              </span>
              <div className="flex items-center gap-1 shrink-0">
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
      </div>
    </div>,
    document.body
  );
}

import { Mic, MicOff, Globe, Type } from 'lucide-react';

const inputCls = 'px-2.5 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500 w-full';

const COMMON_LANGS = ['de', 'en', 'fr', 'it', 'es', 'pl', 'ru', 'nl', 'pt'];

export interface SmartNameDraft {
  enabled: boolean;
  mode: 'simple' | 'multilang';
  simple: string;
  multilang: Record<string, string>;
}

export function initSmartNameDraft(smartName: string | Record<string, string> | false | undefined): SmartNameDraft {
  if (smartName === false) {
    return { enabled: false, mode: 'simple', simple: '', multilang: {} };
  }
  if (typeof smartName === 'string') {
    return { enabled: true, mode: 'simple', simple: smartName, multilang: {} };
  }
  if (smartName && typeof smartName === 'object') {
    return { enabled: true, mode: 'multilang', simple: '', multilang: { ...smartName } };
  }
  return { enabled: true, mode: 'simple', simple: '', multilang: {} };
}

export function smartNameDraftToValue(draft: SmartNameDraft): string | Record<string, string> | false | undefined {
  if (!draft.enabled) return false;
  if (draft.mode === 'simple') {
    return draft.simple.trim() || undefined;
  }
  const filtered = Object.fromEntries(
    Object.entries(draft.multilang).filter(([, v]) => v.trim() !== '')
  );
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

// ── SmartNameTab ──────────────────────────────────────────────────────────────

interface SmartNameTabProps {
  draft: SmartNameDraft;
  setDraft: (d: SmartNameDraft) => void;
  language: 'en' | 'de';
}

export default function SmartNameTab({ draft, setDraft, language }: SmartNameTabProps) {
  const isEn = language === 'en';

  function setField<K extends keyof SmartNameDraft>(key: K, val: SmartNameDraft[K]) {
    setDraft({ ...draft, [key]: val });
  }

  function setLang(lang: string, val: string) {
    setDraft({ ...draft, multilang: { ...draft.multilang, [lang]: val } });
  }

  function removeLang(lang: string) {
    const next = { ...draft.multilang };
    delete next[lang];
    setDraft({ ...draft, multilang: next });
  }

  function addLang(lang: string) {
    if (!draft.multilang[lang]) {
      setDraft({ ...draft, multilang: { ...draft.multilang, [lang]: '' } });
    }
  }

  const usedLangs = Object.keys(draft.multilang);
  const availableLangs = COMMON_LANGS.filter((l) => !usedLangs.includes(l));
  const preview = (() => {
    if (!draft.enabled) return isEn ? 'Voice control disabled' : 'Sprachsteuerung deaktiviert';
    if (draft.mode === 'simple') return draft.simple.trim() || '—';
    const val = draft.multilang[isEn ? 'en' : 'de'] ?? Object.values(draft.multilang).find(Boolean) ?? '—';
    return val || '—';
  })();

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">

      {/* Enable toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setField('enabled', !draft.enabled)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            draft.enabled
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
          }`}
        >
          {draft.enabled ? <Mic size={14} /> : <MicOff size={14} />}
          {draft.enabled
            ? (isEn ? 'Voice control enabled' : 'Sprachsteuerung aktiv')
            : (isEn ? 'Voice control disabled (smartName = false)' : 'Sprachsteuerung deaktiviert (smartName = false)')}
        </button>
      </div>

      {draft.enabled && (
        <>
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setField('mode', 'simple')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                draft.mode === 'simple'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400'
              }`}
            >
              <Type size={12} />
              {isEn ? 'Single name' : 'Einfacher Name'}
            </button>
            <button
              onClick={() => setField('mode', 'multilang')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                draft.mode === 'multilang'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400'
              }`}
            >
              <Globe size={12} />
              {isEn ? 'Multilingual' : 'Mehrsprachig'}
            </button>
          </div>

          {/* Simple mode */}
          {draft.mode === 'simple' && (
            <div className="space-y-1">
              <label className="text-xs text-gray-500 dark:text-gray-400">
                {isEn ? 'Voice name' : 'Sprachname'}
              </label>
              <input
                type="text"
                className={inputCls}
                value={draft.simple}
                onChange={(e) => setField('simple', e.target.value)}
                placeholder={isEn ? 'e.g. Living Room Lamp' : 'z.B. Wohnzimmerlampe'}
              />
            </div>
          )}

          {/* Multilang mode */}
          {draft.mode === 'multilang' && (
            <div className="space-y-3">
              {usedLangs.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {isEn ? 'Add a language below.' : 'Sprache unten hinzufügen.'}
                </p>
              )}
              {usedLangs.map((lang) => (
                <div key={lang} className="flex items-center gap-2">
                  <span className="text-xs font-mono w-7 text-center text-gray-500 dark:text-gray-400 shrink-0">{lang}</span>
                  <input
                    type="text"
                    className={inputCls}
                    value={draft.multilang[lang]}
                    onChange={(e) => setLang(lang, e.target.value)}
                    placeholder={isEn ? 'Voice name…' : 'Sprachname…'}
                  />
                  <button
                    onClick={() => removeLang(lang)}
                    className="text-xs text-red-400 hover:text-red-600 shrink-0 px-1"
                    title={isEn ? 'Remove' : 'Entfernen'}
                  >✕</button>
                </div>
              ))}
              {availableLangs.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {availableLangs.map((lang) => (
                    <button
                      key={lang}
                      onClick={() => addLang(lang)}
                      className="text-xs px-2 py-0.5 rounded border border-dashed border-gray-400 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
                    >
                      + {lang}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Preview */}
          <div className="rounded bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 px-3 py-2">
            <span className="text-xs text-gray-400 dark:text-gray-500 mr-2">{isEn ? 'Preview:' : 'Vorschau:'}</span>
            <span className="text-sm text-gray-800 dark:text-gray-100">{preview}</span>
          </div>
        </>
      )}

      {/* Info box */}
      <div className="rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
        {isEn
          ? 'smartName is used by voice assistants (Alexa, Google Home) via the iot / cloud adapter. Set to false to explicitly exclude this datapoint from voice control.'
          : 'smartName wird von Sprachassistenten (Alexa, Google Home) über den iot / cloud Adapter genutzt. Auf false setzen, um diesen Datenpunkt explizit von der Sprachsteuerung auszuschließen.'}
      </div>
    </div>
  );
}

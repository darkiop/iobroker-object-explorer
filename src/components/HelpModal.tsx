import { useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { createPortal } from 'react-dom';
import { X, CircleHelp, Search, Keyboard, MousePointerClick, CheckSquare, ArrowLeftRight, History, Mic2, Code2, Wand2, ChevronDown, BarChart2, Columns2 } from 'lucide-react';

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
  { keys: ['?'], descEn: 'Show this help', descDe: 'Diese Hilfe anzeigen' },
  { keys: ['Esc'], descEn: 'Close modal / deselect', descDe: 'Modal schließen / Auswahl aufheben' },
  { keys: ['↑', '↓'], descEn: 'Navigate rows in table', descDe: 'Zeilen in Tabelle navigieren' },
  { keys: ['←', '→'], descEn: 'Previous / next page (active panel)', descDe: 'Vorherige / nächste Seite (aktives Panel)' },
  { keys: ['Enter'], descEn: 'Open focused row', descDe: 'Fokussierte Zeile öffnen' },
  { keys: ['Tab'], descEn: 'Switch active panel (dual-pane mode)', descDe: 'Aktives Panel wechseln (Zwei-Panel-Ansicht)' },
];

const SEARCH_COMMANDS: SearchCommand[] = [
  { example: 'hm-rpc.*', descEn: 'Wildcard ID pattern', descDe: 'Wildcard-ID-Muster' },
  { example: 'room:Wohnzimmer', descEn: 'Filter by room', descDe: 'Nach Raum filtern' },
  { example: 'function:Licht', descEn: 'Filter by function', descDe: 'Nach Funktion filtern' },
  { example: 'type:state', descEn: 'Filter by object type', descDe: 'Nach Objekttyp filtern' },
  { example: 'role:value.temperature', descEn: 'Filter by role', descDe: 'Nach Rolle filtern' },
  { example: 'id:alias.*', descEn: 'Filter by ID pattern', descDe: 'Nach ID-Muster filtern' },
  { example: 'name:Temperatur', descEn: 'Filter by name', descDe: 'Nach Name filtern' },
  { example: 'desc:Fenster', descEn: 'Filter by description', descDe: 'Nach Beschreibung filtern' },
  { example: 'room:Bad function:Licht', descEn: 'Combine filters', descDe: 'Filter kombinieren' },
];

export default function HelpModal({ onClose, language = 'en' }: Props) {
  const isEn = language === 'en';
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEscapeKey(onClose);

  const toggle = (key: string) => setOpenKey((prev) => (prev === key ? null : key));

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop-in bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-6xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
            <CircleHelp size={15} className="text-gray-400" />
            {isEn ? 'Help' : 'Hilfe'}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-1">

          {/* App overview — not collapsible */}
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed px-1 pb-3">
            {isEn
              ? 'ioBroker Object Explorer lets you browse, filter, and edit all objects and states from your ioBroker installation in real time. State values refresh every 30 seconds. Click any row to open the detail editor.'
              : 'Der ioBroker Object Explorer zeigt alle Objekte und Zustände deiner ioBroker-Installation in Echtzeit. Zustandswerte werden alle 30 Sekunden aktualisiert. Klicke auf eine Zeile, um den Detaileditor zu öffnen.'}
          </p>

          {/* Aliases + History + Script + SmartName */}
          <AccordionItem
            id="features"
            open={openKey === 'features'}
            onToggle={() => toggle('features')}
            icon={<ArrowLeftRight size={13} />}
            label={isEn ? 'Features & Quick filters' : 'Features & Schnellfilter'}
          >
            <div className="space-y-4">
              <SubSection icon={<ArrowLeftRight size={12} />} label={isEn ? 'Aliases' : 'Aliase'}>
                {isEn
                  ? 'Aliases (alias.0.*) are virtual datapoints that map to a real source object. They support optional read/write conversion formulas in JavaScript. The Alias column in the table shows which objects have an alias pointing to them.'
                  : 'Aliase (alias.0.*) sind virtuelle Datenpunkte, die auf ein echtes Quellobjekt zeigen. Sie unterstützen optionale Lese-/Schreib-Konvertierungsformeln in JavaScript. Die Alias-Spalte in der Tabelle zeigt, welche Objekte einen Alias haben, der auf sie zeigt.'}
              </SubSection>
              <SubSection icon={<History size={12} />} label={isEn ? 'History' : 'Verlauf'}>
                {isEn
                  ? 'States with a history adapter configured (e.g. sql.0) show a history icon in the table. Click it to open the full-screen History modal: choose a time range and aggregation, compare up to 4 extra series side by side, overlay a previous period (±1 week / ±1 month) for comparison, zoom with the mouse wheel and pan by dragging, view min/max/avg/last stat badges, delete individual data points, and export the chart as a PNG image. History data is fetched on demand and cached for the session (sql.0 adapter only).'
                  : 'Zustände mit konfiguriertem History-Adapter (z. B. sql.0) zeigen ein Verlauf-Symbol in der Tabelle. Klicke darauf, um das Vollbild-Verlaufs-Modal zu öffnen: Zeitraum und Aggregation wählen, bis zu 4 zusätzliche Reihen zum Vergleich anzeigen, einen vorherigen Zeitraum (±1 Woche / ±1 Monat) zum Vergleich überlagern, mit dem Mausrad zoomen und per Ziehen verschieben, Min/Max/Durchschnitt/Letzter-Wert-Badges ansehen, einzelne Datenpunkte löschen und das Diagramm als PNG exportieren. Verlaufsdaten werden bei Bedarf geladen und für die Sitzung gecacht (nur sql.0-Adapter).'}
              </SubSection>
              <SubSection icon={<Code2 size={12} />} label={isEn ? 'Script usage' : 'Skriptverwendung'}>
                {isEn
                  ? 'The toolbar offers a "Script" scan that searches all JavaScript adapter scripts for references to each datapoint ID. After scanning, the Script column shows which states are used in scripts. Results are cached locally and can be refreshed manually.'
                  : 'Die Toolbar bietet einen „Skript"-Scan, der alle JavaScript-Adapter-Skripte nach Verweisen auf Datenpunkt-IDs durchsucht. Nach dem Scan zeigt die Skript-Spalte, welche Zustände in Skripten verwendet werden. Ergebnisse werden lokal gecacht und können manuell aktualisiert werden.'}
              </SubSection>
              <SubSection icon={<Mic2 size={12} />} label={isEn ? 'SmartName / Voice control' : 'SmartName / Sprachsteuerung'}>
                {isEn
                  ? 'States with common.smartName set are usable via voice assistants (Alexa, Google Home). Use the "SmartName" quick filter in the toolbar to show only these states. The SmartName column is visible in the column picker.'
                  : 'Zustände mit gesetztem common.smartName sind über Sprach­assistenten (Alexa, Google Home) nutzbar. Der Schnellfilter „SmartName" in der Toolbar zeigt nur diese Zustände. Die SmartName-Spalte ist im Spalten-Picker verfügbar.'}
              </SubSection>
              <SubSection icon={<CheckSquare size={12} />} label={isEn ? 'Custom functions (enabled flag)' : 'Benutzerdefinierte Funktionen (enabled-Flag)'}>
                {isEn
                  ? "States with common.custom entries (adapter-specific config, e.g. history or IoT settings) are highlighted by the \"Custom\" quick filter. The Object Editor's \"Custom Settings\" tab lets you view and edit these adapter-specific configurations directly."
                  : 'Zustände mit common.custom-Einträgen (adapter­spezifische Konfiguration, z. B. Verlauf oder IoT-Einstellungen) werden durch den Schnellfilter „Custom" hervorgehoben. Im Objekteditor unter „Custom Settings" können diese Konfigurationen direkt eingesehen und bearbeitet werden.'}
              </SubSection>
            </div>
          </AccordionItem>

          {/* Auto Alias */}
          <AccordionItem
            id="autoalias"
            open={openKey === 'autoalias'}
            onToggle={() => toggle('autoalias')}
            icon={<Wand2 size={13} />}
            label={isEn ? 'Auto Alias' : 'Auto-Alias'}
          >
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {isEn
                ? 'Right-click a device node in the sidebar tree and choose "Auto Alias" to automatically create alias.0 entries for all states under that device. Useful for mapping hardware datapoints to a clean alias namespace without creating each alias manually.'
                : 'Rechtsklick auf einen Geräteknoten im Seitenbaum → „Auto-Alias" erstellt automatisch alias.0-Einträge für alle Zustände unter diesem Gerät. Nützlich, um Hardware-Datenpunkte ohne manuelle Einzelschritte in einen sauberen Alias-Namensraum zu überführen.'}
            </p>
          </AccordionItem>

          {/* Batch editing */}
          <AccordionItem
            id="batch"
            open={openKey === 'batch'}
            onToggle={() => toggle('batch')}
            icon={<CheckSquare size={13} />}
            label={isEn ? 'Batch editing' : 'Mehrfachbearbeitung'}
          >
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {isEn
                ? 'Check the checkbox on multiple rows to select them. A bar appears at the bottom of the table where you can set Role, Unit, Room, and Function for all selected rows at once.'
                : 'Aktiviere die Checkbox bei mehreren Zeilen, um sie auszuwählen. Am unteren Tabellenrand erscheint eine Leiste, mit der du Rolle, Einheit, Raum und Funktion für alle gewählten Zeilen gleichzeitig setzen kannst.'}
            </p>
          </AccordionItem>

          {/* Context menu */}
          <AccordionItem
            id="context"
            open={openKey === 'context'}
            onToggle={() => toggle('context')}
            icon={<MousePointerClick size={13} />}
            label={isEn ? 'Context menu' : 'Kontextmenü'}
          >
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {isEn
                ? 'Right-click any row in the table or any node in the sidebar tree to open the context menu. It offers quick actions like opening the editor, copying the ID, creating an alias, or showing history.'
                : 'Rechtsklick auf eine Tabellenzeile oder einen Knoten im Seitenbaum öffnet das Kontextmenü. Es bietet schnelle Aktionen wie Editor öffnen, ID kopieren, Alias erstellen oder Verlauf anzeigen.'}
            </p>
          </AccordionItem>

          {/* Dual-pane */}
          <AccordionItem
            id="dualpane"
            open={openKey === 'dualpane'}
            onToggle={() => toggle('dualpane')}
            icon={<Columns2 size={13} />}
            label={isEn ? 'Dual-pane view' : 'Zwei-Panel-Ansicht'}
          >
            <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              <p>
                {isEn
                  ? 'The dual-pane view shows two independent StateList panels side by side — like a dual-pane file manager (FreeCommander style). Toggle it with the'
                  : 'Die Zwei-Panel-Ansicht zeigt zwei unabhängige Tabellen nebeneinander — wie ein Zwei-Panel-Dateimanager (FreeCommander-Stil). Aktivieren über den'}
                {' '}<Columns2 size={12} className="inline-block align-middle" />{' '}
                {isEn ? 'button in the header.' : 'Button in der Titelleiste.'}
              </p>
              <SubSection icon={<MousePointerClick size={12} />} label={isEn ? 'Active panel' : 'Aktives Panel'}>
                {isEn
                  ? 'Click a panel to make it active (blue top border). The sidebar search and tree navigation always target the active panel. Press Tab (outside an input) to switch between panels.'
                  : 'Klick auf ein Panel macht es aktiv (blaue Linie oben). Suchfeld und Baumnavigation in der Sidebar steuern immer das aktive Panel. Tab (außerhalb eines Eingabefelds) wechselt zwischen Panels.'}
              </SubSection>
              <SubSection icon={<CheckSquare size={12} />} label={isEn ? 'Independent settings per panel' : 'Unabhängige Einstellungen pro Panel'}>
                {isEn
                  ? 'Each panel has its own search pattern, page, column filters, tree scope, visible columns, and flat/grouped view. Settings are persisted independently in localStorage. In dual-pane mode, both panels default to a reduced column set (ID, Room, Function, Type, Role, Value, Unit) to save horizontal space.'
                  : 'Jedes Panel hat eigenes Suchmuster, Seite, Spaltenfilter, Baumbereich, sichtbare Spalten und Flat/Gruppiert-Ansicht. Einstellungen werden unabhängig in localStorage gespeichert. Im Zwei-Panel-Modus starten beide Panels mit einem reduzierten Spaltensatz (ID, Raum, Funktion, Typ, Rolle, Wert, Einheit).'}
              </SubSection>
              <SubSection icon={<ArrowLeftRight size={12} />} label={isEn ? 'Cross-panel operations' : 'Panel-übergreifende Operationen'}>
                {isEn
                  ? 'Right-click a row → "Open in other panel" navigates the other panel to the selected datapoint\'s namespace. The "Reset Filters" button in the header resets both panels simultaneously.'
                  : 'Rechtsklick auf eine Zeile → „Im anderen Panel öffnen" navigiert das andere Panel in den Namespace des gewählten Datenpunkts. Der „Filter zurücksetzen"-Button in der Kopfzeile setzt beide Panels gleichzeitig zurück.'}
              </SubSection>
              <SubSection icon={<Search size={12} />} label={isEn ? 'Hidden column tooltips' : 'Ausgeblendete Spalten im Tooltip'}>
                {isEn
                  ? 'When columns are hidden (e.g. Name, Ack, Timestamp), their values appear highlighted in blue at the top of the row hover tooltip.'
                  : 'Wenn Spalten ausgeblendet sind (z. B. Name, Ack, Zeitstempel), erscheinen ihre Werte blau hervorgehoben am Anfang des Zeilen-Hover-Tooltips.'}
              </SubSection>
            </div>
          </AccordionItem>

          {/* Keyboard shortcuts */}
          <AccordionItem
            id="keys"
            open={openKey === 'keys'}
            onToggle={() => toggle('keys')}
            icon={<Keyboard size={13} />}
            label={isEn ? 'Keyboard shortcuts' : 'Tastenkürzel'}
          >
            <div className="space-y-2">
              {SHORTCUTS.map((s) => (
                <div key={s.descEn} className="grid grid-cols-[1fr_280px] items-center gap-4">
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
          </AccordionItem>

          {/* Optimize */}
          <AccordionItem
            id="optimize"
            open={openKey === 'optimize'}
            onToggle={() => toggle('optimize')}
            icon={<BarChart2 size={13} />}
            label={isEn ? 'Optimize' : 'Optimieren'}
          >
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {isEn
                ? 'The Optimize toolbar button analyzes datapoints under a chosen path (or your current table selection) for missing metadata: room, function, role, name, description, unit, min/max, type, and SmartName. Results are sorted by number of issues. Check rows to batch-fix room, function, role, or unit for all selected at once.'
                : 'Der Optimize-Button in der Toolbar analysiert Datenpunkte unter einem gewählten Pfad (oder der aktuellen Tabellenauswahl) auf fehlende Metadaten: Raum, Funktion, Rolle, Name, Beschreibung, Einheit, Min/Max, Typ und SmartName. Ergebnisse werden nach Anzahl der Probleme sortiert. Zeilen anwählen, um Raum, Funktion, Rolle oder Einheit für alle Markierten auf einmal zu setzen.'}
            </p>
          </AccordionItem>

          {/* Search commands */}
          <AccordionItem
            id="search"
            open={openKey === 'search'}
            onToggle={() => toggle('search')}
            icon={<Search size={13} />}
            label={isEn ? 'Search commands' : 'Suchbefehle'}
          >
            <div className="space-y-1.5">
              {SEARCH_COMMANDS.map((c) => (
                <div key={c.example} className="grid grid-cols-[1fr_280px] items-center gap-4">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {isEn ? c.descEn : c.descDe}
                  </span>
                  <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 whitespace-nowrap">
                    {c.example}
                  </code>
                </div>
              ))}
            </div>
          </AccordionItem>


        </div>
      </div>
    </div>,
    document.body
  );
}

function SubSection({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
        {icon}
        {label}
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{children}</p>
    </div>
  );
}

function AccordionItem({
  id, open, onToggle, icon, label, children,
}: {
  id: string;
  open: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-expanded={open}
        aria-controls={`accordion-${id}`}
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
          {icon}
          {label}
        </div>
        <ChevronDown
          size={14}
          className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div id={`accordion-${id}`} className="px-4 py-3 bg-white dark:bg-gray-900">
          {children}
        </div>
      )}
    </div>
  );
}

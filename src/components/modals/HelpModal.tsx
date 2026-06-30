import { useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { createPortal } from 'react-dom';
import { X, CircleHelp, Search, Keyboard, MousePointerClick, CheckSquare, ArrowLeftRight, History, Mic2, Code2, Wand2, ChevronDown, BarChart2, Columns2, TrendingUp, PanelLeft, FolderTree, Table2, SlidersHorizontal, FilePenLine, Settings, LineChart, Wifi, Filter, Lock, Bookmark, Wrench, Move, FolderX } from 'lucide-react';

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
  { keys: [isMac ? '⌘ F' : 'Ctrl F'], descEn: 'Focus search', descDe: 'Suche fokussieren' },
  { keys: [isMac ? '⌘ .' : 'Ctrl .'], descEn: 'Open settings', descDe: 'Einstellungen öffnen' },
  { keys: ['?'], descEn: 'Show this help', descDe: 'Diese Hilfe anzeigen' },
  { keys: ['Esc'], descEn: 'Close modal / deselect', descDe: 'Modal schließen / Auswahl aufheben' },
  { keys: ['↑', '↓'], descEn: 'Navigate rows in table', descDe: 'Zeilen in Tabelle navigieren' },
  { keys: ['←', '→'], descEn: 'Previous / next page (active panel)', descDe: 'Vorherige / nächste Seite (aktives Panel)' },
  { keys: ['Enter'], descEn: 'Open focused row', descDe: 'Fokussierte Zeile öffnen' },
  { keys: ['Tab'], descEn: 'Switch active panel (dual-pane mode)', descDe: 'Aktives Panel wechseln (Zwei-Panel-Ansicht)' },
  { keys: ['Esc'], descEn: 'Clear focused column filter input', descDe: 'Fokussierten Spaltenfilter leeren' },
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

// Searchable keywords per accordion (EN + DE terms) for the help freetext search.
const SECTION_KEYWORDS: Record<string, string> = {
  layout: 'layout navigation sidebar seitenleiste collapse einklappen fullscreen vollbild maximize minimize theme design dark light obsidian hell dunkel language sprache filter history verlauf back forward zurück vorwärts expert mode expertenmodus wrench schraubenschlüssel saved filters gespeicherte filter bookmark lesezeichen connection verbindung host badge resize divider trenner ctrl cmd strg esc',
  features: 'features quick filters schnellfilter alias aliase virtual conversion formula formel history verlauf sql adapter script skript usage verwendung javascript smartname voice sprachsteuerung alexa google home custom settings value wert column spalte indicators symbole trend arrow pfeil up down threshold grenzwert min max boolean toggle switch button url dangling verwaiste',
  tree: 'object tree objektbaum baum node knoten folder ordner device gerät channel kanal datapoint datenpunkt icon color farbe yellow blue green indigo magnifier lupe copy kopieren expand collapse aufklappen einklappen smartname mikrofon context menu kontextmenü rename move delete auto alias',
  table: 'datapoint table datenpunkt tabelle column spalte resize fit auto-fit stretch strecken reset sort sortieren header filter row zeile pagination seite page virtual rendering rows unit value ack timestamp group path gruppieren picker',
  batch: 'batch editing mehrfachbearbeitung bulk checkbox select role unit room function rolle einheit raum funktion combo apply',
  context: 'context menu kontextmenü right-click rechtsklick copy id name value kopieren history filter edit room function value object rename move create alias delete open other panel',
  toolbar: 'toolbar werkzeugleiste new neu create export json csv clipboard zwischenablage import enum enums statistics statistik treestats script index optimize optimieren alias replace ersetzen',
  editing: 'editing edit object operations operationen bearbeiten editor details json alias custom settings tabs read write conversion formula formel tester create auto alias find replace suchen ersetzen copy rename move delete datapoint kopieren umbenennen verschieben löschen import bulk progress',
  dualpane: 'dual-pane dual pane zwei-panel-ansicht zwei panel ansicht side by side nebeneinander freecommander active aktives tab independent unabhängig cross-panel open in other panel column reset filters hidden column tooltip',
  settings: 'settings einstellungen connection verbindung rest api host port admin swagger socket transport realtime display anzeige theme language date format datum font schrift rows page cache ttl columns spalten filters draft save speichern',
  optimize: 'optimize optimieren metadata metadaten missing fehlend quality room function role name description unit min max type batch fix scan',
  virtualfolders: 'virtual folder virtueller ordner ghost synthetic path pfad intermediate zwischenpfad no object kein objekt alias missing fehlend filter',
  history: 'history chart verlauf diagramm sql time range zeitraum preset aggregation average min max line area bar multi series vergleich compare period periode week month zoom pan stats badge export png delete löschen',
  connection: 'connection live updates verbindung echtzeit realtime long polling socket.io transport host badge refresh fallback 30 seconds sekunden no auth authentifizierung login token warning warnung trusted network',
  keys: 'keyboard shortcuts tastenkürzel keys tasten ctrl cmd strg esc tab enter arrow pfeil up down left right sidebar search settings help row page panel column filter',
  search: 'search commands suchbefehle pattern muster wildcard room function type role id name desc description filter combine kombinieren',
};

export default function HelpModal({ onClose, language = 'en' }: Props) {
  const isEn = language === 'en';
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEscapeKey(onClose);

  const toggle = (key: string) => setOpenKey((prev) => (prev === key ? null : key));

  const q = query.trim().toLowerCase();
  const searching = q !== '';
  const matches = (id: string) => !searching || (SECTION_KEYWORDS[id] ?? '').includes(q);
  const anyMatch = Object.keys(SECTION_KEYWORDS).some(matches);

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

        {/* Freetext search */}
        <div className="px-5 pt-3 pb-2 sticky top-[49px] bg-white dark:bg-gray-900 z-10">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isEn ? 'Search help…' : 'Hilfe durchsuchen…'}
              className="w-full pl-8 pr-8 py-1.5 text-sm rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
            />
            {searching && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                title={isEn ? 'Clear' : 'Leeren'}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="px-5 py-4 pt-2 space-y-1">

          {/* App overview — not collapsible */}
          {!searching && (
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed px-1 pb-3">
              {isEn
                ? 'ioBroker Object Explorer lets you browse, filter, and edit all objects and states from your ioBroker installation in real time. State values refresh every 30 seconds. Click any row to open the detail editor.'
                : 'Der ioBroker Object Explorer zeigt alle Objekte und Zustände deiner ioBroker-Installation in Echtzeit. Zustandswerte werden alle 30 Sekunden aktualisiert. Klicke auf eine Zeile, um den Detaileditor zu öffnen.'}
            </p>
          )}

          {searching && !anyMatch && (
            <p className="text-sm text-gray-500 dark:text-gray-400 px-1 py-6 text-center">
              {isEn ? `No help topics match “${query}”.` : `Keine Hilfethemen passen zu „${query}".`}
            </p>
          )}

          {/* Layout & Navigation */}
          <AccordionItem
            id="layout"
            open={openKey === 'layout'}
            onToggle={() => toggle('layout')}
            match={matches('layout')}
            searching={searching}
            icon={<PanelLeft size={13} />}
            label={isEn ? 'Layout & Navigation' : 'Layout & Navigation'}
          >
            <div className="space-y-4">
              <SubSection icon={<PanelLeft size={12} />} label={isEn ? 'Sidebar' : 'Seitenleiste'}>
                {isEn ? (
                  <>The header button toggles the sidebar open/closed (<Kbd>{isMac ? '⌘ B' : 'Ctrl B'}</Kbd>). Drag the divider between sidebar and table to resize it (180–600 px). Both states are saved in your browser.</>
                ) : (
                  <>Der Header-Button blendet die Seitenleiste ein/aus (<Kbd>{isMac ? '⌘ B' : 'Strg B'}</Kbd>). Den Trenner zwischen Seitenleiste und Tabelle ziehen, um die Breite zu ändern (180–600 px). Beides wird im Browser gespeichert.</>
                )}
              </SubSection>
              <SubSection icon={<Columns2 size={12} />} label={isEn ? 'Fullscreen' : 'Vollbild'}>
                {isEn ? (
                  <>The Maximize/Minimize button in the header switches to fullscreen mode; press <Kbd>Esc</Kbd> to exit.</>
                ) : (
                  <>Der Maximieren/Minimieren-Button im Header schaltet in den Vollbildmodus; mit <Kbd>Esc</Kbd> verlassen.</>
                )}
              </SubSection>
              <SubSection icon={<SlidersHorizontal size={12} />} label={isEn ? 'Theme & language' : 'Design & Sprache'}>
                {isEn
                  ? 'Settings let you pick one of three themes (Light / Dark / Obsidian) and the UI language (EN / DE), which switches all labels, dialogs, and tooltips. Both are saved in your browser.'
                  : 'In den Einstellungen wählst du eines von drei Designs (Hell / Dunkel / Obsidian) und die Oberflächensprache (EN / DE), die alle Beschriftungen, Dialoge und Tooltips umstellt. Beides wird im Browser gespeichert.'}
              </SubSection>
              <SubSection icon={<ArrowLeftRight size={12} />} label={isEn ? 'Filter history' : 'Filter-Verlauf'}>
                {isEn
                  ? 'Back / Forward arrow buttons next to the app title navigate through previously applied search filters — like browser back/forward for filter state.'
                  : 'Zurück-/Vorwärts-Pfeile neben dem App-Titel navigieren durch zuvor angewendete Suchfilter — wie Browser-Zurück/Vor für den Filterzustand.'}
              </SubSection>
              <SubSection icon={<Wrench size={12} />} label={isEn ? 'Expert mode' : 'Expertenmodus'}>
                {isEn
                  ? 'The wrench icon in the header (left of Settings) toggles expert mode; it turns amber when active and enables free-form value input and raw editing.'
                  : 'Das Schraubenschlüssel-Symbol im Header (links von Einstellungen) schaltet den Expertenmodus; es wird bei Aktivierung bernsteinfarben und erlaubt freie Werteingabe und Rohbearbeitung.'}
              </SubSection>
              <SubSection icon={<Bookmark size={12} />} label={isEn ? 'Saved filters & connection' : 'Gespeicherte Filter & Verbindung'}>
                {isEn
                  ? 'Frequently used filter combinations can be named and saved via the bookmark icon in the search bar. The host badge in the header shows the connection status and current host with a refresh button next to it; change the host in Settings → Connection.'
                  : 'Häufig genutzte Filterkombinationen lassen sich über das Lesezeichen-Symbol in der Suchleiste benennen und speichern. Das Host-Badge im Header zeigt den Verbindungsstatus und den aktuellen Host samt Aktualisieren-Button daneben; den Host änderst du unter Einstellungen → Verbindung.'}
              </SubSection>
            </div>
          </AccordionItem>

          {/* Aliases + History + Script + SmartName */}
          <AccordionItem
            id="features"
            open={openKey === 'features'}
            onToggle={() => toggle('features')}
            match={matches('features')}
            searching={searching}
            icon={<ArrowLeftRight size={13} />}
            label={isEn ? 'Features & Quick filters' : 'Features & Schnellfilter'}
          >
            <div className="space-y-4">
              <SubSection icon={<ArrowLeftRight size={12} />} label={isEn ? 'Aliases' : 'Aliase'}>
                {isEn
                  ? 'Aliases (alias.0.*) are virtual datapoints that map to a real source object. They support optional read/write conversion formulas in JavaScript. The Alias column in the table shows which objects have an alias pointing to them.'
                  : 'Aliase (alias.0.*) sind virtuelle Datenpunkte, die auf ein echtes Quellobjekt zeigen. Sie unterstützen optionale Lese-/Schreib-Konvertierungsformeln in JavaScript. Die Alias-Spalte in der Tabelle zeigt, welche Objekte einen Alias haben, der auf sie zeigt.'}
              </SubSection>
              <SubSection icon={<Move size={12} />} label={isEn ? 'Drag & drop to create aliases' : 'Drag & Drop für Aliase'}>
                {isEn
                  ? 'Enable "Drag & drop to create aliases" in Settings → Display (off by default). It only works in dual-pane view: drag a source datapoint row from one pane and drop it onto a target in the other pane — an alias.0.* row, or (in grouped view) a folder, device, or channel header below alias.0. The drop target is highlighted in green while hovering. On drop, the Create Alias dialog opens pre-filled: the target path plus the source\'s name, e.g. dragging 0_userdata.0.test-2 onto alias.0.test1 suggests alias.0.test1.test-2. It is off by default because the native draggable attribute can add a slight delay to row clicks.'
                  : 'Aktiviere „Drag & Drop für Aliase" unter Einstellungen → Anzeige (standardmäßig aus). Funktioniert nur in der Zwei-Panel-Ansicht: ziehe eine Quell-Datenpunktzeile aus einem Panel und lege sie im anderen Panel auf ein Ziel ab — eine alias.0.*-Zeile oder (in der gruppierten Ansicht) einen Ordner-, Geräte- oder Kanal-Header unterhalb von alias.0. Das Ziel wird beim Überfahren grün hervorgehoben. Beim Ablegen öffnet sich der Alias-erstellen-Dialog vorausgefüllt: Zielpfad plus Name der Quelle, z. B. ergibt das Ziehen von 0_userdata.0.test-2 auf alias.0.test1 den Vorschlag alias.0.test1.test-2. Standardmäßig aus, weil das native draggable-Attribut Klicks leicht verzögern kann.'}
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
              <SubSection icon={<TrendingUp size={12} />} label={isEn ? 'Value column indicators' : 'Symbole in der Wert-Spalte'}>
                {isEn
                  ? 'The Value column shows inline indicators: a green up / red down arrow appears when a numeric value rose or fell since the last refresh; a warning triangle marks values near (yellow) or outside (red) the configured min/max range; a pencil (on hover) opens the value editor. Booleans are coloured green (true) / red (false) and null values are greyed out. Writable datapoints with role "switch" render a toggle and role "button" a lightning trigger button (in non-expert mode); values with role "url" become clickable links.'
                  : 'Die Wert-Spalte zeigt eingebettete Symbole: ein grüner Aufwärts- bzw. roter Abwärtspfeil erscheint, wenn ein Zahlenwert seit der letzten Aktualisierung gestiegen oder gefallen ist; ein Warndreieck markiert Werte nahe (gelb) oder außerhalb (rot) des konfigurierten Min/Max-Bereichs; ein Stift (beim Überfahren) öffnet den Werte-Editor. Booleans sind grün (true) / rot (false) eingefärbt, null-Werte ausgegraut. Beschreibbare Datenpunkte mit Rolle „switch" zeigen einen Umschalter, Rolle „button" einen Blitz-Auslöser-Button (im Nicht-Expertenmodus); Werte mit Rolle „url" werden zu anklickbaren Links.'}
              </SubSection>
              <SubSection icon={<CheckSquare size={12} />} label={isEn ? 'Custom functions (enabled flag)' : 'Benutzerdefinierte Funktionen (enabled-Flag)'}>
                {isEn
                  ? "States with common.custom entries (adapter-specific config, e.g. history or IoT settings) are highlighted by the \"Custom\" quick filter. The Object Editor's \"Custom Settings\" tab lets you view and edit these adapter-specific configurations directly."
                  : 'Zustände mit common.custom-Einträgen (adapter­spezifische Konfiguration, z. B. Verlauf oder IoT-Einstellungen) werden durch den Schnellfilter „Custom" hervorgehoben. Im Objekteditor unter „Custom Settings" können diese Konfigurationen direkt eingesehen und bearbeitet werden.'}
              </SubSection>
              <SubSection icon={<Filter size={12} />} label={isEn ? 'Quick filters' : 'Schnellfilter'}>
                {isEn
                  ? 'The sidebar has quick-filter buttons for frequent namespaces; add your own patterns in Settings → Filters. Toggle filters for History, SmartName, and Custom (each shows a count badge). The "Dangling Aliases" filter lists alias.0.* objects whose target no longer exists — combine with bulk delete to clean up stale aliases. Filters can be combined.'
                  : 'Die Seitenleiste hat Schnellfilter-Buttons für häufige Namensräume; eigene Muster unter Einstellungen → Filter hinzufügen. Filter für History, SmartName und Custom umschalten (je mit Anzahl-Badge). Der Filter „Verwaiste Aliase" listet alias.0.*-Objekte, deren Ziel nicht mehr existiert — mit Mehrfachlöschung kombinieren, um veraltete Aliase aufzuräumen. Filter sind kombinierbar.'}
              </SubSection>
            </div>
          </AccordionItem>

          {/* Object Tree */}
          <AccordionItem
            id="tree"
            open={openKey === 'tree'}
            onToggle={() => toggle('tree')}
            match={matches('tree')}
            searching={searching}
            icon={<FolderTree size={13} />}
            label={isEn ? 'Object tree' : 'Objektbaum'}
          >
            <div className="space-y-4">
              <SubSection icon={<FolderTree size={12} />} label={isEn ? 'Node types' : 'Knotentypen'}>
                {isEn
                  ? 'The sidebar tree mirrors the ioBroker object hierarchy. Node types have distinct icon colors: folder (yellow), device (light blue), channel (indigo), datapoint without history (green), datapoint with history (blue). A microphone marks datapoints with a configured SmartName.'
                  : 'Der Baum in der Seitenleiste spiegelt die ioBroker-Objekthierarchie. Knotentypen haben eigene Icon-Farben: Ordner (gelb), Gerät (hellblau), Kanal (indigo), Datenpunkt ohne History (grün), Datenpunkt mit History (blau). Ein Mikrofon markiert Datenpunkte mit konfiguriertem SmartName.'}
              </SubSection>
              <SubSection icon={<Search size={12} />} label={isEn ? 'Navigation actions' : 'Navigationsaktionen'}>
                {isEn
                  ? 'The magnifier icon on a folder sets its path as the search filter and fully expands the tree. The copy icon copies the ID or pattern (e.g. folder.*) to the clipboard. Expand-all / Collapse-all buttons sit in the sidebar toolbar. Right-click any node for a context menu: copy ID, set as filter, edit/rename/move/delete, plus "Auto-create aliases…" (device/channel) and "Find & Replace in targets…" (alias.* nodes).'
                  : 'Das Lupen-Symbol an einem Ordner setzt dessen Pfad als Suchfilter und klappt den Baum voll auf. Das Kopier-Symbol kopiert die ID oder das Muster (z. B. folder.*) in die Zwischenablage. Alle aufklappen / einklappen-Buttons sind in der Seitenleisten-Toolbar. Rechtsklick auf einen Knoten öffnet ein Kontextmenü: ID kopieren, als Filter setzen, bearbeiten/umbenennen/verschieben/löschen, dazu „Aliase automatisch erstellen…" (Gerät/Kanal) und „Suchen & Ersetzen in Zielen…" (alias.*-Knoten).'}
              </SubSection>
            </div>
          </AccordionItem>

          {/* Datapoint table */}
          <AccordionItem
            id="table"
            open={openKey === 'table'}
            onToggle={() => toggle('table')}
            match={matches('table')}
            searching={searching}
            icon={<Table2 size={13} />}
            label={isEn ? 'Datapoint table' : 'Datenpunkt-Tabelle'}
          >
            <div className="space-y-4">
              <SubSection icon={<Columns2 size={12} />} label={isEn ? 'Columns' : 'Spalten'}>
                {isEn
                  ? 'Columns include indicator icons (write-protected, history, SmartName, alias), ID, Name, Room, Function, Role, Value, Unit, Ack, and Last Update. Room, Function, Role, Name, and Value are editable inline. Toggle column visibility via the column-picker dropdown (at least one must stay visible); the selection is saved in your browser.'
                  : 'Zu den Spalten gehören Indikator-Icons (schreibgeschützt, History, SmartName, Alias), ID, Name, Raum, Funktion, Rolle, Wert, Einheit, Ack und Letzte Aktualisierung. Raum, Funktion, Rolle, Name und Wert sind direkt editierbar. Spaltensichtbarkeit über das Spalten-Auswahlmenü umschalten (mindestens eine bleibt sichtbar); die Auswahl wird im Browser gespeichert.'}
              </SubSection>
              <SubSection icon={<SlidersHorizontal size={12} />} label={isEn ? 'Resize & fit' : 'Größe & Anpassung'}>
                {isEn
                  ? 'Drag a column header edge to resize (min 40 px); double-click the edge to auto-fit to content. "Stretch to 100%" expands content columns to fill the width; "Reset settings" restores default widths, visibility, and filters. Widths are saved in your browser.'
                  : 'Den Rand eines Spaltenkopfs ziehen, um die Breite zu ändern (min. 40 px); Doppelklick auf den Rand passt automatisch an den Inhalt an. „Auf 100% strecken" füllt mit Inhaltsspalten die Breite; „Einstellungen zurücksetzen" stellt Standardbreiten, Sichtbarkeit und Filter wieder her. Breiten werden im Browser gespeichert.'}
              </SubSection>
              <SubSection icon={<Filter size={12} />} label={isEn ? 'Sort & filter' : 'Sortieren & filtern'}>
                {isEn
                  ? 'Click a column header to sort ascending/descending (arrow indicator). The filter row below the headers offers free-text filters for ID, Name, Room, Function, Role, Value, and Unit; the icon columns (write-protected, history, SmartName, alias) filter by click toggle. Active filters get a blue border and clear individually or all at once.'
                  : 'Spaltenkopf anklicken, um auf-/absteigend zu sortieren (Pfeil-Anzeige). Die Filterzeile unter den Köpfen bietet Freitext-Filter für ID, Name, Raum, Funktion, Rolle, Wert und Einheit; die Icon-Spalten (schreibgeschützt, History, SmartName, Alias) filtern per Klick-Umschaltung. Aktive Filter erhalten einen blauen Rand und lassen sich einzeln oder gesammelt löschen.'}
              </SubSection>
              <SubSection icon={<Table2 size={12} />} label={isEn ? 'Pagination & rendering' : 'Seiten & Darstellung'}>
                {isEn
                  ? 'Page size is configurable (200 / 500 / 1000 / 3000) in Settings. Pagination is active only when no filter is applied and "Group by path" is off — otherwise all matching rows are shown. The table uses virtual rendering, so only visible rows exist in the DOM regardless of total count.'
                  : 'Die Seitengröße ist konfigurierbar (200 / 500 / 1000 / 3000) in den Einstellungen. Seitenblättern ist nur aktiv, wenn kein Filter gesetzt und „Nach Pfad gruppieren" aus ist — sonst werden alle Treffer angezeigt. Die Tabelle nutzt virtuelles Rendering, sodass unabhängig von der Gesamtzahl nur sichtbare Zeilen im DOM sind.'}
              </SubSection>
            </div>
          </AccordionItem>

          {/* Batch editing */}
          <AccordionItem
            id="batch"
            open={openKey === 'batch'}
            onToggle={() => toggle('batch')}
            match={matches('batch')}
            searching={searching}
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
            match={matches('context')}
            searching={searching}
            icon={<MousePointerClick size={13} />}
            label={isEn ? 'Context menu' : 'Kontextmenü'}
          >
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {isEn
                ? 'Right-click any table row (or tree node) to open the context menu. Actions: copy ID / name / value, show history, set as filter (optionally + Optimize), edit room / function / value / object, open in other panel (dual-pane), copy / rename / move datapoint, create alias (non-alias datapoints), and delete datapoint.'
                : 'Rechtsklick auf eine Tabellenzeile (oder einen Baumknoten) öffnet das Kontextmenü. Aktionen: ID / Name / Wert kopieren, Verlauf anzeigen, als Filter setzen (optional + Optimieren), Raum / Funktion / Wert / Objekt bearbeiten, im anderen Panel öffnen (Zwei-Panel), Datenpunkt kopieren / umbenennen / verschieben, Alias erstellen (Nicht-Alias-Datenpunkte) und Datenpunkt löschen.'}
            </p>
          </AccordionItem>

          {/* Toolbar */}
          <AccordionItem
            id="toolbar"
            open={openKey === 'toolbar'}
            onToggle={() => toggle('toolbar')}
            match={matches('toolbar')}
            searching={searching}
            icon={<SlidersHorizontal size={13} />}
            label={isEn ? 'Toolbar' : 'Werkzeugleiste'}
          >
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {isEn
                ? 'The table toolbar offers: + New (create datapoint, ID pre-filled from the search pattern), Export (filtered datapoints as JSON file, CSV file, or JSON to clipboard), Import (load datapoints from a JSON file), Enums (manage room/function enums), Statistics (namespace-level overview with subtree delete), Script Index (rebuild which datapoints are referenced by javascript.0 scripts), Optimize (see its own section), and Virtual Folders (find folder paths that have no real ioBroker object). When a checked row is an alias, an Alias-Replace button appears for find & replace in alias targets.'
                : 'Die Tabellen-Werkzeugleiste bietet: + Neu (Datenpunkt anlegen, ID aus dem Suchmuster vorbelegt), Export (gefilterte Datenpunkte als JSON-Datei, CSV-Datei oder JSON in die Zwischenablage), Import (Datenpunkte aus JSON-Datei laden), Enums (Raum-/Funktions-Enums verwalten), Statistik (Namensraum-Übersicht mit Teilbaum-Löschung), Skript-Index (neu aufbauen, welche Datenpunkte von javascript.0-Skripten referenziert werden), Optimieren (siehe eigener Abschnitt) und Virtuelle Ordner (Ordnerpfade ohne echtes ioBroker-Objekt finden). Ist eine markierte Zeile ein Alias, erscheint ein Alias-Ersetzen-Button für Suchen & Ersetzen in Alias-Zielen.'}
            </p>
          </AccordionItem>

          {/* Editing & datapoint operations */}
          <AccordionItem
            id="editing"
            open={openKey === 'editing'}
            onToggle={() => toggle('editing')}
            match={matches('editing')}
            searching={searching}
            icon={<FilePenLine size={13} />}
            label={isEn ? 'Editing & datapoint operations' : 'Bearbeiten & Datenpunkt-Operationen'}
          >
            <div className="space-y-4">
              <SubSection icon={<FilePenLine size={12} />} label={isEn ? 'Edit object' : 'Objekt bearbeiten'}>
                {isEn
                  ? 'Clicking a row (or "Edit object" in the context menu) opens the editor with four tabs: Details (name, type, role, unit, description, min/max, read/write + a live value control), JSON (raw editor with PUT save), Alias (set/remove target — supports separate read/write IDs and JS conversion formulas with an inline formula tester), and Custom Settings (adapter-specific common.custom config).'
                  : 'Ein Klick auf eine Zeile (oder „Objekt bearbeiten" im Kontextmenü) öffnet den Editor mit vier Tabs: Details (Name, Typ, Rolle, Einheit, Beschreibung, Min/Max, Lesen/Schreiben + Live-Wertsteuerung), JSON (Roh-Editor mit PUT-Speichern), Alias (Ziel setzen/entfernen — unterstützt getrennte Lese-/Schreib-IDs und JS-Konvertierungsformeln mit Inline-Formel-Tester) und Custom Settings (adapterspezifische common.custom-Konfiguration).'}
              </SubSection>
              <SubSection icon={<Wand2 size={12} />} label={isEn ? 'Aliases' : 'Aliase'}>
                {isEn
                  ? 'Create alias (right-click) builds an alias.0.* object pointing to the source. Auto-create aliases (right-click a device/channel) batch-creates aliases for all child states under a base path, optionally assigning a room and function. Find & Replace in alias targets rewrites a string across all alias.id values with a preview — useful after swapping a device.'
                  : 'Alias erstellen (Rechtsklick) legt ein alias.0.*-Objekt an, das auf die Quelle zeigt. Aliase automatisch erstellen (Rechtsklick auf Gerät/Kanal) erzeugt im Batch Aliase für alle Kind-Zustände unter einem Basispfad, optional mit Raum und Funktion. Suchen & Ersetzen in Alias-Zielen ersetzt einen String über alle alias.id-Werte mit Vorschau — nützlich nach einem Gerätetausch.'}
              </SubSection>
              <SubSection icon={<FilePenLine size={12} />} label={isEn ? 'Copy / Rename / Move / Delete' : 'Kopieren / Umbenennen / Verschieben / Löschen'}>
                {isEn
                  ? 'Copy datapoint duplicates with a new ID (type, role, unit, read/write, min/max, description, states). Rename and Move change the ID/path (object + state), validated against existing IDs. Import loads datapoints from a JSON file with a preview. Delete removes a single datapoint (trash icon) or, via checkbox selection, several at once with a progress indicator and confirmation — irreversible.'
                  : 'Datenpunkt kopieren dupliziert mit neuer ID (Typ, Rolle, Einheit, Lesen/Schreiben, Min/Max, Beschreibung, States). Umbenennen und Verschieben ändern ID/Pfad (Objekt + State), geprüft gegen bestehende IDs. Import lädt Datenpunkte aus einer JSON-Datei mit Vorschau. Löschen entfernt einen einzelnen Datenpunkt (Papierkorb-Symbol) oder per Checkbox-Auswahl mehrere auf einmal mit Fortschrittsanzeige und Bestätigung — unwiderruflich.'}
              </SubSection>
            </div>
          </AccordionItem>

          {/* Settings */}
          <AccordionItem
            id="settings"
            open={openKey === 'settings'}
            onToggle={() => toggle('settings')}
            match={matches('settings')}
            searching={searching}
            icon={<Settings size={13} />}
            label={isEn ? 'Settings' : 'Einstellungen'}
          >
            <div className="space-y-4">
              <SubSection icon={<Settings size={12} />} label={isEn ? 'Connection' : 'Verbindung'}>
                {isEn
                  ? 'Set the ioBroker host/port and REST API port ("Test & Connect" probes then reloads), the Admin UI port (for object icons and admin links), a Swagger UI link, the realtime transport (Socket.IO default / Long Polling fallback), and the Socket host override.'
                  : 'ioBroker-Host/-Port und REST-API-Port festlegen („Testen & Verbinden" prüft und lädt neu), den Admin-UI-Port (für Objekt-Icons und Admin-Links), einen Swagger-UI-Link, den Echtzeit-Transport (Socket.IO Standard / Long-Polling Fallback) und die Socket-Host-Überschreibung.'}
              </SubSection>
              <SubSection icon={<SlidersHorizontal size={12} />} label={isEn ? 'Display' : 'Anzeige'}>
                {isEn
                  ? 'Theme, language, date format, table and tree font size, rows per page, group-by-path, description below name, object/type icons, and several caching options (auto-refresh objects, cache reuse, cache TTL, fetch values for visible rows only).'
                  : 'Design, Sprache, Datumsformat, Schriftgröße für Tabelle und Baum, Zeilen pro Seite, Nach-Pfad-gruppieren, Beschreibung unter dem Namen, Objekt-/Typ-Icons sowie mehrere Caching-Optionen (Objekte automatisch aktualisieren, Cache-Wiederverwendung, Cache-Gültigkeit, Werte nur für sichtbare Zeilen laden).'}
              </SubSection>
              <SubSection icon={<Columns2 size={12} />} label={isEn ? 'Columns & Filters' : 'Spalten & Filter'}>
                {isEn
                  ? 'Columns: toggle each column and set default/min/max width per column. Filters: add custom ID patterns (wildcards) that appear as extra quick-filter buttons. Changes apply only on "Save" (draft) — except Expert mode and toolbar labels, which take effect immediately.'
                  : 'Spalten: jede Spalte umschalten und Standard-/Min-/Max-Breite pro Spalte setzen. Filter: eigene ID-Muster (Wildcards) hinzufügen, die als zusätzliche Schnellfilter-Buttons erscheinen. Änderungen gelten erst bei „Speichern" (Entwurf) — außer Expertenmodus und Toolbar-Beschriftungen, die sofort wirken.'}
              </SubSection>
            </div>
          </AccordionItem>

          {/* Dual-pane */}
          <AccordionItem
            id="dualpane"
            open={openKey === 'dualpane'}
            onToggle={() => toggle('dualpane')}
            match={matches('dualpane')}
            searching={searching}
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
                {isEn ? (
                  <>Click a panel to make it active (blue top border). The sidebar search and tree navigation always target the active panel. Press <Kbd>Tab</Kbd> (outside an input) to switch between panels.</>
                ) : (
                  <>Klick auf ein Panel macht es aktiv (blaue Linie oben). Suchfeld und Baumnavigation in der Sidebar steuern immer das aktive Panel. <Kbd>Tab</Kbd> (außerhalb eines Eingabefelds) wechselt zwischen Panels.</>
                )}
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
            match={matches('keys')}
            searching={searching}
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
            match={matches('optimize')}
            searching={searching}
            icon={<BarChart2 size={13} />}
            label={isEn ? 'Optimize' : 'Optimieren'}
          >
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {isEn
                ? 'The Optimize toolbar button analyzes datapoints under a chosen path (or your current table selection) for missing metadata: room, function, role, name, description, unit, min/max, type, and SmartName. Results are sorted by number of issues. Check rows to batch-fix room, function, role, or unit for all selected at once.'
                : 'Der Optimize-Button in der Toolbar analysiert Datenpunkte unter einem gewählten Pfad (oder der aktuellen Tabellenauswahl) auf fehlende Metadaten: Raum, Funktion, Rolle, Name, Beschreibung, Einheit, Min/Max, Typ und SmartName. Ergebnisse werden nach Anzahl der Probleme sortiert. Zeilen anwählen, um Raum, Funktion, Rolle oder Einheit für alle Markierten auf einmal zu setzen.'}
            </p>
          </AccordionItem>

          {/* Virtual Folders */}
          <AccordionItem
            id="virtualfolders"
            open={openKey === 'virtualfolders'}
            onToggle={() => toggle('virtualfolders')}
            match={matches('virtualfolders')}
            searching={searching}
            icon={<FolderX size={13} />}
            label={isEn ? 'Virtual Folders' : 'Virtuelle Ordner'}
          >
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {isEn
                ? 'The "Virtual Folders" toolbar button finds folder paths that appear in the table tree but have no real ioBroker object behind them. These synthetic nodes are created automatically whenever a child object\'s ID contains intermediate path segments (e.g. alias.0.beschattung.terrasse exists as a tree node because alias.0.beschattung.terrasse.schliessen exists, but the folder itself has no object). They are shown italic and dimmed in the table. Use the filter input (pre-filled with "alias.0.") to narrow results, then click the filter icon on any row to jump directly to that path in the table.'
                : 'Der Button "Virtuelle Ordner" in der Toolbar findet Ordnerpfade, die im Tabellenbaum erscheinen, aber kein echtes ioBroker-Objekt besitzen. Diese synthetischen Knoten entstehen automatisch, wenn die ID eines Kind-Objekts Zwischenpfad-Segmente enthält (z.B. existiert alias.0.beschattung.terrasse als Baumknoten, weil alias.0.beschattung.terrasse.schliessen vorhanden ist – der Ordner selbst hat jedoch kein Objekt). In der Tabelle werden sie kursiv und gedimmt dargestellt. Mit dem Filterfeld (vorbelegt mit "alias.0.") lässt sich die Liste einschränken; ein Klick auf das Filter-Icon in einer Zeile setzt den ID-Filter der Tabelle direkt auf diesen Pfad.'}
            </p>
          </AccordionItem>

          {/* History chart */}
          <AccordionItem
            id="history"
            open={openKey === 'history'}
            onToggle={() => toggle('history')}
            match={matches('history')}
            searching={searching}
            icon={<LineChart size={13} />}
            label={isEn ? 'History chart' : 'Verlaufsdiagramm'}
          >
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {isEn
                ? 'Click the history icon on a datapoint to open the full-screen chart. Choose a time range (1 h / 6 h / 24 h / 7 d / 30 d / 1 year or a custom range), chart type (line / area / bar), and aggregation (none / average / min+max / min / max). Overlay up to 4 extra datapoints for comparison and a previous period (±1 week / ±1 month). Min/max/avg/last show as badges; zoom with the mouse wheel and pan by dragging; export as PNG. You can delete a single value, the visible range, or the entire history (with confirmation). History works with the sql.0 adapter only.'
                : 'Klick auf das Verlaufs-Symbol eines Datenpunkts öffnet das Vollbild-Diagramm. Zeitraum wählen (1 h / 6 h / 24 h / 7 d / 30 d / 1 Jahr oder eigener Bereich), Diagrammtyp (Linie / Fläche / Balken) und Aggregation (keine / Durchschnitt / Min+Max / Min / Max). Bis zu 4 zusätzliche Datenpunkte zum Vergleich überlagern sowie einen vorherigen Zeitraum (±1 Woche / ±1 Monat). Min/Max/Durchschnitt/Letzter als Badges; mit dem Mausrad zoomen und per Ziehen verschieben; als PNG exportieren. Einzelwert, sichtbaren Bereich oder die gesamte Historie löschen (mit Bestätigung). Verlauf funktioniert nur mit dem sql.0-Adapter.'}
            </p>
          </AccordionItem>

          {/* Connection & live updates */}
          <AccordionItem
            id="connection"
            open={openKey === 'connection'}
            onToggle={() => toggle('connection')}
            match={matches('connection')}
            searching={searching}
            icon={<Wifi size={13} />}
            label={isEn ? 'Connection & live updates' : 'Verbindung & Live-Updates'}
          >
            <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              <p>
                {isEn
                  ? 'The browser connects directly to the ioBroker REST API. Set the host (ip:port) in Settings → Connection via "Test & Connect". State values update live: by default via long polling against the REST adapter, or via the optional Socket.io transport. If the live transport is unavailable, the app falls back to refreshing values every ~30 seconds and reflects the active transport in the connection badge.'
                  : 'Der Browser verbindet sich direkt mit der ioBroker-REST-API. Den Host (ip:port) unter Einstellungen → Verbindung über „Testen & Verbinden" festlegen. Zustandswerte aktualisieren sich live: standardmäßig per Long-Polling gegen den REST-Adapter oder über den optionalen Socket.io-Transport. Ist der Live-Transport nicht verfügbar, aktualisiert die App die Werte etwa alle 30 Sekunden und zeigt den aktiven Transport im Verbindungs-Badge.'}
              </p>
              <div className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                <Lock size={13} className="mt-0.5 shrink-0" />
                <span>
                  {isEn
                    ? 'No authentication: neither the REST API nor Socket.io support login/token. Only use this dashboard on a trusted network — never expose the adapters to the internet.'
                    : 'Keine Authentifizierung: Weder die REST-API noch Socket.io unterstützen Login/Token. Dieses Dashboard nur in einem vertrauenswürdigen Netzwerk nutzen — die Adapter niemals ins Internet stellen.'}
                </span>
              </div>
            </div>
          </AccordionItem>

          {/* Search commands */}
          <AccordionItem
            id="search"
            open={openKey === 'search'}
            onToggle={() => toggle('search')}
            match={matches('search')}
            searching={searching}
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

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-medium bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 shadow-sm align-middle">
      {children}
    </kbd>
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
  id, open, onToggle, icon, label, children, match = true, searching = false,
}: {
  id: string;
  open: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  match?: boolean;
  searching?: boolean;
}) {
  if (!match) return null;
  const isOpen = searching ? true : open;
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-expanded={isOpen}
        aria-controls={`accordion-${id}`}
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
          {icon}
          {label}
        </div>
        <ChevronDown
          size={14}
          className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div id={`accordion-${id}`} className="px-4 py-3 bg-white dark:bg-gray-900">
          {children}
        </div>
      )}
    </div>
  );
}

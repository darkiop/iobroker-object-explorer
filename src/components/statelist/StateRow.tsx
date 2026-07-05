import React, { useState, useRef, useTransition, useLayoutEffect, useEffect } from 'react';
import { Trash2, History, Mic2, Link2, Wrench, Lock, FileCode2, Cpu, Layers as LayersIcon, Folder, Pencil } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import type { IoBrokerState, IoBrokerObject } from '../../types/iobroker';
import type { SortKey, DateFormatSetting } from './StateListColumns';
import EditableNameCell from '../cells/EditableNameCell';
import EditableRoleCell from '../cells/EditableRoleCell';
import EditableUnitCell from '../cells/EditableUnitCell';
import EditableTypeCell from '../cells/EditableTypeCell';
import EditableValueCell from '../cells/EditableValueCell';
import EditableRoomCell from '../cells/EditableRoomCell';
import EditableFunctionCell from '../cells/EditableFunctionCell';
import CopyIdButton from '../cells/CopyIdButton';
import StyledCheckbox from '../ui/StyledCheckbox';
import { hasHistory, hasSmartName, hasCustomEnabled } from '../../api/iobroker';
import { ColoredId } from '../../utils/coloredId';
import { formatTimestamp } from '../../utils/format';
import { getObjectName, resolveI18n } from './StateListUtils';
import { DEL_COL_WIDTH } from './StateListConstants';
import { ROW_PADDING_Y, type UiRowHeight } from '../../context/UIContext';

export interface StateRowProps {
  id: string;
  state: IoBrokerState | undefined;
  obj: IoBrokerObject | undefined;
  roomName: string;
  fnName: string;
  isSelected: boolean;
  isChecked: boolean;
  aliasIds: string[] | undefined;
  ownTargetExists: boolean;
  visibleCols: SortKey[];
  colWidths: Record<SortKey, number>;
  roles: string[];
  units: string[];
  roomEnums: { id: string; name: string }[];
  fnEnums: { id: string; name: string }[];
  onSelect: (id: string) => void;
  onEditClick?: (id: string) => void;
  onCheck: (id: string, checked: boolean, shiftKey?: boolean) => void;
  onContextMenu: (x: number, y: number, id: string) => void;
  onHistoryClick: (id: string) => void;
  onScriptsClick?: (id: string) => void;
  onCustomClick?: (id: string) => void;
  onAliasClick?: (id: string) => void;
  onSmartNameClick?: (id: string) => void;
  scriptSources?: string;
  onNavigateTo?: (ids: string[]) => void;
  onDeleteClick: (id: string) => void;
  onEditJson: (id: string) => void;
  onSelectRoom: (objectId: string, oldRoomEnumId: string | null, newRoomEnumId: string | null) => void;
  onSelectFunction: (objectId: string, oldFnEnumId: string | null, newFnEnumId: string | null) => void;
  onOpenValueModal: (id: string) => void;
  roomEditForced: boolean;
  fnEditForced: boolean;
  onRoomEditEnd: () => void;
  onFnEditEnd: () => void;
  dateFormat: DateFormatSetting;
  language: 'en' | 'de';
  expertMode: boolean;
  isFocused: boolean;
  showDesc?: boolean;
  showObjectTypeIcons?: boolean;
  hideAliasSubRows?: boolean;
  showUnitInValue?: boolean;
  depth?: number;
  displayId?: string;
  animateEnter?: boolean;
  animateExit?: boolean;
  dragEnabled?: boolean;
  onDropAlias?: (sourceId: string, targetPath: string) => void;
  rowHeight?: UiRowHeight;
}

function aliasIdsEqual(a?: string[], b?: string[]): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const StateRow = React.memo(function StateRow({
  id, state, obj, roomName, fnName,
  isSelected, isChecked, aliasIds, ownTargetExists,
  visibleCols, colWidths, roles, units, roomEnums, fnEnums,
  onSelect, onEditClick, onCheck, onContextMenu, onHistoryClick, onScriptsClick, onCustomClick, onAliasClick, onSmartNameClick, onNavigateTo, onDeleteClick, onEditJson,
  onSelectRoom, onSelectFunction, onOpenValueModal,
  roomEditForced, fnEditForced, onRoomEditEnd, onFnEditEnd,
  dateFormat, language, expertMode, isFocused, showDesc = true, showObjectTypeIcons = true, hideAliasSubRows = false, showUnitInValue = false, scriptSources, depth = 0, displayId, animateEnter, animateExit, dragEnabled = false, onDropAlias, rowHeight = 'comfortable',
}: StateRowProps) {
  const isEn = language === 'en';
  const trRef = useRef<HTMLTableRowElement>(null);
  const [dropHover, setDropHover] = useState(false);

  // A row under the alias.0.* namespace can receive a dragged source datapoint to
  // create a new alias at its parent path. Source must be a non-alias datapoint.
  const isAliasDropTarget = dragEnabled && !!onDropAlias && id.startsWith('alias.');

  // Enter animation: apply class once on mount via DOM, decoupled from React className
  // so re-renders (e.g. isChecked change) never restart it.
  useLayoutEffect(() => {
    if (animateEnter && trRef.current) {
      const el = trRef.current;
      el.classList.add('group-row-enter');
      const cleanup = () => el.classList.remove('group-row-enter');
      el.addEventListener('animationend', cleanup, { once: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Exit animation: class managed via effect so className re-renders don't restart it.
  useEffect(() => {
    if (animateExit && trRef.current) {
      const el = trRef.current;
      el.classList.add('group-row-exit');
      return () => el.classList.remove('group-row-exit');
    }
  }, [animateExit]);
  const show = (key: SortKey) => visibleCols.includes(key);
  const w = (key: SortKey) => colWidths[key];
  const unit = obj?.common?.unit || '';
  const name = getObjectName(obj);
  const roomEnumId = Object.keys(obj?.enums ?? {}).find(k => k.startsWith('enum.rooms.')) ?? null;
  const fnEnumId = Object.keys(obj?.enums ?? {}).find(k => k.startsWith('enum.functions.')) ?? null;
  const rawOwnTarget = obj?.common?.alias?.id;
  const ownTarget = typeof rawOwnTarget === 'object' ? (rawOwnTarget?.read ?? rawOwnTarget?.write) : rawOwnTarget;
  const isAliasObject = id.startsWith('alias.0.');
  const danglingAlias = isAliasObject && !ownTarget;
  const hasAlias = (aliasIds && aliasIds.length > 0) || !!ownTarget || danglingAlias;
  const aliasTooltip = aliasIds?.length
    ? `Alias: ${aliasIds.join(', ')}`
    : ownTarget
      ? `${isEn ? 'Source' : 'Quelle'}: ${ownTarget}`
      : danglingAlias
        ? (isEn ? 'Alias without source' : 'Alias ohne Quelle')
        : undefined;

  const [, startTransition] = useTransition();

  const hiddenColRows: [string, string][] = [];
  if (!show('name') && name) hiddenColRows.push([isEn ? 'Name' : 'Name', name]);
  if (!show('ts') && state)  hiddenColRows.push([isEn ? 'Timestamp' : 'Zeitstempel', formatTimestamp(state.ts, dateFormat)]);
  if (!show('ack') && state) hiddenColRows.push([isEn ? 'Acknowledged' : 'Bestätigt', state.ack ? (isEn ? 'Yes' : 'Ja') : (isEn ? 'No' : 'Nein')]);
  if (!show('write') && obj) hiddenColRows.push([isEn ? 'Writable' : 'Schreibbar', obj.common?.write === false ? (isEn ? 'No (read-only)' : 'Nein (nur lesen)') : (isEn ? 'Yes' : 'Ja')]);
  if (!show('history') && obj && hasHistory(obj)) hiddenColRows.push(['History', isEn ? 'Yes' : 'Ja']);
  if (!show('custom') && obj && hasCustomEnabled(obj)) hiddenColRows.push(['Custom', isEn ? 'Yes' : 'Ja']);
  if (!show('smart') && obj && hasSmartName(obj)) {
    const smartNameVal = obj.common?.smartName;
    const sn = resolveI18n(smartNameVal === false ? undefined : smartNameVal);
    if (sn) hiddenColRows.push(['SmartName', sn]);
  }
  if (!show('alias') && ownTarget) hiddenColRows.push(['Alias', ownTarget]);

  const tooltipStateRows: [string, string][] = state ? [
    ...(show('ts')  ? [['Timestamp',    formatTimestamp(state.ts, dateFormat)] as [string, string]] : []),
    ['Last Change',  formatTimestamp(state.lc, dateFormat)],
    ...(show('ack') ? [['Acknowledged', state.ack ? 'Yes' : 'No'] as [string, string]] : []),
    ['Quality',      String(state.q)],
    ['From',         state.from || '–'],
  ] : [];

  const rowTooltipContent = (hiddenColRows.length > 0 || tooltipStateRows.length > 0) ? (
    <table className="border-separate" style={{ borderSpacing: '0 1px' }}>
      <tbody>
        {hiddenColRows.map(([label, value]) => (
          <tr key={`h-${label}`}>
            <td className="pr-3 text-blue-300 whitespace-nowrap">{label}</td>
            <td className="text-gray-100 whitespace-nowrap">{value}</td>
          </tr>
        ))}
        {hiddenColRows.length > 0 && tooltipStateRows.length > 0 && (
          <tr><td colSpan={2} className="py-0.5"><div className="border-t border-gray-600" /></td></tr>
        )}
        {tooltipStateRows.map(([label, value]) => (
          <tr key={label}>
            <td className="pr-3 text-gray-400 whitespace-nowrap">{label}</td>
            <td className="text-gray-100 whitespace-nowrap">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : undefined;

  return (
    <Tooltip content={rowTooltipContent} side="right" align="start">
    <tr
      ref={trRef}
      style={{ '--row-py': ROW_PADDING_Y[rowHeight] } as React.CSSProperties}
      draggable={dragEnabled || undefined}
      onDragStart={dragEnabled ? (e) => {
        e.dataTransfer.setData('application/iobroker-id', id);
        e.dataTransfer.effectAllowed = 'copy';
      } : undefined}
      onDragOver={isAliasDropTarget ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!dropHover) setDropHover(true); } : undefined}
      onDragEnter={isAliasDropTarget ? (e) => { e.preventDefault(); setDropHover(true); } : undefined}
      onDragLeave={isAliasDropTarget ? (e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropHover(false); } : undefined}
      onDrop={isAliasDropTarget ? (e) => {
        e.preventDefault();
        setDropHover(false);
        const sourceId = e.dataTransfer.getData('application/iobroker-id');
        if (sourceId && !sourceId.startsWith('alias.') && sourceId !== id) {
          onDropAlias!(sourceId, id.split('.').slice(0, -1).join('.'));
        }
      } : undefined}
      onClick={() => startTransition(() => onSelect(id))}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e.clientX, e.clientY, id); }}
      className={`group border-b border-gray-200 dark:border-gray-800 ${dragEnabled ? 'cursor-grab' : 'cursor-pointer'} select-none ${dropHover ? 'outline outline-2 -outline-offset-2 outline-emerald-500 bg-emerald-500/15 ' : ''}${
        isSelected
          ? 'bg-blue-600/20 text-blue-700 dark:text-blue-200'
          : isFocused
            ? 'bg-blue-100/60 text-blue-800 dark:bg-blue-900/40 dark:text-blue-100 outline outline-1 -outline-offset-1 outline-blue-400 dark:outline-blue-500'
            : isChecked
              ? 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
              : 'hover:bg-gray-200/80 text-gray-700 dark:hover:bg-gray-700/60 dark:text-gray-300'
      }`}
    >
      {show('checkbox') && (
        <td style={{ width: w('checkbox'), minWidth: w('checkbox') }} className="py-[var(--row-py)] align-middle" onClick={(e) => e.stopPropagation()}>
          <div className={`flex items-center justify-center transition-opacity ${isChecked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <StyledCheckbox
              checked={isChecked}
              onChange={(e) => onCheck(id, e.target.checked, e.nativeEvent instanceof MouseEvent ? e.nativeEvent.shiftKey : false)}
            />
          </div>
        </td>
      )}
      {show('id') && (
        <td data-col="id" className="py-[var(--row-py)] font-mono text-sm text-gray-500 dark:text-gray-400 overflow-hidden group/id relative" style={{ paddingLeft: depth === 0 ? 12 : 12 + (depth - 1) * 10 + 32 }}>
          <div className="flex flex-col gap-0.5 min-w-0 pr-24">
            <div className="flex items-center gap-1.5 min-w-0">
              {showObjectTypeIcons && obj?.type === 'device'  && <Tooltip content={isEn ? 'Device' : 'Gerät'}><Cpu       size={12} className="text-sky-500/80 shrink-0" /></Tooltip>}
              {showObjectTypeIcons && obj?.type === 'channel' && <Tooltip content={isEn ? 'Channel' : 'Kanal'}><LayersIcon size={12} className="text-indigo-500/80 shrink-0" /></Tooltip>}
              {showObjectTypeIcons && obj?.type === 'folder'  && <Tooltip content={isEn ? 'Folder' : 'Ordner'}><Folder    size={12} className="text-yellow-500/80 shrink-0" /></Tooltip>}
              <ColoredId id={displayId ?? id} />
              <CopyIdButton id={id} />
              <Tooltip content="Delete datapoint">
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteClick(id); }}
                  aria-label="Delete datapoint"
                  className="opacity-0 group-hover/id:opacity-100 text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </Tooltip>
              <Tooltip content={isEn ? 'Edit object' : 'Objekt bearbeiten'}>
                <button
                  onClick={(e) => { e.stopPropagation(); onEditClick ? onEditClick(id) : onSelect(id); }}
                  className="opacity-0 group-hover/id:opacity-100 text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white shrink-0"
                >
                  <Pencil size={12} />
                </button>
              </Tooltip>
            </div>
            {!!onNavigateTo && !hideAliasSubRows && (
              <div className={`text-[10px] leading-4 text-gray-400 dark:text-gray-500 truncate ${!(ownTarget || (aliasIds && aliasIds.length > 0)) ? 'invisible' : ''}`}>
                {ownTarget && (
                  <>
                    <span className="mr-1">{isEn ? 'Source:' : 'Quelle:'}</span>
                    <Tooltip content={ownTargetExists ? ownTarget : `${ownTarget} (${isEn ? 'target does not exist' : 'Ziel existiert nicht'})`}>
                      <button
                        onClick={(e) => { e.stopPropagation(); onNavigateTo([ownTarget]); }}
                        className={`font-mono underline decoration-dotted ${ownTargetExists ? 'hover:text-blue-500 dark:hover:text-blue-400' : 'text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300'}`}
                      >
                        {ownTarget}
                      </button>
                    </Tooltip>
                  </>
                )}
                {ownTarget && aliasIds && aliasIds.length > 0 && <span className="mx-1">|</span>}
                {aliasIds && aliasIds.length > 0 && (
                  <>
                    <span className="mr-1">{isEn ? 'Target:' : 'Ziel:'}</span>
                    {aliasIds.map((aid, idx) => (
                      <React.Fragment key={aid}>
                        {idx > 0 && <span>, </span>}
                        <Tooltip content={aid}>
                          <button
                            onClick={(e) => { e.stopPropagation(); onNavigateTo([aid]); }}
                            className="font-mono underline decoration-dotted hover:text-blue-500 dark:hover:text-blue-400"
                          >
                            {aid}
                          </button>
                        </Tooltip>
                      </React.Fragment>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 shrink-0">
            <Tooltip content="JSON">
              <button
                onClick={(e) => { e.stopPropagation(); onEditJson(id); }}
                className="p-0.5 rounded text-teal-500 dark:text-teal-400 hover:bg-teal-500/15 dark:hover:bg-teal-500/20 transition-colors"
              >
                <Wrench size={13} />
              </button>
            </Tooltip>
            {danglingAlias && (
              <Tooltip content={aliasTooltip}>
                <button
                  onClick={(e) => { e.currentTarget.blur(); e.stopPropagation(); onAliasClick?.(id); }}
                  className="relative p-0.5 rounded text-red-500 dark:text-red-400 hover:bg-red-500/15 dark:hover:bg-red-500/20 transition-colors"
                >
                  <Link2 size={13} />
                </button>
              </Tooltip>
            )}
            {hasAlias && !danglingAlias && (
              <Tooltip content={aliasTooltip}>
                <button
                  onClick={(e) => { e.currentTarget.blur(); e.stopPropagation(); onAliasClick?.(id); }}
                  className="relative p-0.5 rounded text-amber-500 dark:text-amber-400 hover:bg-amber-500/15 dark:hover:bg-amber-500/20 transition-colors"
                >
                  <Link2 size={13} />
                  {aliasIds && aliasIds.length > 1 && (
                    <span className="absolute -top-1.5 -right-2 text-[8px] font-bold leading-none bg-amber-500 text-white rounded-full min-w-[13px] h-[13px] flex items-center justify-center px-0.5">
                      {aliasIds.length}
                    </span>
                  )}
                </button>
              </Tooltip>
            )}
            {obj && hasCustomEnabled(obj) && (
              <Tooltip content={isEn ? 'Custom settings' : 'Benutzerdefinierte Einstellungen'}>
                <button
                  onClick={(e) => { e.stopPropagation(); onCustomClick?.(id); }}
                  className="p-0.5 rounded text-purple-500 dark:text-purple-400 hover:bg-purple-500/15 dark:hover:bg-purple-500/20 transition-colors"
                >
                  <Wrench size={13} />
                </button>
              </Tooltip>
            )}
            {obj && hasSmartName(obj) && (
              <Tooltip content="SmartName">
                <button
                  onClick={(e) => { e.stopPropagation(); onSmartNameClick?.(id); }}
                  className="p-0.5 rounded text-orange-500 dark:text-orange-400 hover:bg-orange-500/15 dark:hover:bg-orange-500/20 transition-colors"
                >
                  <Mic2 size={13} />
                </button>
              </Tooltip>
            )}
            {scriptSources?.includes(id) && (
              <Tooltip content={isEn ? 'Show script usages' : 'Skript-Verwendungen anzeigen'}>
                <button
                  onClick={(e) => { e.currentTarget.blur(); e.stopPropagation(); onScriptsClick?.(id); }}
                  className="p-0.5 rounded text-green-600 dark:text-green-500 hover:bg-green-500/15 dark:hover:bg-green-500/20 transition-colors"
                >
                  <FileCode2 size={13} />
                </button>
              </Tooltip>
            )}
            {obj && hasHistory(obj) && (
              <Tooltip content={isEn ? 'Show history' : 'History anzeigen'}>
                <button
                  onClick={(e) => { e.currentTarget.blur(); e.stopPropagation(); onHistoryClick(id); }}
                  className="p-0.5 rounded text-purple-600 dark:text-purple-400 hover:bg-purple-500/15 dark:hover:bg-purple-500/20 transition-colors"
                >
                  <History size={13} />
                </button>
              </Tooltip>
            )}
          </div>
        </td>
      )}
      {show('name') && <EditableNameCell id={id} name={name} desc={resolveI18n(obj?.common?.desc)} showDesc={showDesc} language={language} />}
      {show('write') && (
        <td style={{ width: colWidths['write'], minWidth: colWidths['write'] }} className="py-[var(--row-py)] align-middle">
          <Tooltip content={obj?.common?.write === false ? (isEn ? 'Read-only' : 'Schreibgeschützt') : undefined}>
            <div className="flex items-center justify-center">
              {obj?.common?.write === false && <Lock size={13} className="text-red-500 dark:text-red-400" />}
            </div>
          </Tooltip>
        </td>
      )}
      {show('history') && (
        <td style={{ width: colWidths['history'], minWidth: colWidths['history'] }} className="py-[var(--row-py)] align-middle">
          <div className="flex items-center justify-center">
            {obj && hasHistory(obj) && (
              <Tooltip content={isEn ? 'Show history' : 'History anzeigen'}>
                <button
                  onClick={(e) => { e.currentTarget.blur(); e.stopPropagation(); onHistoryClick(id); }}
                  className="p-0.5 rounded text-purple-600 dark:text-purple-400 hover:bg-purple-500/15 dark:hover:bg-purple-500/20 transition-colors"
                >
                  <History size={15} />
                </button>
              </Tooltip>
            )}
          </div>
        </td>
      )}
      {show('custom') && (
        <td style={{ width: colWidths['custom'], minWidth: colWidths['custom'] }} className="py-[var(--row-py)] align-middle">
          <div className="flex items-center justify-center">
            {obj && hasCustomEnabled(obj) && (
              <Tooltip content={isEn ? 'Custom settings' : 'Benutzerdefinierte Einstellungen'}>
                <button
                  className="p-0.5 rounded hover:bg-purple-500/15 dark:hover:bg-purple-500/20 transition-colors"
                  onClick={(e) => { e.stopPropagation(); onCustomClick?.(id); }}
                >
                  <Wrench size={13} className="text-purple-500 dark:text-purple-400" />
                </button>
              </Tooltip>
            )}
          </div>
        </td>
      )}
      {show('smart') && (
        <td
          style={{ width: colWidths['smart'], minWidth: colWidths['smart'] }}
          className="py-[var(--row-py)] align-middle"
        >
          <Tooltip content={obj && hasSmartName(obj) ? (
            typeof obj.common.smartName === 'string'
              ? obj.common.smartName
              : typeof obj.common.smartName === 'object' && obj.common.smartName
                ? Object.values(obj.common.smartName).join(' / ')
                : 'SmartName'
          ) : undefined}>
            <div className="flex items-center justify-center">
              {obj && hasSmartName(obj) && (
                <button
                  className="p-0.5 rounded hover:bg-orange-500/15 dark:hover:bg-orange-500/20 transition-colors"
                  onClick={(e) => { e.stopPropagation(); onSmartNameClick?.(id); }}
                >
                  <Mic2 size={15} className="text-orange-500 dark:text-orange-400" />
                </button>
              )}
            </div>
          </Tooltip>
        </td>
      )}
      {show('alias') && (
        <td style={{ width: colWidths['alias'], minWidth: colWidths['alias'] }} className="py-[var(--row-py)] align-middle">
          <div className="flex items-center justify-center">
            {danglingAlias && (
              <Tooltip content={aliasTooltip}>
                <button
                  onClick={(e) => { e.currentTarget.blur(); e.stopPropagation(); onAliasClick?.(id); }}
                  className="relative p-0.5 rounded text-red-500 dark:text-red-400 hover:bg-red-500/15 dark:hover:bg-red-500/20 transition-colors"
                >
                  <Link2 size={15} />
                </button>
              </Tooltip>
            )}
            {hasAlias && !danglingAlias && (
              <Tooltip content={aliasTooltip}>
                <button
                  onClick={(e) => {
                    e.currentTarget.blur();
                    e.stopPropagation();
                    onAliasClick?.(id);
                  }}
                  className="relative p-0.5 rounded text-amber-500 dark:text-amber-400 hover:bg-amber-500/15 dark:hover:bg-amber-500/20 transition-colors"
                >
                  <Link2 size={15} />
                  {aliasIds && aliasIds.length > 1 && (
                    <span className="absolute -top-1.5 -right-2 text-[8px] font-bold leading-none bg-amber-500 text-white rounded-full min-w-[13px] h-[13px] flex items-center justify-center px-0.5">
                      {aliasIds.length}
                    </span>
                  )}
                </button>
              </Tooltip>
            )}
          </div>
        </td>
      )}
      {show('scripts') && (
        <td style={{ width: colWidths['scripts'], minWidth: colWidths['scripts'] }} className="py-[var(--row-py)] align-middle">
          <div className="flex items-center justify-center">
            {scriptSources?.includes(id) && (
              <Tooltip content={isEn ? 'Show script usages' : 'Skript-Verwendungen anzeigen'}>
                <button
                  onClick={(e) => { e.currentTarget.blur(); e.stopPropagation(); onScriptsClick?.(id); }}
                  className="p-0.5 rounded text-green-600 dark:text-green-500 hover:bg-green-500/15 dark:hover:bg-green-500/20 transition-colors"
                >
                  <FileCode2 size={15} />
                </button>
              </Tooltip>
            )}
          </div>
        </td>
      )}
      {show('room') && (
        <EditableRoomCell
          id={id}
          currentRoomEnumId={roomEnumId}
          roomName={roomName}
          roomEnums={roomEnums}
          onSelectRoom={onSelectRoom}
          forceEdit={roomEditForced}
          onEditEnd={onRoomEditEnd}
          language={language}
        />
      )}
      {show('function') && (
        <EditableFunctionCell
          id={id}
          currentFnEnumId={fnEnumId}
          fnName={fnName}
          fnEnums={fnEnums}
          onSelectFunction={onSelectFunction}
          forceEdit={fnEditForced}
          onEditEnd={onFnEditEnd}
          language={language}
        />
      )}
      {show('type') && <EditableTypeCell id={id} typeValue={obj?.common?.type || ''} objType={obj?.type} language={language} />}
      {show('role') && <EditableRoleCell id={id} role={obj?.common?.role || ''} objType={obj?.type} suggestions={roles} language={language} />}
      {show('value') && (obj?.type === 'folder' || obj?.type === 'device' || obj?.type === 'channel' ? <td data-col="value" /> : <EditableValueCell id={id} state={state} obj={obj} expertMode={expertMode} onOpen={onOpenValueModal} language={language} unitSuffix={showUnitInValue ? unit : undefined} showTypeIcon={showObjectTypeIcons} />)}
      {show('unit') && (obj?.type === 'folder' || obj?.type === 'device' || obj?.type === 'channel' ? <td data-col="unit" /> : <EditableUnitCell id={id} unit={unit} suggestions={units} language={language} />)}
      {show('ack') && (
        <td data-col="ack" className="px-3 py-[var(--row-py)]">
          {state ? (
            <Tooltip content={state.ack ? 'Acknowledged' : 'Not acknowledged'}>
              <span
                className={`inline-block w-2 h-2 rounded-full ${state.ack ? 'bg-green-500' : 'bg-yellow-500'}`}
              />
            </Tooltip>
          ) : null}
        </td>
      )}
      {show('ts') && (
        <td data-col="ts" className="px-3 py-[var(--row-py)] text-gray-400 dark:text-gray-500 text-xs font-mono overflow-hidden">
          <span className="truncate block">{state ? formatTimestamp(state.ts, dateFormat) : ''}</span>
        </td>
      )}
      <td style={{ width: DEL_COL_WIDTH, minWidth: DEL_COL_WIDTH }} />
    </tr>
    </Tooltip>
  );
}, (prev, next) => {
  const prevState = prev.state;
  const nextState = next.state;
  const prevObj = prev.obj;
  const nextObj = next.obj;

  return (
    prev.id === next.id &&
    prevState?.val === nextState?.val &&
    prevState?.ack === nextState?.ack &&
    prevState?.ts === nextState?.ts &&
    prevObj === nextObj &&
    prev.roomName === next.roomName &&
    prev.fnName === next.fnName &&
    prev.isSelected === next.isSelected &&
    prev.isChecked === next.isChecked &&
    aliasIdsEqual(prev.aliasIds, next.aliasIds) &&
    prev.ownTargetExists === next.ownTargetExists &&
    prev.visibleCols === next.visibleCols &&
    prev.colWidths === next.colWidths &&
    prev.roles === next.roles &&
    prev.units === next.units &&
    prev.roomEnums === next.roomEnums &&
    prev.fnEnums === next.fnEnums &&
    prev.roomEditForced === next.roomEditForced &&
    prev.fnEditForced === next.fnEditForced &&
    prev.dateFormat === next.dateFormat &&
    prev.language === next.language &&
    prev.expertMode === next.expertMode &&
    prev.onNavigateTo === next.onNavigateTo &&
    prev.onSelectRoom === next.onSelectRoom &&
    prev.onSelectFunction === next.onSelectFunction &&
    prev.onOpenValueModal === next.onOpenValueModal &&
    prev.isFocused === next.isFocused &&
    prev.displayId === next.displayId &&
    prev.animateExit === next.animateExit &&
    prev.hideAliasSubRows === next.hideAliasSubRows &&
    prev.dragEnabled === next.dragEnabled &&
    prev.onDropAlias === next.onDropAlias
  );
});

export default StateRow;

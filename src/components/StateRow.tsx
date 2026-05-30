import React from 'react';
import { Trash2, History, Mic2, Link2, Wrench, Lock, FileCode2 } from 'lucide-react';
import type { IoBrokerState, IoBrokerObject } from '../types/iobroker';
import type { SortKey, DateFormatSetting } from './stateListColumns';
import EditableNameCell from './cells/EditableNameCell';
import EditableRoleCell from './cells/EditableRoleCell';
import EditableUnitCell from './cells/EditableUnitCell';
import EditableTypeCell from './cells/EditableTypeCell';
import EditableValueCell from './cells/EditableValueCell';
import EditableRoomCell from './cells/EditableRoomCell';
import EditableFunctionCell from './cells/EditableFunctionCell';
import CopyIdButton from './cells/CopyIdButton';
import TypeIcon from './TypeIcon';
import StyledCheckbox from './StyledCheckbox';
import { hasHistory, hasSmartName, hasCustomEnabled } from '../api/iobroker';
import { ColoredId } from '../utils/coloredId';
import { formatTimestamp } from '../utils/format';
import { getObjectName, resolveI18n } from './stateListUtils';
import { DEL_COL_WIDTH } from './stateListConstants';

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
  onCheck: (id: string, checked: boolean) => void;
  onContextMenu: (x: number, y: number, id: string) => void;
  onHistoryClick: (id: string) => void;
  onScriptsClick?: (id: string) => void;
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
  depth?: number;
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
  onSelect, onCheck, onContextMenu, onHistoryClick, onScriptsClick, onNavigateTo, onDeleteClick, onEditJson,
  onSelectRoom, onSelectFunction, onOpenValueModal,
  roomEditForced, fnEditForced, onRoomEditEnd, onFnEditEnd,
  dateFormat, language, expertMode, isFocused, showDesc = true, scriptSources, depth = 0,
}: StateRowProps) {
  const isEn = language === 'en';
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

  return (
    <tr
      onClick={() => onSelect(id)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e.clientX, e.clientY, id); }}
      className={`group border-b border-gray-200 dark:border-gray-800 cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-600/20 text-blue-700 dark:text-blue-200'
          : isFocused
            ? 'bg-blue-100/60 text-blue-800 dark:bg-blue-900/40 dark:text-blue-100 outline outline-1 -outline-offset-1 outline-blue-400 dark:outline-blue-500'
            : isChecked
              ? 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
              : 'hover:bg-gray-100/80 text-gray-700 dark:hover:bg-gray-700/60 dark:text-gray-300'
      }`}
    >
      {show('checkbox') && (
        <td style={{ width: w('checkbox'), minWidth: w('checkbox') }} className="py-2 align-middle" onClick={(e) => e.stopPropagation()}>
          <div className={`flex items-center justify-center transition-opacity ${isChecked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <StyledCheckbox
              checked={isChecked}
              onChange={(e) => onCheck(id, e.target.checked)}
            />
          </div>
        </td>
      )}
      {show('id') && (
        <td data-col="id" className="py-2 font-mono text-xs text-gray-500 dark:text-gray-400 overflow-hidden group/id" style={{ paddingLeft: 12 + depth * 10 }}>
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <TypeIcon type={obj?.common?.type || ''} />
              <ColoredId id={id} />
              <CopyIdButton id={id} />
              <button
                onClick={(e) => { e.stopPropagation(); onEditJson(id); }}
                className="opacity-0 group-hover/id:opacity-100 text-gray-400 hover:text-violet-500 dark:text-gray-500 dark:hover:text-violet-400 shrink-0 transition-opacity"
                title="JSON"
              >
                <Wrench size={12} />
              </button>
            </div>
            {!!onNavigateTo && (
              <div className={`text-[10px] leading-4 text-gray-400 dark:text-gray-500 truncate ${!(ownTarget || (aliasIds && aliasIds.length > 0)) ? 'invisible' : ''}`}>
                {ownTarget && (
                  <>
                    <span className="mr-1">{isEn ? 'Source:' : 'Quelle:'}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onNavigateTo([ownTarget]); }}
                      className={`font-mono underline decoration-dotted ${ownTargetExists ? 'hover:text-blue-500 dark:hover:text-blue-400' : 'text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300'}`}
                      title={ownTargetExists ? ownTarget : `${ownTarget} (${isEn ? 'target does not exist' : 'Ziel existiert nicht'})`}
                    >
                      {ownTarget}
                    </button>
                  </>
                )}
                {ownTarget && aliasIds && aliasIds.length > 0 && <span className="mx-1">|</span>}
                {aliasIds && aliasIds.length > 0 && (
                  <>
                    <span className="mr-1">{isEn ? 'Target:' : 'Ziel:'}</span>
                    {aliasIds.map((aid, idx) => (
                      <React.Fragment key={aid}>
                        {idx > 0 && <span>, </span>}
                        <button
                          onClick={(e) => { e.stopPropagation(); onNavigateTo([aid]); }}
                          className="font-mono underline decoration-dotted hover:text-blue-500 dark:hover:text-blue-400"
                          title={aid}
                        >
                          {aid}
                        </button>
                      </React.Fragment>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </td>
      )}
      {show('name') && <EditableNameCell id={id} name={name} desc={resolveI18n(obj?.common?.desc)} showDesc={showDesc} />}
      {show('write') && (
        <td style={{ width: colWidths['write'], minWidth: colWidths['write'] }} className="py-2 align-middle" title={obj?.common?.write === false ? 'Read-only' : undefined}>
          <div className="flex items-center justify-center">
            {obj?.common?.write === false && <Lock size={13} className="text-red-500 dark:text-red-400" />}
          </div>
        </td>
      )}
      {show('history') && (
        <td style={{ width: colWidths['history'], minWidth: colWidths['history'] }} className="py-2 align-middle">
          <div className="flex items-center justify-center">
            {obj && hasHistory(obj) && (
              <button
                onClick={(e) => { e.currentTarget.blur(); e.stopPropagation(); onHistoryClick(id); }}
                title="History anzeigen"
                className="p-0.5 rounded text-blue-500 dark:text-blue-400 hover:bg-blue-500/15 dark:hover:bg-blue-500/20 transition-colors"
              >
                <History size={15} />
              </button>
            )}
          </div>
        </td>
      )}
      {show('custom') && (
        <td style={{ width: colWidths['custom'], minWidth: colWidths['custom'] }} className="py-2 align-middle">
          <div className="flex items-center justify-center">
            {obj && hasCustomEnabled(obj) && (
              <Wrench size={13} className="text-purple-500 dark:text-purple-400" />
            )}
          </div>
        </td>
      )}
      {show('smart') && (
        <td
          style={{ width: colWidths['smart'], minWidth: colWidths['smart'] }}
          className="py-2 align-middle"
          title={obj && hasSmartName(obj) ? (
            typeof obj.common.smartName === 'string'
              ? obj.common.smartName
              : typeof obj.common.smartName === 'object' && obj.common.smartName
                ? Object.values(obj.common.smartName).join(' / ')
                : 'SmartName'
          ) : undefined}
        >
          <div className="flex items-center justify-center">
            {obj && hasSmartName(obj) && (
              <span className="p-0.5 rounded hover:bg-violet-500/15 dark:hover:bg-violet-500/20 transition-colors">
                <Mic2 size={15} className="text-violet-500 dark:text-violet-400" />
              </span>
            )}
          </div>
        </td>
      )}
      {show('alias') && (
        <td style={{ width: colWidths['alias'], minWidth: colWidths['alias'] }} className="py-2 align-middle">
          <div className="flex items-center justify-center">
            {danglingAlias && (
              <span title={aliasTooltip} className="relative p-0.5 rounded text-red-500 dark:text-red-400">
                <Link2 size={15} />
              </span>
            )}
            {hasAlias && !danglingAlias && (
              <button
                onClick={(e) => {
                  e.currentTarget.blur();
                  e.stopPropagation();
                  const targets = aliasIds?.length ? aliasIds : ownTarget ? [ownTarget] : [];
                  onNavigateTo?.(targets);
                }}
                title={aliasTooltip}
                className="relative p-0.5 rounded text-amber-500 dark:text-amber-400 hover:bg-amber-500/15 dark:hover:bg-amber-500/20 transition-colors"
              >
                <Link2 size={15} />
                {aliasIds && aliasIds.length > 1 && (
                  <span className="absolute -top-1.5 -right-2 text-[8px] font-bold leading-none bg-amber-500 text-white rounded-full min-w-[13px] h-[13px] flex items-center justify-center px-0.5">
                    {aliasIds.length}
                  </span>
                )}
              </button>
            )}
          </div>
        </td>
      )}
      {show('scripts') && (
        <td style={{ width: colWidths['scripts'], minWidth: colWidths['scripts'] }} className="py-2 align-middle">
          <div className="flex items-center justify-center">
            {scriptSources?.includes(id) && (
              <button
                onClick={(e) => { e.currentTarget.blur(); e.stopPropagation(); onScriptsClick?.(id); }}
                title={isEn ? 'Show script usages' : 'Skript-Verwendungen anzeigen'}
                className="p-0.5 rounded text-green-600 dark:text-green-500 hover:bg-green-500/15 dark:hover:bg-green-500/20 transition-colors"
              >
                <FileCode2 size={15} />
              </button>
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
      {show('value') && (obj?.type === 'folder' || obj?.type === 'device' || obj?.type === 'channel' ? <td data-col="value" /> : <EditableValueCell id={id} state={state} obj={obj} expertMode={expertMode} onOpen={onOpenValueModal} language={language} />)}
      {show('unit') && (obj?.type === 'folder' || obj?.type === 'device' || obj?.type === 'channel' ? <td data-col="unit" /> : <EditableUnitCell id={id} unit={unit} suggestions={units} language={language} />)}
      {show('ack') && (
        <td data-col="ack" className="px-3 py-2">
          {state ? (
            <span
              className={`inline-block w-2 h-2 rounded-full ${state.ack ? 'bg-green-500' : 'bg-yellow-500'}`}
              title={state.ack ? 'Acknowledged' : 'Not acknowledged'}
            />
          ) : null}
        </td>
      )}
      {show('ts') && (
        <td data-col="ts" className="px-3 py-2 text-gray-400 dark:text-gray-500 text-xs font-mono overflow-hidden">
          <span className="truncate block">{state ? formatTimestamp(state.ts, dateFormat) : ''}</span>
        </td>
      )}
      <td style={{ width: DEL_COL_WIDTH, minWidth: DEL_COL_WIDTH }} className="py-1 pr-2 text-center" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onDeleteClick(id)}
          title="Delete datapoint"
          className={`p-1 rounded transition-colors hover:bg-red-500/10 ${isChecked ? 'text-red-500 dark:text-red-400' : 'text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400'}`}
        ><Trash2 size={13} /></button>
      </td>
    </tr>
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
    prev.isFocused === next.isFocused
  );
});

export default StateRow;

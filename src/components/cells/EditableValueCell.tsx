import React, { useRef } from 'react';
import { ArrowUp, ArrowDown, AlertTriangle, Zap, Pencil, Lock } from 'lucide-react';
import type { IoBrokerState, IoBrokerObject } from '../../types/iobroker';
import { useSetState } from '../../hooks/useStates';
import { formatValue } from '../../utils/format';
import { getThresholdStatus } from '../statelist/StateListUtils';
import TypeIcon from '../TypeIcon';
import { Tooltip } from '../ui/Tooltip';

const EditableValueCell = React.memo(function EditableValueCell({
  id,
  state,
  obj,
  expertMode = false,
  onOpen,
  language = 'en',
  unitSuffix,
  showTypeIcon = true,
}: {
  id: string;
  state: IoBrokerState | undefined;
  obj: IoBrokerObject | undefined;
  expertMode?: boolean;
  onOpen: (id: string) => void;
  language?: 'en' | 'de';
  unitSuffix?: string;
  showTypeIcon?: boolean;
}) {
  const isEn = language === 'en';
  const setStateVal = useSetState();
  const prevValRef = useRef<unknown>(undefined);
  const val = state?.val;
  const isNull = val === null || val === undefined;
  const isBoolean = typeof val === 'boolean';
  const isNumber = typeof val === 'number';
  const role = obj?.common?.role ?? '';
  const isWritable = obj?.common?.write === true;
  const isReadOnly = obj?.common?.write === false;
  const isSwitch = role === 'switch' || role.startsWith('switch.');
  const isButton = role === 'button' || role.startsWith('button.');

  const thresholdStatus = isNumber
    ? getThresholdStatus(val, obj?.common?.min, obj?.common?.max)
    : null;

  let valueColor = 'text-gray-900 dark:text-white';
  if (isNull) valueColor = 'text-gray-300 dark:text-gray-600';
  else if (isBoolean) valueColor = val ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400';
  else if (thresholdStatus === 'exceeded') valueColor = 'text-red-600 dark:text-red-400 font-semibold';
  else if (thresholdStatus === 'warn') valueColor = 'text-yellow-600 dark:text-yellow-400';

  let trendIcon: React.ReactNode = null;
  const prev = prevValRef.current;
  if (isNumber && prev !== undefined && prev !== val) {
    trendIcon = (val as number) > (prev as number)
      ? <ArrowUp size={10} className="text-green-500 dark:text-green-400 shrink-0" />
      : <ArrowDown size={10} className="text-red-400 dark:text-red-400 shrink-0" />;
  }
  prevValRef.current = val;

  if (!expertMode && state && (isSwitch || isButton)) {
    return (
      <td data-col="value" className="px-3 py-1.5 text-left overflow-hidden whitespace-nowrap group/value" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-start gap-1.5">
          {isSwitch ? (
            <Tooltip content={isWritable ? (isEn ? 'Toggle value' : 'Wert umschalten') : (isEn ? 'Read only' : 'Schreibgeschützt')}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isWritable) return;
                  setStateVal.mutate({ id, val: !Boolean(state.val) });
                }}
                disabled={setStateVal.isPending || !isWritable}
                className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
                  Boolean(state.val) ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                } ${(setStateVal.isPending || !isWritable) ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 mt-[3px] rounded-full bg-white shadow transition-transform ${Boolean(state.val) ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </Tooltip>
          ) : (
            <Tooltip content={isEn ? 'Trigger' : 'Auslösen'}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isWritable) return;
                  setStateVal.mutate({ id, val: true });
                }}
                disabled={setStateVal.isPending || !isWritable}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50 transition-colors"
              >
                <Zap size={12} />
              </button>
            </Tooltip>
          )}
          <Tooltip content={isEn ? 'Edit value' : 'Wert bearbeiten'}>
            <button
              onClick={(e) => { e.stopPropagation(); onOpen(id); }}
              className="opacity-0 group-hover/value:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity"
            >
              <Pencil size={12} />
            </button>
          </Tooltip>
          {showTypeIcon && obj?.common?.type && (
            <Tooltip content={obj.common.type}>
              <span className="inline-flex shrink-0"><TypeIcon type={obj.common.type} /></span>
            </Tooltip>
          )}
          {isReadOnly && (
            <Tooltip content={isEn ? 'Read only' : 'Schreibgeschützt'}>
              <Lock size={11} className="text-red-500 dark:text-red-400 shrink-0" />
            </Tooltip>
          )}
          {state && (
            <Tooltip content={state.ack ? (isEn ? 'Acknowledged' : 'Bestätigt') : (isEn ? 'Not acknowledged' : 'Nicht bestätigt')}>
              <span
                className={`inline-block w-2 h-2 rounded-full shrink-0 ${state.ack ? 'bg-green-500' : 'bg-yellow-500'}`}
              />
            </Tooltip>
          )}
        </div>
      </td>
    );
  }

  return (
    <td
      data-col="value"
      className="px-3 py-[var(--row-py)] text-xs text-left font-mono overflow-hidden whitespace-nowrap group/value"
      onClick={(e) => { e.stopPropagation(); onOpen(id); }}
    >
      <div className={`flex items-center justify-start gap-1 ${valueColor}`}>
        {showTypeIcon && obj?.common?.type && (
          <Tooltip content={obj.common.type}>
            <span className="inline-flex shrink-0"><TypeIcon type={obj.common.type} /></span>
          </Tooltip>
        )}
        {isReadOnly && (
          <Tooltip content={isEn ? 'Read only' : 'Schreibgeschützt'}>
            <Lock size={10} className="text-red-500 dark:text-red-400 shrink-0" />
          </Tooltip>
        )}
        {trendIcon}
        {thresholdStatus === 'exceeded' && <AlertTriangle size={10} aria-label={isEn ? 'Value exceeded limit' : 'Grenzwert überschritten'} />}
        {thresholdStatus === 'warn' && <AlertTriangle size={10} aria-label={isEn ? 'Value near limit' : 'Wert nahe am Grenzwert'} />}
        {state ? (() => {
          const v = formatValue(val);
          if (role === 'url' && typeof val === 'string') {
            let safeHref: string | null = null;
            try { const u = new URL(val); if (u.protocol === 'https:' || u.protocol === 'http:') safeHref = val; } catch { /* invalid URL */ }
            if (safeHref) return <Tooltip content={v}><a href={safeHref} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline truncate max-w-[120px] block">{v}</a></Tooltip>;
          }
          const statesMap = obj?.common?.states;
          const stateLabel = statesMap && val !== null && val !== undefined ? statesMap[String(val)] : undefined;
          const display = stateLabel
            ? `${stateLabel} (${v})`
            : unitSuffix ? `${v} ${unitSuffix}` : v;
          const truncated = display.length > 20 ? display.slice(0, 20) + '…' : display;
          return <Tooltip content={display}><span>{truncated}</span></Tooltip>;
        })() : <span className="text-gray-300 dark:text-gray-600">…</span>}
        <Tooltip content={isEn ? 'Edit value' : 'Wert bearbeiten'}>
          <button
            onClick={(e) => { e.stopPropagation(); onOpen(id); }}
            className="opacity-0 group-hover/value:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity"
          >
            <Pencil size={12} />
          </button>
        </Tooltip>
        {state && (
          <Tooltip content={state.ack ? (isEn ? 'Acknowledged' : 'Bestätigt') : (isEn ? 'Not acknowledged' : 'Nicht bestätigt')}>
            <span
              className={`inline-block w-2 h-2 rounded-full shrink-0 ${state.ack ? 'bg-green-500' : 'bg-yellow-500'}`}
            />
          </Tooltip>
        )}
      </div>
    </td>
  );
});

export default EditableValueCell;

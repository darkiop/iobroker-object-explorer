import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Wrench, Trash2, Copy, PenLine, FolderInput, Lock } from 'lucide-react';
import { usePutObject, useExtendObject, useStateDetail, useSetState, useAllRoles, useAllUnits, useDeleteObject, useAllObjects, useRoomEnums, useFunctionEnums, useUpdateRoomMembership, useUpdateFunctionMembership, useCustomSupportedInstances, useObjectFresh, useScriptUsages } from '../hooks/useStates';
import ConfirmDialog from './ConfirmDialog';
import CopyDatapointModal from './CopyDatapointModal';
import RenameDatapointModal from './RenameDatapointModal';
import MoveDatapointModal from './MoveDatapointModal';
import type { IoBrokerObject, IoBrokerObjectCommon } from '../types/iobroker';
import { useToast } from '../context/ToastContext';
import { useAppSettingsContext } from '../context/UIContext';
import { ColoredId } from '../utils/coloredId';
import DetailsTab from './tabs/DetailsTab';
import JsonTab from './tabs/JsonTab';
import AliasTab from './tabs/AliasTab';
import CustomTab from './tabs/CustomTab';
import ScriptsTab from './tabs/ScriptsTab';

interface Props {
  id: string;
  obj: IoBrokerObject;
  onClose: () => void;
  onOpenHistory?: () => void;
  language?: 'en' | 'de';
  dateFormat?: 'de' | 'us' | 'iso';
  initialTab?: 'details' | 'json' | 'alias' | 'custom' | 'scripts';
}

type Tab = 'details' | 'json' | 'alias' | 'custom' | 'scripts';

export default function ObjectEditModal({ id, obj, onClose, onOpenHistory, language = 'en', dateFormat = 'de', initialTab }: Props) {
  const isEn = language === 'en';
  const showToast = useToast();
  const { appSettings } = useAppSettingsContext();
  const adminBaseUrl = (() => {
    const raw = localStorage.getItem('ioBrokerHost') ?? window.__CONFIG__?.ioBrokerHost ?? '';
    const host = raw ? raw.split(':')[0] : window.location.hostname;
    return `http://${host}:${appSettings.adminPort}`;
  })();
  const [tab, setTab] = useState<Tab>(initialTab ?? 'details');
  const [draft, setDraft] = useState(() => JSON.stringify(obj, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [expertMode, setExpertMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [showMove, setShowMove] = useState(false);

  // Custom Settings tab state
  const [customDraftLoaded, setCustomDraftLoaded] = useState(false);
  const [customDraft, setCustomDraft] = useState<NonNullable<IoBrokerObjectCommon['custom']>>(
    () => obj.common.custom ?? {}
  );
  const [shownAdapters, setShownAdapters] = useState<Set<string>>(
    () => new Set(Object.keys(obj.common.custom ?? {}))
  );
  const [expandedAdapters, setExpandedAdapters] = useState<Set<string>>(() => new Set());
  const { data: freshObj, isFetching: customLoading } = useObjectFresh(id, tab === 'custom' && !customDraftLoaded);
  useEffect(() => {
    if (freshObj && !customDraftLoaded) {
      const custom = freshObj.common?.custom ?? {};
      setCustomDraft(custom);
      setShownAdapters(new Set(Object.keys(custom)));
      setExpandedAdapters(new Set());
      setCustomDraftLoaded(true);
    }
  }, [freshObj, customDraftLoaded]);

  // Alias tab state
  const [aliasSeparateIds, setAliasSeparateIds] = useState(() => typeof obj.common.alias?.id === 'object');
  const [aliasId, setAliasId] = useState(() => typeof obj.common.alias?.id === 'string' ? obj.common.alias.id : '');
  const [aliasReadId, setAliasReadId] = useState(() => typeof obj.common.alias?.id === 'object' ? (obj.common.alias.id.read ?? '') : '');
  const [aliasWriteId, setAliasWriteId] = useState(() => typeof obj.common.alias?.id === 'object' ? (obj.common.alias.id.write ?? '') : '');
  const [aliasRead, setAliasRead] = useState(obj.common.alias?.read ?? '');
  const [aliasWrite, setAliasWrite] = useState(obj.common.alias?.write ?? '');
  const [roomEnumId, setRoomEnumId] = useState<string | null>(() => {
    const hit = Object.keys(obj.enums ?? {}).find((enumId) => enumId.startsWith('enum.rooms.'));
    return hit ?? null;
  });
  const [fnEnumId, setFnEnumId] = useState<string | null>(() => {
    const hit = Object.keys(obj.enums ?? {}).find((enumId) => enumId.startsWith('enum.functions.'));
    return hit ?? null;
  });

  const putObject = usePutObject();
  const extend = useExtendObject();
  const { data: state } = useStateDetail(id);
  const setStateMutation = useSetState();
  const { data: roles } = useAllRoles();
  const { data: units } = useAllUnits();
  const { data: roomEnums = [] } = useRoomEnums();
  const { data: fnEnums = [] } = useFunctionEnums();
  const deleteObject = useDeleteObject();
  const updateRoom = useUpdateRoomMembership();
  const updateFn = useUpdateFunctionMembership();
  const { data: allObjects } = useAllObjects();
  const existingIds = useMemo(() => new Set(Object.keys(allObjects ?? {})), [allObjects]);
  const { data: customInstances = [] } = useCustomSupportedInstances();
  const { data: scriptUsages, isFetching: scriptsFetching, refetch: refetchScripts } = useScriptUsages(id, tab === 'scripts');

  const isWritable = obj.common?.write === true;

  useEffect(() => {
    const nextRoom = Object.keys(obj.enums ?? {}).find((enumId) => enumId.startsWith('enum.rooms.')) ?? null;
    const nextFn = Object.keys(obj.enums ?? {}).find((enumId) => enumId.startsWith('enum.functions.')) ?? null;
    setRoomEnumId(nextRoom);
    setFnEnumId(nextFn);
  }, [id, obj.enums]);

  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const showCloseConfirmRef = useRef(false);

  const isDirty = useMemo(() => {
    if (tab === 'json') return draft !== JSON.stringify(obj, null, 2);
    if (tab === 'alias') {
      const orig = obj.common.alias;
      if (aliasSeparateIds) {
        return aliasReadId !== (typeof orig?.id === 'object' ? (orig.id.read ?? '') : '')
          || aliasWriteId !== (typeof orig?.id === 'object' ? (orig.id.write ?? '') : '')
          || aliasRead !== (orig?.read ?? '')
          || aliasWrite !== (orig?.write ?? '');
      }
      return aliasId !== (typeof orig?.id === 'string' ? orig.id : '')
        || aliasRead !== (orig?.read ?? '')
        || aliasWrite !== (orig?.write ?? '');
    }
    if (tab === 'custom') {
      return JSON.stringify(customDraft) !== JSON.stringify(obj.common.custom ?? {});
    }
    return false;
  }, [tab, draft, obj, aliasSeparateIds, aliasId, aliasReadId, aliasWriteId, aliasRead, aliasWrite, customDraft]);
  const isDirtyRef = useRef(isDirty);
  const onCloseRef = useRef(onClose);
  // useLayoutEffect: runs synchronously after commit, before paint — guaranteed up-to-date
  useLayoutEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
  useLayoutEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  function openCloseConfirm() {
    showCloseConfirmRef.current = true;
    setShowCloseConfirm(true);
  }
  function cancelCloseConfirm() {
    showCloseConfirmRef.current = false;
    setShowCloseConfirm(false);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (showCloseConfirmRef.current) return;
      if (isDirtyRef.current) { showCloseConfirmRef.current = true; setShowCloseConfirm(true); return; }
      onCloseRef.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function handleExtend(common: Record<string, unknown>) {
    extend.mutate({ id, common });
  }

  function handleSetValue(val: unknown) {
    setStateMutation.mutate({ id, val });
  }

  function handleSaveJson() {
    let parsed: IoBrokerObject;
    try {
      parsed = JSON.parse(draft);
    } catch (e) {
      setJsonError((isEn ? 'Invalid JSON: ' : 'Ungültiges JSON: ') + (e instanceof Error ? e.message : String(e)));
      return;
    }
    setJsonError(null);
    putObject.mutate({ id, obj: parsed }, {
      onSuccess: onClose,
      onError: (err) => setJsonError((isEn ? 'Save failed: ' : 'Speichern fehlgeschlagen: ') + String(err)),
    });
  }

  function handleSaveCustom() {
    putObject.mutate({ id, obj: { ...obj, common: { ...obj.common, custom: customDraft } } }, {
      onSuccess: onClose,
      onError: (err) => showToast((isEn ? 'Save failed: ' : 'Speichern fehlgeschlagen: ') + String(err)),
    });
  }

  function handleSaveAlias() {
    const newCommon = { ...obj.common };
    const formulas = {
      ...(aliasRead.trim() ? { read: aliasRead.trim() } : {}),
      ...(aliasWrite.trim() ? { write: aliasWrite.trim() } : {}),
    };
    if (aliasSeparateIds) {
      const rId = aliasReadId.trim();
      const wId = aliasWriteId.trim();
      if (rId || wId) {
        newCommon.alias = {
          id: { ...(rId ? { read: rId } : {}), ...(wId ? { write: wId } : {}) },
          ...formulas,
        };
      } else {
        delete newCommon.alias;
      }
    } else {
      const trimmedId = aliasId.trim();
      if (trimmedId) {
        newCommon.alias = { id: trimmedId, ...formulas };
      } else {
        delete newCommon.alias;
      }
    }
    putObject.mutate({ id, obj: { ...obj, common: newCommon } }, {
      onSuccess: onClose,
      onError: (err) => showToast((isEn ? 'Save failed: ' : 'Speichern fehlgeschlagen: ') + String(err)),
    });
  }

  function handleSave() {
    if (tab === 'json') { handleSaveJson(); return; }
    if (tab === 'alias') { handleSaveAlias(); return; }
    if (tab === 'custom') { handleSaveCustom(); return; }
    onClose();
  }

  function handleSetRoom(nextRoomEnumId: string | null) {
    const oldRoomEnumId = roomEnumId;
    if (oldRoomEnumId === nextRoomEnumId) return;
    setRoomEnumId(nextRoomEnumId);
    updateRoom.mutate(
      { objectId: id, oldRoomEnumId, newRoomEnumId: nextRoomEnumId },
      { onError: () => setRoomEnumId(oldRoomEnumId) }
    );
  }

  function handleSetFunction(nextFnEnumId: string | null) {
    const oldFnEnumId = fnEnumId;
    if (oldFnEnumId === nextFnEnumId) return;
    setFnEnumId(nextFnEnumId);
    updateFn.mutate(
      { objectId: id, oldFnEnumId, newFnEnumId: nextFnEnumId },
      { onError: () => setFnEnumId(oldFnEnumId) }
    );
  }

  return createPortal(
    <>
      {showCopy && (
        <CopyDatapointModal
          sourceId={id}
          sourceObj={obj}
          existingIds={existingIds}
          language={language}
          onClose={() => setShowCopy(false)}
        />
      )}
      {showRename && (
        <RenameDatapointModal
          sourceId={id}
          sourceObj={obj}
          sourceState={state}
          existingIds={existingIds}
          language={language}
          onClose={() => setShowRename(false)}
          onRenamed={() => { setShowRename(false); onClose(); }}
        />
      )}
      {showMove && (
        <MoveDatapointModal
          sourceId={id}
          sourceObj={obj}
          sourceState={state}
          existingIds={existingIds}
          language={language}
          onClose={() => setShowMove(false)}
          onMoved={() => { setShowMove(false); onClose(); }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={isEn ? 'Delete 1 datapoint' : '1 Datenpunkt löschen'}
          message={id}
          onConfirm={() => { deleteObject.mutate(id, { onSuccess: onClose }); setConfirmDelete(false); }}
          onCancel={() => setConfirmDelete(false)}
          language={language}
        />
      )}
      {showCloseConfirm && (
        <ConfirmDialog
          title={isEn ? 'Discard changes?' : 'Änderungen verwerfen?'}
          message={isEn ? 'Unsaved changes will be lost.' : 'Nicht gespeicherte Änderungen gehen verloren.'}
          onConfirm={() => { cancelCloseConfirm(); onClose(); }}
          onCancel={cancelCloseConfirm}
          language={language}
        />
      )}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop-in bg-black/60 backdrop-blur-sm p-4"
        onClick={() => { if (isDirtyRef.current) { openCloseConfirm(); } else { onClose(); } }}
      >
        <div
          className="bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl flex flex-col h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <span className="font-semibold text-sm text-gray-700 dark:text-gray-200 truncate pr-4 flex items-center gap-1.5">
              {obj.common?.write === false && (
                <Lock size={13} className="text-red-500 dark:text-red-400 shrink-0" />
              )}
              {isEn ? 'Edit object:' : 'Objekt bearbeiten:'}{' '}
              <ColoredId id={id} className="font-mono text-xs" />
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {isWritable && (
                <button
                  onClick={() => setExpertMode((e) => !e)}
                  title={expertMode ? (isEn ? 'Disable expert mode' : 'Expertenmodus deaktivieren') : (isEn ? 'Expert mode' : 'Expertenmodus')}
                  className={`p-1.5 rounded-lg transition-colors ${
                    expertMode
                      ? 'text-orange-400 bg-orange-400/10 hover:bg-orange-400/20'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <Wrench size={15} />
                </button>
              )}
              <button onClick={() => { if (isDirtyRef.current) { openCloseConfirm(); } else { onClose(); } }} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0 px-5">
            {(['details', 'json', ...(id.startsWith('alias.') ? ['alias'] : []), 'custom', 'scripts'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setJsonError(null); }}
                className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                  tab === t
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {t === 'details' ? 'Details' : t === 'json' ? 'JSON' : t === 'alias' ? 'Alias' : t === 'custom' ? 'Custom' : (isEn ? 'Scripts' : 'Skripte')}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {tab === 'details' && (
              <DetailsTab
                id={id}
                obj={obj}
                language={language}
                dateFormat={dateFormat}
                expertMode={expertMode}
                roomEnumId={roomEnumId}
                fnEnumId={fnEnumId}
                roles={roles ?? []}
                units={units ?? []}
                roomEnums={roomEnums}
                fnEnums={fnEnums}
                state={state}
                extendPending={extend.isPending}
                setValuePending={setStateMutation.isPending}
                setRoomPending={updateRoom.isPending}
                setFunctionPending={updateFn.isPending}
                onExtend={handleExtend}
                onSetValue={handleSetValue}
                onSetRoom={handleSetRoom}
                onSetFunction={handleSetFunction}
                onOpenHistory={onOpenHistory}
                onClose={onClose}
              />
            )}

            {tab === 'json' && (
              <JsonTab
                draft={draft}
                jsonError={jsonError}
                onDraftChange={(v) => { setDraft(v); setJsonError(null); }}
              />
            )}

            {tab === 'alias' && (
              <AliasTab
                obj={obj}
                language={language}
                aliasSeparateIds={aliasSeparateIds}
                setAliasSeparateIds={setAliasSeparateIds}
                aliasId={aliasId}
                setAliasId={setAliasId}
                aliasReadId={aliasReadId}
                setAliasReadId={setAliasReadId}
                aliasWriteId={aliasWriteId}
                setAliasWriteId={setAliasWriteId}
                aliasRead={aliasRead}
                setAliasRead={setAliasRead}
                aliasWrite={aliasWrite}
                setAliasWrite={setAliasWrite}
              />
            )}

            {tab === 'custom' && (
              <CustomTab
                language={language}
                customDraft={customDraft}
                setCustomDraft={setCustomDraft}
                shownAdapters={shownAdapters}
                setShownAdapters={setShownAdapters}
                expandedAdapters={expandedAdapters}
                setExpandedAdapters={setExpandedAdapters}
                customLoading={customLoading}
                customDraftLoaded={customDraftLoaded}
                customInstances={customInstances}
              />
            )}

            {tab === 'scripts' && (
              <ScriptsTab
                id={id}
                language={language}
                adminBaseUrl={adminBaseUrl}
                scriptUsages={scriptUsages}
                scriptsFetching={scriptsFetching}
                refetchScripts={refetchScripts}
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-red-300 dark:border-red-700/50 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title={isEn ? 'Delete datapoint' : 'Datenpunkt löschen'}
              >
                <Trash2 size={12} />
                {isEn ? 'Delete' : 'Löschen'}
              </button>
              <button
                type="button"
                onClick={() => setShowCopy(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title={isEn ? 'Copy datapoint' : 'Datenpunkt kopieren'}
              >
                <Copy size={12} />
                {isEn ? 'Copy' : 'Kopieren'}
              </button>
              <button
                type="button"
                onClick={() => setShowRename(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title={isEn ? 'Rename datapoint' : 'Datenpunkt umbenennen'}
              >
                <PenLine size={12} />
                {isEn ? 'Rename' : 'Umbenennen'}
              </button>
              <button
                type="button"
                onClick={() => setShowMove(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title={isEn ? 'Move datapoint' : 'Datenpunkt verschieben'}
              >
                <FolderInput size={12} />
                {isEn ? 'Move' : 'Verschieben'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { if (isDirtyRef.current) { openCloseConfirm(); } else { onClose(); } }}
                className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {isEn ? 'Cancel' : 'Abbrechen'}
              </button>
              <button
                onClick={handleSave}
                disabled={putObject.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50"
              >
                <Save size={14} />
                {putObject.isPending ? (isEn ? 'Saving…' : 'Speichern…') : (isEn ? 'Save' : 'Speichern')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

import React, { useState, useMemo, useRef, useEffect, useImperativeHandle } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { X, History, Mic2, Trash2, Plus, Minus, Lock, Link2, ChevronDown, ChevronRight, Wrench, FolderOpen, Folder, Cpu, Layers, FileCode2, Copy, Pencil } from 'lucide-react';
import { useExtendObject, useAllRoles, useAllUnits, useDeleteObject, useRoomEnums, useUpdateRoomMembership, useUpdateRoomMembershipBatch, useFunctionEnums, useUpdateFunctionMembership, useUpdateFunctionMembershipBatch, useAllScriptSources } from '../../hooks/useStates';
import { hasHistory, hasSmartName, isGlobPattern } from '../../api/iobroker';
import { useStateListModals } from '../../hooks/useStateListModals';
import { useStateListView } from '../../hooks/useStateListView';
import StateListToolbar from './StateListToolbar';
import StateListModals from '../modals/StateListModals';
import { useAllObjects } from '../../hooks/useStates';
import type { IoBrokerState, IoBrokerObject } from '../../types/iobroker';
import { copyText, copyToClipboard } from '../../utils/clipboard';
import { formatValue, formatTimestamp } from '../../utils/format';
import { ColoredId } from '../../utils/coloredId';
import { getTypeColor } from '../../utils/typeColor';
import { getRoleColor } from '../../utils/roleColor';
import { useToast } from '../../context/ToastContext';
import { usePanelContext } from '../../context/PanelContext';
import { useSelectionContext } from '../../context/SelectionContext';
import { useAppSettingsContext } from '../../context/UIContext';
import BatchComboControl, { EMPTY_SENTINEL } from './BatchComboControl';
import TsRangeFilterControl, { parseTsFilter } from '../ui/TsRangeFilterControl';
import SortHeader from '../ui/SortHeader';
import StyledCheckbox from '../ui/StyledCheckbox';
import StateRow from './StateRow';
import { getObjectName } from './StateListUtils';
import { DEL_COL_WIDTH, VIRTUAL_ROW_HEIGHT, VIRTUAL_OVERSCAN } from './StateListConstants';
import { useColumnResize, LS_WIDTHS_KEY } from '../../hooks/useColumnResize';
import { useBatchEdit } from '../../hooks/useBatchEdit';

export interface StateListHandle {
  fitToContainer: () => void;
}

interface StateListProps {
  ids: string[];
  states: Record<string, IoBrokerState>;
  objects: Record<string, IoBrokerObject>;
  roomMap: Record<string, string>;
  functionMap: Record<string, string>;
  aliasMap: Map<string, string[]>;
  allObjectIds: Set<string>;
  exportIds: string[];
  onNavigateTo: (ids: string[]) => void;
  onOpenInOtherPanel?: (id: string) => void;
  forceHideToolbarLabels?: boolean;
  visibleColsOverride?: SortKey[];
  onVisibleColsChange?: (cols: SortKey[]) => void;
  groupByPathOverride?: boolean;
  onToggleGroupByPathOverride?: () => void;
  historyIds?: Set<string>;
  smartIds?: Set<string>;
  onVisibleIdsChange?: (ids: string[]) => void;
  dragEnabled?: boolean;
}



export type { SortKey, DateFormatSetting } from './StateListColumns';
export { ALL_COLUMNS, getColumnLabel, DEFAULT_COLS } from './StateListColumns';
import type { SortKey } from './StateListColumns';
import { DEFAULT_COLS, BUILTIN_DEFAULT_WIDTHS, BUILTIN_MIN_WIDTHS, BUILTIN_MAX_WIDTHS } from './StateListColumns';



function StateList({ ids, states, objects, roomMap, functionMap, aliasMap, allObjectIds, exportIds, onNavigateTo, onOpenInOtherPanel, forceHideToolbarLabels, visibleColsOverride, onVisibleColsChange, groupByPathOverride, onToggleGroupByPathOverride, historyIds, smartIds, onVisibleIdsChange, dragEnabled = false }: StateListProps, ref: React.ForwardedRef<StateListHandle>) {
  const { colFilters, handleColFilterChange: onColFilterChange, pattern, treeFilter, handleClearTreeFilter: onClearTreeFilter, sidebarToggleSeq, fulltextEnabled, handleTreeScope } = usePanelContext();
  const { selectedId, setSelectedId: onSelect, setHistoryModalId: _setHistoryModalId, setEnumManagerOpen, setAliasReplaceInitialStr, setEditInitialTab, setAutoAliasDeviceId } = useSelectionContext();
  const { appSettings, expertMode, scriptUsedIds, scriptsFetching, scriptLastUpdated, setScriptUsedIds, setConfirmScriptRefresh, handleToggleGroupByPath: _handleToggleGroupByPath, persistSettings } = useAppSettingsContext();
  const onToggleGroupByPath = onToggleGroupByPathOverride ?? _handleToggleGroupByPath;

  const { language = 'en', dateFormat = 'de', visibleCols: settingsVisibleCols, toolbarLabels = true, tableFontSize = 'normal', showDesc = true, groupByPath: settingsGroupByPath = false, shortenGroupPaths = true, showObjectIcons = false, showObjectTypeIcons = true, customDefaultWidths, customMinWidths, customMaxWidths, pageSize, animateGroupExpand = false, hideAliasSubRows = false, showUnitInValue = false } = appSettings;
  const groupByPath = groupByPathOverride !== undefined ? groupByPathOverride : settingsGroupByPath;
  const onOpenEnumManager = React.useCallback(() => setEnumManagerOpen(true), [setEnumManagerOpen]);
  const onOpenAliasReplace = React.useCallback((initialStr?: string) => setAliasReplaceInitialStr(initialStr ?? null), [setAliasReplaceInitialStr]);
  const onScriptsClick = React.useCallback((id: string) => { onSelect(id); setEditInitialTab('scripts'); }, [onSelect, setEditInitialTab]);
  const onPageSizeChange = React.useCallback((size: number) => persistSettings({ ...appSettings, pageSize: size }), [persistSettings, appSettings]);

  const effectiveDefaults: Record<SortKey, number> = { ...BUILTIN_DEFAULT_WIDTHS, ...(customDefaultWidths ?? {}) };
  const effectiveMin: Partial<Record<SortKey, number>> = { ...BUILTIN_MIN_WIDTHS, ...(customMinWidths ?? {}) };
  const effectiveMax: Partial<Record<SortKey, number>> = { ...BUILTIN_MAX_WIDTHS, ...(customMaxWidths ?? {}) };
  const isEn = language === 'en';
  const {
    sortKey, setSortKey,
    sortDir, setSortDir,
    visibleCols, setVisibleCols,
    showStats, setShowStats,
    collapsedPrefixes, setCollapsedPrefixes,
    animatingPrefixes, setAnimatingPrefixes,
    collapsingPrefixes, setCollapsingPrefixes,
    animTimersRef,
    collapseTimersRef,
    allSepPrefixesRef,
    animatedSepEls,
  } = useStateListView(visibleColsOverride ?? settingsVisibleCols ?? DEFAULT_COLS);
  const { data: scriptSources } = useAllScriptSources(visibleCols.includes('scripts'));
  const { data: allObjectsData } = useAllObjects();
  const allObjects = allObjectsData ?? {} as Record<string, IoBrokerObject>;
  const allHistoryIds = useMemo(() => {
    if (historyIds) return historyIds;
    const s = new Set<string>(); for (const [id, obj] of Object.entries(allObjects)) { if (hasHistory(obj)) s.add(id); } return s;
  }, [historyIds, allObjects]);
  const allSmartIds = useMemo(() => {
    if (smartIds) return smartIds;
    const s = new Set<string>(); for (const [id, obj] of Object.entries(allObjects)) { if (hasSmartName(obj)) s.add(id); } return s;
  }, [smartIds, allObjects]);
  const containerRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const autoFitRef = useRef(true);
  const { colWidths, setColWidths, handleResizeStart, handleAutoFit, fitToContainer } = useColumnResize({
    effectiveDefaults, effectiveMin, effectiveMax, visibleCols, containerRef,
  });

  const isFilterActive = !!(pattern && pattern !== '*') || !!treeFilter;
  const [headerHeight, setHeaderHeight] = useState(0);
  const {
    newDatapointOpen, setNewDatapointOpen,
    newDatapointPrefix, setNewDatapointPrefix,
    newAliasOpen, setNewAliasOpen,
    newMenuOpen, setNewMenuOpen,
    newMenuRef,
    importOpen, setImportOpen,
    optimizeOpen, setOptimizeOpen,
    optimizePath, setOptimizePath,
    historyModalId, setHistoryModalId,
    historyInitialExtra, setHistoryInitialExtra,
    deletingId, setDeletingId,
    deletingGroupPrefix, setDeletingGroupPrefix,
    valueEditId, setValueEditId,
    confirmResetLs, setConfirmResetLs,
    multiDeleteOpen, setMultiDeleteOpen,
    aliasSourceId, setAliasSourceId,
    copySourceId, setCopySourceId,
    renameId, setRenameId,
    moveId, setMoveId,
    editObjId, setEditObjId,
    editObjInitialTab, setEditObjInitialTab,
    exportMenuOpen, setExportMenuOpen,
    exportMenuRef,
    ctxMenu, setCtxMenu,
    sepCtxMenu, setSepCtxMenu,
    checkedSepPrefix, setCheckedSepPrefix,
  } = useStateListModals();
  const showToolbarLabels = forceHideToolbarLabels ? false : toolbarLabels;
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [colFiltersDraft, setColFiltersDraft] = useState<Partial<Record<SortKey, string>>>(colFilters);
  const colFilterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const propagatingRef = useRef(false);
  const showToast = useToast();
  const deleteObject = useDeleteObject();
  const extend = useExtendObject();
  const { data: roles = [] } = useAllRoles();
  const { data: units = [] } = useAllUnits();
  const { data: roomEnums = [] } = useRoomEnums();
  const { data: fnEnums = [] } = useFunctionEnums();
  const updateRoom = useUpdateRoomMembership();
  const updateFn = useUpdateFunctionMembership();
  const updateRoomBatch = useUpdateRoomMembershipBatch();
  const updateFnBatch = useUpdateFunctionMembershipBatch();
  const {
    batchRole, setBatchRole,
    batchUnit, setBatchUnit,
    batchRoomEnumId, setBatchRoomEnumId,
    batchFnEnumId, setBatchFnEnumId,
    batchMin, setBatchMin,
    batchMax, setBatchMax,
    batchDesc, setBatchDesc,
    batchDescClear, setBatchDescClear,
    batchCanApply,
    batchProgress,
    handleBatchApply,
  } = useBatchEdit({
    checkedIds,
    extendMutateAsync: extend.mutateAsync,
    updateRoomBatchMutateAsync: updateRoomBatch.mutateAsync,
    updateFnBatchMutateAsync: updateFnBatch.mutateAsync,
    showToast,
    isEn,
  });
  const [roomEditId, setRoomEditId] = useState<string | null>(null);
  const [fnEditId, setFnEditId] = useState<string | null>(null);
  const updateRoomMutateRef = useRef(updateRoom.mutate);
  const updateFnMutateRef = useRef(updateFn.mutate);

  useEffect(() => {
    updateRoomMutateRef.current = updateRoom.mutate;
  }, [updateRoom.mutate]);

  useEffect(() => {
    updateFnMutateRef.current = updateFn.mutate;
  }, [updateFn.mutate]);

  function handleColChange(cols: SortKey[]) {
    if (onVisibleColsChange) {
      onVisibleColsChange(cols);
      setVisibleCols(cols);
    } else {
      persistSettings({ ...appSettings, visibleCols: cols });
    }
  }

  function handleHideCol(key: SortKey) {
    handleColChange(visibleCols.filter((k) => k !== key));
  }

  useImperativeHandle(ref, () => ({ fitToContainer }), []);

  useEffect(() => {
    if (!autoFitRef.current || ids.length === 0) return;
    autoFitRef.current = false;
    requestAnimationFrame(() => fitToContainer());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  useEffect(() => {
    const container = containerRef.current;
    const thead = theadRef.current;
    if (!container) return;

    let rafId: number | null = null;
    const measure = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        setHeaderHeight(thead?.offsetHeight ?? 0);
      });
    };
    measure();

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro) {
      ro.observe(container);
      if (thead) ro.observe(thead);
    } else {
      window.addEventListener('resize', measure);
    }
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    if (!sidebarToggleSeq) return;
    fitToContainer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarToggleSeq]);

  useEffect(() => {
    if (visibleColsOverride) { setVisibleCols(visibleColsOverride); return; }
    if (!settingsVisibleCols || settingsVisibleCols.length === 0) return;
    setVisibleCols(settingsVisibleCols);
  }, [settingsVisibleCols, visibleColsOverride]);

  // Sync external colFilters → draft (e.g. context menu, clear from App.tsx)
  useEffect(() => {
    if (propagatingRef.current) return;
    setColFiltersDraft(colFilters);
  }, [colFilters]);

  useEffect(() => {
    if (fulltextEnabled && pattern && !isGlobPattern(pattern) && pattern !== '*') {
      setSortKey('relevanz');
      setSortDir('asc');
    } else {
      setSortKey('id');
      setSortDir('asc');
    }
  }, [pattern]);

  function setDraftAndDebounce(draft: Partial<Record<SortKey, string>>) {
    setColFiltersDraft(draft);
    if (colFilterDebounceRef.current) clearTimeout(colFilterDebounceRef.current);
    colFilterDebounceRef.current = setTimeout(() => {
      colFilterDebounceRef.current = null;
      propagatingRef.current = true;
      onColFilterChange(draft);
      setTimeout(() => { propagatingRef.current = false; }, 0);
    }, 350);
  }

  function setDraftAndPropagate(draft: Partial<Record<SortKey, string>>) {
    if (colFilterDebounceRef.current) { clearTimeout(colFilterDebounceRef.current); colFilterDebounceRef.current = null; }
    setColFiltersDraft(draft);
    propagatingRef.current = true;
    onColFilterChange(draft);
    setTimeout(() => { propagatingRef.current = false; }, 0);
  }

  const show = (key: SortKey) => visibleCols.includes(key);
  const w = (key: SortKey) => colWidths[key];

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sortNeedsState = sortKey === 'value' || sortKey === 'ack' || sortKey === 'ts';
  const sortNeedsObject = sortKey === 'name' || sortKey === 'role' || sortKey === 'unit' || sortKey === 'type';
  const sortNeedsRoomMap = sortKey === 'room';
  const sortNeedsFunctionMap = sortKey === 'function';

  const sortedIds = useMemo(() => {
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...ids].sort((a, b) => {
      const stateA = states[a];
      const stateB = states[b];
      const objA = objects[a];
      const objB = objects[b];

      switch (sortKey) {
        case 'id':
          return mul * a.localeCompare(b);
        case 'name':
          return mul * getObjectName(objA).localeCompare(getObjectName(objB));
        case 'value': {
          const vA = stateA?.val;
          const vB = stateB?.val;
          if (vA == null && vB == null) return 0;
          if (vA == null) return mul;
          if (vB == null) return -mul;
          if (typeof vA === 'number' && typeof vB === 'number') return mul * (vA - vB);
          return mul * String(vA).localeCompare(String(vB));
        }
        case 'room':
          return mul * (roomMap[a] || '').localeCompare(roomMap[b] || '');
        case 'function':
          return mul * (functionMap[a] || '').localeCompare(functionMap[b] || '');
        case 'type':
          return mul * (objA?.common?.type || objA?.type || '').localeCompare(objB?.common?.type || objB?.type || '');
        case 'role':
          return mul * (objA?.common?.role || '').localeCompare(objB?.common?.role || '');
        case 'unit':
          return mul * (objA?.common?.unit || '').localeCompare(objB?.common?.unit || '');
        case 'ack': {
          const aA = stateA?.ack ? 1 : 0;
          const aB = stateB?.ack ? 1 : 0;
          return mul * (aA - aB);
        }
        case 'ts':
          return mul * ((stateA?.ts || 0) - (stateB?.ts || 0));
        case 'relevanz':
          return 0; // preserve relevance order from input
        default:
          return 0;
      }
    });
  }, [
    ids,
    sortKey,
    sortDir,
    sortNeedsState ? states : null,
    sortNeedsObject ? objects : null,
    sortNeedsRoomMap ? roomMap : null,
    sortNeedsFunctionMap ? functionMap : null,
  ]);

  // metadata + icon filters applied in App.tsx before pagination
  // value/timestamp/scripts are filtered here (page-local)
  const valueFilterRaw = colFilters.value?.trim() || '';
  const valueFilterEmpty = valueFilterRaw === EMPTY_SENTINEL;
  const valueFilter = valueFilterEmpty ? '' : valueFilterRaw.toLowerCase();
  const tsFilterParsed = useMemo(() => parseTsFilter(colFilters.ts || ''), [colFilters.ts]);
  const scriptsFilterActive = colFilters.scripts === '1';
  const ackFilter = colFilters.ack || '';
  const filteredIds = useMemo(() => {
    if (!valueFilter && !valueFilterEmpty && tsFilterParsed.mode === 'none' && !scriptsFilterActive && !ackFilter) return sortedIds;
    return sortedIds.filter((id) => {
      if (scriptsFilterActive && !scriptSources?.includes(id)) return false;
      if (ackFilter === 'yes' && !states[id]?.ack) return false;
      if (ackFilter === 'no' && states[id]?.ack !== false) return false;
      let valueOk: boolean;
      if (valueFilterEmpty) {
        valueOk = states[id]?.val == null;
      } else {
        valueOk = !valueFilter || formatValue(states[id]?.val).toLowerCase().includes(valueFilter);
      }
      let tsOk = true;
      if (tsFilterParsed.mode === 'text') {
        tsOk = formatTimestamp(states[id]?.ts ?? NaN, dateFormat).toLowerCase().includes(tsFilterParsed.text || '');
      } else if (tsFilterParsed.mode === 'range') {
        const ts = states[id]?.ts;
        tsOk = Number.isFinite(ts);
        if (tsOk && tsFilterParsed.from !== undefined) tsOk = (ts as number) >= tsFilterParsed.from;
        if (tsOk && tsFilterParsed.to !== undefined) tsOk = (ts as number) <= tsFilterParsed.to;
      }
      return valueOk && tsOk;
    });
  }, [sortedIds, valueFilter, valueFilterEmpty, tsFilterParsed, dateFormat, scriptsFilterActive, ackFilter, scriptSources,
    (valueFilter || valueFilterEmpty || tsFilterParsed.mode !== 'none' || ackFilter) ? states : null]);

  type DisplayItem = { kind: 'row'; id: string; depth: number; parentPrefix?: string } | { kind: 'sep'; prefix: string; isState: boolean; depth: number; parentPrefix?: string };

  // All ancestor prefixes at every level, used for collapse/expand logic
  const allSepPrefixes = useMemo((): Set<string> => {
    if (!groupByPath) return new Set();
    const result = new Set<string>();
    for (const id of filteredIds) {
      const t = allObjects[id]?.type;
      if (t === 'folder' || t === 'device' || t === 'channel') {
        result.add(id);
      }
      const parts = id.split('.');
      for (let i = 1; i < parts.length; i++) {
        result.add(parts.slice(0, i).join('.'));
      }
    }
    return result;
  }, [filteredIds, groupByPath, allObjects]);

  allSepPrefixesRef.current = allSepPrefixes;

  useEffect(() => {
    if (!groupByPath || !isFilterActive) { setCollapsedPrefixes(null); return; }
    // Auto-expand depth 0+1, collapse depth >= 2 when a search filter is active.
    // Uses filteredIdsRef so background state refreshes don't re-trigger this.
    const ids = filteredIdsRef.current;
    const sepPrefixes = new Set<string>();
    for (const id of ids) {
      const parts = id.split('.');
      for (let i = 1; i < parts.length; i++) {
        sepPrefixes.add(parts.slice(0, i).join('.'));
      }
    }
    const toCollapse = new Set<string>();
    for (const prefix of sepPrefixes) {
      const parts = prefix.split('.');
      let depth = 0;
      for (let i = 1; i < parts.length; i++) {
        if (sepPrefixes.has(parts.slice(0, i).join('.'))) depth++;
      }
      if (depth >= 2) toCollapse.add(prefix);
    }
    setCollapsedPrefixes(toCollapse);
  }, [groupByPath, isFilterActive]);

  const displayItems = useMemo((): DisplayItem[] => {
    if (!groupByPath) return filteredIds.map((id) => ({ kind: 'row' as const, id, depth: 0 }));

    const filteredIdSet = new Set(filteredIds);

    // Build parent→childPrefixes and parent→directLeaves maps from allSepPrefixes
    const childPrefixesMap = new Map<string, Set<string>>();
    const rootPrefixes = new Set<string>();
    for (const prefix of allSepPrefixes) {
      const parts = prefix.split('.');
      if (parts.length === 1) {
        rootPrefixes.add(prefix);
      } else {
        const parent = parts.slice(0, -1).join('.');
        if (allSepPrefixes.has(parent)) {
          if (!childPrefixesMap.has(parent)) childPrefixesMap.set(parent, new Set());
          childPrefixesMap.get(parent)!.add(prefix);
        } else {
          rootPrefixes.add(prefix);
        }
      }
    }

    const directLeavesMap = new Map<string, string[]>();
    for (const id of filteredIds) {
      if (allSepPrefixes.has(id)) continue; // appears as sep row, not a leaf
      const parts = id.split('.');
      const parent = parts.length > 1 ? parts.slice(0, -1).join('.') : '';
      if (!directLeavesMap.has(parent)) directLeavesMap.set(parent, []);
      directLeavesMap.get(parent)!.push(id);
    }

    const items: DisplayItem[] = [];
    function visit(prefix: string, depth: number, parentPrefix?: string) {
      items.push({ kind: 'sep', prefix, depth, isState: filteredIdSet.has(prefix), parentPrefix });
      const isCollapsed = (collapsedPrefixes === null || collapsedPrefixes.has(prefix)) && !collapsingPrefixes.has(prefix);
      if (!isCollapsed) {
        const children = [...(childPrefixesMap.get(prefix) ?? [])].sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: 'base' })
        );
        for (const child of children) visit(child, depth + 1, prefix);
        for (const id of (directLeavesMap.get(prefix) ?? [])) {
          items.push({ kind: 'row', id, depth: depth + 1, parentPrefix: prefix });
        }
      }
    }

    const sortedRoots = [...rootPrefixes].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
    for (const root of sortedRoots) visit(root, 0);

    // Leaves with no ancestor prefix (edge case: single-part IDs)
    for (const id of (directLeavesMap.get('') ?? [])) {
      items.push({ kind: 'row', id, depth: 0 });
    }

    return items;
  }, [filteredIds, groupByPath, collapsedPrefixes, collapsingPrefixes, allSepPrefixes]);

  const activeDisplayItems: DisplayItem[] = displayItems;


  const totalWidth = DEL_COL_WIDTH + visibleCols.reduce((sum, k) => sum + colWidths[k], 0);

  const allOnPageChecked = filteredIds.length > 0 && filteredIds.every((id) => checkedIds.has(id));
  const someChecked = filteredIds.some((id) => checkedIds.has(id));

  function toggleCheckAll() {
    if (allOnPageChecked) {
      setCheckedIds((prev) => { const next = new Set(prev); filteredIds.forEach((id) => next.delete(id)); return next; });
    } else {
      setCheckedIds((prev) => new Set([...prev, ...filteredIds]));
    }
  }

  function handleDeleteOne(id: string) {
    deleteObject.mutate(id, {
      onSuccess: () => showToast(isEn ? `Deleted: ${id}` : `Gelöscht: ${id}`, 'success'),
      onError: (err) => showToast((isEn ? 'Delete failed: ' : 'Löschen fehlgeschlagen: ') + String(err)),
    });
    setCheckedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }

  function handleDeleteAll(ids: string[]) {
    Promise.all(ids.map((id) => deleteObject.mutateAsync(id)))
      .then(() => {
        setCheckedIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
        showToast(isEn ? `${ids.length} datapoints deleted` : `${ids.length} Datenpunkte gelöscht`, 'success');
      })
      .catch((err) => showToast((isEn ? 'Delete failed: ' : 'Löschen fehlgeschlagen: ') + String(err)));
  }

  const lastCheckedIdRef = useRef<string | null>(null);
  const filteredIdsRef = useRef<string[]>(filteredIds);
  filteredIdsRef.current = filteredIds;
  const handleCheckRow = React.useCallback((id: string, checked: boolean, shiftKey?: boolean) => {
    if (shiftKey && checked && lastCheckedIdRef.current) {
      const ids = filteredIdsRef.current;
      const lastId = lastCheckedIdRef.current;
      const lastIdx = ids.indexOf(lastId);
      const curIdx = ids.indexOf(id);
      if (lastIdx !== -1 && curIdx !== -1) {
        const [from, to] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
        setCheckedIds((prev) => {
          const next = new Set(prev);
          ids.slice(from, to + 1).forEach((rid) => next.add(rid));
          return next;
        });
        lastCheckedIdRef.current = id;
        return;
      }
    }
    setCheckedIds((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
    if (checked) {
      lastCheckedIdRef.current = id;
    }
  }, []);

  const handleRowContextMenu = React.useCallback((x: number, y: number, id: string) => {
    setCtxMenu({ x, y, id });
  }, []);

  const handleRowHistoryClick = React.useCallback((id: string) => {
    setHistoryModalId(id);
  }, []);

  const handleRowDeleteClick = React.useCallback((id: string) => {
    setDeletingId(id);
  }, []);
  const handleRowEditJsonClick = React.useCallback((id: string) => {
    setEditObjInitialTab('json');
    setEditObjId(id);
  }, []);
  const handleOpenValueModal = React.useCallback((id: string) => {
    setValueEditId(id);
  }, []);

  const handleSelectRoom = React.useCallback((objectId: string, oldRoomEnumId: string | null, newRoomEnumId: string | null) => {
    updateRoomMutateRef.current({ objectId, oldRoomEnumId, newRoomEnumId });
  }, []);

  const handleSelectFunction = React.useCallback((objectId: string, oldFnEnumId: string | null, newFnEnumId: string | null) => {
    updateFnMutateRef.current({ objectId, oldFnEnumId, newFnEnumId });
  }, []);

  const handleRoomEditEnd = React.useCallback(() => setRoomEditId(null), []);
  const handleFnEditEnd = React.useCallback(() => setFnEditId(null), []);

  function handleExport(format: 'json' | 'csv') {
    const allIds = exportIds ?? ids;
    const rows = allIds.map((id) => {
      const obj = objects[id];
      return {
        id,
        name: obj?.common?.name ? (typeof obj.common.name === 'string' ? obj.common.name : (obj.common.name.de || obj.common.name.en || '')) : '',
        type: obj?.common?.type || obj?.type || '',
        role: obj?.common?.role || '',
        unit: obj?.common?.unit || '',
        room: roomMap[id] || '',
        function: functionMap[id] || '',
        read: obj?.common?.read !== false ? 'true' : 'false',
        write: obj?.common?.write === true ? 'true' : 'false',
      };
    });
    let content: string;
    let mime: string;
    let ext: string;
    if (format === 'json') {
      content = JSON.stringify(rows, null, 2);
      mime = 'application/json';
      ext = 'json';
    } else {
      const headers = ['id', 'name', 'type', 'role', 'unit', 'room', 'function', 'read', 'write'];
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
      content = [headers.join(';'), ...rows.map((r) => headers.map((h) => escape(String(r[h as keyof typeof r]))).join(';'))].join('\r\n');
      mime = 'text/csv;charset=utf-8';
      ext = 'csv';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iobroker-export-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCopyJson() {
    const allIds = checkedIds.size > 0 ? [...checkedIds] : (exportIds ?? ids);
    const rows = allIds.map((id) => {
      const obj = objects[id];
      return {
        id,
        name: obj?.common?.name ? (typeof obj.common.name === 'string' ? obj.common.name : (obj.common.name.de || obj.common.name.en || '')) : '',
        type: obj?.common?.type || obj?.type || '',
        role: obj?.common?.role || '',
        unit: obj?.common?.unit || '',
        room: roomMap[id] || '',
        function: functionMap[id] || '',
        read: obj?.common?.read !== false ? 'true' : 'false',
        write: obj?.common?.write === true ? 'true' : 'false',
      };
    });
    copyText(JSON.stringify(rows, null, 2));
  }

  function exportDatapointsToJson(idsToExport: string[]) {
    const result: Record<string, object> = {};
    for (const id of idsToExport) {
      const obj = objects[id] ?? { _id: id };
      const { enums: _enums, ...rest } = obj as unknown as Record<string, unknown>;
      result[id] = rest;
    }
    const content = JSON.stringify(result, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iobroker-datenpunkt-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const existingIds = useMemo(() => new Set(Object.keys(objects)), [objects]);

  const noRoomLabel = isEn ? '— No room —' : '— Kein Raum —';
  const noFunctionLabel = isEn ? '— No function —' : '— Keine Funktion —';
  const roomById = useMemo(() => new Map(roomEnums.map((r) => [r.id, r.name])), [roomEnums]);
  const roomNameOptions = useMemo(() => [noRoomLabel, ...roomEnums.map((r) => r.name)], [roomEnums, noRoomLabel]);
  const fnById = useMemo(() => new Map(fnEnums.map((f) => [f.id, f.name])), [fnEnums]);
  const fnNameOptions = useMemo(() => [noFunctionLabel, ...fnEnums.map((f) => f.name)], [fnEnums, noFunctionLabel]);
  const roomFilterOptions = useMemo(() => [...new Set(roomEnums.map((r) => r.name))], [roomEnums]);
  const fnFilterOptions = useMemo(() => [...new Set(fnEnums.map((f) => f.name))], [fnEnums]);
  const roleFilterOptions = useMemo(() => [...new Set(roles)], [roles]);
  const unitFilterOptions = useMemo(() => [...new Set(units)], [units]);
  const typeFilterOptions = useMemo(
    () => [...new Set(Object.values(objects).map((obj) => obj?.common?.type || obj?.type || '').filter((v) => v.trim() !== ''))],
    [objects]
  );

  const rowVirtualizer = useVirtualizer({
    count: activeDisplayItems.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => VIRTUAL_ROW_HEIGHT,
    overscan: VIRTUAL_OVERSCAN,
    scrollPaddingStart: headerHeight,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalVirtualSize = rowVirtualizer.getTotalSize();
  const topSpacer = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const bottomSpacer = virtualItems.length > 0
    ? totalVirtualSize - virtualItems[virtualItems.length - 1].end
    : totalVirtualSize;
  const visibleItems = virtualItems.map((v) => activeDisplayItems[v.index]);
  const rowColSpan = visibleCols.length + 1;

  const lastVisibleIdsKey = useRef<string>('');
  useEffect(() => {
    if (!onVisibleIdsChange) return;
    const visibleRowIds = visibleItems.filter((item) => item.kind === 'row').map((item) => item.id);
    const key = [...visibleRowIds].sort().join(',');
    const timer = setTimeout(() => {
      if (key !== lastVisibleIdsKey.current) {
        lastVisibleIdsKey.current = key;
        onVisibleIdsChange(visibleRowIds);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [visibleItems, onVisibleIdsChange]);

  const sepCountMap = useMemo(() => {
    if (!groupByPath) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const id of filteredIds) {
      const parts = id.split('.');
      for (let i = 1; i < parts.length; i++) {
        const prefix = parts.slice(0, i).join('.');
        map.set(prefix, (map.get(prefix) ?? 0) + 1);
      }
    }
    return map;
  }, [filteredIds, groupByPath]);

  // Sep row column split: main cell spans up to first of type/role; trailing spans remainder + DEL_COL
  const _sepNameIdx  = visibleCols.indexOf('name');
  const _sepTypeIdx  = visibleCols.indexOf('type');
  const _sepRoleIdx  = visibleCols.indexOf('role');
  const _sepNameVis  = _sepNameIdx >= 0;
  const _sepTypeVis  = _sepTypeIdx >= 0;
  const _sepRoleVis  = _sepRoleIdx >= 0;
  const _sepSplitIdx = _sepTypeVis || _sepRoleVis
    ? Math.min(_sepTypeVis ? _sepTypeIdx : Infinity, _sepRoleVis ? _sepRoleIdx : Infinity)
    : visibleCols.length;
  const _sepLastDetailIdx = Math.max(_sepTypeVis ? _sepTypeIdx : -1, _sepRoleVis ? _sepRoleIdx : -1);
  const _sepMainSpan     = _sepSplitIdx;                                           // cols before first detail col
  const _sepTrailingSpan = visibleCols.length - _sepLastDetailIdx - 1 + 1;         // remaining cols + DEL_COL
  // type/role tds in visibleCols order
  const _sepDetailCols = ([['type', _sepTypeIdx], ['role', _sepRoleIdx]] as [SortKey, number][])
    .filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]).map(([k]) => k);
  // name split: main td stops before name col; filler td covers cols between name and first type/role
  const _sepNameBeforeType = _sepNameVis && (_sepNameIdx < _sepSplitIdx);
  const _sepMainSpanWithName = _sepNameBeforeType ? _sepNameIdx - 1 : _sepMainSpan;
  const _sepFillerSpan = _sepNameBeforeType ? _sepSplitIdx - _sepNameIdx - 1 : 0;

  function scrollRowIntoView(index: number) {
    rowVirtualizer.scrollToIndex(index, { align: 'auto' });
  }

  function handleContainerKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const currentIndex = focusedId !== null ? filteredIds.indexOf(focusedId) : -1;
      const nextIndex = e.key === 'ArrowDown'
        ? Math.min(filteredIds.length - 1, currentIndex + 1)
        : Math.max(0, currentIndex > 0 ? currentIndex - 1 : 0);
      const nextId = filteredIds[nextIndex];
      if (nextId !== undefined) {
        setFocusedId(nextId);
        scrollRowIntoView(nextIndex);
      }
    } else if (e.key === 'Enter') {
      if (focusedId !== null && filteredIds.includes(focusedId)) {
        e.preventDefault();
        onSelect(focusedId);
      }
    } else if (e.key === 'Escape') {
      setFocusedId(null);
    }
  }

  return (
    <>
    <div className="flex flex-col h-full">
      <StateListToolbar
        isEn={isEn}
        language={language as 'en' | 'de'}
        showToolbarLabels={showToolbarLabels}
        groupByPath={groupByPath}
        shortenGroupPaths={shortenGroupPaths}
        hideAliasSubRows={hideAliasSubRows}
        treeFilter={treeFilter}
        pattern={pattern}
        fulltextEnabled={fulltextEnabled}
        colFilters={colFilters}
        checkedIds={checkedIds}
        checkedSepPrefix={checkedSepPrefix}
        pageSize={pageSize ?? 50}
        visibleCols={visibleCols}
        scriptsFetching={scriptsFetching}
        scriptLastUpdated={scriptLastUpdated}
        allHistoryIds={allHistoryIds}
        objects={objects}
        newMenuOpen={newMenuOpen}
        exportMenuOpen={exportMenuOpen}
        newMenuRef={newMenuRef}
        exportMenuRef={exportMenuRef}
        onNewMenuToggle={() => setNewMenuOpen((v) => !v)}
        onNewDatapoint={() => { setNewDatapointOpen(true); setNewMenuOpen(false); }}
        onNewAlias={() => { setNewAliasOpen(true); setNewMenuOpen(false); }}
        onExportMenuToggle={() => setExportMenuOpen((v) => !v)}
        onExportCsv={() => { handleExport('csv'); setExportMenuOpen(false); }}
        onExportJson={() => { handleExport('json'); setExportMenuOpen(false); }}
        onExportJsonClipboard={() => { handleCopyJson(); setExportMenuOpen(false); }}
        onImport={() => setImportOpen(true)}
        onEnums={onOpenEnumManager}
        onStats={() => setShowStats(true)}
        onScriptRefresh={() => setConfirmScriptRefresh(true)}
        onOptimize={() => { setOptimizePath(undefined); setOptimizeOpen(true); }}
        onAliasReplace={(str) => onOpenAliasReplace?.(str)}
        onAutoAlias={(target) => setAutoAliasDeviceId(target)}
        onHistoryOpen={(id, extra) => { setHistoryInitialExtra(extra); setHistoryModalId(id); }}
        onDeleteSelected={() => setMultiDeleteOpen(true)}
        onClearTreeFilter={onClearTreeFilter}
        onToggleHideAliasSubRows={() => persistSettings({ ...appSettings, hideAliasSubRows: !hideAliasSubRows })}
        onToggleGroupByPath={() => onToggleGroupByPath?.()}
        onToggleShortenGroupPaths={() => persistSettings({ ...appSettings, shortenGroupPaths: !shortenGroupPaths })}
        onFitToContainer={fitToContainer}
        onResetLs={() => setConfirmResetLs(true)}
        onPageSizeChange={onPageSizeChange}
        onColChange={handleColChange}
      />
      <div className={`flex items-center gap-2 px-3 py-1.5 shrink-0 border-b border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 flex-wrap transition-all ${checkedIds.size > 0 ? 'visible' : 'invisible h-0 py-0 overflow-hidden border-0'}`}>
          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium shrink-0 whitespace-nowrap">
            {checkedIds.size} {isEn ? 'selected:' : 'ausgewählt:'}
          </span>
          <BatchComboControl
            value={batchRole}
            onChange={setBatchRole}
            placeholder={isEn ? 'Role…' : 'Rolle…'}
            options={roles}
            className="w-32"
            language={language}
          />
          <BatchComboControl
            value={batchUnit}
            onChange={setBatchUnit}
            placeholder={isEn ? 'Unit…' : 'Einheit…'}
            options={units}
            className="w-32"
            language={language}
          />
          <BatchComboControl
            value={batchRoomEnumId === '' ? '' : (batchRoomEnumId === '__none__' ? noRoomLabel : (roomById.get(batchRoomEnumId) ?? ''))}
            onChange={(name) => {
              if (name.trim() === '') { setBatchRoomEnumId(''); return; }
              if (name === noRoomLabel) { setBatchRoomEnumId('__none__'); return; }
              const hit = roomEnums.find((r) => r.name === name);
              setBatchRoomEnumId(hit ? hit.id : '');
            }}
            placeholder={isEn ? 'Room…' : 'Raum…'}
            options={roomNameOptions}
            className="w-32"
            language={language}
          />
          <BatchComboControl
            value={batchFnEnumId === '' ? '' : (batchFnEnumId === '__none__' ? noFunctionLabel : (fnById.get(batchFnEnumId) ?? ''))}
            onChange={(name) => {
              if (name.trim() === '') { setBatchFnEnumId(''); return; }
              if (name === noFunctionLabel) { setBatchFnEnumId('__none__'); return; }
              const hit = fnEnums.find((f) => f.name === name);
              setBatchFnEnumId(hit ? hit.id : '');
            }}
            placeholder={isEn ? 'Function…' : 'Funktion…'}
            options={fnNameOptions}
            className="w-32"
            language={language}
          />
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={batchDesc}
              onChange={(e) => { setBatchDesc(e.target.value); if (batchDescClear) setBatchDescClear(false); }}
              disabled={batchDescClear}
              placeholder={batchDescClear ? (isEn ? '— clear —' : '— löschen —') : (isEn ? 'Description…' : 'Beschreibung…')}
              className={`h-7 w-36 px-2 text-xs rounded border bg-gray-50/70 dark:bg-gray-800/70 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400 ${batchDescClear ? 'border-red-400 dark:border-red-600 opacity-60' : 'border-gray-300 dark:border-gray-600'}`}
            />
            <button
              type="button"
              onClick={() => { setBatchDescClear((v) => !v); setBatchDesc(''); }}
              title={isEn ? 'Clear description on all selected' : 'Beschreibung bei allen Ausgewählten löschen'}
              className={`h-7 px-1.5 text-xs rounded border transition-colors ${batchDescClear ? 'border-red-400 bg-red-500/10 text-red-500 dark:border-red-600 dark:text-red-400' : 'border-gray-300 dark:border-gray-600 text-gray-400 hover:text-red-500 hover:border-red-400'}`}
            >
              <X size={11} />
            </button>
          </div>
          <input
            type="number"
            value={batchMin}
            onChange={(e) => setBatchMin(e.target.value)}
            placeholder="Min"
            className="h-7 w-20 px-2 text-xs rounded border border-gray-300 dark:border-gray-600 bg-gray-50/70 dark:bg-gray-800/70 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <input
            type="number"
            value={batchMax}
            onChange={(e) => setBatchMax(e.target.value)}
            placeholder="Max"
            className="h-7 w-20 px-2 text-xs rounded border border-gray-300 dark:border-gray-600 bg-gray-50/70 dark:bg-gray-800/70 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            onClick={handleBatchApply}
            disabled={!batchCanApply}
            className="h-7 px-2.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isEn ? 'Apply' : 'Anwenden'}
          </button>
      </div>
      <div ref={containerRef} onKeyDown={handleContainerKeyDown} tabIndex={0} className="overflow-x-auto overflow-y-auto flex-1 outline-none bg-white dark:bg-gray-900" data-table-fontsize={tableFontSize}>
        <table className="text-xs text-left table-fixed" style={{ width: totalWidth }}>
          <thead ref={theadRef} className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-white dark:bg-gray-800 sticky top-0 z-10">
            <tr>
              {show('checkbox') && (
                <th style={{ width: w('checkbox'), minWidth: w('checkbox') }} className="text-center align-middle">
                  {groupByPath && (() => {
                    const allCollapsed = collapsedPrefixes === null || (allSepPrefixes.size > 0 && [...allSepPrefixes].every((p) => collapsedPrefixes.has(p)));
                    return (
                      <button
                        onClick={() => setCollapsedPrefixes(allCollapsed ? new Set() : null)}
                        title={allCollapsed ? (isEn ? 'Expand all groups' : 'Alle Gruppen aufklappen') : (isEn ? 'Collapse all groups' : 'Alle Gruppen einklappen')}
                        className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                      >
                        {allCollapsed ? <FolderOpen size={13} /> : <Folder size={13} />}
                      </button>
                    );
                  })()}
                </th>
              )}
              {show('id')      && <SortHeader label="ID" sortKey="id" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('id')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} onHide={handleHideCol} />}
              {show('name')    && <SortHeader label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('name')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} onHide={handleHideCol} />}
              {show('write')   && <th style={{ width: colWidths['write'],   minWidth: colWidths['write']   }} className="text-center align-middle group/hdr relative" title={isEn ? 'Read only' : 'Schreibschutz'}><Lock size={12} className="mx-auto text-gray-400 dark:text-gray-500" /><button className="absolute inset-y-0 right-0 opacity-0 group-hover/hdr:opacity-100 px-0.5 text-gray-400 hover:text-red-400 transition-opacity" onClick={() => handleHideCol('write')} tabIndex={-1}><Minus size={10} /></button></th>}
              {show('history') && <th style={{ width: colWidths['history'], minWidth: colWidths['history'] }} className="text-center align-middle group/hdr relative" title="History"><History size={12} className="mx-auto text-gray-400 dark:text-gray-500" /><button className="absolute inset-y-0 right-0 opacity-0 group-hover/hdr:opacity-100 px-0.5 text-gray-400 hover:text-red-400 transition-opacity" onClick={() => handleHideCol('history')} tabIndex={-1}><Minus size={10} /></button></th>}
              {show('custom')  && <th style={{ width: colWidths['custom'],  minWidth: colWidths['custom']  }} className="text-center align-middle group/hdr relative" title="Custom"><Wrench size={12} className="mx-auto text-gray-400 dark:text-gray-500" /><button className="absolute inset-y-0 right-0 opacity-0 group-hover/hdr:opacity-100 px-0.5 text-gray-400 hover:text-red-400 transition-opacity" onClick={() => handleHideCol('custom')} tabIndex={-1}><Minus size={10} /></button></th>}
              {show('smart')   && <th style={{ width: colWidths['smart'],   minWidth: colWidths['smart']   }} className="text-center align-middle group/hdr relative" title="SmartName"><Mic2 size={12} className="mx-auto text-gray-400 dark:text-gray-500" /><button className="absolute inset-y-0 right-0 opacity-0 group-hover/hdr:opacity-100 px-0.5 text-gray-400 hover:text-red-400 transition-opacity" onClick={() => handleHideCol('smart')} tabIndex={-1}><Minus size={10} /></button></th>}
              {show('alias')   && <th style={{ width: colWidths['alias'],           minWidth: colWidths['alias']           }} className="text-center align-middle group/hdr relative" title="Alias"><Link2 size={12} className="mx-auto text-gray-400 dark:text-gray-500" /><button className="absolute inset-y-0 right-0 opacity-0 group-hover/hdr:opacity-100 px-0.5 text-gray-400 hover:text-red-400 transition-opacity" onClick={() => handleHideCol('alias')} tabIndex={-1}><Minus size={10} /></button></th>}
              {show('scripts') && <th style={{ width: colWidths['scripts'], minWidth: colWidths['scripts'] }} className="text-center align-middle group/hdr relative" title={isEn ? 'Scripts' : 'Skripte'}><FileCode2 size={12} className="mx-auto text-gray-400 dark:text-gray-500" /><button className="absolute inset-y-0 right-0 opacity-0 group-hover/hdr:opacity-100 px-0.5 text-gray-400 hover:text-red-400 transition-opacity" onClick={() => handleHideCol('scripts')} tabIndex={-1}><Minus size={10} /></button></th>}
              {show('room')     && <SortHeader label={isEn ? 'Room' : 'Raum'} sortKey="room" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('room')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} onHide={handleHideCol} />}
              {show('function') && <SortHeader label={isEn ? 'Function' : 'Funktion'} sortKey="function" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('function')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} onHide={handleHideCol} />}
              {show('type')    && <SortHeader label={isEn ? 'Type' : 'Typ'} sortKey="type" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('type')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} onHide={handleHideCol} />}
              {show('role')     && <SortHeader label={isEn ? 'Role' : 'Rolle'} sortKey="role" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('role')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} onHide={handleHideCol} />}
              {show('value')    && <SortHeader label={isEn ? 'Value' : 'Wert'} sortKey="value" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('value')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} onHide={handleHideCol} className="text-left" />}
              {show('unit')    && <SortHeader label={isEn ? 'Unit' : 'Einheit'} sortKey="unit" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('unit')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} onHide={handleHideCol} />}
              {show('ack')     && <SortHeader label="ACK" sortKey="ack" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('ack')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} onHide={handleHideCol} />}
              {show('ts')      && <SortHeader label={isEn ? 'Last Update' : 'Letztes Update'} sortKey="ts" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('ts')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} onHide={handleHideCol} />}
              <th style={{ width: DEL_COL_WIDTH, minWidth: DEL_COL_WIDTH }} />
            </tr>
            <tr className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              {show('checkbox') && (
                <th style={{ width: w('checkbox'), minWidth: w('checkbox') }} className="py-1 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                  <StyledCheckbox
                    checked={allOnPageChecked}
                    indeterminate={someChecked && !allOnPageChecked}
                    onChange={toggleCheckAll}
                    title={isEn ? 'Select all' : 'Alle auswählen'}
                  />
                </th>
              )}
              {(['id','name','write','history','custom','smart','alias','scripts','room','function','type','role','value','unit','ack','ts'] as SortKey[]).filter(show).map((key) => {
                const filterable = ['id','name','room','function','type','role','value','unit','ack','ts'].includes(key);
                const isIconToggle = ['write','history','custom','smart','alias','scripts'].includes(key);
                const isActive = colFiltersDraft[key] === '1';

                if (isIconToggle) {
                  const icon = key === 'write'
                    ? <Lock size={11} />
                    : key === 'history'
                    ? <History size={11} />
                    : key === 'custom'
                    ? <Wrench size={11} />
                    : key === 'alias'
                    ? <Link2 size={11} />
                    : key === 'scripts'
                    ? <FileCode2 size={11} />
                    : <Mic2 size={11} />;
                  const activeClass = key === 'write'
                    ? 'text-gray-500 dark:text-gray-300 bg-gray-300/60 dark:bg-gray-500/40'
                    : key === 'history'
                    ? 'text-blue-500 bg-blue-500/20'
                    : key === 'custom'
                    ? 'text-purple-500 bg-purple-500/20'
                    : key === 'alias'
                    ? 'text-amber-500 bg-amber-500/20'
                    : key === 'scripts'
                    ? 'text-green-600 bg-green-500/20'
                    : 'text-violet-500 bg-violet-500/20';
                  const title = key === 'write'
                    ? (isEn ? 'Only read-only' : 'Nur Schreibgeschützte')
                    : key === 'history'
                    ? (isEn ? 'Only with history' : 'Nur mit History')
                    : key === 'custom'
                    ? (isEn ? 'Only with custom settings' : 'Nur mit Custom-Einstellungen')
                    : key === 'alias'
                    ? (isEn ? 'Only with alias' : 'Nur mit Alias')
                    : key === 'scripts'
                    ? (isEn ? 'Only used in scripts' : 'Nur in Skripten verwendet')
                    : (isEn ? 'Only with SmartName' : 'Nur mit SmartName');
                  return (
                    <th key={key} style={{ width: w(key) }} className="py-1 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setDraftAndPropagate({ ...colFiltersDraft, [key]: isActive ? '' : '1' })}
                        title={title}
                        className={`p-0.5 rounded transition-colors ${isActive ? activeClass : 'text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400'}`}
                      >
                        {icon}
                      </button>
                    </th>
                  );
                }

                return (
                  <th key={key} style={{ width: w(key) }} className="px-2 py-1 normal-case font-normal align-middle">
                    {filterable ? (
                      <div className="relative flex items-center" onClick={(e) => e.stopPropagation()}>
                        {key === 'ack' ? (
                          <BatchComboControl
                            value={colFiltersDraft.ack || ''}
                            onChange={(value) => setDraftAndPropagate({ ...colFiltersDraft, ack: value })}
                            placeholder="Filter..."
                            options={['yes', 'no']}
                            displayMap={{ yes: isEn ? 'Yes' : 'Ja', no: isEn ? 'No' : 'Nein' }}
                            className="w-full"
                            language={language}
                          />
                        ) : (key === 'role' || key === 'room' || key === 'function' || key === 'unit' || key === 'type' || key === 'value') ? (
                          <BatchComboControl
                            value={colFiltersDraft[key] || ''}
                            onChange={(value) => setDraftAndDebounce({ ...colFiltersDraft, [key]: value })}
                            placeholder="Filter..."
                            options={
                              key === 'role'
                                ? roleFilterOptions
                                : key === 'room'
                                  ? roomFilterOptions
                                  : key === 'function'
                                    ? fnFilterOptions
                                    : key === 'unit'
                                      ? unitFilterOptions
                                      : key === 'type'
                                        ? typeFilterOptions
                                        : []
                            }
                            className="w-full"
                            language={language}
                            emptyOptionLabel={isEn ? '(empty)' : '(leer)'}
                          />
                        ) : key === 'ts' ? (
                          <TsRangeFilterControl
                            value={colFiltersDraft.ts || ''}
                            onChange={(value) => setDraftAndDebounce({ ...colFiltersDraft, ts: value })}
                            language={language}
                          />
                        ) : (
                          <>
                            <input
                              type="text"
                              value={colFiltersDraft[key] || ''}
                              onChange={(e) => setDraftAndDebounce({ ...colFiltersDraft, [key]: e.target.value })}
                              onKeyDown={(e) => { if (e.key === 'Escape' && colFiltersDraft[key]?.trim()) { e.stopPropagation(); setDraftAndPropagate({ ...colFiltersDraft, [key]: '' }); } }}
                              placeholder="Filter..."
                              className={`w-full h-7 py-0 text-xs rounded border bg-gray-50/70 dark:bg-gray-800/70 text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500 ${
                                colFiltersDraft[key]?.trim()
                                  ? 'pl-1.5 pr-5 border-blue-400 dark:border-blue-500'
                                  : 'px-1.5 border-gray-300 dark:border-gray-600'
                              }`}
                            />
                            {colFiltersDraft[key]?.trim() && (
                              <button
                                onMouseDown={(e) => { e.preventDefault(); setDraftAndPropagate({ ...colFiltersDraft, [key]: '' }); }}
                                className="absolute right-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    ) : null}
                  </th>
                );
              })}
              <th style={{ width: DEL_COL_WIDTH, minWidth: DEL_COL_WIDTH }} />
            </tr>
          </thead>
          <tbody>
            {filteredIds.length === 0 && (
              <tr>
                <td colSpan={visibleCols.length + 3} className="px-4 py-10 text-center">
                  {ids.length === 0 ? (
                    <span className="text-sm text-gray-400 dark:text-gray-500">
                      {isEn ? 'No datapoints found. Use search to load datapoints.' : 'Keine Datenpunkte gefunden. Verwende die Suche um Datenpunkte zu laden.'}
                    </span>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <span className="text-sm text-gray-400 dark:text-gray-500">
                        {isEn ? 'No entries match the active filters.' : 'Keine Einträge entsprechen den gesetzten Filtern.'}
                      </span>
                      <div className="flex flex-wrap justify-center gap-2">
                        {treeFilter && onClearTreeFilter && (
                          <button
                            onClick={onClearTreeFilter}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800/60 transition-colors"
                          >
                            <X size={12} />
                            {isEn ? 'Clear tree filter' : 'Baumfilter leeren'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            )}
            {topSpacer > 0 && (
              <tr aria-hidden="true">
                <td colSpan={rowColSpan} style={{ height: topSpacer, padding: 0, border: 0 }} />
              </tr>
            )}
            {visibleItems.map((item) => {
              if (item.kind === 'sep') {
                const isCollapsed = collapsedPrefixes !== null && collapsedPrefixes.has(item.prefix);
                const hasCheckedInside = isCollapsed && [...checkedIds].some((id) => id.startsWith(item.prefix + '.') || id === item.prefix);
                const hasFocusedInside = isCollapsed && focusedId !== null && (focusedId.startsWith(item.prefix + '.') || focusedId === item.prefix);
                const hasHiddenSelection = hasCheckedInside || hasFocusedInside;
                return (
                  <tr key={`sep_${item.prefix}`} ref={(el) => {
                      if (!el) return;
                      if (animateGroupExpand && item.parentPrefix) {
                        if (animatingPrefixes.has(item.parentPrefix) && !animatedSepEls.current.has(el)) {
                          animatedSepEls.current.add(el);
                          el.classList.add('group-row-enter');
                          el.addEventListener('animationend', () => el.classList.remove('group-row-enter'), { once: true });
                        }
                        if (collapsingPrefixes.has(item.parentPrefix) && !el.classList.contains('group-row-exit')) {
                          el.classList.add('group-row-exit');
                        } else if (!collapsingPrefixes.has(item.parentPrefix) && el.classList.contains('group-row-exit')) {
                          el.classList.remove('group-row-exit');
                        }
                      }
                    }} className="group/sep cursor-pointer select-none" onContextMenu={(e) => { e.preventDefault(); setSepCtxMenu({ x: e.clientX, y: e.clientY, prefix: item.prefix }); }} onClick={() => {
                      const prefix = item.prefix;
                      const base = collapsedPrefixes === null ? new Set(allSepPrefixesRef.current) : new Set(collapsedPrefixes);
                      const wasCollapsed = base.has(prefix);
                      if (wasCollapsed) {
                        // Expand
                        base.delete(prefix);
                        setCollapsedPrefixes(base);
                        if (animateGroupExpand) {
                          const existing = animTimersRef.current.get(prefix);
                          if (existing) clearTimeout(existing);
                          setAnimatingPrefixes((ap) => new Set(ap).add(prefix));
                          animTimersRef.current.set(prefix, setTimeout(() => {
                            setAnimatingPrefixes((ap) => { const s = new Set(ap); s.delete(prefix); return s; });
                            animTimersRef.current.delete(prefix);
                          }, 250));
                        }
                      } else {
                        // Collapse
                        if (animateGroupExpand) {
                          const existingT = collapseTimersRef.current.get(prefix);
                          if (existingT) clearTimeout(existingT);
                          setCollapsingPrefixes((cp) => new Set(cp).add(prefix));
                          collapseTimersRef.current.set(prefix, setTimeout(() => {
                            setCollapsedPrefixes((prev) => {
                              const b = prev === null ? new Set(allSepPrefixesRef.current) : new Set(prev);
                              b.add(prefix);
                              return b;
                            });
                            setCollapsingPrefixes((cp) => { const s = new Set(cp); s.delete(prefix); return s; });
                            collapseTimersRef.current.delete(prefix);
                          }, 200));
                        } else {
                          base.add(prefix);
                          setCollapsedPrefixes(base);
                        }
                      }
                    }}>
                    <td className="py-1.5 bg-white dark:bg-gray-800/60 border-y border-gray-200/80 dark:border-gray-700/60 group-hover/sep:bg-gray-100/50 dark:group-hover/sep:bg-gray-700/60 transition-colors text-center" style={{ width: DEL_COL_WIDTH, minWidth: DEL_COL_WIDTH }}>
                      {item.prefix && (
                        <StyledCheckbox
                          checked={checkedSepPrefix === item.prefix}
                          onChange={() => setCheckedSepPrefix(checkedSepPrefix === item.prefix ? null : item.prefix)}
                          title={isEn ? 'Select as alias source' : 'Als Alias-Quelle auswählen'}
                        />
                      )}
                    </td>
                    <td colSpan={(_sepNameBeforeType ? (_sepMainSpanWithName || 1) : (_sepMainSpan || rowColSpan + 1)) - 1} className="py-1.5 bg-white dark:bg-gray-800/60 border-y border-gray-200/80 dark:border-gray-700/60 group-hover/sep:bg-gray-100/50 dark:group-hover/sep:bg-gray-700/60 transition-colors" style={{ paddingLeft: 12 + item.depth * 10, paddingRight: 12 }}>
                      <div className="flex items-center gap-2">
                        {(collapsedPrefixes === null || collapsedPrefixes.has(item.prefix) || collapsingPrefixes.has(item.prefix))
                          ? <ChevronRight size={14} className="text-gray-400 dark:text-gray-500 shrink-0" />
                          : <ChevronDown size={14} className="text-gray-400 dark:text-gray-500 shrink-0" />
                        }
                        {objects[item.prefix]?.type === 'device'
                          ? <Cpu size={14} className="text-sky-500/80 shrink-0" />
                          : objects[item.prefix]?.type === 'channel'
                            ? <Layers size={14} className="text-indigo-500/80 shrink-0" />
                            : <FolderOpen size={14} className="text-yellow-500/80 shrink-0" />
                        }
                        {item.prefix
                          ? <ColoredId id={shortenGroupPaths && item.parentPrefix ? item.prefix.slice(item.parentPrefix.length + 1) : item.prefix} className="text-sm font-mono font-bold" />
                          : <span className="text-sm text-gray-400 dark:text-gray-500 font-mono font-bold italic">root</span>
                        }
                        {!_sepNameBeforeType && item.prefix && allObjects[item.prefix]?.common?.name && (() => {
                          const n = allObjects[item.prefix].common.name;
                          const label = typeof n === 'string' ? n : (isEn ? (n.en || n.de || '') : (n.de || n.en || ''));
                          return label ? <span title={label} className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</span> : null;
                        })()}
                        {sepCountMap.get(item.prefix) != null && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 font-mono shrink-0">({sepCountMap.get(item.prefix)})</span>
                        )}
                        {hasHiddenSelection && (
                          <span className="flex items-center gap-1 shrink-0">
                            {hasCheckedInside && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/15 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                                {[...checkedIds].filter((id) => id.startsWith(item.prefix + '.') || id === item.prefix).length} ✓
                              </span>
                            )}
                            {hasFocusedInside && !hasCheckedInside && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                                ↵
                              </span>
                            )}
                          </span>
                        )}
                        {item.prefix && objects[item.prefix] && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditObjId(item.prefix); }}
                            className="ml-1 opacity-0 group-hover/sep:opacity-100 transition-opacity text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400"
                            title={isEn ? 'Edit object' : 'Objekt bearbeiten'}
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setNewDatapointPrefix(item.prefix || null); setNewDatapointOpen(true); }}
                          className="opacity-0 group-hover/sep:opacity-100 transition-opacity text-gray-400 hover:text-green-500 dark:text-gray-500 dark:hover:text-green-400"
                          title={isEn ? 'New datapoint in this group' : 'Neuer Datenpunkt in dieser Gruppe'}
                        >
                          <Plus size={13} />
                        </button>
                        {item.prefix && (
                          <button
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(item.prefix).then(() => showToast(item.prefix, 'success')).catch(() => showToast(isEn ? 'Copy failed' : 'Kopieren fehlgeschlagen')); }}
                            className="opacity-0 group-hover/sep:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                            title={item.prefix}
                          >
                            <Copy size={12} />
                          </button>
                        )}
                        {_sepDetailCols.length === 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeletingGroupPrefix(item.prefix); }}
                            className="ml-auto opacity-0 group-hover/sep:opacity-100 transition-opacity text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                            title={isEn ? 'Delete all datapoints in this group' : 'Alle Datenpunkte dieser Gruppe löschen'}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                    {_sepNameBeforeType && (() => {
                      const sepObj = allObjects[item.prefix];
                      const nw = colWidths['name'];
                      const n = sepObj?.common?.name;
                      const label = n ? (typeof n === 'string' ? n : (isEn ? (n.en || n.de || '') : (n.de || n.en || ''))) : '';
                      const _iconRaw = showObjectIcons ? sepObj?.common?.icon : undefined;
                      const iconUrl = _iconRaw
                        ? (() => {
                            if (_iconRaw.startsWith('data:') || _iconRaw.startsWith('http')) return _iconRaw;
                            const host = (localStorage.getItem('ioBrokerHost') ?? window.__CONFIG__?.ioBrokerHost ?? '').split(':')[0];
                            if (!host) return _iconRaw;
                            const adapterName = item.prefix.split('.')[0];
                            const iconPath = _iconRaw.startsWith('/') ? _iconRaw : `/${_iconRaw}`;
                            return `http://${host}:${appSettings.adminPort}/adapter/${adapterName}${iconPath}`;
                          })()
                        : undefined;
                      return <>
                        <td key="name" title={label || undefined} style={{ width: nw, minWidth: nw }} className="px-3 py-1.5 bg-white dark:bg-gray-800/60 border-y border-gray-200/80 dark:border-gray-700/60 group-hover/sep:bg-gray-100/50 dark:group-hover/sep:bg-gray-700/60 transition-colors text-xs align-middle text-gray-600 dark:text-gray-300">
                          <div className="flex items-center gap-1.5 truncate">
                            {iconUrl && <img src={iconUrl} alt="" className="w-4 h-4 shrink-0 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                            <span className="truncate">{label}</span>
                          </div>
                        </td>
                        {_sepFillerSpan > 0 && <td colSpan={_sepFillerSpan} className="bg-white dark:bg-gray-800/60 border-y border-gray-200/80 dark:border-gray-700/60 group-hover/sep:bg-gray-100/50 dark:group-hover/sep:bg-gray-700/60 transition-colors" />}
                      </>;
                    })()}
                    {_sepDetailCols.length > 0 && (() => {
                      const sepObj = allObjects[item.prefix];
                      return _sepDetailCols.map((k) => {
                        const w = colWidths[k];
                        if (k === 'name') {
                          // handled separately above
                          return null;
                        }
                        if (k === 'type') {
                          const t = item.prefix.split('.').length > 2 ? (sepObj?.type ?? 'folder') : sepObj?.type;
                          return <td key="type" style={{ width: w, minWidth: w }} className="px-3 py-1.5 bg-white dark:bg-gray-800/60 border-y border-gray-200/80 dark:border-gray-700/60 group-hover/sep:bg-gray-100/50 dark:group-hover/sep:bg-gray-700/60 transition-colors text-xs font-mono align-middle">{t && <span className={`font-semibold ${getTypeColor(t)}`}>{t}</span>}</td>;
                        }
                        if (k === 'role') {
                          const r = sepObj?.common?.role;
                          return <td key="role" style={{ width: w, minWidth: w }} className="px-3 py-1.5 bg-white dark:bg-gray-800/60 border-y border-gray-200/80 dark:border-gray-700/60 group-hover/sep:bg-gray-100/50 dark:group-hover/sep:bg-gray-700/60 transition-colors text-xs font-mono align-middle">{r && <span className={`font-semibold ${getRoleColor(r)}`}>{r}</span>}</td>;
                        }
                        return null;
                      });
                    })()}
                    {_sepDetailCols.length > 0 && (
                      <td colSpan={_sepTrailingSpan} className="bg-white dark:bg-gray-800/60 border-y border-gray-200/80 dark:border-gray-700/60 group-hover/sep:bg-gray-100/50 dark:group-hover/sep:bg-gray-700/60 transition-colors pr-2 text-right align-middle">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeletingGroupPrefix(item.prefix); }}
                          className="opacity-0 group-hover/sep:opacity-100 transition-opacity text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                          title={isEn ? 'Delete all datapoints in this group' : 'Alle Datenpunkte dieser Gruppe löschen'}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              }
              const id = item.id;
              const displayId = shortenGroupPaths && item.parentPrefix ? id.slice(item.parentPrefix.length + 1) : undefined;
              return (
                <StateRow
                  key={id}
                  id={id}
                  displayId={displayId}
                  state={states[id]}
                  obj={objects[id]}
                  roomName={roomMap[id] || ''}
                  fnName={functionMap[id] || ''}
                  isSelected={selectedId === id}
                  isChecked={checkedIds.has(id)}
                  aliasIds={aliasMap?.get(id)}
                  ownTargetExists={(() => { const aliasId = objects[id]?.common?.alias?.id; return !aliasId || (allObjectIds ? allObjectIds.has(aliasId as string) : !!objects[aliasId as string]); })()}
                  visibleCols={visibleCols}
                  colWidths={colWidths}
                  roles={roles}
                  units={units}
                  roomEnums={roomEnums}
                  fnEnums={fnEnums}
                  onSelect={onSelect}
                  onCheck={handleCheckRow}
                  onContextMenu={handleRowContextMenu}
                  onHistoryClick={handleRowHistoryClick}
                  onScriptsClick={onScriptsClick}
                  scriptSources={scriptSources}
                  onNavigateTo={onNavigateTo}
                  onDeleteClick={handleRowDeleteClick}
                  onEditJson={handleRowEditJsonClick}
                  onSelectRoom={handleSelectRoom}
                  onSelectFunction={handleSelectFunction}
                  onOpenValueModal={handleOpenValueModal}
                  roomEditForced={roomEditId === id}
                  fnEditForced={fnEditId === id}
                  onRoomEditEnd={handleRoomEditEnd}
                  onFnEditEnd={handleFnEditEnd}
                  dateFormat={dateFormat}
                  language={language}
                  expertMode={expertMode}
                  isFocused={focusedId === id && selectedId !== id}
                  showDesc={showDesc} showObjectTypeIcons={showObjectTypeIcons}
                  hideAliasSubRows={hideAliasSubRows}
                  showUnitInValue={showUnitInValue}
                  dragEnabled={dragEnabled}
                  depth={item.depth}
                  animateEnter={animateGroupExpand && !!item.parentPrefix && animatingPrefixes.has(item.parentPrefix)}
                  animateExit={animateGroupExpand && !!item.parentPrefix && collapsingPrefixes.has(item.parentPrefix)}
                />
              );
            })}
            {bottomSpacer > 0 && (
              <tr aria-hidden="true">
                <td colSpan={rowColSpan} style={{ height: bottomSpacer, padding: 0, border: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    <StateListModals
      isEn={isEn}
      language={language as 'en' | 'de'}
      objects={objects}
      states={states}
      allObjects={allObjects}
      existingIds={existingIds}
      allObjectIds={allObjectIds}
      filteredIds={filteredIds}
      checkedIds={checkedIds}
      pattern={pattern}
      roomEnums={roomEnums}
      fnEnums={fnEnums}
      collapsedPrefixes={collapsedPrefixes}
      allHistoryIds={allHistoryIds}
      allSmartIds={allSmartIds}
      scriptUsedIds={scriptUsedIds}
      scriptsFetching={scriptsFetching}
      includeScripts={appSettings.includeScripts}
      batchProgress={batchProgress}
      onOpenInOtherPanel={onOpenInOtherPanel}
      newDatapointOpen={newDatapointOpen}
      newDatapointPrefix={newDatapointPrefix}
      newAliasOpen={newAliasOpen}
      importOpen={importOpen}
      optimizeOpen={optimizeOpen}
      optimizePath={optimizePath}
      historyModalId={historyModalId}
      historyInitialExtra={historyInitialExtra}
      deletingId={deletingId}
      deletingGroupPrefix={deletingGroupPrefix}
      valueEditId={valueEditId}
      confirmResetLs={confirmResetLs}
      multiDeleteOpen={multiDeleteOpen}
      aliasSourceId={aliasSourceId}
      copySourceId={copySourceId}
      renameId={renameId}
      moveId={moveId}
      editObjId={editObjId}
      editObjInitialTab={editObjInitialTab}
      ctxMenu={ctxMenu}
      sepCtxMenu={sepCtxMenu}
      showStats={showStats}
      onCloseNewDatapoint={() => { setNewDatapointOpen(false); setNewDatapointPrefix(null); }}
      onNewAliasCreated={(newId) => onNavigateTo?.([newId])}
      onCloseNewAlias={() => setNewAliasOpen(false)}
      onCloseImport={() => setImportOpen(false)}
      onCloseOptimize={() => { setOptimizeOpen(false); setOptimizePath(undefined); }}
      onOpenEditFromOptimize={(id) => { setOptimizeOpen(false); setOptimizePath(undefined); onSelect(id); }}
      onCloseHistory={() => { setHistoryModalId(null); setHistoryInitialExtra([]); }}
      onCloseValueEdit={() => setValueEditId(null)}
      onConfirmDeleteId={() => { deleteObject.mutate(deletingId!); setDeletingId(null); }}
      onCancelDeleteId={() => setDeletingId(null)}
      onConfirmResetLs={() => {
        localStorage.removeItem(LS_WIDTHS_KEY);
        setVisibleCols(DEFAULT_COLS);
        setColWidths({ ...effectiveDefaults });
        setDraftAndPropagate({});
        setConfirmResetLs(false);
      }}
      onCancelResetLs={() => setConfirmResetLs(false)}
      onCloseMultiDelete={() => setMultiDeleteOpen(false)}
      onDeleteOne={handleDeleteOne}
      onDeleteAll={handleDeleteAll}
      onCloseAliasSource={() => setAliasSourceId(null)}
      onAliasSourceCreated={(newId) => onNavigateTo?.([newId])}
      onCloseCopySource={() => setCopySourceId(null)}
      onCloseRename={() => setRenameId(null)}
      onRenamed={(newId) => onNavigateTo?.([newId])}
      onCloseMove={() => setMoveId(null)}
      onMoved={(newId) => onNavigateTo?.([newId])}
      onCloseEditObj={() => { setEditObjId(null); setEditObjInitialTab('details'); }}
      onOpenHistoryFromEdit={() => setHistoryModalId(editObjId)}
      onCloseStats={() => setShowStats(false)}
      onCloseCtxMenu={() => setCtxMenu(null)}
      onCloseSepCtxMenu={() => setSepCtxMenu(null)}
      onCtxSetFilter={(id) => setDraftAndPropagate({ ...colFiltersDraft, id })}
      onCtxOptimize={(id) => { setOptimizeOpen(true); setOptimizePath(id); setCtxMenu(null); }}
      onCtxEditRoom={(id) => setRoomEditId(id)}
      onCtxEditFunction={(id) => setFnEditId(id)}
      onCtxEditObject={(id) => setEditObjId(id)}
      onCtxCopySource={(id) => setCopySourceId(id)}
      onCtxRename={(id) => setRenameId(id)}
      onCtxMove={(id) => setMoveId(id)}
      onCtxCreateAlias={(id) => setAliasSourceId(id)}
      onCtxExportJson={(ids) => exportDatapointsToJson(ids)}
      onCtxDelete={(id) => setDeletingId(id)}
      onCtxShowHistory={(id, secondaryId) => {
        if (secondaryId) {
          const n = objects[secondaryId]?.common?.name;
          setHistoryInitialExtra([{
            id: secondaryId,
            label: (typeof n === 'string' ? n : (n?.de || n?.en)) || secondaryId.split('.').slice(-2).join('.'),
            unit: objects[secondaryId]?.common?.unit,
          }]);
        } else {
          setHistoryInitialExtra([]);
        }
        setHistoryModalId(id);
      }}
      onSepSetFilter={(prefix) => setDraftAndPropagate({ ...colFiltersDraft, id: prefix })}
      onSepToggleCollapse={(prefix, isCollapsed) => setCollapsedPrefixes((prev) => {
        const base = prev === null ? new Set(allSepPrefixes) : new Set(prev);
        isCollapsed ? base.delete(prefix) : base.add(prefix);
        return base;
      })}
      onSepSelectAll={(_prefix, groupIds, allChecked) => setCheckedIds((prev) => {
        const next = new Set(prev);
        allChecked ? groupIds.forEach((id) => next.delete(id)) : groupIds.forEach((id) => next.add(id));
        return next;
      })}
      onSepAutoAlias={(prefix) => setAutoAliasDeviceId(prefix)}
      onSepOptimize={(prefix) => { setOptimizePath(prefix + '.*'); setOptimizeOpen(true); setSepCtxMenu(null); }}
      onSepDelete={(prefix) => setDeletingGroupPrefix(prefix)}
      onStatsSelectNamespace={(ns) => handleTreeScope(`${ns}.`)}
      onStatsIncludeScriptsChange={(v) => persistSettings({ ...appSettings, includeScripts: v })}
      onStatsScriptUsedIdsChange={(ids) => setScriptUsedIds(ids)}
      onStatsRequestRefreshScripts={() => setConfirmScriptRefresh(true)}
      showToast={showToast}
    />
</>
  );
}

export default React.memo(React.forwardRef(StateList));

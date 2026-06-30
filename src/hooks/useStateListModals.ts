import { useState, useRef, useEffect } from 'react';
import type { ExtraSeries } from '../components/history/HistoryChart';

export function useStateListModals() {
  const [newDatapointOpen, setNewDatapointOpen] = useState(false);
  const [newDatapointPrefix, setNewDatapointPrefix] = useState<string | null>(null);
  const [newAliasOpen, setNewAliasOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [optimizePath, setOptimizePath] = useState<string | undefined>(undefined);
  const [historyModalId, setHistoryModalId] = useState<string | null>(null);
  const [historyInitialExtra, setHistoryInitialExtra] = useState<ExtraSeries[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingGroupPrefix, setDeletingGroupPrefix] = useState<string | null>(null);
  const [valueEditId, setValueEditId] = useState<string | null>(null);
  const [confirmResetLs, setConfirmResetLs] = useState(false);
  const [multiDeleteOpen, setMultiDeleteOpen] = useState(false);
  const [aliasSourceId, setAliasSourceId] = useState<string | null>(null);
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [editObjId, setEditObjId] = useState<string | null>(null);
  const [editObjInitialTab, setEditObjInitialTab] = useState<'details' | 'json' | 'alias' | 'custom'>('details');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [sepCtxMenu, setSepCtxMenu] = useState<{ x: number; y: number; prefix: string } | null>(null);
  const [checkedSepPrefix, setCheckedSepPrefix] = useState<string | null>(null);
  const [virtualFoldersOpen, setVirtualFoldersOpen] = useState(false);

  useEffect(() => {
    if (!exportMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportMenuOpen]);

  useEffect(() => {
    if (!newMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setNewMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [newMenuOpen]);

  return {
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
    virtualFoldersOpen, setVirtualFoldersOpen,
  };
}

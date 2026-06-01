import { useState } from 'react';
import type { UseMutateFunction } from '@tanstack/react-query';
import type { IoBrokerObjectCommon } from '../types/iobroker';

interface UseBatchEditParams {
  checkedIds: Set<string>;
  extendMutate: UseMutateFunction<void, Error, { id: string; common: Partial<IoBrokerObjectCommon> }, unknown>;
  updateRoomBatchMutate: UseMutateFunction<void, Error, { objectIds: string[]; newRoomEnumId: string | null }, unknown>;
  updateFnBatchMutate: UseMutateFunction<void, Error, { objectIds: string[]; newFnEnumId: string | null }, unknown>;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  isEn: boolean;
}

export function useBatchEdit({
  checkedIds,
  extendMutate,
  updateRoomBatchMutate,
  updateFnBatchMutate,
  showToast,
  isEn,
}: UseBatchEditParams) {
  const [batchRole, setBatchRole] = useState('');
  const [batchUnit, setBatchUnit] = useState('');
  const [batchRoomEnumId, setBatchRoomEnumId] = useState('');
  const [batchFnEnumId, setBatchFnEnumId] = useState('');
  const [batchMin, setBatchMin] = useState('');
  const [batchMax, setBatchMax] = useState('');

  const batchCanApply =
    batchRole.trim() !== '' || batchUnit.trim() !== '' ||
    batchRoomEnumId !== '' || batchFnEnumId !== '' ||
    batchMin.trim() !== '' || batchMax.trim() !== '';

  function handleBatchApply() {
    const ids = [...checkedIds];
    const onErr = (err: unknown) => showToast((isEn ? 'Save failed: ' : 'Speichern fehlgeschlagen: ') + String(err));
    if (batchRole.trim()) {
      ids.forEach((id) => extendMutate({ id, common: { role: batchRole.trim() } }, { onError: onErr }));
    }
    if (batchUnit.trim()) {
      ids.forEach((id) => extendMutate({ id, common: { unit: batchUnit.trim() } }, { onError: onErr }));
    }
    if (batchMin.trim() !== '') {
      const v = parseFloat(batchMin.trim());
      if (!isNaN(v)) ids.forEach((id) => extendMutate({ id, common: { min: v } }, { onError: onErr }));
    }
    if (batchMax.trim() !== '') {
      const v = parseFloat(batchMax.trim());
      if (!isNaN(v)) ids.forEach((id) => extendMutate({ id, common: { max: v } }, { onError: onErr }));
    }
    if (batchRoomEnumId !== '') {
      const newRoomEnumId = batchRoomEnumId === '__none__' ? null : batchRoomEnumId;
      updateRoomBatchMutate({ objectIds: ids, newRoomEnumId }, { onError: onErr });
    }
    if (batchFnEnumId !== '') {
      const newFnEnumId = batchFnEnumId === '__none__' ? null : batchFnEnumId;
      updateFnBatchMutate({ objectIds: ids, newFnEnumId }, { onError: onErr });
    }
    setBatchRole('');
    setBatchUnit('');
    setBatchRoomEnumId('');
    setBatchFnEnumId('');
    setBatchMin('');
    setBatchMax('');
  }

  return {
    batchRole, setBatchRole,
    batchUnit, setBatchUnit,
    batchRoomEnumId, setBatchRoomEnumId,
    batchFnEnumId, setBatchFnEnumId,
    batchMin, setBatchMin,
    batchMax, setBatchMax,
    batchCanApply,
    handleBatchApply,
  };
}

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

  const batchCanApply = batchRole.trim() !== '' || batchUnit.trim() !== '' || batchRoomEnumId !== '' || batchFnEnumId !== '';

  function handleBatchApply() {
    const ids = [...checkedIds];
    const onErr = (err: unknown) => showToast((isEn ? 'Save failed: ' : 'Speichern fehlgeschlagen: ') + String(err));
    if (batchRole.trim()) {
      ids.forEach((id) => extendMutate({ id, common: { role: batchRole.trim() } }, { onError: onErr }));
    }
    if (batchUnit.trim()) {
      ids.forEach((id) => extendMutate({ id, common: { unit: batchUnit.trim() } }, { onError: onErr }));
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
  }

  return {
    batchRole, setBatchRole,
    batchUnit, setBatchUnit,
    batchRoomEnumId, setBatchRoomEnumId,
    batchFnEnumId, setBatchFnEnumId,
    batchCanApply,
    handleBatchApply,
  };
}

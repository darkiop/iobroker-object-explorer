import { useState, useRef } from 'react';
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
  const [batchDesc, setBatchDesc] = useState('');
  const [batchDescClear, setBatchDescClear] = useState(false);

  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const pendingRef = useRef(0);
  const totalRef = useRef(0);

  const batchCanApply =
    batchRole.trim() !== '' || batchUnit.trim() !== '' ||
    batchRoomEnumId !== '' || batchFnEnumId !== '' ||
    batchMin.trim() !== '' || batchMax.trim() !== '' ||
    batchDesc.trim() !== '' || batchDescClear;

  function handleBatchApply() {
    const ids = [...checkedIds];

    // Count total ops upfront
    let total = 0;
    if (batchRole.trim()) total += ids.length;
    if (batchUnit.trim()) total += ids.length;
    if (batchMin.trim() !== '' && !isNaN(parseFloat(batchMin.trim()))) total += ids.length;
    if (batchMax.trim() !== '' && !isNaN(parseFloat(batchMax.trim()))) total += ids.length;
    if (batchDesc.trim() || batchDescClear) total += ids.length;
    if (batchRoomEnumId !== '') total += 1;
    if (batchFnEnumId !== '') total += 1;

    pendingRef.current = 0;
    totalRef.current = total;
    if (total > 1) setBatchProgress({ done: 0, total });

    const onSettled = () => {
      pendingRef.current += 1;
      setBatchProgress({ done: pendingRef.current, total: totalRef.current });
      if (pendingRef.current >= totalRef.current) {
        setTimeout(() => setBatchProgress(null), 600);
      }
    };
    const onErr = (err: unknown) => {
      showToast((isEn ? 'Save failed: ' : 'Speichern fehlgeschlagen: ') + String(err));
      onSettled();
    };
    const onSuccess = () => onSettled();

    if (batchRole.trim()) {
      ids.forEach((id) => extendMutate({ id, common: { role: batchRole.trim() } }, { onError: onErr, onSuccess }));
    }
    if (batchUnit.trim()) {
      ids.forEach((id) => extendMutate({ id, common: { unit: batchUnit.trim() } }, { onError: onErr, onSuccess }));
    }
    if (batchMin.trim() !== '') {
      const v = parseFloat(batchMin.trim());
      if (!isNaN(v)) ids.forEach((id) => extendMutate({ id, common: { min: v } }, { onError: onErr, onSuccess }));
    }
    if (batchMax.trim() !== '') {
      const v = parseFloat(batchMax.trim());
      if (!isNaN(v)) ids.forEach((id) => extendMutate({ id, common: { max: v } }, { onError: onErr, onSuccess }));
    }
    if (batchDescClear) {
      ids.forEach((id) => extendMutate({ id, common: { desc: '' } }, { onError: onErr, onSuccess }));
    } else if (batchDesc.trim()) {
      ids.forEach((id) => extendMutate({ id, common: { desc: batchDesc.trim() } }, { onError: onErr, onSuccess }));
    }
    if (batchRoomEnumId !== '') {
      const newRoomEnumId = batchRoomEnumId === '__none__' ? null : batchRoomEnumId;
      updateRoomBatchMutate({ objectIds: ids, newRoomEnumId }, { onError: onErr, onSuccess });
    }
    if (batchFnEnumId !== '') {
      const newFnEnumId = batchFnEnumId === '__none__' ? null : batchFnEnumId;
      updateFnBatchMutate({ objectIds: ids, newFnEnumId }, { onError: onErr, onSuccess });
    }

    setBatchRole('');
    setBatchUnit('');
    setBatchRoomEnumId('');
    setBatchFnEnumId('');
    setBatchMin('');
    setBatchMax('');
    setBatchDesc('');
    setBatchDescClear(false);
  }

  return {
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
  };
}

import { useState } from 'react';
import type { IoBrokerObjectCommon } from '../types/iobroker';

interface UseBatchEditParams {
  checkedIds: Set<string>;
  extendMutateAsync: (args: { id: string; common: Partial<IoBrokerObjectCommon> }) => Promise<void>;
  updateRoomBatchMutateAsync: (args: { objectIds: string[]; newRoomEnumId: string | null }) => Promise<void>;
  updateFnBatchMutateAsync: (args: { objectIds: string[]; newFnEnumId: string | null }) => Promise<void>;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  isEn: boolean;
}

export function useBatchEdit({
  checkedIds,
  extendMutateAsync,
  updateRoomBatchMutateAsync,
  updateFnBatchMutateAsync,
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

  const batchCanApply =
    batchRole.trim() !== '' || batchUnit.trim() !== '' ||
    batchRoomEnumId !== '' || batchFnEnumId !== '' ||
    batchMin.trim() !== '' || batchMax.trim() !== '' ||
    batchDesc.trim() !== '' || batchDescClear;

  async function handleBatchApply() {
    const ids = [...checkedIds];
    const promises: Promise<void>[] = [];

    if (batchRole.trim()) {
      ids.forEach((id) => promises.push(extendMutateAsync({ id, common: { role: batchRole.trim() } })));
    }
    if (batchUnit.trim()) {
      ids.forEach((id) => promises.push(extendMutateAsync({ id, common: { unit: batchUnit.trim() } })));
    }
    if (batchMin.trim() !== '') {
      const v = parseFloat(batchMin.trim());
      if (!isNaN(v)) ids.forEach((id) => promises.push(extendMutateAsync({ id, common: { min: v } })));
    }
    if (batchMax.trim() !== '') {
      const v = parseFloat(batchMax.trim());
      if (!isNaN(v)) ids.forEach((id) => promises.push(extendMutateAsync({ id, common: { max: v } })));
    }
    if (batchDescClear) {
      ids.forEach((id) => promises.push(extendMutateAsync({ id, common: { desc: '' } })));
    } else if (batchDesc.trim()) {
      ids.forEach((id) => promises.push(extendMutateAsync({ id, common: { desc: batchDesc.trim() } })));
    }
    if (batchRoomEnumId !== '') {
      const newRoomEnumId = batchRoomEnumId === '__none__' ? null : batchRoomEnumId;
      promises.push(updateRoomBatchMutateAsync({ objectIds: ids, newRoomEnumId }));
    }
    if (batchFnEnumId !== '') {
      const newFnEnumId = batchFnEnumId === '__none__' ? null : batchFnEnumId;
      promises.push(updateFnBatchMutateAsync({ objectIds: ids, newFnEnumId }));
    }

    setBatchRole('');
    setBatchUnit('');
    setBatchRoomEnumId('');
    setBatchFnEnumId('');
    setBatchMin('');
    setBatchMax('');
    setBatchDesc('');
    setBatchDescClear(false);

    if (promises.length <= 1) {
      const results = await Promise.allSettled(promises);
      results.forEach((r) => { if (r.status === 'rejected') showToast((isEn ? 'Save failed: ' : 'Speichern fehlgeschlagen: ') + String(r.reason)); });
      return;
    }

    const total = promises.length;
    let done = 0;
    setBatchProgress({ done: 0, total });

    await Promise.allSettled(promises.map((p) =>
      p.then(
        () => { done++; setBatchProgress({ done, total }); },
        (err) => { done++; setBatchProgress({ done, total }); showToast((isEn ? 'Save failed: ' : 'Speichern fehlgeschlagen: ') + String(err)); }
      )
    ));

    setTimeout(() => setBatchProgress(null), 600);
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

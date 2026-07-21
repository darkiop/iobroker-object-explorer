import { useCallback, useRef, useState } from 'react';
import {
  fetchDpRowsChunked,
  fetchOrphanRowsChunked,
  getDpValueCount,
  tsTableForType,
} from '../api/iobroker';
import {
  buildDump,
  serializeDump,
  dumpFilename,
  DB_DUMP_MAX_ROWS,
  type DumpRow,
  type DumpTable,
  type DumpTrigger,
  type DumpSeriesInput,
} from '../api/dbBackup';

export interface BackupProgress {
  phase: 'counting' | 'fetching' | 'writing';
  done: number;
  total: number;
}

export type ExportOutcome =
  | { ok: true; rows: number; truncated: boolean }
  | { ok: false; needsCapDecision: true; total: number; cap: number }
  | { ok: false; error: string };

export interface ExportNamedArgs {
  id: string;
  type: unknown;
  trigger: DumpTrigger;
  startTs: number | null;
  endTs: number | null;
  /** Set after the user confirmed the cap dialog — exports the newest cap rows. */
  acceptCap?: boolean;
}

export interface ExportOrphanArgs {
  table: DumpTable;
  dbId: number;
  count: number;
  acceptCap?: boolean;
}

export interface ExportRowsArgs {
  id: string;
  type: unknown;
  trigger: DumpTrigger;
  rows: DumpRow[];
}

interface Options {
  /** Injected so tests can capture the payload instead of hitting the DOM. */
  onDownload?: (filename: string, text: string) => void;
  /** Host label recorded in the dump for provenance. */
  host?: string;
}

function browserDownload(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function useDbBackup(opts: Options = {}) {
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const download = opts.onDownload ?? browserDownload;
  const host = opts.host ?? '';

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const emit = useCallback(
    (trigger: DumpTrigger, subject: string, truncated: boolean, series: DumpSeriesInput[]) => {
      setProgress({ phase: 'writing', done: 1, total: 1 });
      const dump = buildDump({
        trigger,
        truncated,
        createdAt: Date.now(),
        source: { db: 'iobroker', host },
        series,
      });
      download(dumpFilename(trigger, subject, new Date()), serializeDump(dump));
    },
    [download, host],
  );

  const exportNamed = useCallback(
    async (args: ExportNamedArgs): Promise<ExportOutcome> => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        setProgress({ phase: 'counting', done: 0, total: 0 });
        const total = await getDpValueCount(args.id, args.type, args.startTs, args.endTs);
        if (total > DB_DUMP_MAX_ROWS && !args.acceptCap) {
          return { ok: false, needsCapDecision: true, total, cap: DB_DUMP_MAX_ROWS };
        }
        const truncated = total > DB_DUMP_MAX_ROWS;
        const capped = Math.min(total, DB_DUMP_MAX_ROWS);

        setProgress({ phase: 'fetching', done: 0, total: capped });
        const rows = await fetchDpRowsChunked(args.id, args.type, {
          startTs: args.startTs,
          endTs: args.endTs,
          cap: DB_DUMP_MAX_ROWS,
          signal: ctrl.signal,
          onProgress: (done) => setProgress({ phase: 'fetching', done, total: capped }),
        });

        emit(args.trigger, args.id, truncated, [{
          kind: 'named',
          id: args.id,
          table: tsTableForType(args.type) as DumpTable,
          type: String(args.type),
          rows,
        }]);
        return { ok: true, rows: rows.length, truncated };
      } catch (err) {
        // No partial file is written: half a dump that looks like a backup is the
        // most dangerous outcome.
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      } finally {
        setProgress(null);
        abortRef.current = null;
      }
    },
    [emit],
  );

  const exportOrphan = useCallback(
    async (args: ExportOrphanArgs): Promise<ExportOutcome> => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        if (args.count > DB_DUMP_MAX_ROWS && !args.acceptCap) {
          return { ok: false, needsCapDecision: true, total: args.count, cap: DB_DUMP_MAX_ROWS };
        }
        const truncated = args.count > DB_DUMP_MAX_ROWS;
        const capped = Math.min(args.count, DB_DUMP_MAX_ROWS);

        setProgress({ phase: 'fetching', done: 0, total: capped });
        const rows = await fetchOrphanRowsChunked(args.table, args.dbId, {
          cap: DB_DUMP_MAX_ROWS,
          signal: ctrl.signal,
          onProgress: (done) => setProgress({ phase: 'fetching', done, total: capped }),
        });

        const type = args.table === 'ts_string' ? 'string' : args.table === 'ts_bool' ? 'boolean' : 'number';
        emit('orphan-delete', `${args.table}-${args.dbId}`, truncated, [{
          kind: 'orphan',
          dbId: args.dbId,
          table: args.table,
          type,
          rows,
        }]);
        return { ok: true, rows: rows.length, truncated };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      } finally {
        setProgress(null);
        abortRef.current = null;
      }
    },
    [emit],
  );

  /** Dumps rows the caller already holds — used by dedupe, whose scan has to read
   *  the affected rows anyway, so no second pass over the table is needed. */
  const exportRows = useCallback(
    async (args: ExportRowsArgs): Promise<ExportOutcome> => {
      try {
        emit(args.trigger, args.id, false, [{
          kind: 'named',
          id: args.id,
          table: tsTableForType(args.type) as DumpTable,
          type: String(args.type),
          rows: args.rows,
        }]);
        return { ok: true, rows: args.rows.length, truncated: false };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      } finally {
        setProgress(null);
      }
    },
    [emit],
  );

  return { progress, abort, exportNamed, exportOrphan, exportRows };
}

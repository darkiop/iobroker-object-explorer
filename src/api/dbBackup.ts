// Backup format for raw sql.0 value rows. This module is deliberately IO-free:
// building, parsing and validating a dump is the part that must be correct, so
// it is testable without a database.

export const DUMP_FORMAT = 'iobroker-object-explorer/db-dump';
export const DUMP_VERSION = 1;

/** Hard cap on how many rows a single export may collect. */
export const DB_DUMP_MAX_ROWS = 500_000;

/** The three value tables sql.0 writes to. Whitelist for anything read from a file. */
export const DUMP_TABLES = ['ts_number', 'ts_string', 'ts_bool'] as const;
export type DumpTable = (typeof DUMP_TABLES)[number];

export type DumpTrigger = 'delete-all' | 'purge' | 'dedupe' | 'orphan-delete' | 'manual';

/** One stored value: [ts, val, ack, q, sourceName]. Array-of-arrays rather than
 *  objects — at 500k rows that is roughly 60% less file size. The column order is
 *  pinned by DUMP_VERSION. */
export type DumpRow = [number, unknown, number, number, string | null];

export interface DumpSeriesBase {
  table: DumpTable;
  type: string;
  range: { from: number; to: number };
  count: number;
  rows: DumpRow[];
}

export interface NamedDumpSeries extends DumpSeriesBase {
  kind: 'named';
  id: string;
}

export interface OrphanDumpSeries extends DumpSeriesBase {
  kind: 'orphan';
  dbId: number;
}

export type DumpSeries = NamedDumpSeries | OrphanDumpSeries;

export interface Dump {
  format: typeof DUMP_FORMAT;
  version: number;
  createdAt: number;
  source: { db: string; host: string };
  trigger: DumpTrigger;
  truncated: boolean;
  series: DumpSeries[];
}

/** Series input without the derived fields (range/count). */
export type DumpSeriesInput =
  | (Omit<NamedDumpSeries, 'range' | 'count'>)
  | (Omit<OrphanDumpSeries, 'range' | 'count'>);

export interface BuildDumpInput {
  trigger: DumpTrigger;
  truncated: boolean;
  createdAt: number;
  source: { db: string; host: string };
  series: DumpSeriesInput[];
}

export function buildDump(input: BuildDumpInput): Dump {
  return {
    format: DUMP_FORMAT,
    version: DUMP_VERSION,
    createdAt: input.createdAt,
    source: input.source,
    trigger: input.trigger,
    truncated: input.truncated,
    series: input.series.map((s) => {
      // Rows arrive newest-first from the DB; derive the span from both ends
      // rather than assuming a direction.
      let from = 0;
      let to = 0;
      for (const r of s.rows) {
        const ts = r[0];
        if (from === 0 || ts < from) from = ts;
        if (ts > to) to = ts;
      }
      return { ...s, range: { from, to }, count: s.rows.length } as DumpSeries;
    }),
  };
}

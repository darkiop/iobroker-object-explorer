// Backup format for raw sql.0 value rows. This module is deliberately IO-free:
// building, parsing and validating a dump is the part that must be correct, so
// it is testable without a database.

export const DUMP_FORMAT = 'iobroker-object-explorer/db-dump';
export const DUMP_VERSION = 1;

/** Hard cap on how many rows a single export may collect.
 *
 *  A row serializes to ~44 chars, so 2M rows are ~88 MB of JSON plus ~285 MB of
 *  heap for the row arrays — comfortable in a browser tab. The walls sit much
 *  further out: V8 refuses strings beyond 536,870,888 chars (~12M rows) and the
 *  heap gives out before that. The binding constraint in practice is fetch time
 *  — 2M rows are 200 sendTo roundtrips — which is what the abort button is for.
 *
 *  The cap exists mainly for the delete guard: there a truncated export would be
 *  paired with a full delete, so it forces an explicit decision instead of
 *  silently dropping the oldest rows. */
export const DB_DUMP_MAX_ROWS = 2_000_000;

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

export function serializeDump(dump: Dump): string {
  return JSON.stringify(dump);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isUInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

/** Validates a decoded dump. A dump is a user-picked file, so nothing in it is
 *  trusted: the table name and numeric ids end up in SQL, and the row tuples are
 *  written back to the database. Throws on the first problem with a message the
 *  restore UI can show verbatim. */
export function validateDump(value: unknown): Dump {
  if (!isPlainObject(value)) throw new Error('Dump is not an object');
  if (value.format !== DUMP_FORMAT) throw new Error('This file is not a database dump');
  if (value.version !== DUMP_VERSION) {
    throw new Error(`Unsupported dump version ${String(value.version)} (expected ${DUMP_VERSION})`);
  }
  if (!isUInt(value.createdAt)) throw new Error('Invalid createdAt');
  if (typeof value.truncated !== 'boolean') throw new Error('Invalid truncated flag');
  if (!Array.isArray(value.series)) throw new Error('Dump has no series array');

  const triggers: DumpTrigger[] = ['delete-all', 'purge', 'dedupe', 'orphan-delete', 'manual'];
  if (!triggers.includes(value.trigger as DumpTrigger)) {
    throw new Error(`Unknown trigger ${String(value.trigger)}`);
  }
  if (!isPlainObject(value.source) || typeof value.source.db !== 'string' || typeof value.source.host !== 'string') {
    throw new Error('Invalid source block');
  }

  for (const s of value.series) {
    if (!isPlainObject(s)) throw new Error('Series is not an object');
    if (!(DUMP_TABLES as readonly unknown[]).includes(s.table)) {
      throw new Error(`Unknown value table ${String(s.table)}`);
    }
    if (typeof s.type !== 'string') throw new Error('Invalid series type');
    if (s.kind === 'named') {
      if (typeof s.id !== 'string' || s.id === '') throw new Error('Invalid series id');
    } else if (s.kind === 'orphan') {
      if (!isUInt(s.dbId)) throw new Error(`Invalid db id ${String(s.dbId)}`);
    } else {
      throw new Error(`Unknown series kind ${String(s.kind)}`);
    }
    if (!Array.isArray(s.rows)) throw new Error('Series has no rows array');
    for (const r of s.rows) {
      if (!Array.isArray(r) || r.length !== 5) throw new Error('Every row must have 5 columns');
      if (!isUInt(r[0]) || r[0] === 0) throw new Error(`Invalid timestamp ${String(r[0])}`);
      if (r[2] !== 0 && r[2] !== 1) throw new Error(`Invalid ack ${String(r[2])}`);
      if (!isUInt(r[3])) throw new Error(`Invalid quality ${String(r[3])}`);
      if (r[4] !== null && typeof r[4] !== 'string') throw new Error('Invalid source name');
    }
    if (!isPlainObject(s.range) || !isUInt(s.range.from) || !isUInt(s.range.to)) {
      throw new Error('Invalid series range');
    }
    if (!isUInt(s.count)) throw new Error('Invalid series count');
  }
  return value as unknown as Dump;
}

export function parseDump(text: string): Dump {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON');
  }
  return validateDump(decoded);
}

export type RestoreStatus = 'ok' | 'missing' | 'blocked';

export interface RestoreClassification {
  status: RestoreStatus;
  reason?: string;
}

/** Live state of the datapoints table, needed to judge whether a series can be
 *  restored: which ids exist by name, and which numeric ids are in use. */
export interface LiveDpIndex {
  names: Set<string>;
  ids: Set<number>;
}

/** Decides whether one dump series may be written back.
 *
 *  A named series needs its id to still exist — the restore never creates
 *  datapoints, that is the adapter's job.
 *
 *  An orphan series is blocked when its numeric id is in use again: MariaDB
 *  reuses AUTO_INCREMENT gaps, so the id may now belong to a different
 *  datapoint, and writing would inject foreign values into a live series. */
export function classifyRestoreSeries(series: DumpSeries, live: LiveDpIndex): RestoreClassification {
  if (series.kind === 'named') {
    return live.names.has(series.id)
      ? { status: 'ok' }
      : { status: 'missing', reason: `Datapoint no longer exists in the database: ${series.id}` };
  }
  return live.ids.has(series.dbId)
    ? {
        status: 'blocked',
        reason: `Numeric id ${series.dbId} has been reassigned to another datapoint — restoring would write foreign values into a live series`,
      }
    : { status: 'ok' };
}

export function dumpFilename(trigger: DumpTrigger, subject: string, now: Date): string {
  const safe = subject.replace(/[^A-Za-z0-9._-]/g, '_').replace(/\./g, '_');
  const date = now.toISOString().slice(0, 10);
  return `iobroker-dbdump-${trigger}-${safe}-${date}.json`;
}

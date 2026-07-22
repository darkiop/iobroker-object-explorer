# DB-Backup: Export vor dem Löschen und Restore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rohwerte aus der sql.0-Datenbank vor jeder destruktiven Aktion als JSON-Dump sichern und wieder zurückspielen können.

**Architecture:** Eine IO-freie Formatschicht (`src/api/dbBackup.ts`) trägt Bau, Parsen und Validierung des Dumps und ist ohne DB testbar. Ein Hook (`src/hooks/useDbBackup.ts`) orchestriert Chunk-Fetch, Progress und Restore-Lauf. Die vier bestehenden Delete-Call-Sites rufen vor dem Löschen dieselbe Export-Funktion auf; schlägt sie fehl, unterbleibt das Löschen.

**Tech Stack:** TypeScript (strict, `noUnusedLocals`/`noUnusedParameters`), React 18, Vitest + @testing-library/react, sql.0-Adapter über `sendTo`-Kommandos `query`.

**Spec:** [docs/superpowers/specs/2026-07-20-db-backup-restore-design.md](docs/superpowers/specs/2026-07-20-db-backup-restore-design.md)

---

## Wichtig vorab

`docs/` steht in [.gitignore:34](.gitignore#L34). Plan und Spec sind **nicht** im Repo — nur die Code-Änderungen werden committed.

Alle Kommentare im Code werden **englisch** geschrieben (Repo-Konvention, siehe [src/api/iobroker.ts](src/api/iobroker.ts)). UI-Strings sind zweisprachig über das vorhandene `isEn`-Muster.

`SQL_DB_NAME`, `sqlQuote()`, `querySql()` und `dpValueSql()` liegen in [src/api/iobroker.ts](src/api/iobroker.ts) und sind **modul-privat** bzw. teilexportiert. Die neuen DB-Funktionen kommen deshalb in dieselbe Datei — nicht in `dbBackup.ts`. `dbBackup.ts` bleibt strikt IO-frei.

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/api/dbBackup.ts` (neu) | Dump-Typen, `buildDump`, `serializeDump`, `parseDump`, `validateDump`, `classifyRestoreSeries`, `dumpFilename`. Keine IO. |
| `src/api/dbBackup.test.ts` (neu) | Unit-Tests der Formatschicht |
| `src/api/iobroker.ts` (ändern) | `fetchDpRowsChunked`, `fetchOrphanRowsChunked`, `insertDpValuesBatch`, `getSourceIdMap`, `getLiveDpNumericIds`; `findConsecutiveDuplicateTs` liefert zusätzlich volle Zeilen |
| `src/hooks/useDbBackup.ts` (neu) | Export-Lauf (Chunk-Loop, Cap, Progress, Download), Restore-Lauf (Batch-Insert, Report) |
| `src/hooks/useDbBackup.test.ts` (neu) | Tests des Export-Laufs mit gemockter API |
| `src/components/modals/DbBackupModal.tsx` (neu) | Restore-UI: Datei wählen, Preview, Progress, Report |
| `src/context/UIContext.tsx` (ändern) | `dbBackupBeforeDelete` in `AppSettings` + Default + Persistenz |
| `src/components/modals/SettingsModal.tsx` (ändern) | Toggle im Connection-Tab |
| `src/components/modals/DbOverviewModal.tsx` (ändern) | Delete-all mit Export davor; Restore-Button in der Toolbar |
| `src/components/modals/DpValuesModal.tsx` (ändern) | Purge und Dedupe mit Export davor |
| `src/components/modals/OrphanValuesModal.tsx` (ändern) | Orphan-Delete mit Export davor |

---

### Task 1: Dump-Typen und `buildDump`

**Files:**
- Create: `src/api/dbBackup.ts`
- Test: `src/api/dbBackup.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { buildDump, DUMP_FORMAT, DUMP_VERSION } from './dbBackup'

describe('buildDump', () => {
  it('builds a named series with range and count derived from the rows', () => {
    const dump = buildDump({
      trigger: 'delete-all',
      truncated: false,
      createdAt: 1753000000000,
      source: { db: 'iobroker', host: 'iob.local' },
      series: [{
        kind: 'named',
        id: 'alias.0.foo',
        table: 'ts_number',
        type: 'number',
        rows: [
          [1690000000000, 21.5, 1, 0, 'system.adapter.admin.0'],
          [1690000060000, 22, 1, 0, null],
        ],
      }],
    })

    expect(dump.format).toBe(DUMP_FORMAT)
    expect(dump.version).toBe(DUMP_VERSION)
    expect(dump.trigger).toBe('delete-all')
    expect(dump.series[0].count).toBe(2)
    expect(dump.series[0].range).toEqual({ from: 1690000000000, to: 1690000060000 })
  })

  it('builds an orphan series carrying dbId instead of id', () => {
    const dump = buildDump({
      trigger: 'orphan-delete',
      truncated: true,
      createdAt: 1753000000000,
      source: { db: 'iobroker', host: 'iob.local' },
      series: [{
        kind: 'orphan',
        dbId: 4711,
        table: 'ts_bool',
        type: 'boolean',
        rows: [[1690000000000, 1, 1, 0, null]],
      }],
    })

    expect(dump.truncated).toBe(true)
    expect(dump.series[0]).toMatchObject({ kind: 'orphan', dbId: 4711, count: 1 })
    expect('id' in dump.series[0]).toBe(false)
  })

  it('yields an empty range for a series with no rows', () => {
    const dump = buildDump({
      trigger: 'manual',
      truncated: false,
      createdAt: 1,
      source: { db: 'iobroker', host: 'h' },
      series: [{ kind: 'named', id: 'a.0.b', table: 'ts_number', type: 'number', rows: [] }],
    })
    expect(dump.series[0].count).toBe(0)
    expect(dump.series[0].range).toEqual({ from: 0, to: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/dbBackup.test.ts`
Expected: FAIL — `Failed to resolve import "./dbBackup"`

- [ ] **Step 3: Write minimal implementation**

Create `src/api/dbBackup.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/dbBackup.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/api/dbBackup.ts src/api/dbBackup.test.ts
git commit -m "feat(db): dump format types and buildDump"
```

---

### Task 2: `serializeDump`, `parseDump`, `validateDump`

**Files:**
- Modify: `src/api/dbBackup.ts`
- Test: `src/api/dbBackup.test.ts`

- [ ] **Step 1: Write the failing test**

An `src/api/dbBackup.test.ts` anhängen (Import-Zeile oben erweitern auf
`import { buildDump, serializeDump, parseDump, DUMP_FORMAT, DUMP_VERSION } from './dbBackup'`):

```ts
describe('parseDump', () => {
  const valid = () => buildDump({
    trigger: 'manual',
    truncated: false,
    createdAt: 1753000000000,
    source: { db: 'iobroker', host: 'iob.local' },
    series: [{
      kind: 'named',
      id: 'alias.0.foo',
      table: 'ts_number',
      type: 'number',
      rows: [[1690000000000, 21.5, 1, 0, 'system.adapter.admin.0'] as const] as never,
    }],
  })

  it('round-trips every field including q and src', () => {
    const parsed = parseDump(serializeDump(valid()))
    expect(parsed).toEqual(valid())
    expect(parsed.series[0].rows[0]).toEqual([1690000000000, 21.5, 1, 0, 'system.adapter.admin.0'])
  })

  it('keeps a null src as null', () => {
    const d = valid()
    d.series[0].rows[0][4] = null
    expect(parseDump(serializeDump(d)).series[0].rows[0][4]).toBeNull()
  })

  it('rejects a wrong format tag', () => {
    const d = { ...valid(), format: 'something/else' }
    expect(() => parseDump(JSON.stringify(d))).toThrow(/not a database dump/i)
  })

  it('rejects an unknown version', () => {
    const d = { ...valid(), version: 99 }
    expect(() => parseDump(JSON.stringify(d))).toThrow(/version 99/i)
  })

  it('rejects a table outside the whitelist', () => {
    const d = valid()
    ;(d.series[0] as { table: string }).table = 'ts_evil; DROP TABLE datapoints'
    expect(() => parseDump(JSON.stringify(d))).toThrow(/unknown value table/i)
  })

  it('rejects a row with the wrong number of columns', () => {
    const d = valid()
    ;(d.series[0].rows as unknown[])[0] = [1690000000000, 21.5, 1]
    expect(() => parseDump(JSON.stringify(d))).toThrow(/5 columns/i)
  })

  it.each([
    ['a string ts', '1690000000000'],
    ['a negative ts', -5],
    ['NaN as ts', Number.NaN],
    ['a fractional ts', 1.5],
  ])('rejects %s', (_label, ts) => {
    const d = valid()
    ;(d.series[0].rows[0] as unknown[])[0] = ts
    expect(() => parseDump(JSON.stringify(d))).toThrow(/timestamp/i)
  })

  it('rejects an ack outside 0/1', () => {
    const d = valid()
    ;(d.series[0].rows[0] as unknown[])[2] = 7
    expect(() => parseDump(JSON.stringify(d))).toThrow(/ack/i)
  })

  it('rejects an orphan series with a non-integer dbId', () => {
    const d = buildDump({
      trigger: 'orphan-delete', truncated: false, createdAt: 1,
      source: { db: 'iobroker', host: 'h' },
      series: [{ kind: 'orphan', dbId: 1, table: 'ts_bool', type: 'boolean', rows: [] }],
    })
    ;(d.series[0] as { dbId: unknown }).dbId = '4711 OR 1=1'
    expect(() => parseDump(JSON.stringify(d))).toThrow(/db id/i)
  })

  it('rejects invalid JSON with a readable message', () => {
    expect(() => parseDump('{ not json')).toThrow(/not valid json/i)
  })

  it('preserves truncated: true', () => {
    const d = { ...valid(), truncated: true }
    expect(parseDump(JSON.stringify(d)).truncated).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/dbBackup.test.ts`
Expected: FAIL — `serializeDump is not exported` / `parseDump is not a function`

- [ ] **Step 3: Write minimal implementation**

An `src/api/dbBackup.ts` anhängen:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/dbBackup.test.ts`
Expected: PASS, alle Tests aus Task 1 und 2

- [ ] **Step 5: Commit**

```bash
git add src/api/dbBackup.ts src/api/dbBackup.test.ts
git commit -m "feat(db): dump serialization and hardened validation"
```

---

### Task 3: `classifyRestoreSeries` und `dumpFilename`

**Files:**
- Modify: `src/api/dbBackup.ts`
- Test: `src/api/dbBackup.test.ts`

- [ ] **Step 1: Write the failing test**

An `src/api/dbBackup.test.ts` anhängen (Import erweitern um `classifyRestoreSeries, dumpFilename`):

```ts
describe('classifyRestoreSeries', () => {
  const named = (id: string) => ({
    kind: 'named' as const, id, table: 'ts_number' as const, type: 'number',
    range: { from: 1, to: 2 }, count: 0, rows: [],
  })
  const orphan = (dbId: number) => ({
    kind: 'orphan' as const, dbId, table: 'ts_number' as const, type: 'number',
    range: { from: 1, to: 2 }, count: 0, rows: [],
  })

  const live = { names: new Set(['alias.0.foo']), ids: new Set([1, 2, 3]) }

  it('marks a named series ok when the id still exists', () => {
    expect(classifyRestoreSeries(named('alias.0.foo'), live).status).toBe('ok')
  })

  it('marks a named series missing when the id is gone', () => {
    const r = classifyRestoreSeries(named('alias.0.gone'), live)
    expect(r.status).toBe('missing')
    expect(r.reason).toMatch(/no longer exists/i)
  })

  it('blocks an orphan series whose dbId was reassigned', () => {
    const r = classifyRestoreSeries(orphan(2), live)
    expect(r.status).toBe('blocked')
    expect(r.reason).toMatch(/reassigned/i)
  })

  it('marks an orphan series ok when its dbId is still free', () => {
    expect(classifyRestoreSeries(orphan(99), live).status).toBe('ok')
  })
})

describe('dumpFilename', () => {
  it('encodes trigger, subject and date', () => {
    const name = dumpFilename('purge', 'alias.0.foo', new Date('2026-07-20T10:00:00Z'))
    expect(name).toBe('iobroker-dbdump-purge-alias_0_foo-2026-07-20.json')
  })

  it('strips characters that are unsafe in a filename', () => {
    expect(dumpFilename('manual', 'a/b\\c:d*?"<>|e', new Date('2026-07-20T00:00:00Z')))
      .toBe('iobroker-dbdump-manual-a_b_c_d_______e-2026-07-20.json')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/dbBackup.test.ts -t classifyRestoreSeries`
Expected: FAIL — `classifyRestoreSeries is not a function`

- [ ] **Step 3: Write minimal implementation**

An `src/api/dbBackup.ts` anhängen:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/dbBackup.test.ts`
Expected: PASS, alle Tests

- [ ] **Step 5: Commit**

```bash
git add src/api/dbBackup.ts src/api/dbBackup.test.ts
git commit -m "feat(db): restore series classification and dump filename"
```

---

### Task 4: Chunk-Fetch der Rohzeilen

**Files:**
- Modify: `src/api/iobroker.ts` (anhängen hinter `getDpValues`, ca. Zeile 989)

- [ ] **Step 1: Implementation schreiben**

Diese Funktionen sind reine DB-Zugriffe und werden über den Hook-Test in Task 8 abgedeckt — kein eigener Unit-Test, weil ohne laufende sql.0-Instanz nur der Mock getestet würde.

Ganz oben in der Datei den Import ergänzen:

```ts
import type { DumpRow, DumpTable } from './dbBackup';
```

Hinter `getDpValues` einfügen:

```ts
// --- Backup: chunked raw row fetch -------------------------------------------

/** Rows per request when streaming a datapoint out of the database. Large enough
 *  to keep the roundtrip count sane, small enough that a single sendTo response
 *  stays manageable. */
const BACKUP_FETCH_CHUNK = 10_000;

export interface ChunkedFetchOptions {
  startTs?: number | null;
  endTs?: number | null;
  /** Stop after this many rows (newest first). */
  cap: number;
  /** Called after every chunk with the running total. */
  onProgress?: (fetched: number) => void;
  signal?: AbortSignal;
}

async function fetchRowsChunked(
  table: string,
  numId: number,
  opts: ChunkedFetchOptions,
): Promise<DumpRow[]> {
  let where = `n.id = ${numId}`;
  if (opts.startTs != null && !Number.isNaN(opts.startTs)) where += ` AND n.ts >= ${Math.floor(opts.startTs)}`;
  if (opts.endTs != null && !Number.isNaN(opts.endTs)) where += ` AND n.ts <= ${Math.floor(opts.endTs)}`;

  const out: DumpRow[] = [];
  let offset = 0;
  for (;;) {
    if (opts.signal?.aborted) throw new Error('Export aborted');
    const remaining = opts.cap - out.length;
    if (remaining <= 0) break;
    const limit = Math.min(BACKUP_FETCH_CHUNK, remaining);
    const rows = await querySql(
      `SELECT n.ts, n.val, n.ack, n.q, s.name AS src ` +
      `FROM ${SQL_DB_NAME}.${table} n ` +
      `LEFT JOIN ${SQL_DB_NAME}.sources s ON s.id = n._from ` +
      `WHERE ${where} ORDER BY n.ts DESC LIMIT ${limit} OFFSET ${offset}`
    );
    for (const r of rows) {
      const o = r as Record<string, unknown>;
      out.push([
        Number(o.ts ?? 0),
        o.val,
        Number(o.ack ?? 0) === 1 ? 1 : 0,
        Number(o.q ?? 0),
        o.src == null ? null : String(o.src),
      ]);
    }
    opts.onProgress?.(out.length);
    if (rows.length < limit) break;
    offset += limit;
  }
  return out;
}

/** Streams the raw stored rows of a datapoint, newest first. */
export async function fetchDpRowsChunked(
  id: string,
  type: unknown,
  opts: ChunkedFetchOptions,
): Promise<DumpRow[]> {
  const numId = await resolveDpNumericId(id);
  if (numId == null || Number.isNaN(numId)) {
    throw new Error(`Datapoint not found in database: ${id}`);
  }
  return fetchRowsChunked(tsTableForType(type), numId, opts);
}

/** Streams the raw rows of an orphan group. Orphans have no name left, so the
 *  lookup goes through the numeric id directly instead of datapoints.name. */
export async function fetchOrphanRowsChunked(
  table: DumpTable,
  dbId: number,
  opts: ChunkedFetchOptions,
): Promise<DumpRow[]> {
  if (!(TS_TABLES as readonly string[]).includes(table)) {
    throw new Error(`Unknown value table: ${table}`);
  }
  const numId = Math.floor(Number(dbId));
  if (!Number.isFinite(numId)) throw new Error(`Invalid db id: ${dbId}`);
  return fetchRowsChunked(table, numId, opts);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: keine neuen Fehler

- [ ] **Step 4: Commit**

```bash
git add src/api/iobroker.ts
git commit -m "feat(db): chunked raw value fetch for backups"
```

---

### Task 5: Batch-Insert und Live-Index für den Restore

**Files:**
- Modify: `src/api/iobroker.ts` (anhängen hinter `insertDpValue`, ca. Zeile 1280)

- [ ] **Step 1: Implementation schreiben**

```ts
// --- Backup: restore -----------------------------------------------------------

/** Rows per INSERT statement during a restore. */
const RESTORE_INSERT_CHUNK = 5_000;

/** Maps sources.name → sources.id, so a dump's source names can be written back
 *  as _from. Names missing from the table fall back to 0 — the restore never
 *  inserts into `sources`, that stays the adapter's business. */
export async function getSourceIdMap(): Promise<Record<string, number>> {
  const rows = await querySql(`SELECT id, name FROM ${SQL_DB_NAME}.sources`);
  const map: Record<string, number> = {};
  for (const r of rows) {
    const o = r as { id?: unknown; name?: unknown };
    if (o.name != null) map[String(o.name)] = Number(o.id);
  }
  return map;
}

/** Live datapoints index used to classify dump series before restoring. */
export async function getLiveDpIndex(): Promise<{ names: Set<string>; ids: Set<number> }> {
  const rows = await querySql(`SELECT id, name FROM ${SQL_DB_NAME}.datapoints`);
  const names = new Set<string>();
  const ids = new Set<number>();
  for (const r of rows) {
    const o = r as { id?: unknown; name?: unknown };
    if (o.name != null) names.add(String(o.name));
    ids.add(Number(o.id));
  }
  return { names, ids };
}

export interface BatchInsertResult {
  inserted: number;
  skipped: number;
}

/** Writes dump rows back into a value table.
 *
 *  INSERT IGNORE relies on the (id, ts) primary key: rows that already exist stay
 *  untouched and are reported as skipped. That gives skip-and-report semantics
 *  atomically per block, without pulling half a million timestamps into the
 *  browser first and without a check-then-insert race in between.
 *
 *  `rows` carry a source *name*; the caller resolves it to a numeric _from via
 *  getSourceIdMap() and passes the resolved map in. */
export async function insertDpValuesBatch(
  table: DumpTable,
  type: unknown,
  numId: number,
  rows: DumpRow[],
  sourceIds: Record<string, number>,
  onProgress?: (done: number) => void,
  signal?: AbortSignal,
): Promise<BatchInsertResult & { unresolvedSources: number }> {
  if (!(TS_TABLES as readonly string[]).includes(table)) {
    throw new Error(`Unknown value table: ${table}`);
  }
  const id = Math.floor(Number(numId));
  if (!Number.isFinite(id)) throw new Error(`Invalid db id: ${numId}`);

  let inserted = 0;
  let unresolvedSources = 0;

  for (let i = 0; i < rows.length; i += RESTORE_INSERT_CHUNK) {
    if (signal?.aborted) throw new Error('Restore aborted');
    const chunk = rows.slice(i, i + RESTORE_INSERT_CHUNK);
    const values = chunk.map((r) => {
      const src = r[4];
      let from = 0;
      if (src != null) {
        const resolved = sourceIds[src];
        if (resolved == null) unresolvedSources += 1;
        else from = resolved;
      }
      // dpValueSql quotes strings and coerces per type; it throws on values that
      // cannot be represented, which is what we want for untrusted file input.
      return `(${id}, ${Math.floor(r[0])}, ${dpValueSql(type, r[1])}, ${r[2] === 1 ? 1 : 0}, ${from}, ${Math.floor(r[3])})`;
    });
    const res = (await sendToSql(
      'query',
      `INSERT IGNORE INTO ${SQL_DB_NAME}.${table} (id, ts, val, ack, _from, q) VALUES ${values.join(', ')}`
    )) as { error?: unknown; result?: { affectedRows?: number } } | null;
    if (res && typeof res === 'object' && res.error) throw new Error(String(res.error));
    // MariaDB reports how many rows the statement actually wrote; the rest hit
    // the primary key and were ignored.
    const affected = Number(res?.result?.affectedRows ?? 0);
    inserted += affected;
    onProgress?.(i + chunk.length);
  }

  return { inserted, skipped: rows.length - inserted, unresolvedSources };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler

Falls `dpValueSql` oder `sendToSql` als nicht sichtbar gemeldet werden: beide stehen in derselben Datei (`dpValueSql` ist exportiert, `sendToSql` modul-privat) — der Code muss unterhalb ihrer Definitionen stehen.

- [ ] **Step 3: Commit**

```bash
git add src/api/iobroker.ts
git commit -m "feat(db): batch insert and live datapoint index for restore"
```

---

### Task 6: Dedupe-Scan liefert volle Zeilen

Der Dedupe-Export soll ohne zweite Abfrage auskommen. `findConsecutiveDuplicateTs` liest heute nur `ts` und `val` und wirft die Werte danach weg — für einen verlustfreien Dump fehlen `ack`, `q` und `src`.

**Files:**
- Modify: `src/api/iobroker.ts:1034-1066` (`findConsecutiveDuplicateTs`)
- Test: `src/api/iobroker.test.ts`

- [ ] **Step 1: Write the failing test**

An `src/api/iobroker.test.ts` anhängen:

```ts
import { pickDuplicateRows } from './iobroker'

describe('pickDuplicateRows', () => {
  it('returns the full row tuple of every repeat, keeping the first of a run', () => {
    const rows = [
      { ts: 1, val: 5, ack: 1, q: 0, src: 'a' },
      { ts: 2, val: 5, ack: 1, q: 0, src: 'a' },
      { ts: 3, val: 5, ack: 0, q: 2, src: null },
      { ts: 4, val: 6, ack: 1, q: 0, src: 'a' },
    ]
    const res = pickDuplicateRows(rows, 'number', null)
    expect(res.rows).toEqual([
      [2, 5, 1, 0, 'a'],
      [3, 5, 0, 2, null],
    ])
    expect(res.last).toEqual({ val: 6 })
  })

  it('compares across a chunk border via prev', () => {
    const res = pickDuplicateRows(
      [{ ts: 9, val: 5, ack: 1, q: 0, src: null }],
      'number',
      { val: 5 },
    )
    expect(res.rows).toEqual([[9, 5, 1, 0, null]])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/iobroker.test.ts -t pickDuplicateRows`
Expected: FAIL — `pickDuplicateRows is not a function`

- [ ] **Step 3: Write minimal implementation**

`findConsecutiveDuplicateTs` in [src/api/iobroker.ts:1034](src/api/iobroker.ts#L1034) so ersetzen, dass sie volle Zeilen sammelt und die alte Signatur als dünner Wrapper erhalten bleibt (die Aufrufer in `DpValuesModal` erwarten weiterhin eine ts-Liste):

```ts
export interface DedupeScanRow {
  ts: number;
  val: unknown;
  ack: number;
  q: number;
  src: string | null;
}

/** Picks the full row tuples of all rows that merely repeat the previous value.
 *  `rows` must be sorted by ts ascending; the first row of a run is kept, so a
 *  step chart drawn from the remaining rows is identical. `prev` carries the last
 *  value of the preceding chunk across chunk borders. */
export function pickDuplicateRows(
  rows: DedupeScanRow[],
  type: unknown,
  prev: { val: string | number } | null,
): { rows: DumpRow[]; last: { val: string | number } | null } {
  const out: DumpRow[] = [];
  let last = prev;
  for (const r of rows) {
    const norm = normalizeVal(r.val, type);
    if (last != null && last.val === norm) {
      out.push([r.ts, r.val, r.ack === 1 ? 1 : 0, r.q, r.src]);
    }
    last = { val: norm };
  }
  return { rows: out, last };
}

/** Scans the stored values of a datapoint (ts ascending) and returns the full
 *  rows of every entry that merely repeats the previous value.
 *  Reads via the PK index (id, ts) — no filesort, no window functions (the sql.0
 *  backend may run MariaDB < 10.2). Selects ack/q/source as well so a backup of
 *  the deleted rows needs no second pass over the table. */
export async function findConsecutiveDuplicateRows(
  id: string,
  type: unknown,
  startTs?: number | null,
  endTs?: number | null,
): Promise<DumpRow[]> {
  const numId = await resolveDpNumericId(id);
  if (numId == null || Number.isNaN(numId)) return [];
  const table = tsTableForType(type);
  let where = `n.id = ${numId}`;
  if (startTs != null && !Number.isNaN(startTs)) where += ` AND n.ts >= ${Math.floor(startTs)}`;
  if (endTs != null && !Number.isNaN(endTs)) where += ` AND n.ts <= ${Math.floor(endTs)}`;

  const all: DumpRow[] = [];
  let prev: { val: string | number } | null = null;
  let offset = 0;
  for (;;) {
    const rows = await querySql(
      `SELECT n.ts, n.val, n.ack, n.q, s.name AS src FROM ${SQL_DB_NAME}.${table} n ` +
      `LEFT JOIN ${SQL_DB_NAME}.sources s ON s.id = n._from ` +
      `WHERE ${where} ORDER BY n.ts ASC LIMIT ${DEDUPE_SCAN_CHUNK} OFFSET ${offset}`
    );
    if (rows.length === 0) break;
    const mapped: DedupeScanRow[] = rows.map((r) => {
      const o = r as Record<string, unknown>;
      return {
        ts: Number(o.ts ?? 0),
        val: o.val,
        ack: Number(o.ack ?? 0),
        q: Number(o.q ?? 0),
        src: o.src == null ? null : String(o.src),
      };
    });
    const res = pickDuplicateRows(mapped, type, prev);
    all.push(...res.rows);
    prev = res.last;
    if (rows.length < DEDUPE_SCAN_CHUNK) break;
    offset += DEDUPE_SCAN_CHUNK;
  }
  return all;
}

/** Timestamp-only view of findConsecutiveDuplicateRows, kept for the existing
 *  dedupe confirm/verify flow in DpValuesModal. */
export async function findConsecutiveDuplicateTs(
  id: string,
  type: unknown,
  startTs?: number | null,
  endTs?: number | null,
): Promise<number[]> {
  return (await findConsecutiveDuplicateRows(id, type, startTs, endTs)).map((r) => r[0]);
}
```

Die bisherige Hilfsfunktion `pickDuplicateTs` wird dadurch überflüssig. Prüfen und entfernen:

Run: `grep -rn "pickDuplicateTs" src/`
Falls nur noch die Definition und deren Tests übrig sind: Definition löschen und die zugehörigen Tests in `src/api/iobroker.test.ts` auf `pickDuplicateRows` umstellen (`res.ts` → `res.rows.map(r => r[0])`). `noUnusedLocals` bricht den Build sonst.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/api/iobroker.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck und Commit**

```bash
npx tsc --noEmit
git add src/api/iobroker.ts src/api/iobroker.test.ts
git commit -m "feat(db): dedupe scan returns full rows for backup"
```

---

### Task 7: `dbBackupBeforeDelete` in AppSettings

**Files:**
- Modify: `src/context/UIContext.tsx:85` (Interface), `:130` (Defaults), `:219` (Persistenz-Parsing)

- [ ] **Step 1: Interface erweitern**

Direkt hinter `dragDropEnabled: boolean;` ([UIContext.tsx:85](src/context/UIContext.tsx#L85)):

```ts
  /** When on, every destructive database action (delete-all, 3-month purge,
   *  dedupe, orphan delete) downloads a JSON dump of the affected rows first and
   *  aborts the delete if that export fails. On by default. */
  dbBackupBeforeDelete: boolean;
```

- [ ] **Step 2: Default ergänzen**

Direkt hinter `dragDropEnabled: false,` ([UIContext.tsx:130](src/context/UIContext.tsx#L130)):

```ts
    dbBackupBeforeDelete: true,
```

- [ ] **Step 3: Persistenz-Parsing ergänzen**

Direkt hinter `dragDropEnabled: parsed.dragDropEnabled === true,` ([UIContext.tsx:219](src/context/UIContext.tsx#L219)):

```ts
      // Default on: an absent key (settings saved before this feature existed)
      // must mean "backup enabled", so `!== false` rather than `=== true`.
      dbBackupBeforeDelete: parsed.dbBackupBeforeDelete !== false,
```

- [ ] **Step 4: Toggle im Settings-Modal**

In [src/components/modals/SettingsModal.tsx](src/components/modals/SettingsModal.tsx) im Connection-Tab, direkt unter dem Feld für `adminPort`, mit demselben Checkbox-Markup wie die benachbarten Booleans (dort abschauen und Klassen 1:1 übernehmen):

```tsx
<label className="flex items-center gap-2 text-sm cursor-pointer select-none">
  <input
    type="checkbox"
    checked={settingsDraft.dbBackupBeforeDelete}
    onChange={(e) => setSettingsDraft({ ...settingsDraft, dbBackupBeforeDelete: e.target.checked })}
  />
  <span>
    {isEn ? 'Back up database values before deleting' : 'DB-Werte vor dem Löschen sichern'}
  </span>
</label>
<p className="text-xs text-gray-500 dark:text-gray-400 ml-6">
  {isEn
    ? 'Downloads a JSON dump of the affected rows before delete-all, 3-month purge, dedupe and orphan delete. If the export fails, nothing is deleted.'
    : 'Lädt vor Delete-all, 3-Monats-Purge, Dedupe und Orphan-Delete einen JSON-Dump der betroffenen Zeilen herunter. Schlägt der Export fehl, wird nichts gelöscht.'}
</p>
```

- [ ] **Step 5: Typecheck und Commit**

```bash
npx tsc --noEmit
git add src/context/UIContext.tsx src/components/modals/SettingsModal.tsx
git commit -m "feat(db): add dbBackupBeforeDelete setting"
```

---

### Task 8: Export-Hook `useDbBackup`

**Files:**
- Create: `src/hooks/useDbBackup.ts`
- Test: `src/hooks/useDbBackup.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDbBackup } from './useDbBackup'
import { parseDump } from '../api/dbBackup'

const fetchDpRowsChunked = vi.fn()
const getDpValueCount = vi.fn()

vi.mock('../api/iobroker', () => ({
  fetchDpRowsChunked: (...a: unknown[]) => fetchDpRowsChunked(...a),
  fetchOrphanRowsChunked: vi.fn(),
  getDpValueCount: (...a: unknown[]) => getDpValueCount(...a),
  insertDpValuesBatch: vi.fn(),
  getSourceIdMap: vi.fn(),
  getLiveDpIndex: vi.fn(),
  tsTableForType: (t: unknown) => (t === 'string' ? 'ts_string' : t === 'boolean' ? 'ts_bool' : 'ts_number'),
}))

// Capture what the hook would download instead of touching the DOM.
const downloads: { name: string; text: string }[] = []

beforeEach(() => {
  downloads.length = 0
  fetchDpRowsChunked.mockReset()
  getDpValueCount.mockReset()
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:fake',
    revokeObjectURL: () => {},
  })
})

function harness() {
  return renderHook(() =>
    useDbBackup({
      onDownload: (name, text) => downloads.push({ name, text }),
    }),
  )
}

describe('useDbBackup export', () => {
  it('writes a valid dump containing the fetched rows', async () => {
    getDpValueCount.mockResolvedValue(2)
    fetchDpRowsChunked.mockResolvedValue([
      [1690000060000, 22, 1, 0, null],
      [1690000000000, 21.5, 1, 0, 'system.adapter.admin.0'],
    ])

    const { result } = harness()
    await act(async () => {
      await result.current.exportNamed({
        id: 'alias.0.foo', type: 'number', trigger: 'delete-all', startTs: null, endTs: null,
      })
    })

    expect(downloads).toHaveLength(1)
    const dump = parseDump(downloads[0].text)
    expect(dump.trigger).toBe('delete-all')
    expect(dump.truncated).toBe(false)
    expect(dump.series[0].count).toBe(2)
    expect(downloads[0].name).toMatch(/^iobroker-dbdump-delete-all-alias_0_foo-\d{4}-\d{2}-\d{2}\.json$/)
  })

  it('reports needsCapDecision instead of exporting when the count exceeds the cap', async () => {
    getDpValueCount.mockResolvedValue(600_000)

    const { result } = harness()
    let outcome: unknown
    await act(async () => {
      outcome = await result.current.exportNamed({
        id: 'alias.0.foo', type: 'number', trigger: 'purge', startTs: null, endTs: null,
      })
    })

    expect(outcome).toEqual({ ok: false, needsCapDecision: true, total: 600_000, cap: 500_000 })
    expect(fetchDpRowsChunked).not.toHaveBeenCalled()
    expect(downloads).toHaveLength(0)
  })

  it('marks the dump truncated when the cap decision was accepted', async () => {
    getDpValueCount.mockResolvedValue(600_000)
    fetchDpRowsChunked.mockResolvedValue([[1690000000000, 1, 1, 0, null]])

    const { result } = harness()
    await act(async () => {
      await result.current.exportNamed({
        id: 'alias.0.foo', type: 'number', trigger: 'purge', startTs: null, endTs: null, acceptCap: true,
      })
    })

    expect(parseDump(downloads[0].text).truncated).toBe(true)
  })

  it('downloads nothing and reports the error when a chunk fails', async () => {
    getDpValueCount.mockResolvedValue(10)
    fetchDpRowsChunked.mockRejectedValue(new Error('sendTo timeout'))

    const { result } = harness()
    let outcome: { ok: boolean; error?: string } | undefined
    await act(async () => {
      outcome = await result.current.exportNamed({
        id: 'alias.0.foo', type: 'number', trigger: 'delete-all', startTs: null, endTs: null,
      }) as { ok: boolean; error?: string }
    })

    expect(outcome?.ok).toBe(false)
    expect(outcome?.error).toMatch(/sendTo timeout/)
    expect(downloads).toHaveLength(0)
  })

  it('tracks progress phases', async () => {
    getDpValueCount.mockResolvedValue(3)
    fetchDpRowsChunked.mockImplementation(async (_id, _type, opts: { onProgress?: (n: number) => void }) => {
      opts.onProgress?.(3)
      return [[1690000000000, 1, 1, 0, null]]
    })

    const { result } = harness()
    await act(async () => {
      await result.current.exportNamed({
        id: 'alias.0.foo', type: 'number', trigger: 'manual', startTs: null, endTs: null,
      })
    })

    // Back to idle once the run finished.
    expect(result.current.progress).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useDbBackup.test.ts`
Expected: FAIL — `Failed to resolve import "./useDbBackup"`

- [ ] **Step 3: Write minimal implementation**

Create `src/hooks/useDbBackup.ts`:

```ts
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
  rows: import('../api/dbBackup').DumpRow[];
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useDbBackup.test.ts`
Expected: PASS, 5 Tests

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/hooks/useDbBackup.ts src/hooks/useDbBackup.test.ts
git commit -m "feat(db): export side of the backup hook"
```

---

### Task 9: Delete-all im DbOverviewModal absichern

**Files:**
- Modify: `src/components/modals/DbOverviewModal.tsx:137-152` (`handleDeleteConfirm`) und die Stelle, an der `setPendingDelete` gesetzt wird

- [ ] **Step 1: `pendingDelete` um den Typ erweitern**

`handleDeleteConfirm` braucht `type`, um die richtige `ts_*`-Tabelle zu treffen. `pendingDelete` ist heute ein reiner ID-String.

`grep -n "pendingDelete" src/components/modals/DbOverviewModal.tsx` ausführen und an allen Fundstellen umstellen:

```tsx
// State-Deklaration
const [pendingDelete, setPendingDelete] = useState<{ id: string; type: unknown } | null>(null);
```

Am Setz-Aufruf im Zeilen-Button (der Delete-Button bei ca. Zeile 587) `setPendingDelete(r.id)` ersetzen durch:

```tsx
setPendingDelete({ id: r.id, type: r.type })
```

Im Bestätigungstext (ca. Zeile 648) `pendingDelete` durch `pendingDelete.id` ersetzen.

- [ ] **Step 2: Export vor dem Delete einhängen**

Imports oben ergänzen:

```tsx
import { useDbBackup } from '../../hooks/useDbBackup';
import { useAppSettings } from '../../context/UIContext';
```

(Den exakten Namen des Settings-Hooks aus einem benachbarten Modal übernehmen — `grep -n "appSettings" src/components/modals/DpValuesModal.tsx | head -3`.)

Im Komponenten-Body:

```tsx
const { appSettings } = useAppSettings();
const backup = useDbBackup();
const [capPrompt, setCapPrompt] = useState<{ total: number; cap: number } | null>(null);
```

`handleDeleteConfirm` ersetzen:

```tsx
// Runs the backup export first when enabled and only deletes if it succeeded —
// a dump written after the delete would be worthless, and one that fails
// silently is worse than none.
async function handleDeleteConfirm(acceptCap = false) {
  if (!pendingDelete) return;
  setDeleting(true);
  try {
    if (appSettings.dbBackupBeforeDelete) {
      const res = await backup.exportNamed({
        id: pendingDelete.id,
        type: pendingDelete.type,
        trigger: 'delete-all',
        startTs: null,
        endTs: null,
        acceptCap,
      });
      if (!res.ok) {
        if ('needsCapDecision' in res) {
          setCapPrompt({ total: res.total, cap: res.cap });
          return;
        }
        showToast(
          isEn ? `Backup failed, nothing deleted: ${res.error}` : `Backup fehlgeschlagen, nichts gelöscht: ${res.error}`,
          'error',
        );
        return;
      }
    }
    await deleteHistoryAll(pendingDelete.id);
    showToast(
      isEn ? `Deleted DB values for ${pendingDelete.id}` : `DB-Werte für ${pendingDelete.id} gelöscht`,
      'success'
    );
    setPendingDelete(null);
    setCapPrompt(null);
    await queryClient.invalidateQueries({ queryKey: queryKeys.history.dpOverview });
  } catch (err) {
    showToast(err instanceof Error ? err.message : String(err), 'error');
  } finally {
    setDeleting(false);
  }
}
```

- [ ] **Step 3: Cap-Dialog und Progress rendern**

Direkt vor dem bestehenden `{pendingDelete && (` -Block einfügen:

```tsx
{capPrompt && (
  <div className="shrink-0 border-t border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-5 py-3 flex items-center gap-3">
    <AlertTriangle size={15} className="text-amber-500 shrink-0" />
    <span className="text-xs text-amber-800 dark:text-amber-200 flex-1">
      {isEn
        ? `${capPrompt.total.toLocaleString()} rows exceed the export limit of ${capPrompt.cap.toLocaleString()}. Only the newest ${capPrompt.cap.toLocaleString()} can be backed up — the oldest rows would be lost from the dump.`
        : `${capPrompt.total.toLocaleString()} Zeilen überschreiten das Export-Limit von ${capPrompt.cap.toLocaleString()}. Nur die neuesten ${capPrompt.cap.toLocaleString()} können gesichert werden — die ältesten Zeilen fehlen dann im Dump.`}
    </span>
    <button
      onClick={() => { setCapPrompt(null); setPendingDelete(null); }}
      className="px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      {isEn ? 'Cancel' : 'Abbrechen'}
    </button>
    <button
      onClick={() => { setCapPrompt(null); void handleDeleteConfirm(true); }}
      className="px-3 py-1 text-xs rounded bg-amber-600 hover:bg-amber-700 text-white font-medium"
    >
      {isEn ? 'Back up newest and delete' : 'Neueste sichern und löschen'}
    </button>
  </div>
)}
{backup.progress && (
  <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 px-5 py-2 flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300">
    <Loader2 size={12} className="animate-spin" />
    <span>
      {backup.progress.phase === 'counting'
        ? (isEn ? 'Counting rows…' : 'Zeilen zählen…')
        : backup.progress.phase === 'fetching'
          ? (isEn
              ? `Backing up ${backup.progress.done.toLocaleString()} / ${backup.progress.total.toLocaleString()}`
              : `Sichere ${backup.progress.done.toLocaleString()} / ${backup.progress.total.toLocaleString()}`)
          : (isEn ? 'Writing file…' : 'Datei schreiben…')}
    </span>
    <button onClick={backup.abort} className="underline">
      {isEn ? 'Cancel' : 'Abbrechen'}
    </button>
  </div>
)}
```

Der `onClick` des bestehenden Delete-Buttons (ca. Zeile 661) wird zu `onClick={() => void handleDeleteConfirm()}`.

- [ ] **Step 4: Manuell prüfen**

Run: `npm run dev`, DB-Overview öffnen, bei einem kleinen Datenpunkt auf Löschen → Datei muss heruntergeladen werden, danach verschwinden die Werte. Setting ausschalten → kein Download, Delete läuft wie vorher.

- [ ] **Step 5: Typecheck, Lint, Commit**

```bash
npx tsc --noEmit && npm run lint && npm test
git add src/components/modals/DbOverviewModal.tsx
git commit -m "feat(db): back up values before delete-all"
```

---

### Task 10: Purge und Dedupe im DpValuesModal absichern

**Files:**
- Modify: `src/components/modals/DpValuesModal.tsx:131-158` (`purgeOld`), `:174-195` (`runDedupe`), `:161-173` (`scanDedupe`)

- [ ] **Step 1: Hook einbinden**

Imports ergänzen (`findConsecutiveDuplicateRows` zusätzlich zu den bestehenden aus `../../api/iobroker`):

```tsx
import { useDbBackup } from '../../hooks/useDbBackup';
import type { DumpRow } from '../../api/dbBackup';
```

Im Komponenten-Body, neben den vorhandenen States:

```tsx
const backup = useDbBackup();
const [capPrompt, setCapPrompt] = useState<{ total: number; cap: number; action: 'purge' } | null>(null);
const [dedupeRows, setDedupeRows] = useState<DumpRow[] | null>(null);
```

- [ ] **Step 2: `scanDedupe` speichert die vollen Zeilen**

Der Scan liest ts und val ohnehin; mit Task 6 liefert er auch ack/q/src. Damit kostet der Dedupe-Export keine zweite Abfrage.

```tsx
async function scanDedupe(wholeDp: boolean) {
  setDedupeTs(null);
  setDedupeRows(null);
  setConfirmDedupe(true);
  setScanningDedupe(true);
  try {
    const rows = await findConsecutiveDuplicateRows(
      id, type, wholeDp ? null : startTs, wholeDp ? null : endTs,
    );
    setDedupeRows(rows);
    setDedupeTs(rows.map((r) => r[0]));
  } catch (err) {
    showToast(err instanceof Error ? err.message : String(err), 'error');
    setDedupeTs([]);
    setDedupeRows([]);
  } finally {
    setScanningDedupe(false);
  }
}
```

- [ ] **Step 3: `purgeOld` sichert vorher**

`await deleteHistoryRange(id, 1, purgeCutoff);` im `try`-Block von `purgeOld` ersetzen durch:

```tsx
      if (appSettings.dbBackupBeforeDelete) {
        const res = await backup.exportNamed({
          id, type, trigger: 'purge', startTs: null, endTs: purgeCutoff, acceptCap,
        });
        if (!res.ok) {
          if ('needsCapDecision' in res) {
            setCapPrompt({ total: res.total, cap: res.cap, action: 'purge' });
            return;
          }
          showToast(
            isEn ? `Backup failed, nothing deleted: ${res.error}` : `Backup fehlgeschlagen, nichts gelöscht: ${res.error}`,
            'error',
          );
          return;
        }
      }
      await deleteHistoryRange(id, 1, purgeCutoff);
```

Die Signatur wird zu `async function purgeOld(acceptCap = false)`, der Aufrufer im Bestätigungsdialog zu `onClick={() => void purgeOld()}`.

Der `appSettings`-Zugriff kommt aus dem im Modal bereits verwendeten Settings-Hook — falls dort noch keiner importiert ist, denselben verwenden wie in Task 9.

- [ ] **Step 4: `runDedupe` sichert vorher**

`await deleteDpValuesByTs(id, type, dedupeTs);` ersetzen durch:

```tsx
      if (appSettings.dbBackupBeforeDelete && dedupeRows && dedupeRows.length > 0) {
        // No cap prompt here: the rows are already in memory from the scan, so
        // there is nothing left to fetch and nothing to truncate.
        const res = await backup.exportRows({ id, type, trigger: 'dedupe', rows: dedupeRows });
        if (!res.ok) {
          showToast(
            isEn ? `Backup failed, nothing deleted: ${'error' in res ? res.error : ''}` : `Backup fehlgeschlagen, nichts gelöscht: ${'error' in res ? res.error : ''}`,
            'error',
          );
          return;
        }
      }
      await deleteDpValuesByTs(id, type, dedupeTs);
```

- [ ] **Step 5: Cap-Dialog rendern**

Denselben Block wie in Task 9 Schritt 3 einfügen, mit `onClick={() => { setCapPrompt(null); void purgeOld(true); }}` am Bestätigen-Button und dem Progress-Block darunter. Der Purge-Hinweistext wird ergänzt um:

```tsx
{capPrompt?.action === 'purge' && (
  <span className="block mt-1">
    {isEn
      ? 'For a 3-month purge these are the rows immediately before the cutoff — the oldest values are the ones that drop out of the dump.'
      : 'Beim 3-Monats-Purge sind das die Zeilen direkt vor dem Cutoff — gerade die ältesten Werte fallen aus dem Dump.'}
  </span>
)}
```

- [ ] **Step 6: Typecheck, Lint, Tests, Commit**

```bash
npx tsc --noEmit && npm run lint && npm test
git add src/components/modals/DpValuesModal.tsx
git commit -m "feat(db): back up values before purge and dedupe"
```

---

### Task 11: Orphan-Delete absichern

**Files:**
- Modify: `src/components/modals/OrphanValuesModal.tsx:67-85` (`handleDeleteConfirm`)

- [ ] **Step 1: Hook einbinden und Handler umbauen**

Imports ergänzen:

```tsx
import { useDbBackup } from '../../hooks/useDbBackup';
```

Plus denselben Settings-Hook wie in Task 9. Im Body:

```tsx
const { appSettings } = useAppSettings();
const backup = useDbBackup();
const [capPrompt, setCapPrompt] = useState<{ total: number; cap: number } | null>(null);
```

`handleDeleteConfirm` ersetzen:

```tsx
async function handleDeleteConfirm(acceptCap = false) {
  if (!pending) return;
  setDeleting(true);
  try {
    if (appSettings.dbBackupBeforeDelete) {
      const res = await backup.exportOrphan({
        table: pending.table,
        dbId: pending.dbId,
        count: pending.count,
        acceptCap,
      });
      if (!res.ok) {
        if ('needsCapDecision' in res) {
          setCapPrompt({ total: res.total, cap: res.cap });
          return;
        }
        showToast(
          isEn ? `Backup failed, nothing deleted: ${res.error}` : `Backup fehlgeschlagen, nichts gelöscht: ${res.error}`,
          'error',
        );
        return;
      }
    }
    await deleteOrphanValueRows(pending.table, pending.dbId);
    showToast(
      isEn
        ? `Deleted ${pending.count.toLocaleString()} orphan rows (${pending.table} #${pending.dbId})`
        : `${pending.count.toLocaleString()} verwaiste Zeilen gelöscht (${pending.table} #${pending.dbId})`,
      'success'
    );
    setRows((r) => (r ?? []).filter((x) => !(x.table === pending.table && x.dbId === pending.dbId)));
    setPending(null);
    setCapPrompt(null);
  } catch (err) {
    showToast(err instanceof Error ? err.message : String(err), 'error');
  } finally {
    setDeleting(false);
  }
}
```

`pending.table` ist als `TsTable` typisiert und deckungsgleich mit `DumpTable` — falls TypeScript meckert, in `dbBackup.ts` prüfen, dass `DUMP_TABLES` exakt `['ts_number', 'ts_string', 'ts_bool']` ist.

Der Delete-Button (Zeile 238) wird zu `onClick={() => void handleDeleteConfirm()}`.

- [ ] **Step 2: Cap-Dialog und Progress rendern**

Denselben Block wie in Task 9 Schritt 3, mit `void handleDeleteConfirm(true)` am Bestätigen-Button.

- [ ] **Step 3: Typecheck, Lint, Tests, Commit**

```bash
npx tsc --noEmit && npm run lint && npm test
git add src/components/modals/OrphanValuesModal.tsx
git commit -m "feat(db): back up orphan rows before deleting them"
```

---

### Task 12: Restore-Lauf im Hook

**Files:**
- Modify: `src/hooks/useDbBackup.ts`
- Test: `src/hooks/useDbBackup.test.ts`

- [ ] **Step 1: Write the failing test**

An `src/hooks/useDbBackup.test.ts` anhängen. Die Mocks oben um konkrete Implementierungen erweitern:

```ts
const insertDpValuesBatch = vi.fn()
const getSourceIdMap = vi.fn()
const getLiveDpIndex = vi.fn()
const resolveDpNumericId = vi.fn()
```

und im `vi.mock`-Block die entsprechenden Einträge auf diese Spies zeigen lassen
(`insertDpValuesBatch: (...a: unknown[]) => insertDpValuesBatch(...a)` usw., plus
`resolveDpNumericId: (...a: unknown[]) => resolveDpNumericId(...a)`).

```ts
describe('useDbBackup restore', () => {
  const dumpText = () => JSON.stringify({
    format: 'iobroker-object-explorer/db-dump',
    version: 1,
    createdAt: 1753000000000,
    source: { db: 'iobroker', host: 'h' },
    trigger: 'delete-all',
    truncated: false,
    series: [
      {
        kind: 'named', id: 'alias.0.live', table: 'ts_number', type: 'number',
        range: { from: 1, to: 2 }, count: 1, rows: [[1690000000000, 21.5, 1, 0, 'src.a']],
      },
      {
        kind: 'named', id: 'alias.0.gone', table: 'ts_number', type: 'number',
        range: { from: 1, to: 2 }, count: 1, rows: [[1690000000000, 1, 1, 0, null]],
      },
      {
        kind: 'orphan', dbId: 7, table: 'ts_number', type: 'number',
        range: { from: 1, to: 2 }, count: 1, rows: [[1690000000000, 2, 1, 0, null]],
      },
    ],
  })

  beforeEach(() => {
    insertDpValuesBatch.mockReset()
    getSourceIdMap.mockReset()
    getLiveDpIndex.mockReset()
    resolveDpNumericId.mockReset()
    getSourceIdMap.mockResolvedValue({ 'src.a': 3 })
    getLiveDpIndex.mockResolvedValue({ names: new Set(['alias.0.live']), ids: new Set([7]) })
    resolveDpNumericId.mockResolvedValue(42)
    insertDpValuesBatch.mockResolvedValue({ inserted: 1, skipped: 0, unresolvedSources: 0 })
  })

  it('classifies every series before writing anything', async () => {
    const { result } = harness()
    let plan: Awaited<ReturnType<typeof result.current.prepareRestore>> | undefined
    await act(async () => { plan = await result.current.prepareRestore(dumpText()) })

    expect(plan?.series.map((s) => s.status)).toEqual(['ok', 'missing', 'blocked'])
    expect(insertDpValuesBatch).not.toHaveBeenCalled()
  })

  it('writes only the selected ok series and reports the totals', async () => {
    const { result } = harness()
    let plan: Awaited<ReturnType<typeof result.current.prepareRestore>>
    await act(async () => { plan = await result.current.prepareRestore(dumpText()) })

    let report: Awaited<ReturnType<typeof result.current.runRestore>> | undefined
    await act(async () => { report = await result.current.runRestore(plan!, [0, 1, 2]) })

    expect(insertDpValuesBatch).toHaveBeenCalledTimes(1)
    expect(report).toMatchObject({ inserted: 1, skipped: 0, missing: 1, blocked: 1, unresolvedSources: 0 })
  })

  it('reports how many rows were skipped as already present', async () => {
    insertDpValuesBatch.mockResolvedValue({ inserted: 0, skipped: 1, unresolvedSources: 1 })
    const { result } = harness()
    let plan: Awaited<ReturnType<typeof result.current.prepareRestore>>
    await act(async () => { plan = await result.current.prepareRestore(dumpText()) })
    let report: Awaited<ReturnType<typeof result.current.runRestore>> | undefined
    await act(async () => { report = await result.current.runRestore(plan!, [0]) })

    expect(report).toMatchObject({ inserted: 0, skipped: 1, unresolvedSources: 1 })
  })

  it('rejects a file that is not a dump', async () => {
    const { result } = harness()
    await expect(result.current.prepareRestore('{"format":"nope"}')).rejects.toThrow(/not a database dump/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useDbBackup.test.ts -t restore`
Expected: FAIL — `result.current.prepareRestore is not a function`

- [ ] **Step 3: Write minimal implementation**

In `src/hooks/useDbBackup.ts` die Imports erweitern:

```ts
import {
  fetchDpRowsChunked,
  fetchOrphanRowsChunked,
  getDpValueCount,
  tsTableForType,
  insertDpValuesBatch,
  getSourceIdMap,
  getLiveDpIndex,
  resolveDpNumericId,
} from '../api/iobroker';
import {
  buildDump,
  serializeDump,
  parseDump,
  classifyRestoreSeries,
  dumpFilename,
  DB_DUMP_MAX_ROWS,
  type Dump,
  type DumpSeries,
  type DumpTable,
  type DumpTrigger,
  type DumpSeriesInput,
  type RestoreStatus,
} from '../api/dbBackup';
```

Und vor dem `return` des Hooks ergänzen:

```ts
export interface RestorePlanSeries {
  index: number;
  series: DumpSeries;
  status: RestoreStatus;
  reason?: string;
}

export interface RestorePlan {
  dump: Dump;
  series: RestorePlanSeries[];
}

export interface RestoreReport {
  inserted: number;
  skipped: number;
  missing: number;
  blocked: number;
  unresolvedSources: number;
  /** Index of the last series written successfully, -1 if none. */
  lastCompleted: number;
  error?: string;
}
```

Im Hook-Body:

```ts
  const prepareRestore = useCallback(async (text: string): Promise<RestorePlan> => {
    const dump = parseDump(text);
    const live = await getLiveDpIndex();
    return {
      dump,
      series: dump.series.map((s, index) => ({ index, series: s, ...classifyRestoreSeries(s, live) })),
    };
  }, []);

  const runRestore = useCallback(
    async (plan: RestorePlan, selected: number[]): Promise<RestoreReport> => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const chosen = new Set(selected);
      const report: RestoreReport = {
        inserted: 0, skipped: 0, missing: 0, blocked: 0, unresolvedSources: 0, lastCompleted: -1,
      };
      try {
        const sourceIds = await getSourceIdMap();
        const writable = plan.series.filter((s) => chosen.has(s.index));
        const totalRows = writable.reduce((n, s) => n + (s.status === 'ok' ? s.series.rows.length : 0), 0);
        let doneRows = 0;

        for (const entry of writable) {
          if (entry.status === 'missing') { report.missing += 1; continue; }
          if (entry.status === 'blocked') { report.blocked += 1; continue; }

          const s = entry.series;
          const numId = s.kind === 'orphan' ? s.dbId : await resolveDpNumericId(s.id);
          if (numId == null || Number.isNaN(numId)) { report.missing += 1; continue; }

          setProgress({ phase: 'writing', done: doneRows, total: totalRows });
          const res = await insertDpValuesBatch(
            s.table, s.type, numId, s.rows, sourceIds,
            (done) => setProgress({ phase: 'writing', done: doneRows + done, total: totalRows }),
            ctrl.signal,
          );
          report.inserted += res.inserted;
          report.skipped += res.skipped;
          report.unresolvedSources += res.unresolvedSources;
          report.lastCompleted = entry.index;
          doneRows += s.rows.length;
        }
        return report;
      } catch (err) {
        // Blocks written before the failure stay in place. INSERT IGNORE makes a
        // re-run with the same file safe, so the report names the position rather
        // than pretending to roll back.
        return { ...report, error: err instanceof Error ? err.message : String(err) };
      } finally {
        setProgress(null);
        abortRef.current = null;
      }
    },
    [],
  );
```

`return { progress, abort, exportNamed, exportOrphan, exportRows, prepareRestore, runRestore };`

`resolveDpNumericId` muss dafür in [src/api/iobroker.ts:945](src/api/iobroker.ts#L945) exportiert sein — ist es bereits.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useDbBackup.test.ts`
Expected: PASS, alle Tests aus Task 8 und 12

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/hooks/useDbBackup.ts src/hooks/useDbBackup.test.ts
git commit -m "feat(db): restore side of the backup hook"
```

---

### Task 13: `DbBackupModal` und Toolbar-Einstieg

**Files:**
- Create: `src/components/modals/DbBackupModal.tsx`
- Modify: `src/components/modals/DbOverviewModal.tsx` (Toolbar-Button neben dem Orphan-Button, ca. Zeile 317-324; Rendern neben `{orphansOpen && …}` ca. Zeile 670)

- [ ] **Step 1: Modal anlegen**

Das Modal folgt dem Aufbau von [OrphanValuesModal.tsx](src/components/modals/OrphanValuesModal.tsx) (Overlay, Header, Body, Footer) — dort Klassen und Struktur abschauen und übernehmen.

```tsx
import { useState } from 'react';
import { Upload, AlertTriangle, Loader2, X } from 'lucide-react';
import { useDbBackup, type RestorePlan, type RestoreReport } from '../../hooks/useDbBackup';

interface Props {
  language: 'en' | 'de';
  onClose: () => void;
}

export function DbBackupModal({ language, onClose }: Props) {
  const isEn = language === 'en';
  const backup = useDbBackup();
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [report, setReport] = useState<RestoreReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setReport(null);
    setPlan(null);
    try {
      const p = await backup.prepareRestore(await file.text());
      setPlan(p);
      // Preselect exactly what can be written; missing and blocked stay off.
      setSelected(new Set(p.series.filter((s) => s.status === 'ok').map((s) => s.index)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRun() {
    if (!plan) return;
    setRunning(true);
    try {
      setReport(await backup.runRestore(plan, [...selected]));
    } finally {
      setRunning(false);
    }
  }

  function toggle(index: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        <div className="shrink-0 flex items-center gap-2 px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <Upload size={16} className="text-blue-500" />
          <h2 className="text-sm font-semibold flex-1">
            {isEn ? 'Restore database values' : 'DB-Werte wiederherstellen'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
            className="text-xs"
          />

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {plan?.dump.truncated && (
            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                {isEn
                  ? 'This dump was truncated when it was created — it does not contain every row of the original range.'
                  : 'Dieser Dump wurde beim Erstellen abgeschnitten — er enthält nicht alle Zeilen des ursprünglichen Bereichs.'}
              </span>
            </div>
          )}

          {plan && (
            <table className="w-full text-xs">
              <thead className="text-gray-500 dark:text-gray-400 text-left">
                <tr>
                  <th className="py-1 w-8"></th>
                  <th className="py-1">{isEn ? 'Series' : 'Serie'}</th>
                  <th className="py-1">{isEn ? 'Table' : 'Tabelle'}</th>
                  <th className="py-1 text-right">{isEn ? 'Rows' : 'Zeilen'}</th>
                  <th className="py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {plan.series.map((s) => (
                  <tr key={s.index} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="py-1">
                      <input
                        type="checkbox"
                        checked={selected.has(s.index)}
                        disabled={s.status !== 'ok'}
                        onChange={() => toggle(s.index)}
                      />
                    </td>
                    <td className="py-1 font-mono">
                      {s.series.kind === 'named' ? s.series.id : `#${s.series.dbId}`}
                    </td>
                    <td className="py-1">{s.series.table}</td>
                    <td className="py-1 text-right">{s.series.count.toLocaleString()}</td>
                    <td className="py-1">
                      <span
                        className={
                          s.status === 'ok'
                            ? 'text-green-600 dark:text-green-400'
                            : s.status === 'missing'
                              ? 'text-gray-500'
                              : 'text-red-600 dark:text-red-400'
                        }
                        title={s.reason}
                      >
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {backup.progress && (
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <Loader2 size={12} className="animate-spin" />
              <span>
                {backup.progress.done.toLocaleString()} / {backup.progress.total.toLocaleString()}
              </span>
              <button onClick={backup.abort} className="underline">
                {isEn ? 'Cancel' : 'Abbrechen'}
              </button>
            </div>
          )}

          {report && (
            <div className="text-xs space-y-1">
              <div>
                {isEn
                  ? `${report.inserted.toLocaleString()} inserted, ${report.skipped.toLocaleString()} already present, ${report.missing} missing, ${report.blocked} blocked`
                  : `${report.inserted.toLocaleString()} eingefügt, ${report.skipped.toLocaleString()} bereits vorhanden, ${report.missing} fehlend, ${report.blocked} blockiert`}
              </div>
              {report.unresolvedSources > 0 && (
                <div className="text-amber-600 dark:text-amber-400">
                  {isEn
                    ? `${report.unresolvedSources.toLocaleString()} row(s) had a source name that no longer exists — written with no source.`
                    : `${report.unresolvedSources.toLocaleString()} Zeile(n) hatten einen nicht mehr vorhandenen Quellnamen — ohne Quelle geschrieben.`}
                </div>
              )}
              {report.error && (
                <div className="text-red-600 dark:text-red-400">
                  {isEn
                    ? `Aborted after series ${report.lastCompleted}: ${report.error}. Re-running with the same file is safe — rows already written are skipped.`
                    : `Abgebrochen nach Serie ${report.lastCompleted}: ${report.error}. Ein erneuter Lauf mit derselben Datei ist gefahrlos — bereits geschriebene Zeilen werden übersprungen.`}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {isEn ? 'Close' : 'Schließen'}
          </button>
          <button
            onClick={() => void handleRun()}
            disabled={!plan || selected.size === 0 || running}
            className="px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 flex items-center gap-1"
          >
            {running && <Loader2 size={12} className="animate-spin" />}
            {isEn ? 'Restore' : 'Wiederherstellen'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Toolbar-Button in DbOverviewModal**

Import ergänzen:

```tsx
import { DbBackupModal } from './DbBackupModal';
```

State neben `orphansOpen`:

```tsx
const [restoreOpen, setRestoreOpen] = useState(false);
```

Direkt nach dem Orphan-Button (ca. Zeile 324) denselben Button-Stil verwenden:

```tsx
<button
  onClick={() => setRestoreOpen(true)}
  title={isEn ? 'Restore values from a backup dump' : 'Werte aus einem Backup-Dump wiederherstellen'}
  className="..."  /* Klassen vom Orphan-Button übernehmen */
>
  <Upload size={13} />
  {isEn ? 'Restore' : 'Restore'}
</button>
```

`Upload` aus `lucide-react` importieren.

Neben dem `{orphansOpen && …}`-Block (ca. Zeile 670):

```tsx
{restoreOpen && (
  <DbBackupModal language={language} onClose={() => setRestoreOpen(false)} />
)}
```

- [ ] **Step 3: Manuell prüfen**

Run: `npm run dev`. Einen kleinen Datenpunkt über Delete-all löschen (Dump wird geladen), dann Restore öffnen, die Datei wählen — Status muss `missing` sein, wenn der Datenpunkt aus `datapoints` verschwunden ist, sonst `ok`. Bei `ok` restoren und im DpValuesModal prüfen, dass die Werte zurück sind. Erneut restoren → alles `already present`.

- [ ] **Step 4: Typecheck, Lint, Tests, Commit**

```bash
npx tsc --noEmit && npm run lint && npm test
git add src/components/modals/DbBackupModal.tsx src/components/modals/DbOverviewModal.tsx
git commit -m "feat(db): restore modal for backup dumps"
```

---

### Task 14: Dokumentation nachziehen

**Files:**
- Modify: `CLAUDE.md` (Tabelle „Key Components", Abschnitt AppSettings)

- [ ] **Step 1: Komponententabelle ergänzen**

In der Tabelle „Key Components" nach der `OrphanValuesModal`-Zeile einfügen:

```markdown
| `DbBackupModal` | `modals/DbBackupModal.tsx` | Restores a JSON dump of raw `ts_*` rows: file picker, per-series status (ok/missing/blocked), batch insert via `INSERT IGNORE`, skip-and-report. Opened from DbOverviewModal. |
```

- [ ] **Step 2: Key Patterns ergänzen**

Bei den Key Patterns anhängen:

```markdown
- **Backup before delete**: `AppSettings.dbBackupBeforeDelete` (default on) makes the four destructive DB actions (delete-all, 3-month purge, dedupe, orphan delete) download a JSON dump of the affected rows first; a failed export aborts the delete. Format logic lives IO-free in `src/api/dbBackup.ts`, the run in `src/hooks/useDbBackup.ts`. Export is capped at `DB_DUMP_MAX_ROWS` (500k) with an explicit user decision above it.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: describe backup-before-delete and restore"
```

---

## Self-Review

**Spec-Abdeckung**

| Spec-Abschnitt | Task |
|---|---|
| Dump-Format, Array-of-Arrays, `q`/`src` | 1, 2 |
| `kind: "orphan"`, dbId-Blockade | 3, 12 |
| `fetchDpRowsChunked` / `fetchOrphanRowsChunked` | 4 |
| `insertDpValuesBatch`, `INSERT IGNORE` | 5 |
| Dedupe ohne Extra-Queries | 6, 10 |
| Cap `DB_DUMP_MAX_ROWS`, Cap-Dialog | 8, 9, 10, 11 |
| Progress, `AbortController` | 4, 8, 9 |
| `dbBackupBeforeDelete` + Settings-Toggle | 7 |
| Auto-Export-Gate an 4 Call-Sites | 9, 10, 11 |
| Restore-Flow, Status, Report | 12, 13 |
| Escaping/Validierung | 2, 5 |
| Tests | 1, 2, 3, 6, 8, 12 |

**Abweichung von der Spec:** Die Spec behauptet, der Dedupe-Export brauche keine Extra-Queries, weil der Scan die Zeilen schon lädt. Das stimmte so nicht — `findConsecutiveDuplicateTs` las nur `ts` und `val`. Task 6 erweitert das SELECT um `ack`, `q` und den Quellnamen, damit die Aussage hält. Kosten: etwas mehr Bandbreite pro Scan-Chunk, weiterhin null zusätzliche Roundtrips.

**Namenskonsistenz geprüft:** `DumpRow`, `DumpTable`, `DumpTrigger`, `DumpSeries`, `LiveDpIndex`, `RestoreStatus` durchgehend gleich benannt. Die API-Funktion heißt `getLiveDpIndex` und liefert genau die `LiveDpIndex`-Form, die `classifyRestoreSeries` erwartet. `exportNamed` / `exportOrphan` / `exportRows` / `prepareRestore` / `runRestore` sind in Task 8 und 12 definiert und in 9–13 identisch aufgerufen.

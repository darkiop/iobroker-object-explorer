import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDbBackup } from './useDbBackup'
import { parseDump, DB_DUMP_MAX_ROWS } from '../api/dbBackup'

const fetchDpRowsChunked = vi.fn()
const fetchOrphanRowsChunked = vi.fn()
const getDpValueCount = vi.fn()
const insertDpValuesBatch = vi.fn()
const getSourceIdMap = vi.fn()
const getLiveDpIndex = vi.fn()
const resolveDpNumericId = vi.fn()

vi.mock('../api/iobroker', () => ({
  fetchDpRowsChunked: (...a: unknown[]) => fetchDpRowsChunked(...a),
  fetchOrphanRowsChunked: (...a: unknown[]) => fetchOrphanRowsChunked(...a),
  getDpValueCount: (...a: unknown[]) => getDpValueCount(...a),
  insertDpValuesBatch: (...a: unknown[]) => insertDpValuesBatch(...a),
  getSourceIdMap: (...a: unknown[]) => getSourceIdMap(...a),
  getLiveDpIndex: (...a: unknown[]) => getLiveDpIndex(...a),
  resolveDpNumericId: (...a: unknown[]) => resolveDpNumericId(...a),
  tsTableForType: (t: unknown) => (t === 'string' ? 'ts_string' : t === 'boolean' ? 'ts_bool' : 'ts_number'),
}))

// Capture what the hook would download instead of touching the DOM.
const downloads: { name: string; text: string }[] = []

// Derived from the cap so the tests keep testing the boundary, not a fixed number.
const OVER_CAP = DB_DUMP_MAX_ROWS + 100_000

beforeEach(() => {
  downloads.length = 0
  fetchDpRowsChunked.mockReset()
  fetchOrphanRowsChunked.mockReset()
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
    getDpValueCount.mockResolvedValue(OVER_CAP)

    const { result } = harness()
    let outcome: unknown
    await act(async () => {
      outcome = await result.current.exportNamed({
        id: 'alias.0.foo', type: 'number', trigger: 'purge', startTs: null, endTs: null,
      })
    })

    expect(outcome).toEqual({ ok: false, needsCapDecision: true, total: OVER_CAP, cap: DB_DUMP_MAX_ROWS })
    expect(fetchDpRowsChunked).not.toHaveBeenCalled()
    expect(downloads).toHaveLength(0)
  })

  it('marks the dump truncated when the cap decision was accepted', async () => {
    getDpValueCount.mockResolvedValue(OVER_CAP)
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

  it('records the manual trigger for an orphan export instead of orphan-delete', async () => {
    fetchOrphanRowsChunked.mockResolvedValue([[1690000000000, 1, 1, 0, null]])

    const { result } = harness()
    await act(async () => {
      await result.current.exportOrphan({ table: 'ts_bool', dbId: 42, count: 1, trigger: 'manual' })
    })

    expect(parseDump(downloads[0].text).trigger).toBe('manual')
    expect(downloads[0].name).toMatch(/^iobroker-dbdump-manual-ts_bool-42-/)
  })

  it('defaults an orphan export to the orphan-delete trigger', async () => {
    fetchOrphanRowsChunked.mockResolvedValue([[1690000000000, 1, 1, 0, null]])

    const { result } = harness()
    await act(async () => {
      await result.current.exportOrphan({ table: 'ts_bool', dbId: 42, count: 1 })
    })

    expect(parseDump(downloads[0].text).trigger).toBe('orphan-delete')
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

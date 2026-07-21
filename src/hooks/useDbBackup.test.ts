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
  resolveDpNumericId: vi.fn(),
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

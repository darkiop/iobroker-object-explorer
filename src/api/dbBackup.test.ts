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

import { describe, it, expect } from 'vitest'
import { buildDump, serializeDump, parseDump, DUMP_FORMAT, DUMP_VERSION } from './dbBackup'

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

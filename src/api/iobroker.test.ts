import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  isGlobPattern,
  compilePattern,
  scoreObject,
  buildAliasReverseMap,
  hasHistory,
  hasSmartName,
  pickDuplicateRows,
  buildOrphanValuesSql,
  buildOrphanDeleteSql,
  deleteOrphanValueRows,
} from './iobroker'
import type { IoBrokerObject } from '../types/iobroker'

function makeObj(overrides: Partial<IoBrokerObject['common']> = {}): IoBrokerObject {
  return {
    _id: 'test.0.x',
    type: 'state',
    common: { name: 'Test', ...overrides },
    native: {},
  }
}

describe('isGlobPattern', () => {
  it('pattern with * → true', () => {
    expect(isGlobPattern('alias.0.*')).toBe(true)
    expect(isGlobPattern('*')).toBe(true)
  })

  it('pattern without * → false', () => {
    expect(isGlobPattern('alias.0.light')).toBe(false)
    expect(isGlobPattern('')).toBe(false)
  })
})

describe('compilePattern', () => {
  it('converts * to .*', () => {
    const re = compilePattern('alias.0.*')
    expect(re.test('alias.0.something')).toBe(true)
    expect(re.test('alias.0.deep.nested')).toBe(true)
    expect(re.test('alias.1.something')).toBe(false)
  })

  it('escapes dots', () => {
    const re = compilePattern('hm-rpc.0.abc')
    expect(re.test('hm-rpc.0.abc')).toBe(true)
    expect(re.test('hm-rpcX0Xabc')).toBe(false)
  })

  it('requires full match (anchored)', () => {
    const re = compilePattern('a.b')
    expect(re.test('a.b')).toBe(true)
    expect(re.test('prefix.a.b')).toBe(false)
    expect(re.test('a.b.suffix')).toBe(false)
  })
})

describe('scoreObject', () => {
  it('exact ID match → 100', () => {
    const o = makeObj()
    expect(scoreObject('alias.0.light', o, 'alias.0.light')).toBe(100)
  })

  it('ID starts-with → 80', () => {
    const o = makeObj()
    expect(scoreObject('alias.0.light.state', o, 'alias.0')).toBe(80)
  })

  it('ID contains → 60', () => {
    const o = makeObj()
    expect(scoreObject('hm-rpc.0.light.state', o, 'light')).toBe(60)
  })

  it('name contains → 50', () => {
    const o = makeObj({ name: 'Wohnzimmer Lampe' })
    expect(scoreObject('some.other.id', o, 'lampe')).toBe(50)
  })

  it('alias string ID contains → 40', () => {
    const o = makeObj({ alias: { id: 'hm-rpc.0.channel' } })
    expect(scoreObject('alias.0.x', o, 'hm-rpc')).toBe(40)
  })

  it('alias object {read,write} contains → 40', () => {
    const o = makeObj({ alias: { id: { read: 'hm-rpc.0.r', write: 'hm-rpc.0.w' } } })
    expect(scoreObject('alias.0.x', o, 'hm-rpc')).toBe(40)
  })

  it('desc contains → 30', () => {
    const o = makeObj({ desc: 'Sensor im Keller' })
    expect(scoreObject('totally.different', o, 'keller')).toBe(30)
  })

  it('no match → 0', () => {
    const o = makeObj({ name: 'Steckdose' })
    expect(scoreObject('hm-rpc.0.device', o, 'xyz-nomatch')).toBe(0)
  })

  it('case-insensitive', () => {
    const o = makeObj()
    expect(scoreObject('ALIAS.0.LIGHT', o, 'alias.0.light')).toBe(100)
  })
})

describe('buildAliasReverseMap', () => {
  it('single alias string → map entry', () => {
    const objects: Record<string, IoBrokerObject> = {
      'alias.0.foo': makeObj({ alias: { id: 'hm-rpc.0.bar' } }),
      'hm-rpc.0.bar': makeObj(),
    }
    const map = buildAliasReverseMap(objects)
    expect(map.get('hm-rpc.0.bar')).toEqual(['alias.0.foo'])
  })

  it('multiple aliases to same target → array with both', () => {
    const objects: Record<string, IoBrokerObject> = {
      'alias.0.a': makeObj({ alias: { id: 'hm-rpc.0.bar' } }),
      'alias.0.b': makeObj({ alias: { id: 'hm-rpc.0.bar' } }),
    }
    const map = buildAliasReverseMap(objects)
    expect(map.get('hm-rpc.0.bar')).toHaveLength(2)
    expect(map.get('hm-rpc.0.bar')).toContain('alias.0.a')
    expect(map.get('hm-rpc.0.bar')).toContain('alias.0.b')
  })

  it('alias {read, write} → two target entries', () => {
    const objects: Record<string, IoBrokerObject> = {
      'alias.0.x': makeObj({ alias: { id: { read: 'hm-rpc.0.r', write: 'hm-rpc.0.w' } } }),
    }
    const map = buildAliasReverseMap(objects)
    expect(map.get('hm-rpc.0.r')).toContain('alias.0.x')
    expect(map.get('hm-rpc.0.w')).toContain('alias.0.x')
  })

  it('alias {read, write} same value → single entry only', () => {
    const objects: Record<string, IoBrokerObject> = {
      'alias.0.x': makeObj({ alias: { id: { read: 'hm-rpc.0.same', write: 'hm-rpc.0.same' } } }),
    }
    const map = buildAliasReverseMap(objects)
    expect(map.get('hm-rpc.0.same')).toEqual(['alias.0.x'])
  })

  it('non-alias objects are ignored', () => {
    const objects: Record<string, IoBrokerObject> = {
      'hm-rpc.0.bar': makeObj(),
      'javascript.0.script': makeObj(),
    }
    const map = buildAliasReverseMap(objects)
    expect(map.size).toBe(0)
  })

  it('empty objects → empty map', () => {
    expect(buildAliasReverseMap({}).size).toBe(0)
  })
})

describe('hasHistory', () => {
  it('sql.0 enabled true → true', () => {
    const o = makeObj({ custom: { 'sql.0': { enabled: true } } })
    expect(hasHistory(o)).toBe(true)
  })

  it('sql.0 enabled false → false', () => {
    const o = makeObj({ custom: { 'sql.0': { enabled: false } } })
    expect(hasHistory(o)).toBe(false)
  })

  it('no custom → false', () => {
    expect(hasHistory(makeObj())).toBe(false)
  })

  it('other adapter only → false', () => {
    const o = makeObj({ custom: { 'influxdb.0': { enabled: true } } })
    expect(hasHistory(o)).toBe(false)
  })
})

describe('hasSmartName', () => {
  it('undefined obj → false', () => {
    expect(hasSmartName(undefined)).toBe(false)
  })

  it('no smartName → false', () => {
    expect(hasSmartName(makeObj())).toBe(false)
  })

  it('empty string → false', () => {
    expect(hasSmartName(makeObj({ smartName: '   ' }))).toBe(false)
  })

  it('non-empty string → true', () => {
    expect(hasSmartName(makeObj({ smartName: 'Lampe' }))).toBe(true)
  })

  it('object with non-empty value → true', () => {
    expect(hasSmartName(makeObj({ smartName: { de: 'Lampe', en: 'Lamp' } }))).toBe(true)
  })

  it('object with all empty values → false', () => {
    expect(hasSmartName(makeObj({ smartName: { de: '', en: '' } }))).toBe(false)
  })

  it('false as value → false', () => {
    expect(hasSmartName(makeObj({ smartName: false }))).toBe(false)
  })
})

describe('getStatesBatch fallback to per-namespace patterns', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.resetModules()
  })

  it('requests one command/getStates call per derived namespace, not pattern=*', async () => {
    const requestedUrls: string[] = []

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      requestedUrls.push(url)

      // Bulk-by-id endpoint: simulate "unsupported" (404) so the code falls
      // through to the command-based fallback under test.
      if (url.includes('/state/')) {
        return { ok: false, status: 404, statusText: 'Not Found' } as Response
      }

      // Command-based fallback: return namespace-scoped fake states.
      if (url.includes('/command/getStates')) {
        const patternMatch = url.match(/pattern=([^&]+)/)
        const pattern = decodeURIComponent(patternMatch?.[1] ?? '')
        if (pattern === 'hm-rpc.0.*') {
          return {
            ok: true,
            json: async () => ({ result: { 'hm-rpc.0.foo': { val: 1, ack: true, ts: 0, lc: 0, from: 'x' } } }),
          } as Response
        }
        if (pattern === 'javascript.0.*') {
          return {
            ok: true,
            json: async () => ({ result: { 'javascript.0.bar': { val: 2, ack: true, ts: 0, lc: 0, from: 'x' } } }),
          } as Response
        }
        return { ok: true, json: async () => ({ result: {} }) } as Response
      }

      throw new Error(`Unexpected fetch: ${url}`)
    }) as unknown as typeof fetch

    // Reset module-level support-detection flags by re-importing fresh.
    vi.resetModules()
    const { getStatesBatch } = await import('./iobroker')

    const result = await getStatesBatch(['hm-rpc.0.foo', 'javascript.0.bar'])

    expect(result).toEqual({
      'hm-rpc.0.foo': { val: 1, ack: true, ts: 0, lc: 0, from: 'x' },
      'javascript.0.bar': { val: 2, ack: true, ts: 0, lc: 0, from: 'x' },
    })

    const commandUrls = requestedUrls.filter((u) => u.includes('/command/getStates'))
    expect(commandUrls.length).toBe(2)
    expect(commandUrls.some((u) => u.includes('pattern=*') && !u.includes('pattern=%2A'))).toBe(false)
    expect(commandUrls.some((u) => u.includes(encodeURIComponent('hm-rpc.0.*')))).toBe(true)
    expect(commandUrls.some((u) => u.includes(encodeURIComponent('javascript.0.*')))).toBe(true)
  })
})

// The scan returns whole row tuples now; most cases here only care about which
// timestamps were picked.
const tsOf = (r: { rows: [number, ...unknown[]][] }) => r.rows.map((x) => x[0])

describe('pickDuplicateRows', () => {
  it('empty input → no duplicates', () => {
    const res = pickDuplicateRows([], 'number')
    expect(res.rows).toEqual([])
    expect(res.last).toBeNull()
  })

  it('all values distinct → nothing deleted', () => {
    const rows = [{ ts: 1, val: 1 }, { ts: 2, val: 2 }, { ts: 3, val: 3 }]
    expect(tsOf(pickDuplicateRows(rows, 'number'))).toEqual([])
  })

  it('keeps the first of each run, deletes the rest', () => {
    const rows = [
      { ts: 1, val: 5 },
      { ts: 2, val: 5 },
      { ts: 3, val: 5 },
      { ts: 4, val: 7 },
      { ts: 5, val: 5 },
      { ts: 6, val: 5 },
    ]
    expect(tsOf(pickDuplicateRows(rows, 'number'))).toEqual([2, 3, 6])
  })

  it('whole series identical → all but the first deleted', () => {
    const rows = [{ ts: 1, val: 42 }, { ts: 2, val: 42 }, { ts: 3, val: 42 }]
    expect(tsOf(pickDuplicateRows(rows, 'number'))).toEqual([2, 3])
  })

  it('number values arriving as strings compare equal', () => {
    const rows = [{ ts: 1, val: 1.5 }, { ts: 2, val: '1.5' }, { ts: 3, val: 2 }]
    expect(tsOf(pickDuplicateRows(rows, 'number'))).toEqual([2])
  })

  it('boolean 0/1 and false/true compare equal', () => {
    const rows = [
      { ts: 1, val: 0 },
      { ts: 2, val: false },
      { ts: 3, val: 1 },
      { ts: 4, val: true },
      { ts: 5, val: 'true' },
    ]
    expect(tsOf(pickDuplicateRows(rows, 'boolean'))).toEqual([2, 4, 5])
  })

  it('string values compare exactly', () => {
    const rows = [{ ts: 1, val: 'on' }, { ts: 2, val: 'on' }, { ts: 3, val: 'On' }]
    expect(tsOf(pickDuplicateRows(rows, 'string'))).toEqual([2])
  })

  it('NaN repeats count as duplicates', () => {
    const rows = [{ ts: 1, val: 'x' }, { ts: 2, val: 'y' }]
    expect(tsOf(pickDuplicateRows(rows, 'number'))).toEqual([2])
  })

  it('carries the previous value across chunk borders', () => {
    const first = pickDuplicateRows([{ ts: 1, val: 3 }, { ts: 2, val: 3 }], 'number')
    expect(tsOf(first)).toEqual([2])
    const second = pickDuplicateRows([{ ts: 3, val: 3 }, { ts: 4, val: 4 }], 'number', first.last)
    expect(tsOf(second)).toEqual([3])
  })

  it('without carry the first row of a chunk is always kept', () => {
    const second = pickDuplicateRows([{ ts: 3, val: 3 }, { ts: 4, val: 3 }], 'number')
    expect(tsOf(second)).toEqual([4])
  })

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

describe('buildOrphanValuesSql', () => {
  const sql = buildOrphanValuesSql()

  it('covers all three value tables', () => {
    expect(sql).toContain('iobroker.ts_number')
    expect(sql).toContain('iobroker.ts_string')
    expect(sql).toContain('iobroker.ts_bool')
    expect(sql.match(/UNION ALL/g)).toHaveLength(2)
  })

  it('selects only rows with no matching datapoints row', () => {
    expect(sql.match(/LEFT JOIN iobroker\.datapoints d ON d\.id = n\.id/g)).toHaveLength(3)
    expect(sql.match(/WHERE d\.id IS NULL/g)).toHaveLength(3)
  })

  it('groups per id so each orphan id yields one row', () => {
    expect(sql.match(/GROUP BY n\.id/g)).toHaveLength(3)
  })
})

describe('buildOrphanDeleteSql', () => {
  it('deletes only the given id and re-checks it is still orphaned', () => {
    const sql = buildOrphanDeleteSql('ts_number', 42)
    expect(sql).toContain('DELETE n FROM iobroker.ts_number n')
    expect(sql).toContain('WHERE n.id = 42')
    expect(sql).toContain('NOT EXISTS')
    expect(sql).toContain('SELECT 1 FROM iobroker.datapoints d WHERE d.id = n.id')
  })

  it('floors the id so no fractional literal reaches the statement', () => {
    expect(buildOrphanDeleteSql('ts_bool', 7.9)).toContain('WHERE n.id = 7')
  })
})

describe('deleteOrphanValueRows', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('rejects a table name outside the ts_* whitelist', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(deleteOrphanValueRows('datapoints', 1)).rejects.toThrow(/Unknown value table/)
    await expect(deleteOrphanValueRows('ts_number; DROP TABLE datapoints', 1)).rejects.toThrow(
      /Unknown value table/
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects a non-numeric db id', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(deleteOrphanValueRows('ts_number', Number('x'))).rejects.toThrow(/Invalid db id/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

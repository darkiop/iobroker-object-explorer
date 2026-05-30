import { describe, it, expect } from 'vitest'
import { formatTimestamp, formatValue } from './format'

// All dates use local-time constructors + local-time getters → timezone-independent.
const LOCAL_TS = new Date(2024, 0, 15, 8, 5, 3).getTime() // 15 Jan 2024 08:05:03

describe('formatTimestamp', () => {
  it('de format (default)', () => {
    expect(formatTimestamp(LOCAL_TS)).toBe('15.01.2024 08:05:03')
  })

  it('us format', () => {
    expect(formatTimestamp(LOCAL_TS, 'us')).toBe('01/15/2024 08:05:03')
  })

  it('iso format', () => {
    expect(formatTimestamp(LOCAL_TS, 'iso')).toBe('2024-01-15 08:05:03')
  })

  it('pads single-digit day and month', () => {
    const ts = new Date(2024, 2, 5, 9, 3, 7).getTime() // 05 Mar
    expect(formatTimestamp(ts)).toBe('05.03.2024 09:03:07')
  })

  it('returns empty string for NaN', () => {
    expect(formatTimestamp(NaN)).toBe('')
  })

  it('returns empty string for Infinity', () => {
    expect(formatTimestamp(Infinity)).toBe('')
  })

  it('returns empty string for -Infinity', () => {
    expect(formatTimestamp(-Infinity)).toBe('')
  })
})

describe('formatValue', () => {
  it('null → em dash', () => {
    expect(formatValue(null)).toBe('—')
  })

  it('undefined → em dash', () => {
    expect(formatValue(undefined)).toBe('—')
  })

  it('true → "true"', () => {
    expect(formatValue(true)).toBe('true')
  })

  it('false → "false"', () => {
    expect(formatValue(false)).toBe('false')
  })

  it('number → string', () => {
    expect(formatValue(42)).toBe('42')
    expect(formatValue(3.14)).toBe('3.14')
  })

  it('bigint → string', () => {
    expect(formatValue(BigInt(42))).toBe('42')
  })

  it('string passthrough', () => {
    expect(formatValue('hello')).toBe('hello')
  })

  it('object → compact JSON', () => {
    expect(formatValue({ a: 1 })).toBe('{"a":1}')
  })

  it('object → pretty JSON with pretty=true', () => {
    expect(formatValue({ a: 1 }, true)).toBe('{\n  "a": 1\n}')
  })

  it('array → compact JSON', () => {
    expect(formatValue([1, 2, 3])).toBe('[1,2,3]')
  })
})

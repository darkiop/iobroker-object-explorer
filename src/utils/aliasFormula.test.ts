import { describe, it, expect } from 'vitest'
import { evalFormula } from './aliasFormula'

describe('evalFormula', () => {
  it('evaluates simple arithmetic on val', () => {
    expect(evalFormula('val * 2', 10)).toEqual({ value: '20' })
  })

  it('evaluates division', () => {
    expect(evalFormula('val / 10', 100)).toEqual({ value: '10' })
  })

  it('handles boolean val', () => {
    expect(evalFormula('val ? 1 : 0', true)).toEqual({ value: '1' })
    expect(evalFormula('val ? 1 : 0', false)).toEqual({ value: '0' })
  })

  it('passes through string conversion', () => {
    expect(evalFormula('val', 'hello')).toEqual({ value: 'hello' })
  })

  it('handles offset formula', () => {
    expect(evalFormula('val + 273.15', 0)).toEqual({ value: '273.15' })
  })

  it('returns error for invalid formula syntax', () => {
    const result = evalFormula('val ***', 10)
    expect(result.error).toBeDefined()
    expect(result.value).toBeUndefined()
  })

  it('returns error for unknown variable', () => {
    const result = evalFormula('x + 1', 10)
    expect(result.error).toBeDefined()
  })

  it('trims whitespace from formula', () => {
    expect(evalFormula('  val * 3  ', 5)).toEqual({ value: '15' })
  })
})

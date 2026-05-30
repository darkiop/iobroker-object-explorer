import { describe, it, expect } from 'vitest'
import { getThresholdStatus, getObjectName, resolveI18n } from './stateListUtils'
import type { IoBrokerObject } from '../types/iobroker'

function obj(name: IoBrokerObject['common']['name']): IoBrokerObject {
  return { _id: 'test.0.x', type: 'state', common: { name }, native: {} }
}

describe('getThresholdStatus', () => {
  it('no min+max → null', () => {
    expect(getThresholdStatus(50, undefined, undefined)).toBeNull()
  })

  it('non-number → null', () => {
    expect(getThresholdStatus('high', 0, 100)).toBeNull()
    expect(getThresholdStatus(null, 0, 100)).toBeNull()
    expect(getThresholdStatus(undefined, 0, 100)).toBeNull()
  })

  it('NaN/Infinity → null', () => {
    expect(getThresholdStatus(NaN, 0, 100)).toBeNull()
    expect(getThresholdStatus(Infinity, 0, 100)).toBeNull()
  })

  it('value above max → exceeded', () => {
    expect(getThresholdStatus(110, 0, 100)).toBe('exceeded')
    expect(getThresholdStatus(101, 0, 100)).toBe('exceeded')
  })

  it('value below min → exceeded', () => {
    expect(getThresholdStatus(-1, 0, 100)).toBe('exceeded')
  })

  it('value in warn zone near max → warn', () => {
    // warn zone = (100-0)*0.1 = 10; warn if val >= 90
    expect(getThresholdStatus(95, 0, 100)).toBe('warn')
    expect(getThresholdStatus(90, 0, 100)).toBe('warn')
  })

  it('value in warn zone near min → warn', () => {
    // warn if val <= 10
    expect(getThresholdStatus(5, 0, 100)).toBe('warn')
    expect(getThresholdStatus(10, 0, 100)).toBe('warn')
  })

  it('value safely in middle → null', () => {
    expect(getThresholdStatus(50, 0, 100)).toBeNull()
    expect(getThresholdStatus(11, 0, 100)).toBeNull()
    expect(getThresholdStatus(89, 0, 100)).toBeNull()
  })

  it('only max defined, value above → exceeded', () => {
    expect(getThresholdStatus(105, undefined, 100)).toBe('exceeded')
  })

  it('only min defined, value below → exceeded', () => {
    expect(getThresholdStatus(-5, 0, undefined)).toBe('exceeded')
  })

  it('only one bound → no warn zone (both needed)', () => {
    // warn zone only computed when both min+max present
    expect(getThresholdStatus(95, undefined, 100)).toBeNull()
  })
})

describe('getObjectName', () => {
  it('undefined → empty string', () => {
    expect(getObjectName(undefined)).toBe('')
  })

  it('no name → empty string', () => {
    expect(getObjectName({ _id: 'x', type: 'state', common: { name: '' }, native: {} })).toBe('')
  })

  it('string name', () => {
    expect(getObjectName(obj('Temperatur'))).toBe('Temperatur')
  })

  it('object name prefers de', () => {
    expect(getObjectName(obj({ de: 'Temperatur', en: 'Temperature' }))).toBe('Temperatur')
  })

  it('object name falls back to en', () => {
    expect(getObjectName(obj({ en: 'Temperature' }))).toBe('Temperature')
  })
})

describe('resolveI18n', () => {
  it('undefined → undefined', () => {
    expect(resolveI18n(undefined)).toBeUndefined()
  })

  it('string passthrough', () => {
    expect(resolveI18n('hello')).toBe('hello')
  })

  it('object prefers de', () => {
    expect(resolveI18n({ de: 'Hallo', en: 'Hello' })).toBe('Hallo')
  })

  it('falls back to en if no de', () => {
    expect(resolveI18n({ en: 'Hello' })).toBe('Hello')
  })

  it('falls back to first value if no de+en', () => {
    expect(resolveI18n({ fr: 'Bonjour' })).toBe('Bonjour')
  })

  it('empty object → undefined', () => {
    expect(resolveI18n({})).toBeUndefined()
  })
})

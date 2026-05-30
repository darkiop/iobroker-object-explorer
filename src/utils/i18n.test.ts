import { describe, it, expect } from 'vitest'
import { getLocalizedName, getAllNamesForSearch } from './i18n'

describe('getLocalizedName', () => {
  it('undefined → empty string', () => {
    expect(getLocalizedName(undefined)).toBe('')
  })

  it('string passthrough', () => {
    expect(getLocalizedName('Temperatur')).toBe('Temperatur')
  })

  it('returns requested lang if available', () => {
    expect(getLocalizedName({ de: 'Temperatur', en: 'Temperature' }, 'en')).toBe('Temperature')
    expect(getLocalizedName({ de: 'Temperatur', en: 'Temperature' }, 'de')).toBe('Temperatur')
  })

  it('falls back to de if lang missing', () => {
    expect(getLocalizedName({ de: 'Temperatur', en: 'Temperature' }, 'fr')).toBe('Temperatur')
  })

  it('falls back to en if de missing and no lang specified', () => {
    expect(getLocalizedName({ en: 'Temperature' })).toBe('Temperature')
  })

  it('falls back to first value if de+en missing', () => {
    expect(getLocalizedName({ fr: 'Température' })).toBe('Température')
  })

  it('empty object → empty string', () => {
    expect(getLocalizedName({})).toBe('')
  })
})

describe('getAllNamesForSearch', () => {
  it('undefined → empty string', () => {
    expect(getAllNamesForSearch(undefined)).toBe('')
  })

  it('string passthrough', () => {
    expect(getAllNamesForSearch('Temperatur')).toBe('Temperatur')
  })

  it('joins all language values', () => {
    const result = getAllNamesForSearch({ de: 'Temperatur', en: 'Temperature' })
    expect(result).toContain('Temperatur')
    expect(result).toContain('Temperature')
  })

  it('empty object → empty string', () => {
    expect(getAllNamesForSearch({})).toBe('')
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { getDefaultAppSettings, normalizeQuickPattern, loadAppSettings } from './UIContext'

const LS_KEY = 'iobroker-app-settings'

describe('getDefaultAppSettings', () => {
  it('returns object with expected shape', () => {
    const defaults = getDefaultAppSettings()
    expect(defaults.language).toBe('en')
    expect(defaults.dateFormat).toBe('de')
    expect(defaults.pageSize).toBe(200)
    expect(defaults.toolbarLabels).toBe(true)
    expect(defaults.includeScripts).toBe(false)
    expect(Array.isArray(defaults.visibleCols)).toBe(true)
    expect(defaults.visibleCols.length).toBeGreaterThan(0)
  })

  it('returns fresh object each call (no shared reference)', () => {
    const a = getDefaultAppSettings()
    const b = getDefaultAppSettings()
    a.language = 'de'
    expect(b.language).toBe('en')
  })
})

describe('normalizeQuickPattern', () => {
  it('empty string → empty string', () => {
    expect(normalizeQuickPattern('')).toBe('')
    expect(normalizeQuickPattern('   ')).toBe('')
  })

  it('no wildcard → appends .*', () => {
    expect(normalizeQuickPattern('alias.0')).toBe('alias.0.*')
  })

  it('trailing dot → strips dot, appends .*', () => {
    expect(normalizeQuickPattern('alias.0.')).toBe('alias.0.*')
    expect(normalizeQuickPattern('alias.0...')).toBe('alias.0.*')
  })

  it('already ends with .* → unchanged', () => {
    expect(normalizeQuickPattern('alias.0.*')).toBe('alias.0.*')
  })

  it('ends with * but not .* → normalizes to .*', () => {
    expect(normalizeQuickPattern('alias.0*')).toBe('alias.0.*')
  })

  it('trims whitespace', () => {
    expect(normalizeQuickPattern('  alias.0  ')).toBe('alias.0.*')
  })
})

describe('loadAppSettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('empty localStorage → returns defaults', () => {
    const s = loadAppSettings()
    const defaults = getDefaultAppSettings()
    expect(s.language).toBe(defaults.language)
    expect(s.dateFormat).toBe(defaults.dateFormat)
    expect(s.pageSize).toBe(defaults.pageSize)
  })

  it('corrupt JSON → returns defaults', () => {
    localStorage.setItem(LS_KEY, 'not-valid-json{{{')
    const s = loadAppSettings()
    expect(s.language).toBe('en')
  })

  it('null JSON → returns defaults', () => {
    localStorage.setItem(LS_KEY, 'null')
    const s = loadAppSettings()
    expect(s.language).toBe('en')
  })

  it('partial object → fills missing keys with defaults', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ language: 'de' }))
    const s = loadAppSettings()
    expect(s.language).toBe('de')
    expect(s.dateFormat).toBe('de') // default
    expect(s.pageSize).toBe(200)    // default
  })

  it('invalid language → falls back to en', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ language: 'fr' }))
    const s = loadAppSettings()
    expect(s.language).toBe('en')
  })

  it('invalid dateFormat → falls back to de', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ dateFormat: 'xyz' }))
    const s = loadAppSettings()
    expect(s.dateFormat).toBe('de')
  })

  it('invalid pageSize → falls back to 200', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ pageSize: 9999 }))
    const s = loadAppSettings()
    expect(s.pageSize).toBe(200)
  })

  it('valid pageSize kept', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ pageSize: 500 }))
    const s = loadAppSettings()
    expect(s.pageSize).toBe(500)
  })

  it('unknown visibleCols filtered out', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ visibleCols: ['id', 'INVALID_COL', 'name'] }))
    const s = loadAppSettings()
    expect(s.visibleCols).not.toContain('INVALID_COL')
    expect(s.visibleCols).toContain('id')
  })

  it('toolbarLabels false is preserved', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ toolbarLabels: false }))
    const s = loadAppSettings()
    expect(s.toolbarLabels).toBe(false)
  })

  it('includeScripts true is preserved', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ includeScripts: true }))
    const s = loadAppSettings()
    expect(s.includeScripts).toBe(true)
  })

  it('valid full object is round-tripped correctly', () => {
    const settings = { ...getDefaultAppSettings(), language: 'de' as const }
    localStorage.setItem(LS_KEY, JSON.stringify(settings))
    const s = loadAppSettings()
    expect(s.language).toBe('de')
    expect(s.dateFormat).toBe(settings.dateFormat)
    expect(s.pageSize).toBe(settings.pageSize)
  })
})

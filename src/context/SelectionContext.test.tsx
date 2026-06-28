import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { SelectionContextProvider, useSelectionContext } from './SelectionContext'

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(SelectionContextProvider, null, children)
}

describe('SelectionContext — initial state', () => {
  it('all values start null/false/undefined', () => {
    const { result } = renderHook(() => useSelectionContext(), { wrapper })
    expect(result.current.selectedId).toBeNull()
    expect(result.current.historyModalId).toBeNull()
    expect(result.current.newDatapointInitialId).toBeNull()
    expect(result.current.aliasReplaceInitialStr).toBeNull()
    expect(result.current.autoAliasDeviceId).toBeNull()
    expect(result.current.enumManagerOpen).toBe(false)
    expect(result.current.editInitialTab).toBeUndefined()
  })
})

describe('SelectionContext — state transitions', () => {
  it('setSelectedId updates selectedId', () => {
    const { result } = renderHook(() => useSelectionContext(), { wrapper })
    act(() => { result.current.setSelectedId('test.0.myState') })
    expect(result.current.selectedId).toBe('test.0.myState')
  })

  it('setSelectedId accepts null to clear', () => {
    const { result } = renderHook(() => useSelectionContext(), { wrapper })
    act(() => { result.current.setSelectedId('test.0.x') })
    act(() => { result.current.setSelectedId(null) })
    expect(result.current.selectedId).toBeNull()
  })

  it('setHistoryModalId updates historyModalId independently', () => {
    const { result } = renderHook(() => useSelectionContext(), { wrapper })
    act(() => {
      result.current.setSelectedId('test.0.x')
      result.current.setHistoryModalId('test.0.x')
    })
    expect(result.current.selectedId).toBe('test.0.x')
    expect(result.current.historyModalId).toBe('test.0.x')
  })

  it('setHistoryModalId null clears without affecting selectedId', () => {
    const { result } = renderHook(() => useSelectionContext(), { wrapper })
    act(() => {
      result.current.setSelectedId('test.0.x')
      result.current.setHistoryModalId('test.0.x')
    })
    act(() => { result.current.setHistoryModalId(null) })
    expect(result.current.historyModalId).toBeNull()
    expect(result.current.selectedId).toBe('test.0.x')
  })

  it('setEnumManagerOpen toggles correctly', () => {
    const { result } = renderHook(() => useSelectionContext(), { wrapper })
    act(() => { result.current.setEnumManagerOpen(true) })
    expect(result.current.enumManagerOpen).toBe(true)
    act(() => { result.current.setEnumManagerOpen(false) })
    expect(result.current.enumManagerOpen).toBe(false)
  })

  it('setEditInitialTab sets tab value', () => {
    const { result } = renderHook(() => useSelectionContext(), { wrapper })
    act(() => { result.current.setEditInitialTab('alias') })
    expect(result.current.editInitialTab).toBe('alias')
  })

  it('setAliasReplaceInitialStr updates correctly', () => {
    const { result } = renderHook(() => useSelectionContext(), { wrapper })
    act(() => { result.current.setAliasReplaceInitialStr('old.0.id') })
    expect(result.current.aliasReplaceInitialStr).toBe('old.0.id')
  })

  it('setAutoAliasDeviceId updates correctly', () => {
    const { result } = renderHook(() => useSelectionContext(), { wrapper })
    act(() => { result.current.setAutoAliasDeviceId('hm-rpc.0.ABC123') })
    expect(result.current.autoAliasDeviceId).toBe('hm-rpc.0.ABC123')
  })

  it('multiple independent state updates do not interfere', () => {
    const { result } = renderHook(() => useSelectionContext(), { wrapper })
    act(() => {
      result.current.setSelectedId('a.b.c')
      result.current.setEnumManagerOpen(true)
      result.current.setNewDatapointInitialId('new.0.id')
    })
    expect(result.current.selectedId).toBe('a.b.c')
    expect(result.current.enumManagerOpen).toBe(true)
    expect(result.current.newDatapointInitialId).toBe('new.0.id')
    expect(result.current.historyModalId).toBeNull()
  })
})

describe('SelectionContext — safety', () => {
  it('throws when used outside provider', () => {
    expect(() => renderHook(() => useSelectionContext())).toThrow(
      'useSelectionContext must be used inside SelectionContextProvider'
    )
  })
})

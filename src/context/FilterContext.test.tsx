import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { FilterContextProvider } from './FilterContext'
import { usePanelContext, type PanelContextValue } from './PanelContext'
import { UIContextProvider } from './UIContext'

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    UIContextProvider,
    null,
    React.createElement(FilterContextProvider, null, children)
  )
}

describe('FilterContextProvider — panel1Value identity', () => {
  it('keeps the same panel1Value object reference across unrelated re-renders', () => {
    const { result, rerender } = renderHook<PanelContextValue, unknown>(
      () => usePanelContext(),
      { wrapper }
    )
    const first = result.current
    rerender()
    const second = result.current
    expect(second).toBe(first)
  })
})

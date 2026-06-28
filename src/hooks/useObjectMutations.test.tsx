import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSetState } from './useObjectMutations'
import { queryKeys } from './queryKeys'
import type { IoBrokerState } from '../types/iobroker'

vi.mock('../api/iobroker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/iobroker')>()
  return { ...actual, setState: vi.fn() }
})

const { setState } = await import('../api/iobroker')
const mockSetState = setState as ReturnType<typeof vi.fn>

const INITIAL_STATE: IoBrokerState = { val: 42, ts: 1000, ack: true }
const STATE_ID = 'test.0.x'

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

describe('useSetState — optimistic update', () => {
  let qc: QueryClient

  beforeEach(() => {
    qc = makeQueryClient()
    // Seed state data using the actual values key pattern
    qc.setQueryData(
      queryKeys.states.values([STATE_ID]),
      { [STATE_ID]: { ...INITIAL_STATE } }
    )
    vi.clearAllMocks()
  })

  it('applies optimistic value before API resolves', async () => {
    let resolveApi!: () => void
    mockSetState.mockReturnValue(new Promise<void>((r) => { resolveApi = r }))

    const { result } = renderHook(() => useSetState(), { wrapper: makeWrapper(qc) })

    act(() => { result.current.mutate({ id: STATE_ID, val: 99 }) })

    // onMutate is async — wait for optimistic update to be applied
    await waitFor(() => {
      const allData = qc.getQueriesData<Record<string, IoBrokerState>>({
        queryKey: queryKeys.states.valuesRoot,
      })
      const entry = allData.find(([, v]) => v?.[STATE_ID])?.[1]
      expect(entry?.[STATE_ID]?.val).toBe(99)
    })

    // API still pending — resolve it now
    resolveApi()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('rolls back optimistic update when API call fails', async () => {
    mockSetState.mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useSetState(), { wrapper: makeWrapper(qc) })

    await act(async () => { result.current.mutate({ id: STATE_ID, val: 999 }) })
    await waitFor(() => expect(result.current.isError).toBe(true))

    // Value should be restored to original
    const allData = qc.getQueriesData<Record<string, IoBrokerState>>({
      queryKey: queryKeys.states.valuesRoot,
    })
    const entry = allData.find(([, v]) => v?.[STATE_ID])?.[1]
    expect(entry?.[STATE_ID]?.val).toBe(42)
  })

  it('sets ack: false on optimistic update when ack not provided', async () => {
    mockSetState.mockResolvedValue(undefined)

    const { result } = renderHook(() => useSetState(), { wrapper: makeWrapper(qc) })

    await act(async () => { result.current.mutate({ id: STATE_ID, val: 1 }) })

    // After success, detail query is invalidated — check optimistic ack was false
    // We verify by checking the rollback context captured ack correctly
    // (The onMutate sets ack: ack ?? false)
    const allData = qc.getQueriesData<Record<string, IoBrokerState>>({
      queryKey: queryKeys.states.valuesRoot,
    })
    // After success the data may still reflect the optimistic update (no refetch unless invalidated)
    const entry = allData.find(([, v]) => v?.[STATE_ID])?.[1]
    expect(entry?.[STATE_ID]?.ack).toBe(false)
  })
})

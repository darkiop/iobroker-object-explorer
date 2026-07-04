import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSetState, useCreateDatapoint } from './useObjectMutations'
import { queryKeys } from './queryKeys'
import type { IoBrokerState } from '../types/iobroker'

vi.mock('../api/iobroker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/iobroker')>()
  return {
    ...actual,
    setState: vi.fn(),
    createObject: vi.fn(),
    updateRoomMembership: vi.fn(),
    updateFunctionMembership: vi.fn(),
  }
})

const { setState, createObject } = await import('../api/iobroker')
const mockSetState = setState as ReturnType<typeof vi.fn>
const mockCreateObject = createObject as ReturnType<typeof vi.fn>

const STATE_ID = 'test.0.x'
const INITIAL_STATE: IoBrokerState = { val: 42, ts: 1000, ack: true, q: 0, from: '', user: '', lc: 1000, id: STATE_ID }

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

describe('useCreateDatapoint', () => {
  let qc: QueryClient

  beforeEach(() => {
    qc = makeQueryClient()
    qc.setQueryData(queryKeys.objects.root, {
      'alias.0.existing': { _id: 'alias.0.existing', type: 'state', common: {}, native: {} },
    })
    vi.clearAllMocks()
    mockCreateObject.mockResolvedValue(undefined)
  })

  it('patches the objects cache in place instead of invalidating it', async () => {
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useCreateDatapoint(), { wrapper: makeWrapper(qc) })

    await act(async () => {
      await result.current.mutateAsync({
        id: 'alias.0.new',
        common: { name: 'New' },
        objectType: 'state',
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const cache = qc.getQueryData<Record<string, unknown>>(queryKeys.objects.root)
    expect(cache?.['alias.0.new']).toBeDefined()
    expect(invalidateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.objects.root })
    )
  })
})

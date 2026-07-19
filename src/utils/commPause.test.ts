import { describe, it, expect } from 'vitest'
import {
  STATES_POLL_MS,
  pausedObjectsRefetch,
  pausedStatesRefetch,
  pausedRealtimeEnabled,
  pausedLongPollEnabled,
} from './commPause'

describe('pausedObjectsRefetch', () => {
  it('returns false when paused, regardless of base', () => {
    expect(pausedObjectsRefetch(true, 30_000)).toBe(false)
    expect(pausedObjectsRefetch(true, false)).toBe(false)
  })
  it('returns the base interval when not paused', () => {
    expect(pausedObjectsRefetch(false, 30_000)).toBe(30_000)
    expect(pausedObjectsRefetch(false, false)).toBe(false)
  })
})

describe('pausedStatesRefetch', () => {
  it('returns false when paused', () => {
    expect(pausedStatesRefetch(true, false)).toBe(false)
    expect(pausedStatesRefetch(true, true)).toBe(false)
  })
  it('returns false when a realtime channel is connected', () => {
    expect(pausedStatesRefetch(false, true)).toBe(false)
  })
  it('returns the poll interval when running and no realtime channel', () => {
    expect(pausedStatesRefetch(false, false)).toBe(STATES_POLL_MS)
  })
})

describe('pausedRealtimeEnabled', () => {
  it('is false when paused even if socket transport is selected', () => {
    expect(pausedRealtimeEnabled(true, true)).toBe(false)
  })
  it('is true only when running and socket transport is selected', () => {
    expect(pausedRealtimeEnabled(false, true)).toBe(true)
    expect(pausedRealtimeEnabled(false, false)).toBe(false)
  })
})

describe('pausedLongPollEnabled', () => {
  it('is false when paused', () => {
    expect(pausedLongPollEnabled(true, false, false)).toBe(false)
    expect(pausedLongPollEnabled(true, true, true)).toBe(false)
  })
  it('is true when long polling is the chosen transport', () => {
    expect(pausedLongPollEnabled(false, false, false)).toBe(true)
  })
  it('is true when socket transport is selected but has failed', () => {
    expect(pausedLongPollEnabled(false, true, true)).toBe(true)
  })
  it('is false when socket transport is selected and healthy', () => {
    expect(pausedLongPollEnabled(false, true, false)).toBe(false)
  })
})

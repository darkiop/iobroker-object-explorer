/**
 * Pure helpers that translate the ephemeral `paused` flag into the effective
 * React Query refetch intervals and realtime-transport enable flags used in
 * App.tsx. Single source of truth so "pause = stop all live traffic" stays
 * consistent across the object poll, the state-value poll, and both push
 * transports.
 */

/** Poll interval (ms) for state values when no realtime push channel is connected. */
export const STATES_POLL_MS = 10_000;

/** Objects auto-refresh is suspended entirely while paused; otherwise the configured base interval. */
export function pausedObjectsRefetch(paused: boolean, base: number | false): number | false {
  return paused ? false : base;
}

/**
 * State-value polling is suspended while paused, and (as before) while a realtime
 * push channel is connected. Otherwise it polls every STATES_POLL_MS.
 */
export function pausedStatesRefetch(paused: boolean, realtimeConnected: boolean): number | false {
  if (paused) return false;
  return realtimeConnected ? false : STATES_POLL_MS;
}

/** Socket.io transport runs only when selected AND not paused. */
export function pausedRealtimeEnabled(paused: boolean, socketTransportSelected: boolean): boolean {
  return !paused && socketTransportSelected;
}

/**
 * Long polling runs when not paused and either long-polling is the chosen
 * transport or socket.io has failed (auto-fallback).
 */
export function pausedLongPollEnabled(
  paused: boolean,
  socketTransportSelected: boolean,
  socketFailed: boolean,
): boolean {
  return !paused && (!socketTransportSelected || socketFailed);
}

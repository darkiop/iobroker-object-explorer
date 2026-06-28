import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useInstallPrompt } from './useInstallPrompt';

describe('useInstallPrompt', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('canInstall is false initially', () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);
  });

  it('canInstall becomes true when beforeinstallprompt fires', () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      const evt = Object.assign(new Event('beforeinstallprompt'), {
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(evt);
    });
    expect(result.current.canInstall).toBe(true);
  });

  it('install() calls prompt() on the event', async () => {
    const promptFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      const evt = Object.assign(new Event('beforeinstallprompt'), {
        prompt: promptFn,
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(evt);
    });
    await act(async () => {
      result.current.install();
    });
    expect(promptFn).toHaveBeenCalledOnce();
  });

  it('canInstall becomes false after install()', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      const evt = Object.assign(new Event('beforeinstallprompt'), {
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(evt);
    });
    await act(async () => {
      result.current.install();
    });
    expect(result.current.canInstall).toBe(false);
  });
});

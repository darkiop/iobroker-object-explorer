import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip, TooltipProvider } from './Tooltip';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('Tooltip', () => {
  beforeEach(() => {
    // @ts-expect-error - jsdom has no ResizeObserver; Radix UI needs it for size measurement
    global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('shows content after hover delay and hides on unhover', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(
      <TooltipProvider delayDuration={300} disableHoverableContent>
        <Tooltip content="Hello tooltip">
          <button>Trigger</button>
        </Tooltip>
      </TooltipProvider>
    );

    expect(screen.queryAllByText('Hello tooltip')).toHaveLength(0);

    await user.hover(screen.getByText('Trigger'));
    await waitFor(() => expect(screen.queryAllByText('Hello tooltip').length).toBeGreaterThan(0), {
      advanceTimers: vi.advanceTimersByTime,
    });

    await user.unhover(screen.getByText('Trigger'));
    await waitFor(() => expect(screen.queryAllByText('Hello tooltip')).toHaveLength(0), {
      advanceTimers: vi.advanceTimersByTime,
    });
  });

  it('renders only children when content is undefined', () => {
    render(
      <TooltipProvider>
        <Tooltip content={undefined}>
          <button>NoTooltip</button>
        </Tooltip>
      </TooltipProvider>
    );
    expect(screen.getByText('NoTooltip')).not.toBeNull();
  });
});

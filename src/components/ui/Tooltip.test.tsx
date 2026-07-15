import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip, TooltipProvider } from './Tooltip';

describe('Tooltip', () => {
  beforeEach(() => {
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
    await waitFor(() => expect(screen.queryAllByText('Hello tooltip').length).toBeGreaterThan(0));

    await user.unhover(screen.getByText('Trigger'));
    await waitFor(() => expect(screen.queryAllByText('Hello tooltip')).toHaveLength(0));
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

  it('clamps tooltip position so it never renders outside the viewport', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip content="Edge tooltip">
          <button>EdgeTrigger</button>
        </Tooltip>
      </TooltipProvider>
    );

    const trigger = screen.getByText('EdgeTrigger');
    fireEvent.mouseEnter(trigger, { clientX: 5000, clientY: 5000 });
    fireEvent.mouseMove(trigger, { clientX: 5000, clientY: 5000 });

    await waitFor(() => expect(screen.queryByTestId('tooltip-content')).not.toBeNull());

    const el = screen.getByTestId('tooltip-content') as HTMLElement;
    const left = parseFloat(el.style.left);
    const top = parseFloat(el.style.top);
    expect(left).toBeLessThanOrEqual(window.innerWidth - 8);
    expect(top).toBeLessThanOrEqual(window.innerHeight - 8);

    await user.unhover(trigger);
  });
});

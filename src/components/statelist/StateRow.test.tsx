import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StateRow from './StateRow';
import { TooltipProvider } from '../ui/Tooltip';
import type { SortKey } from './StateListColumns';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const baseObj = {
  _id: 'test.0.foo',
  type: 'state' as const,
  common: { name: 'Foo Bar', role: 'value', type: 'number' },
  native: {},
};

const visibleCols: SortKey[] = ['checkbox', 'id', 'write'];
const colWidths: Record<SortKey, number> = {
  checkbox: 30, id: 200, name: 150, write: 60, history: 40, custom: 40, smart: 40,
  alias: 40, scripts: 40, room: 100, function: 100, type: 80, role: 80, value: 100,
  unit: 60, ack: 40, ts: 120,
} as Record<SortKey, number>;

function renderRow(overrides: { onSelect?: (id: string) => void; onDeleteClick?: (id: string) => void } = {}) {
  return render(
    <TooltipProvider delayDuration={0}>
      <table>
        <tbody>
          <StateRow
            id="test.0.foo"
            state={{ val: 1, ack: true, ts: 1000, lc: 1000, q: 0, from: 'system' }}
            obj={baseObj}
            roomName=""
            fnName=""
            isSelected={false}
            isChecked={false}
            aliasIds={undefined}
            ownTargetExists={false}
            visibleCols={visibleCols}
            colWidths={colWidths}
            roles={[]}
            units={[]}
            roomEnums={[]}
            fnEnums={[]}
            onSelect={overrides.onSelect ?? (() => {})}
            onCheck={() => {}}
            onContextMenu={() => {}}
            onHistoryClick={() => {}}
            onDeleteClick={overrides.onDeleteClick ?? (() => {})}
            onEditJson={() => {}}
            onSelectRoom={() => {}}
            onSelectFunction={() => {}}
            onOpenValueModal={() => {}}
            roomEditForced={false}
            fnEditForced={false}
            onRoomEditEnd={() => {}}
            onFnEditEnd={() => {}}
            dateFormat="iso"
            language="en"
            expertMode={false}
            isFocused={false}
          />
        </tbody>
      </table>
    </TooltipProvider>
  );
}

describe('StateRow', () => {
  beforeEach(() => {
    // @ts-expect-error - jsdom has no ResizeObserver; Radix UI needs it for size measurement
    global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;
  });

  afterEach(() => {
    cleanup();
  });

  it('shows hidden-column info tooltip on row hover without clipping at viewport edge', async () => {
    const user = userEvent.setup({ delay: null });
    renderRow();

    await user.hover(screen.getByRole('row'));
    await waitFor(() => expect(screen.queryAllByText(/Name/).length).toBeGreaterThan(0));
  });

  it('clicking the Delete button (wrapped in Tooltip) fires onDeleteClick and stops propagation, without triggering row onSelect', async () => {
    const user = userEvent.setup({ delay: null });
    const onDeleteClick = vi.fn();
    const onSelect = vi.fn();
    renderRow({ onDeleteClick, onSelect });

    await user.click(screen.getByRole('button', { name: 'Delete datapoint' }));

    expect(onDeleteClick).toHaveBeenCalledWith('test.0.foo');
    expect(onSelect).not.toHaveBeenCalled();
  });
});

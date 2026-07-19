import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import userEvent from '@testing-library/user-event';
import SearchBar from './SearchBar';

const rooms = ['Wohnzimmer', 'Kueche'];

function setup() {
  const onSearch = vi.fn();
  render(<SearchBar onSearch={onSearch} roomNames={rooms} functionNames={[]} roleNames={[]} allObjectIds={[]} />);
  return { onSearch, input: screen.getByRole('textbox') as HTMLInputElement };
}

describe('SearchBar prefix click → value list', () => {
  it('typing "room:" shows room values', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.click(input);
    await user.type(input, 'room:');
    await waitFor(() => expect(screen.getByText('Wohnzimmer')).toBeTruthy());
  });

  it('clicking room: prefix from focus list shows room values (userEvent)', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.click(input);
    const prefixBtn = await screen.findByText('room:');
    await user.click(prefixBtn);
    await waitFor(() => expect(screen.getByText('Wohnzimmer')).toBeTruthy());
  });
});

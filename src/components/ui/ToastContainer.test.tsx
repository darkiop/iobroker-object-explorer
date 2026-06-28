import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ToastProvider, useToast } from '../../context/ToastContext';
import ToastContainer from './ToastContainer';

afterEach(cleanup);

function Trigger({
  message,
  type,
  action,
}: {
  message: string;
  type?: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
}) {
  const showToast = useToast();
  return (
    <button onClick={() => showToast(message, type, action)}>show</button>
  );
}

function Wrapper({
  message,
  type,
  action,
}: {
  message: string;
  type?: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
}) {
  return (
    <ToastProvider>
      <Trigger message={message} type={type} action={action} />
      <ToastContainer />
    </ToastProvider>
  );
}

describe('ToastContainer', () => {
  it('renders success toast', () => {
    render(<Wrapper message="OK" type="success" />);
    fireEvent.click(screen.getByText('show'));
    expect(screen.getByText('OK')).toBeTruthy();
  });

  it('renders info toast', () => {
    render(<Wrapper message="Info" type="info" />);
    fireEvent.click(screen.getByText('show'));
    expect(screen.getByText('Info')).toBeTruthy();
  });

  it('renders action button and calls handler', () => {
    const onClick = vi.fn();
    render(
      <Wrapper
        message="Update"
        type="info"
        action={{ label: 'Neu laden', onClick }}
      />
    );
    fireEvent.click(screen.getByText('show'));
    const actionBtn = screen.getByRole('button', { name: 'Neu laden' });
    fireEvent.click(actionBtn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('dismisses after action button click', () => {
    const onClick = vi.fn();
    render(
      <Wrapper
        message="Update"
        type="info"
        action={{ label: 'Neu laden', onClick }}
      />
    );
    fireEvent.click(screen.getByText('show'));
    fireEvent.click(screen.getByRole('button', { name: 'Neu laden' }));
    expect(screen.queryByText('Update')).toBeNull();
  });
});

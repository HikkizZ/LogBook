import { act, render, screen } from '@testing-library/react';
import { ToastProvider, useToast, type ToastOptions } from './Toast';

function Show({ options }: { options: ToastOptions }) {
  const toast = useToast();
  return <button onClick={() => toast.show(options)}>Mostrar</button>;
}

function showToast(options: ToastOptions) {
  render(
    <ToastProvider>
      <Show options={options} />
    </ToastProvider>,
  );
  act(() => screen.getByRole('button', { name: 'Mostrar' }).click());
}

describe('Toast (I-2 §5)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('un toast sin acción se cierra solo a los 4 s', () => {
    showToast({ tone: 'success', message: 'Copiado' });
    expect(screen.getByRole('status')).toHaveTextContent('Copiado');

    act(() => void vi.advanceTimersByTime(4000));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('un toast con acción no se cierra solo', () => {
    showToast({
      tone: 'danger',
      message: 'Sin conexión',
      action: { label: 'Reintentar', onClick: () => undefined },
    });

    act(() => void vi.advanceTimersByTime(60_000));

    expect(screen.getByRole('alert')).toHaveTextContent('Sin conexión');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

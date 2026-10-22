import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useHotkeys } from './useHotkeys';

interface HarnessProps {
  onNew: () => void;
  onSearch: () => void;
  onDay: () => void;
}

function Harness({ onNew, onSearch, onDay }: HarnessProps) {
  const [help, setHelp] = useState(false);
  useHotkeys({
    n: onNew,
    'ctrl+k': onSearch,
    '?': () => setHelp(true),
    'g d': onDay,
  });
  return (
    <>
      <input aria-label="Campo" />
      <textarea aria-label="Texto" />
      {help && <p>Atajos de teclado</p>}
    </>
  );
}

function setup() {
  const fns = { onNew: vi.fn(), onSearch: vi.fn(), onDay: vi.fn() };
  render(<Harness {...fns} />);
  return { user: userEvent.setup(), ...fns };
}

describe('useHotkeys', () => {
  it('n en un input no abre nada; fuera de un input sí', async () => {
    const { user, onNew } = setup();

    await user.click(screen.getByRole('textbox', { name: 'Campo' }));
    await user.keyboard('n');
    await user.click(screen.getByRole('textbox', { name: 'Texto' }));
    await user.keyboard('n');
    expect(onNew).not.toHaveBeenCalled();

    await user.click(document.body);
    await user.keyboard('n');
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('? abre la tabla de atajos, pero no escribiendo en un campo', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('textbox', { name: 'Campo' }));
    await user.keyboard('?');
    expect(screen.queryByText('Atajos de teclado')).not.toBeInTheDocument();

    await user.click(document.body);
    await user.keyboard('?');
    expect(screen.getByText('Atajos de teclado')).toBeInTheDocument();
  });

  it('Ctrl+K funciona también dentro de un input', async () => {
    const { user, onSearch } = setup();

    await user.click(screen.getByRole('textbox', { name: 'Campo' }));
    await user.keyboard('{Control>}k{/Control}');

    expect(onSearch).toHaveBeenCalledOnce();
  });

  it('g d es una secuencia: g solo no dispara, g y d sí', async () => {
    const { user, onDay } = setup();

    await user.keyboard('g');
    expect(onDay).not.toHaveBeenCalled();
    await user.keyboard('d');
    expect(onDay).toHaveBeenCalledOnce();

    await user.keyboard('xd');
    expect(onDay).toHaveBeenCalledOnce();
  });

  it('no dispara con un modal abierto', async () => {
    const { user, onNew } = setup();
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    document.body.append(modal);

    await user.keyboard('n');
    modal.remove();

    expect(onNew).not.toHaveBeenCalled();
  });

  it('M-8 §6.2: con Bloq Mayús (key en mayúscula, sin Shift) el atajo sigue disparando', () => {
    const { onNew } = setup();

    fireEvent.keyDown(document, { key: 'N' });
    expect(onNew).toHaveBeenCalledOnce();

    // Con Shift real no es el atajo `n`.
    fireEvent.keyDown(document, { key: 'N', shiftKey: true });
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('M-8 §6.2: las secuencias también ignoran Bloq Mayús', () => {
    const { onDay } = setup();

    fireEvent.keyDown(document, { key: 'G' });
    fireEvent.keyDown(document, { key: 'D' });

    expect(onDay).toHaveBeenCalledOnce();
  });
});

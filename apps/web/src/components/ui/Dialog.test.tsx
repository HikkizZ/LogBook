import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { ToastProvider, useToast } from './Toast';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Abrir</Button>
      <Button>Fuera</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="¿Por qué queda bloqueada T-42?">
        <textarea aria-label="Motivo" />
        <Button>Bloquear</Button>
        <Button onClick={() => setOpen(false)}>Cancelar</Button>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('tiene rol dialog con nombre accesible y enfoca el primer control', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    expect(screen.getByRole('dialog', { name: '¿Por qué queda bloqueada T-42?' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Motivo' })).toHaveFocus();
  });

  it('no deja salir el foco con Tab ni con Shift+Tab', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = screen.getByRole('dialog');

    for (let i = 0; i < 7; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    for (let i = 0; i < 7; i++) {
      await user.tab({ shift: true });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    // Shift+Tab desde el primero salta al último; Tab desde el último vuelve al primero.
    screen.getByRole('textbox', { name: 'Motivo' }).focus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Motivo' })).toHaveFocus();
  });

  it('Esc cierra y el foco vuelve al botón que lo abrió', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Abrir' });
    await user.click(opener);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('M-4 §6.1: el contenedor del diálogo no quita su propio anillo de foco', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    expect(screen.getByRole('dialog').className).not.toMatch(/outline-none/);
  });

  it('M-5: mientras está abierto el body no se desplaza y al cerrar se restaura', async () => {
    const user = userEvent.setup();
    document.body.style.overflow = 'auto';
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');

    expect(document.body.style.overflow).toBe('auto');
    document.body.style.overflow = '';
  });

  it('M-5: un toast sobre el diálogo puede recibir el foco y cerrarse con el teclado', async () => {
    const user = userEvent.setup();
    function WithToast() {
      const toast = useToast();
      return (
        <Dialog open onClose={() => undefined} title="Diálogo">
          <Button onClick={() => toast.show({ tone: 'danger', message: 'Sin conexión' })}>
            Avisar
          </Button>
        </Dialog>
      );
    }
    render(
      <ToastProvider>
        <WithToast />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Avisar' }));
    const close = screen.getByRole('button', { name: 'Cerrar aviso' });

    close.focus();
    expect(close).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(screen.queryByText('Sin conexión')).not.toBeInTheDocument();
  });
});

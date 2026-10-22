import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  it('M-6 §5: se cierra al hacer scroll para no quedar flotando', async () => {
    const user = userEvent.setup();
    render(
      <div data-testid="scroller">
        <Tooltip label="Mi día" side="right">
          {(props) => (
            <a href="/today" {...props}>
              Hoy
            </a>
          )}
        </Tooltip>
      </div>,
    );

    await user.tab();
    expect(await screen.findByRole('tooltip')).toBeVisible();

    // Los scroll no burbujean: el de la `nav` de la sidebar solo llega por captura.
    fireEvent.scroll(screen.getByTestId('scroller'));

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

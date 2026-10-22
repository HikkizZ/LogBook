import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('M-11 §6.1: un botón solo de icono exige aria-label en el tipo', () => {
    // @ts-expect-error iconOnly sin aria-label no compila
    const missing = <Button iconOnly />;
    render(
      <>
        {missing}
        <Button iconOnly aria-label="Reloj" />
      </>,
    );

    expect(screen.getByRole('button', { name: 'Reloj' })).toBeInTheDocument();
  });
});

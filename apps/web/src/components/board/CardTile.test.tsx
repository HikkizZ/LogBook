import { render, screen } from '@testing-library/react';
import { makeCard } from '../../test/board-fixtures';
import { CardTile } from './CardTile';

const TODAY = '2026-10-22';

describe('CardTile (4.1)', () => {
  it('§6.1: una fecha vencida lleva la clase de peligro y el texto "vencida"', () => {
    render(<CardTile today={TODAY} card={makeCard('todo', { dueDate: '2026-10-19' })} />);

    const due = screen.getByText(/vencida/);

    expect(due).toHaveClass('text-danger');
    expect(due).toHaveTextContent('vencida hace 3 días');
  });

  it('§6.1: por vencer (≤ 3 días) usa ámbar con texto; lejana, muted con la fecha', () => {
    render(
      <>
        <CardTile today={TODAY} card={makeCard('todo', { dueDate: '2026-10-24' })} />
        <CardTile today={TODAY} card={makeCard('todo', { dueDate: '2026-11-15' })} />
      </>,
    );

    expect(screen.getByText('vence en 2 días')).toHaveClass('text-warning');
    expect(screen.getByText('15 nov')).toHaveClass('text-fg-muted');
  });

  it('una tarjeta hecha no se marca como vencida aunque la fecha haya pasado', () => {
    render(<CardTile today={TODAY} card={makeCard('done', { dueDate: '2026-10-01' })} />);

    expect(screen.queryByText(/vencida/)).not.toBeInTheDocument();
    expect(screen.getByText('1 oct')).toBeInTheDocument();
  });

  it('muestra ID, título, etiquetas, checklist 2/5 y prioridad con texto para lectores', () => {
    render(
      <CardTile
        today={TODAY}
        card={makeCard('in_progress', {
          number: 42,
          title: 'Migrar facturas',
          priority: 'urgent',
          labels: [
            { name: 'feature', color: 'violeta' },
            { name: 'bug', color: 'magenta' },
            { name: 'docs', color: 'gris' },
          ],
          checklistDone: 2,
          checklistTotal: 5,
        })}
      />,
    );

    expect(screen.getByText('T-42')).toHaveClass('font-mono');
    expect(screen.getByText('Migrar facturas')).toHaveClass('line-clamp-2');
    expect(screen.getByText('feature')).toBeInTheDocument();
    expect(screen.getByText('bug')).toBeInTheDocument();
    expect(screen.queryByText('docs')).not.toBeInTheDocument();
    expect(screen.getByText('1 etiquetas más')).toBeInTheDocument();
    expect(screen.getByText('Checklist: 2 de 5')).toBeInTheDocument();
    expect(screen.getByText('Prioridad urgente')).toBeInTheDocument();
  });

  it('prioridad media no lleva punto y sin nada que mostrar no hay tercera línea', () => {
    render(<CardTile today={TODAY} card={makeCard('todo', { priority: 'medium' })} />);

    expect(screen.queryByText(/Prioridad/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Checklist/)).not.toBeInTheDocument();
  });

  it('§2.2: la barra de estado cambia con el estado; Revisión es discontinua', () => {
    render(
      <>
        <CardTile today={TODAY} card={makeCard('blocked', { number: 1 })} />
        <CardTile today={TODAY} card={makeCard('review', { number: 2 })} />
        <CardTile today={TODAY} card={makeCard('done', { number: 3 })} />
      </>,
    );
    const tile = (ref: string) => document.querySelector(`[data-card-ref="${ref}"]`);

    expect(tile('T-1')).toHaveClass('border-l-danger');
    expect(tile('T-2')).toHaveClass('border-l-primary', '[border-left-style:dashed]');
    expect(tile('T-3')).toHaveClass('border-l-success');
  });

  it('§5: archivada al 60 % de opacidad; el hueco del arrastre oculta el contenido', () => {
    render(
      <>
        <CardTile
          today={TODAY}
          card={makeCard('todo', { number: 1, archivedAt: '2026-10-21T12:00:00.000Z' })}
        />
        <CardTile today={TODAY} card={makeCard('todo', { number: 2 })} state="placeholder" />
      </>,
    );

    expect(document.querySelector('[data-card-ref="T-1"]')).toHaveClass('opacity-60');
    expect(document.querySelector('[data-card-ref="T-2"]')).toHaveClass('border-dashed');
    expect(screen.getByText('T-2').parentElement?.parentElement).toHaveClass('invisible');
  });
});

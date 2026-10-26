import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DndContextProps, DragEndEvent } from '@dnd-kit/core';
import { makeCard } from '../../test/board-fixtures';
import { makeItem, renderPanel } from '../../test/card-fixtures';

// Igual que en BoardDrag.test.tsx: jsdom no tiene geometría, así que se captura el `DndContext` del checklist
// (el único cuyas instrucciones hablan de "reordenar") y se invoca su `onDragEnd` con el evento de dnd-kit.
const captured = vi.hoisted(() => ({ contexts: [] as DndContextProps[] }));

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: (props: DndContextProps) => {
      captured.contexts.push(props);
      return <actual.DndContext {...props} />;
    },
  };
});

const ID = (n: number) => `00000000-0000-4000-a000-00000000000${n}`;

function checklistContext(): DndContextProps {
  const found = [...captured.contexts]
    .reverse()
    .find((c) => c.accessibility?.screenReaderInstructions?.draggable?.includes('reordenar'));
  if (!found) throw new Error('No hay DndContext del checklist');
  return found;
}

function dropItem(activeId: string, overId: string) {
  act(() =>
    checklistContext().onDragEnd?.({
      active: { id: activeId },
      over: { id: overId },
    } as unknown as DragEndEvent),
  );
}

async function openChecklist() {
  const user = userEvent.setup();
  const api = renderPanel(
    [
      makeCard('todo', {
        number: 1,
        title: 'Migrar facturas',
        checklistDone: 0,
        checklistTotal: 3,
      }),
    ],
    {
      checklist: [
        makeItem(ID(1), 'Uno', false, 0),
        makeItem(ID(2), 'Dos', false, 1),
        makeItem(ID(3), 'Tres', false, 2),
      ],
    },
  );
  await screen.findByText('Migrar facturas');
  document.querySelector<HTMLElement>('[data-card-ref="T-1"]')?.focus();
  await user.keyboard('{Enter}');
  const dialog = await screen.findByRole('dialog', { name: 'Migrar facturas' });
  await user.click(await within(dialog).findByRole('tab', { name: /Checklist/ }));
  await within(dialog).findByRole('list', { name: 'Ítems del checklist' });
  return { api, dialog };
}

/** Textos de los ítems en el orden en que se pintan (el texto va en el botón que abre la edición). */
const order = (dialog: HTMLElement) =>
  within(within(dialog).getByRole('list', { name: 'Ítems del checklist' }))
    .getAllByRole('button', { name: /^(Uno|Dos|Tres)$/ })
    .map((b) => b.textContent);

describe('reordenar el checklist (5.4, RF-24)', () => {
  it('RF-24: soltar un ítem sobre otro lo reordena al instante y manda la posición destino', async () => {
    const { api, dialog } = await openChecklist();

    dropItem(ID(1), ID(3));

    await waitFor(() => expect(order(dialog)).toEqual(['Dos', 'Tres', 'Uno']));
    await waitFor(() =>
      expect(api.checklistPatches).toEqual([{ id: ID(1), body: { position: 2 } }]),
    );
    expect(api.checklist.map((i) => i.text)).toEqual(['Dos', 'Tres', 'Uno']);
  });

  it('soltar un ítem sobre sí mismo no hace nada', async () => {
    const { api, dialog } = await openChecklist();

    dropItem(ID(2), ID(2));

    expect(order(dialog)).toEqual(['Uno', 'Dos', 'Tres']);
    expect(api.checklistPatches).toEqual([]);
  });

  it('las asas llevan nombre accesible y rol descrito para el lector de pantalla', async () => {
    const { dialog } = await openChecklist();

    const handle = within(dialog).getByRole('button', { name: 'Reordenar "Uno"' });

    expect(handle).toHaveAttribute('aria-roledescription', 'ítem reordenable');
  });
});

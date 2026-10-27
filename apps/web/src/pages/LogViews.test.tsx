import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { todayIn } from '../lib/dates';
import { SETTINGS } from '../test/board-fixtures';
import { logCard, logEntry, logProject, renderLog } from '../test/log-fixtures';
import type { LogView } from '../api/log-queries';

const SIGA = logProject('siga', 'SIGA');
const PORTAFOLIO = logProject('portafolio', 'Portafolio', 'turquesa');
const PERSONAL = logProject('personal', 'Personal', 'oliva');
const ALL = [SIGA, PORTAFOLIO, PERSONAL];

/** Una semana con notas en 3 proyectos, en dos días, y una tarjeta que se movió. */
const WEEK: LogView = {
  days: [
    {
      date: '2026-10-20',
      projects: [
        {
          project: PERSONAL,
          cards: [
            {
              card: logCard(7, 'personal', 'Ordenar el vault'),
              entries: [logEntry('T-7', 'Ordené la bandeja', '2026-10-20T13:00:00.000Z')],
            },
          ],
        },
        {
          project: SIGA,
          cards: [
            {
              card: logCard(1, 'siga', 'Migrar facturas', { status: 'blocked' }),
              entries: [
                logEntry('T-1', 'Avancé la exportación', '2026-10-20T14:00:00.000Z'),
                logEntry('T-1', 'Espero respuesta', '2026-10-20T15:00:00.000Z', {
                  kind: 'blocked',
                }),
              ],
            },
          ],
        },
      ],
    },
    {
      date: '2026-10-21',
      projects: [
        {
          project: PORTAFOLIO,
          cards: [
            {
              card: logCard(4, 'portafolio', 'Página de proyectos'),
              entries: [
                logEntry('T-4', 'Armé la grilla', '2026-10-21T13:00:00.000Z'),
                logEntry('T-4', 'Por hacer → En curso', '2026-10-21T13:30:00.000Z', {
                  kind: 'moved',
                  metadata: { from: 'todo', to: 'in_progress' },
                }),
              ],
            },
          ],
        },
      ],
    },
  ],
  moved: [logCard(4, 'portafolio', 'Página de proyectos') as never],
};

const EMPTY: LogView = { days: [], moved: [] };

describe('Mi semana (6.1)', () => {
  it('RF-41: agrupa por día, luego por proyecto, tarjeta y entradas', async () => {
    const api = renderLog('/week?date=2026-10-21', WEEK, '', ALL);

    const tuesday = await screen.findByRole('heading', { name: 'Martes 20' });
    const wednesday = screen.getByRole('heading', { name: 'Miércoles 21' });
    expect(tuesday.compareDocumentPosition(wednesday)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    // Dos proyectos el martes, uno el miércoles: cada nombre bajo su día.
    const sections = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(sections).toEqual(['Personal', 'SIGA', 'Portafolio']);

    const siga = screen.getByRole('link', { name: /T-1 Migrar facturas/ }).closest('li');
    expect(siga).not.toBeNull();
    if (!siga) return;
    expect(within(siga).getByText('Avancé la exportación')).toBeVisible();
    expect(within(siga).getByText('Espero respuesta')).toBeVisible();
    // El bloqueo lleva su chip y la tarjeta su estado actual.
    expect(within(siga).getAllByText('Bloqueado')).toHaveLength(2);

    expect(screen.getByText('semana 43')).toBeVisible();
    expect(api.logRequests.at(-1)?.params).toEqual({ from: '2026-10-19', to: '2026-10-25' });
  });

  it('RF-42: la sección "Se movieron" muestra el recorrido de columnas de la tarjeta', async () => {
    renderLog('/week?date=2026-10-21', WEEK, '', ALL);

    const heading = await screen.findByRole('heading', { name: /Se movieron/ });
    const section = heading.closest('section');
    if (!section) throw new Error('sin sección');
    expect(within(section).getByRole('link')).toHaveTextContent('T-4 · Por hacer → En curso');
  });

  it('RF-41: las notas se pintan sanitizadas (sin HTML)', async () => {
    const view: LogView = {
      days: [
        {
          date: '2026-10-20',
          projects: [
            {
              project: SIGA,
              cards: [
                {
                  card: logCard(1, 'siga', 'Migrar'),
                  entries: [
                    logEntry(
                      'T-1',
                      'hola <img src=x onerror=alert(1)> **fuerte**',
                      '2026-10-20T14:00:00.000Z',
                    ),
                  ],
                },
              ],
            },
          ],
        },
      ],
      moved: [],
    };
    renderLog('/week?date=2026-10-20', view);
    await screen.findByText('fuerte');
    expect(document.querySelector('img')).toBeNull();
  });

  it('RF-41: las flechas cambian de semana ISO y "Hoy" vuelve a la actual', async () => {
    const user = userEvent.setup();
    const api = renderLog('/week?date=2026-10-21', EMPTY);
    await screen.findByText('semana 43');

    await user.click(screen.getByRole('button', { name: 'Semana siguiente' }));
    await screen.findByText('semana 44');
    expect(screen.getByTestId('location')).toHaveTextContent('/week?date=2026-10-28');
    await waitFor(() =>
      expect(api.logRequests.at(-1)?.params).toEqual({ from: '2026-10-26', to: '2026-11-01' }),
    );

    await user.click(screen.getByRole('button', { name: 'Semana anterior' }));
    await user.click(screen.getByRole('button', { name: 'Semana anterior' }));
    await screen.findByText('semana 42');

    await user.click(screen.getByRole('button', { name: 'Hoy' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/week$/);
  });

  it('RF-44: el selector de proyecto vive en la URL y filtra la petición', async () => {
    const user = userEvent.setup();
    const api = renderLog('/week?date=2026-10-21', WEEK, '', ALL);
    await screen.findByRole('heading', { name: 'Martes 20' });

    await user.selectOptions(screen.getByLabelText('Proyecto'), 'siga');

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/week?date=2026-10-21&project=siga',
      ),
    );
    await waitFor(() => expect(api.logRequests.at(-1)?.params.project).toBe('siga'));
  });

  it('RF-44: abrir la página con ?project= deja el selector en ese proyecto', async () => {
    const api = renderLog('/week?date=2026-10-21&project=portafolio', EMPTY, '', ALL);
    await screen.findByText('Sin registros esta semana');
    expect(screen.getByLabelText('Proyecto')).toHaveValue('portafolio');
    expect(api.logRequests[0]?.params.project).toBe('portafolio');
  });
});

describe('Mi día (6.1)', () => {
  it('RF-40: sin ?date= muestra hoy en la zona de Ajustes y navega día a día', async () => {
    const user = userEvent.setup();
    const today = todayIn(SETTINGS.timezone);
    const api = renderLog('/today', EMPTY);
    await screen.findByText('Sin registros este día');
    expect(screen.getByText('hoy')).toBeVisible();
    expect(api.logRequests[0]?.params).toEqual({ from: today, to: today });
    expect(screen.getByRole('button', { name: 'Hoy' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Día anterior' }));
    await waitFor(() => expect(api.logRequests.at(-1)?.params.from).not.toBe(today));
    expect(screen.getByRole('button', { name: 'Hoy' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Día siguiente' }));
    // La consulta de hoy sigue en caché: se ve por la etiqueta, no por una petición nueva.
    expect(await screen.findByText('hoy')).toBeVisible();
  });

  it('RF-40: el estado vacío ofrece ir al tablero', async () => {
    renderLog('/today?date=2026-10-21', EMPTY);
    await screen.findByText('Sin registros este día');
    expect(screen.getByRole('link', { name: 'Ir al tablero' })).toHaveAttribute('href', '/p/siga');
  });

  it('RF-40: abrir una tarjeta lleva a /p/:slug/:ref', async () => {
    const user = userEvent.setup();
    renderLog('/today?date=2026-10-20', { days: WEEK.days.slice(0, 1), moved: [] }, '', ALL);

    await user.click(await screen.findByRole('link', { name: /T-1 Migrar facturas/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/p/siga/T-1');
  });
});

describe('Copiar resumen (6.2)', () => {
  const MARKDOWN =
    '## Semana 43 — 2026-10-19 a 2026-10-25\n\n### SIGA\n\n- **T-1** Migrar facturas — avancé X (mar 20)\n';

  const writeText = vi.fn();
  /** `userEvent.setup()` instala su propio portapapeles: el mock va después. */
  const setupUser = () => {
    const user = userEvent.setup();
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    return user;
  };

  it('RF-43: pide /summary?format=md con los mismos filtros de la vista y copia el texto exacto', async () => {
    const user = setupUser();
    const api = renderLog('/week?date=2026-10-21&project=siga', WEEK, MARKDOWN, ALL);
    await screen.findByRole('heading', { name: 'Martes 20' });

    await user.click(screen.getByRole('button', { name: 'Copiar resumen' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(MARKDOWN));
    expect(api.summaryRequests).toEqual([
      {
        path: '/api/v1/summary',
        params: { from: '2026-10-19', to: '2026-10-25', project: 'siga', format: 'md' },
      },
    ]);
    const toasts = await screen.findByRole('region', { name: 'Avisos' });
    expect(await within(toasts).findByRole('status')).toHaveTextContent('Copiado');
  });

  it('RF-43: en Mi día pide el mismo día en from y to', async () => {
    const user = setupUser();
    const api = renderLog('/today?date=2026-10-21', EMPTY, '## Día 2026-10-21\n');
    await screen.findByText('Sin registros este día');

    await user.click(screen.getByRole('button', { name: 'Copiar resumen' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('## Día 2026-10-21\n'));
    expect(api.summaryRequests[0]?.params).toEqual({
      from: '2026-10-21',
      to: '2026-10-21',
      format: 'md',
    });
  });

  it('RF-43: si el portapapeles falla, avisa y deja el resumen seleccionable', async () => {
    const user = setupUser();
    writeText.mockRejectedValue(new Error('denegado'));
    renderLog('/week?date=2026-10-21', EMPTY, MARKDOWN);
    await screen.findByText('Sin registros esta semana');

    await user.click(screen.getByRole('button', { name: 'Copiar resumen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo copiar');
    const box = screen.getByRole('textbox', { name: 'Resumen en markdown' });
    expect(box).toHaveValue(MARKDOWN);
    expect(box).toHaveAttribute('readonly');
  });
});

describe('Revisión fase 6', () => {
  it('I-4 §6.1: en Mi día cada tarjeta es un h3 y el proyecto un h2', async () => {
    renderLog('/today?date=2026-10-20', { days: WEEK.days.slice(0, 1), moved: [] }, '', ALL);

    await screen.findByRole('heading', { level: 2, name: 'SIGA' });
    const cards = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(cards).toEqual([
      expect.stringContaining('Ordenar el vault'),
      expect.stringContaining('Migrar facturas'),
    ]);
    expect(screen.getByRole('link', { name: /T-1 Migrar facturas/ }).closest('h3')).not.toBeNull();
  });

  it('I-4 §6.1: en Mi semana la tarjeta baja un nivel (h2 día, h3 proyecto, h4 tarjeta)', async () => {
    renderLog('/week?date=2026-10-21', WEEK, '', ALL);

    await screen.findByRole('heading', { level: 2, name: 'Martes 20' });
    const cards = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(cards).toEqual([
      expect.stringContaining('Ordenar el vault'),
      expect.stringContaining('Migrar facturas'),
      expect.stringContaining('Página de proyectos'),
    ]);
  });

  it('M-7 RF-41: el rango de una semana que cruza el año lleva el año', async () => {
    renderLog('/week?date=2026-12-30', EMPTY);
    await screen.findByText('semana 53');
    expect(screen.getByText(/28 dic 2026 – 3 ene 2027/)).toBeVisible();
  });

  it('M-7 RF-41: el rango de una semana de otro año que el actual lleva el año', async () => {
    renderLog('/week?date=2020-03-04', EMPTY);
    await screen.findByText('semana 10');
    expect(screen.getByText(/2 mar 2020 – 8 mar 2020/)).toBeVisible();
  });
});

describe('navegación por fecha (D-5)', () => {
  it('D-5 §4.4: las flechas y "Hoy" añaden una entrada al historial: Atrás vuelve al día anterior', async () => {
    const user = userEvent.setup();
    renderLog('/today?date=2026-10-21', EMPTY);
    await screen.findByText('Sin registros este día');

    await user.click(screen.getByRole('button', { name: 'Día siguiente' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/today?date=2026-10-22');
    await user.click(screen.getByRole('button', { name: 'Día siguiente' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/today?date=2026-10-23');
    await user.click(screen.getByRole('button', { name: 'Hoy' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/today$/);

    await user.click(screen.getByRole('button', { name: 'Atrás (prueba)' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/today?date=2026-10-23');
    await user.click(screen.getByRole('button', { name: 'Atrás (prueba)' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/today?date=2026-10-22');
  });
});

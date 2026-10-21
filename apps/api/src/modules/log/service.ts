import type {
  CardDto,
  CardLogQuery,
  CreateLogEntryBody,
  LogCardDto,
  LogEntryDto,
  LogGroupsDto,
  LogRangeQuery,
  UpdateLogEntryBody,
} from 'shared';
import { getDataSource } from '../../db/client.js';
import { LogEntry } from '../../entities/index.js';
import type { Card, LogKind, LogSource, Project } from '../../entities/index.js';
import { AppError } from '../../http/errors.js';
import { dateInTimezone, now } from '../../lib/clock.js';
import { loadCardDtos } from '../cards/service.js';
import { findProjectBySlug, toProjectDto } from '../projects/service.js';
import { getTimezone } from '../settings/service.js';
import { toLogEntryDto } from './dto.js';

const DAY_MS = 86_400_000;
const notFound = () => new AppError('NOT_FOUND', 'Entrada de bitácora no encontrada');

// ---------------------------------------------------------------------------------------------
// Bitácora de una tarjeta

export async function listCardLog(card: Card, query: CardLogQuery): Promise<LogEntryDto[]> {
  const qb = getDataSource()
    .createQueryBuilder(LogEntry, 'l')
    .where('l.card_id = :id', { id: card.id });
  if (query.kinds) qb.andWhere('l.kind IN (:...kinds)', { kinds: query.kinds });
  const rows = await qb
    .orderBy('l.occurred_at', 'DESC')
    .addOrderBy('l.id', 'DESC')
    .limit(query.limit)
    .getMany();
  return rows.reverse().map((e) => toLogEntryDto(e, card.number));
}

export async function createEntry(
  card: Card,
  body: CreateLogEntryBody,
  source: Extract<LogSource, 'ui' | 'api'>,
): Promise<LogEntryDto> {
  const repo = getDataSource().getRepository(LogEntry);
  const entry = await repo.save(
    repo.create({
      cardId: card.id,
      kind: body.kind ?? 'note',
      source,
      body: body.body,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : now(),
    }),
  );
  return toLogEntryDto(entry, card.number);
}

async function findEntry(id: string): Promise<{ entry: LogEntry; number: number }> {
  const entry = await getDataSource()
    .getRepository(LogEntry)
    .findOne({ where: { id }, relations: { card: true } });
  if (!entry) throw notFound();
  return { entry, number: entry.card.number };
}

/** RF-32: solo `note` y `blocked` se editan; las de sistema dan 400. */
export async function updateEntry(id: string, body: UpdateLogEntryBody): Promise<LogEntryDto> {
  const { entry, number } = await findEntry(id);
  if (entry.kind !== 'note' && entry.kind !== 'blocked') {
    throw new AppError('VALIDATION_ERROR', 'kind: solo se editan entradas note y blocked', [
      { path: 'kind', message: 'solo se editan entradas note y blocked' },
    ]);
  }
  if (body.body !== undefined) entry.body = body.body;
  if (body.occurredAt !== undefined) entry.occurredAt = new Date(body.occurredAt);
  const saved = await getDataSource().getRepository(LogEntry).save(entry);
  return toLogEntryDto(saved, number);
}

/** RF-32: cualquier entrada se puede borrar, también las de sistema. */
export async function deleteEntry(id: string): Promise<void> {
  const { entry } = await findEntry(id);
  await getDataSource().getRepository(LogEntry).delete({ id: entry.id });
}

// ---------------------------------------------------------------------------------------------
// Bitácora agregada por día → proyecto → tarjeta

/** El `Card` de `days[]` va sin `description` (#20). */
function toLogCard(card: CardDto): LogCardDto {
  const { description, ...rest } = card;
  void description;
  return rest;
}

export interface DateRange {
  from: string;
  to: string;
}

/** Sin `from`/`to` = hoy; con uno solo = ese día. Los días son los del `timezone` de `/settings` (#13). */
export async function resolveRange(query: Pick<LogRangeQuery, 'from' | 'to'>): Promise<DateRange> {
  const from = query.from ?? query.to ?? dateInTimezone(now(), await getTimezone());
  return { from, to: query.to ?? from };
}

type EntryWithCard = LogEntry & { card: Card & { project: Project } };

/** Entradas cuyo día local (en `timeZone`) cae en el período, en orden cronológico. */
async function entriesInRange(
  range: DateRange,
  timeZone: string,
  kinds: LogKind[] | undefined,
  projectId: string | undefined,
): Promise<EntryWithCard[]> {
  // Cota gruesa en UTC (el desfase máximo de una zona es 14 h); el filtro exacto es el de abajo.
  const lower = new Date(Date.parse(range.from) - DAY_MS);
  const upper = new Date(Date.parse(range.to) + 2 * DAY_MS);
  const qb = getDataSource()
    .createQueryBuilder(LogEntry, 'l')
    .innerJoinAndSelect('l.card', 'c')
    .innerJoinAndSelect('c.project', 'p')
    .where('l.occurred_at >= :lower AND l.occurred_at < :upper', { lower, upper });
  if (kinds) qb.andWhere('l.kind IN (:...kinds)', { kinds });
  if (projectId) qb.andWhere('c.project_id = :projectId', { projectId });
  const rows = (await qb
    .orderBy('l.occurred_at', 'ASC')
    .addOrderBy('l.id', 'ASC')
    .getMany()) as EntryWithCard[];
  return rows.filter((e) => {
    const day = dateInTimezone(e.occurredAt, timeZone);
    return day >= range.from && day <= range.to;
  });
}

/**
 * `GET /log`: día → proyecto → tarjeta. Días ascendentes, proyectos por nombre, tarjetas en el orden de su
 * primera entrada del día, entradas cronológicas. `moved` = tarjetas con una entrada `moved` en el período
 * (sea cual sea `kinds`), la movida hace menos tiempo al final.
 * El `card` de `days[]` va sin `description`; el de `moved[]`, completo (#20).
 */
export async function buildLog(
  range: DateRange,
  filters: Pick<LogRangeQuery, 'project' | 'kinds'>,
): Promise<LogGroupsDto> {
  const projectId = filters.project ? (await findProjectBySlug(filters.project)).id : undefined;
  const timeZone = await getTimezone();
  const [entries, movedEntries] = await Promise.all([
    entriesInRange(range, timeZone, filters.kinds, projectId),
    entriesInRange(range, timeZone, ['moved'], projectId),
  ]);

  // Las entradas vienen en orden cronológico: la última de cada tarjeta fija su lugar en `moved`.
  const lastMoved = new Map<string, number>();
  for (const e of movedEntries) lastMoved.set(e.cardId, e.occurredAt.getTime());
  const movedIds = [...lastMoved.keys()].sort(
    (a, b) => (lastMoved.get(a) ?? 0) - (lastMoved.get(b) ?? 0),
  );

  const cardIds = [...new Set([...entries.map((e) => e.cardId), ...movedIds])];
  const cardDtos = new Map(
    (await loadCardDtos(getDataSource().manager, cardIds)).map((c) => [c.id, c]),
  );

  type Day = Map<string, { project: Project; cards: Map<string, LogEntryDto[]> }>;
  const byDay = new Map<string, Day>();
  for (const e of entries) {
    const date = dateInTimezone(e.occurredAt, timeZone);
    const day: Day = byDay.get(date) ?? new Map();
    byDay.set(date, day);
    const group = day.get(e.card.projectId) ?? { project: e.card.project, cards: new Map() };
    day.set(e.card.projectId, group);
    const list = group.cards.get(e.cardId) ?? [];
    group.cards.set(e.cardId, list);
    list.push(toLogEntryDto(e, e.card.number));
  }

  return {
    days: [...byDay.keys()].sort().map((date) => ({
      date,
      projects: [...(byDay.get(date)?.values() ?? [])]
        .sort((a, b) => a.project.name.localeCompare(b.project.name))
        .map(({ project, cards }) => ({
          project: toProjectDto(project),
          cards: [...cards.entries()].flatMap(([cardId, list]) => {
            const full = cardDtos.get(cardId);
            return full ? [{ card: toLogCard(full), entries: list }] : [];
          }),
        })),
    })),
    moved: movedIds.flatMap((id) => {
      const card = cardDtos.get(id);
      return card ? [card] : [];
    }),
  };
}

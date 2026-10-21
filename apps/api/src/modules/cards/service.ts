import type {
  CardDetailDto,
  CardDto,
  CardListDto,
  CreateCardBody,
  ListCardsQuery,
  UpdateCardBody,
} from 'shared';
import type { EntityManager } from 'typeorm';
import { getDataSource } from '../../db/client.js';
import { Card, ChecklistItem, Label, LogEntry, Project } from '../../entities/index.js';
import type { CardStatus } from '../../entities/index.js';
import { AppError } from '../../http/errors.js';
import { dateInAppTimezone, now } from '../../lib/clock.js';
import { toChecklistItemDto } from '../checklist/dto.js';
import { toLogEntryDto } from '../log/dto.js';
import { branchName } from './branch.js';
import { compactColumn, endPosition, lockProjects } from './positions.js';

const MAX_INT4 = 2147483647;
const LOG_IN_DETAIL = 50;

// ---------------------------------------------------------------------------------------------
// Lectura y DTO

/** Cuántos ítems de checklist hay y cuántos están hechos, por tarjeta. */
async function checklistCounts(
  m: EntityManager,
  ids: string[],
): Promise<Map<string, { done: number; total: number }>> {
  const rows = await m.query<{ card_id: string; total: number; done: number }[]>(
    `SELECT card_id, count(*)::int AS total, (count(*) FILTER (WHERE done))::int AS done
     FROM checklist_item WHERE card_id = ANY($1::uuid[]) GROUP BY card_id`,
    [ids],
  );
  return new Map(rows.map((r) => [r.card_id, { done: r.done, total: r.total }]));
}

/** Carga las tarjetas con proyecto, etiquetas y contadores de checklist, en el orden de `ids`. */
export async function loadCardDtos(m: EntityManager, ids: string[]): Promise<CardDto[]> {
  if (ids.length === 0) return [];
  const [cards, counts] = await Promise.all([
    m.find(Card, { where: ids.map((id) => ({ id })), relations: { project: true, labels: true } }),
    checklistCounts(m, ids),
  ]);
  const byId = new Map(cards.map((c) => [c.id, c]));
  return ids.flatMap((id) => {
    const card = byId.get(id);
    if (!card) return [];
    const c = counts.get(id) ?? { done: 0, total: 0 };
    return [
      {
        id: card.id,
        ref: `T-${card.number}`,
        number: card.number,
        project: card.project.slug,
        title: card.title,
        description: card.description,
        status: card.status,
        priority: card.priority,
        labels: card.labels
          .map((l) => ({ name: l.name, color: l.color }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        position: card.position,
        startDate: card.startDate,
        dueDate: card.dueDate,
        completedAt: card.completedAt?.toISOString() ?? null,
        archivedAt: card.archivedAt?.toISOString() ?? null,
        checklistDone: c.done,
        checklistTotal: c.total,
        createdAt: card.createdAt.toISOString(),
        updatedAt: card.updatedAt.toISOString(),
      },
    ];
  });
}

export async function loadCardDto(m: EntityManager, id: string): Promise<CardDto> {
  const [dto] = await loadCardDtos(m, [id]);
  if (!dto) throw new AppError('NOT_FOUND', 'Tarjeta no encontrada');
  return dto;
}

/** Resuelve `T-42` / `T-042` o uuid. Las archivadas también resuelven (hay que poder desarchivarlas). */
export async function findCardByRef(ref: string, m: EntityManager = getDataSource().manager) {
  let card: Card | null;
  if (ref.startsWith('T-')) {
    const number = Number(ref.slice(2));
    card =
      Number.isSafeInteger(number) && number >= 1 && number <= MAX_INT4
        ? await m.findOneBy(Card, { number })
        : null;
  } else {
    card = await m.findOneBy(Card, { id: ref });
  }
  if (!card) throw new AppError('NOT_FOUND', 'Tarjeta no encontrada');
  return card;
}

export async function getCardDetail(card: Card): Promise<CardDetailDto> {
  const m = getDataSource().manager;
  const [dto, items, entries] = await Promise.all([
    loadCardDto(m, card.id),
    m.find(ChecklistItem, { where: { cardId: card.id }, order: { position: 'ASC', id: 'ASC' } }),
    m.find(LogEntry, {
      where: { cardId: card.id },
      order: { occurredAt: 'DESC', id: 'DESC' },
      take: LOG_IN_DETAIL,
    }),
  ]);
  return {
    ...dto,
    checklist: items.map(toChecklistItemDto),
    log: entries.reverse().map((e) => toLogEntryDto(e, card.number)),
    branchName: branchName(
      card.number,
      card.title,
      dto.labels.map((l) => l.name),
    ),
  };
}

// ---------------------------------------------------------------------------------------------
// Listado con filtros y cursor

interface Cursor {
  s: CardStatus;
  p: number;
  n: number;
}

function encodeCursor(card: Pick<Card, 'status' | 'position' | 'number'>): string {
  const cursor: Cursor = { s: card.status, p: card.position, n: card.number };
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/** `position` y `number` son int4 no negativos: lo demás no puede ser un cursor emitido por la API. */
function isInt4(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_INT4;
}

function decodeCursor(raw: string): Cursor {
  const invalid = () =>
    new AppError('VALIDATION_ERROR', 'cursor: inválido', [{ path: 'cursor', message: 'inválido' }]);
  try {
    const value: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const c = value as Partial<Cursor> | null;
    if (
      !c ||
      typeof c.s !== 'string' ||
      !['backlog', 'todo', 'in_progress', 'review', 'blocked', 'done'].includes(c.s) ||
      !isInt4(c.p) ||
      !isInt4(c.n)
    ) {
      throw invalid();
    }
    return c as Cursor;
  } catch {
    throw invalid();
  }
}

export async function listCards(query: ListCardsQuery): Promise<CardListDto> {
  const m = getDataSource().manager;
  const qb = m.createQueryBuilder(Card, 'c').select(['c.id', 'c.status', 'c.position', 'c.number']);

  if (query.project) {
    const project = await m.findOneBy(Project, { slug: query.project });
    if (!project) throw new AppError('NOT_FOUND', 'Proyecto no encontrado');
    qb.andWhere('c.project_id = :projectId', { projectId: project.id });
  }
  if (query.status) qb.andWhere('c.status IN (:...statuses)', { statuses: query.status });
  if (query.priority) qb.andWhere('c.priority = :priority', { priority: query.priority });
  // TODO(spec): `due_before` es estricto (due_date < fecha).
  if (query.due_before) qb.andWhere('c.due_date < :dueBefore', { dueBefore: query.due_before });
  if (query.label) {
    qb.andWhere(
      `EXISTS (SELECT 1 FROM card_label cl JOIN label l ON l.id = cl.label_id
               WHERE cl.card_id = c.id AND lower(l.name) = lower(:label))`,
      { label: query.label },
    );
  }
  // TODO(spec): `archived=true` incluye las archivadas junto a las activas (como `GET /projects?archived=true`).
  if (!query.archived) qb.andWhere('c.archived_at IS NULL');
  if (query.cursor) {
    const c = decodeCursor(query.cursor);
    qb.andWhere('(c.status, c.position, c.number) > (CAST(:cs AS card_status), :cp, :cn)', {
      cs: c.s,
      cp: c.p,
      cn: c.n,
    });
  }

  const rows = await qb
    .orderBy('c.status', 'ASC')
    .addOrderBy('c.position', 'ASC')
    .addOrderBy('c.number', 'ASC')
    .limit(query.limit + 1)
    .getMany();

  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    items: await loadCardDtos(
      m,
      page.map((c) => c.id),
    ),
    nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Escritura

/** Etiquetas por nombre, sin distinguir mayúsculas (RF-23). Un nombre inexistente es 400. */
async function resolveLabels(m: EntityManager, names: string[]): Promise<Label[]> {
  if (names.length === 0) return [];
  const all = await m.find(Label);
  const byName = new Map(all.map((l) => [l.name.toLowerCase(), l]));
  const found = new Map<string, Label>();
  const missing: string[] = [];
  for (const name of names) {
    const label = byName.get(name.toLowerCase());
    if (label) found.set(label.id, label);
    else missing.push(name);
  }
  if (missing.length > 0) {
    // TODO(spec): la spec no dice qué pasa con una etiqueta inexistente; se responde 400 (no se crea sola).
    throw new AppError(
      'VALIDATION_ERROR',
      `labels: etiqueta inexistente: ${missing.join(', ')}`,
      missing.map((n) => ({ path: 'labels', message: `etiqueta inexistente: ${n}` })),
    );
  }
  return [...found.values()];
}

async function setLabels(m: EntityManager, cardId: string, labels: Label[]): Promise<void> {
  await m.query(`DELETE FROM card_label WHERE card_id = $1`, [cardId]);
  if (labels.length > 0) {
    await m.query(`INSERT INTO card_label (card_id, label_id) SELECT $1, unnest($2::uuid[])`, [
      cardId,
      labels.map((l) => l.id),
    ]);
  }
}

async function projectForWrite(m: EntityManager, slug: string): Promise<Project> {
  const project = await m.findOneBy(Project, { slug });
  if (!project) throw new AppError('NOT_FOUND', 'Proyecto no encontrado');
  // TODO(spec): no se crean ni mueven tarjetas hacia un proyecto archivado (409).
  if (project.archivedAt) throw new AppError('CONFLICT', 'El proyecto está archivado');
  return project;
}

function assertDatesInOrder(startDate: string | null, dueDate: string | null): void {
  if (startDate && dueDate && dueDate < startDate) {
    throw new AppError('VALIDATION_ERROR', 'dueDate: no puede ser anterior a startDate', [
      { path: 'dueDate', message: 'no puede ser anterior a startDate' },
    ]);
  }
}

/**
 * RF-15: al entrar a `in_progress` se completa `start_date` con hoy si estaba vacía.
 * TODO(spec): si la fecha límite ya pasó, hoy rompería `due_date >= start_date`; en ese caso no se completa.
 */
export function autoStartDate(
  startDate: string | null,
  dueDate: string | null,
  at: Date,
): string | null {
  if (startDate) return startDate;
  const today = dateInAppTimezone(at);
  return dueDate && dueDate < today ? null : today;
}

/** Carga la fila de la tarjeta bloqueándola, para serializar escrituras concurrentes sobre ella. */
export async function lockCard(m: EntityManager, id: string): Promise<Card> {
  await m.query(`SELECT id FROM card WHERE id = $1 FOR NO KEY UPDATE`, [id]);
  const card = await m.findOneBy(Card, { id });
  if (!card) throw new AppError('NOT_FOUND', 'Tarjeta no encontrada');
  return card;
}

export async function createCard(body: CreateCardBody): Promise<CardDto> {
  return getDataSource().transaction(async (m) => {
    const project = await projectForWrite(m, body.project);
    await lockProjects(m, [project.id]);
    const labels = await resolveLabels(m, body.labels ?? []);
    const status = body.status ?? 'backlog';
    const at = now();
    const dueDate = body.dueDate ?? null;
    let startDate = body.startDate ?? null;
    // TODO(spec): al crear directamente en `in_progress`/`done` se aplica RF-15 igual que en un movimiento.
    if (status === 'in_progress') startDate = autoStartDate(startDate, dueDate, at);

    const saved = await m.save(
      m.create(Card, {
        projectId: project.id,
        title: body.title,
        description: body.description ?? '',
        status,
        priority: body.priority ?? 'medium',
        position: await endPosition(m, project.id, status),
        startDate,
        dueDate,
        completedAt: status === 'done' ? at : null,
      }),
    );
    await setLabels(m, saved.id, labels);
    const items = body.checklist ?? [];
    if (items.length > 0) {
      await m.insert(
        ChecklistItem,
        items.map((text, position) => ({ cardId: saved.id, text, position })),
      );
    }
    return loadCardDto(m, saved.id);
  });
}

export async function updateCard(cardId: string, body: UpdateCardBody): Promise<CardDto> {
  return getDataSource().transaction(async (m) => {
    const before = await m.findOneBy(Card, { id: cardId });
    if (!before) throw new AppError('NOT_FOUND', 'Tarjeta no encontrada');
    const target = body.project ? await projectForWrite(m, body.project) : null;
    await lockProjects(m, target ? [before.projectId, target.id] : [before.projectId]);
    const card = await lockCard(m, cardId);

    if (body.title !== undefined) card.title = body.title;
    if (body.description !== undefined) card.description = body.description;
    if (body.priority !== undefined) card.priority = body.priority;
    if (body.dueDate !== undefined) card.dueDate = body.dueDate;
    if (body.startDate !== undefined) card.startDate = body.startDate;
    assertDatesInOrder(card.startDate, card.dueDate);

    // RF-28: otro proyecto, misma columna, al final; conserva número, bitácora y checklist.
    if (target && target.id !== card.projectId) {
      if (!card.archivedAt) {
        await compactColumn(m, card.projectId, card.status, card.id);
        card.position = await endPosition(m, target.id, card.status);
      }
      card.projectId = target.id;
    }

    await m.save(card);
    if (body.labels !== undefined) await setLabels(m, card.id, await resolveLabels(m, body.labels));
    return loadCardDto(m, card.id);
  });
}

export async function archiveCard(cardId: string): Promise<CardDto> {
  return getDataSource().transaction(async (m) => {
    const before = await m.findOneBy(Card, { id: cardId });
    if (!before) throw new AppError('NOT_FOUND', 'Tarjeta no encontrada');
    await lockProjects(m, [before.projectId]);
    const card = await lockCard(m, cardId);
    if (!card.archivedAt) {
      card.archivedAt = now();
      await m.save(card);
      await compactColumn(m, card.projectId, card.status);
    }
    return loadCardDto(m, card.id);
  });
}

/** Al desarchivar, la tarjeta vuelve al final de su columna. */
export async function unarchiveCard(cardId: string): Promise<CardDto> {
  return getDataSource().transaction(async (m) => {
    const before = await m.findOneBy(Card, { id: cardId });
    if (!before) throw new AppError('NOT_FOUND', 'Tarjeta no encontrada');
    await lockProjects(m, [before.projectId]);
    const card = await lockCard(m, cardId);
    if (card.archivedAt) {
      card.archivedAt = null;
      card.position = await endPosition(m, card.projectId, card.status);
      await m.save(card);
    }
    return loadCardDto(m, card.id);
  });
}

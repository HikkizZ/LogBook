import type { ChecklistItemDto, CreateChecklistItemBody, UpdateChecklistItemBody } from 'shared';
import type { EntityManager } from 'typeorm';
import { getDataSource } from '../../db/client.js';
import { ChecklistItem } from '../../entities/index.js';
import { AppError } from '../../http/errors.js';
import { lockCard } from '../cards/service.js';
import { toChecklistItemDto } from './dto.js';

const notFound = () => new AppError('NOT_FOUND', 'Ítem de checklist no encontrado');

/** IDs de los ítems de la tarjeta en orden, sin `exclude`. */
async function itemIds(m: EntityManager, cardId: string, exclude?: string): Promise<string[]> {
  const rows = await m.query<{ id: string }[]>(
    `SELECT id FROM checklist_item
     WHERE card_id = $1 AND ($2::uuid IS NULL OR id <> $2) ORDER BY position, created_at, id`,
    [cardId, exclude ?? null],
  );
  return rows.map((r) => r.id);
}

/** Deja `position = índice` en cada ID de la lista (`0..n-1`, sin huecos). */
async function applyPositions(m: EntityManager, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await m.query(
    `UPDATE checklist_item SET position = t.pos
     FROM unnest($1::uuid[], $2::int[]) AS t(id, pos)
     WHERE checklist_item.id = t.id AND checklist_item.position <> t.pos`,
    [ids, ids.map((_, i) => i)],
  );
}

export async function createItem(
  cardId: string,
  body: CreateChecklistItemBody,
): Promise<ChecklistItemDto> {
  return getDataSource().transaction(async (m) => {
    await lockCard(m, cardId);
    const position = (await itemIds(m, cardId)).length;
    return toChecklistItemDto(
      await m.save(m.create(ChecklistItem, { cardId, text: body.text, position })),
    );
  });
}

/** Ítem + tarjeta bloqueada, para serializar escrituras sobre el checklist de la misma tarjeta. */
async function lockedItem(m: EntityManager, id: string): Promise<ChecklistItem> {
  const found = await m.findOneBy(ChecklistItem, { id });
  if (!found) throw notFound();
  await lockCard(m, found.cardId);
  const item = await m.findOneBy(ChecklistItem, { id });
  if (!item) throw notFound();
  return item;
}

export async function updateItem(
  id: string,
  body: UpdateChecklistItemBody,
): Promise<ChecklistItemDto> {
  return getDataSource().transaction(async (m) => {
    const item = await lockedItem(m, id);
    if (body.text !== undefined) item.text = body.text;
    if (body.done !== undefined) item.done = body.done;
    await m.save(item);
    if (body.position !== undefined) {
      const ids = await itemIds(m, item.cardId, item.id);
      ids.splice(Math.min(body.position, ids.length), 0, item.id);
      await applyPositions(m, ids);
    }
    const saved = await m.findOneByOrFail(ChecklistItem, { id });
    return toChecklistItemDto(saved);
  });
}

export async function deleteItem(id: string): Promise<void> {
  await getDataSource().transaction(async (m) => {
    const item = await lockedItem(m, id);
    await m.delete(ChecklistItem, { id });
    await applyPositions(m, await itemIds(m, item.cardId));
  });
}

import type { CardDto, MoveCardBody } from 'shared';
import { getDataSource } from '../../db/client.js';
import { Card, LogEntry } from '../../entities/index.js';
import type { CardStatus, LogSource } from '../../entities/index.js';
import { AppError } from '../../http/errors.js';
import { now } from '../../lib/clock.js';
import { applyPositions, columnIds, compactColumn, lockProjects } from './positions.js';
import { autoStartDate, loadCardDto, lockCard } from './service.js';

/** Nombres de las columnas (RF-10), para el texto de la entrada `moved`. */
export const COLUMN_NAME: Record<CardStatus, string> = {
  backlog: 'Backlog',
  todo: 'Por hacer',
  in_progress: 'En curso',
  review: 'Revisión',
  blocked: 'Bloqueado',
  done: 'Hecho',
};

/**
 * Mueve una tarjeta (RF-13..16) en una sola transacción, con el proyecto bloqueado para que dos movimientos
 * simultáneos no dejen posiciones repetidas ni huecos.
 *
 * - Cambia de columna: renumera origen y destino, aplica RF-15, escribe `moved` (RF-16) y, si va a
 *   `blocked`, también `blocked` con el motivo (RF-14).
 * - Misma columna: solo reordena y no escribe entradas (RF-16).
 * - El WIP nunca bloquea el movimiento (RF-13).
 */
export async function moveCard(
  cardId: string,
  body: MoveCardBody,
  source: Extract<LogSource, 'ui' | 'api'>,
): Promise<CardDto> {
  return getDataSource().transaction(async (m) => {
    const before = await m.findOneBy(Card, { id: cardId });
    if (!before) throw new AppError('NOT_FOUND', 'Tarjeta no encontrada');
    await lockProjects(m, [before.projectId]);
    const card = await lockCard(m, cardId);

    // TODO(spec): una tarjeta archivada no está en ninguna columna; moverla da 409 (hay que desarchivarla antes).
    if (card.archivedAt) throw new AppError('CONFLICT', 'La tarjeta está archivada');

    const from = card.status;
    const to = body.status;
    const changed = from !== to;
    if (changed && to === 'blocked' && !body.reason) {
      throw new AppError('VALIDATION_ERROR', 'reason: obligatorio al mover a Bloqueado', [
        { path: 'reason', message: 'obligatorio al mover a Bloqueado' },
      ]);
    }

    // Columna destino sin la tarjeta, con la tarjeta insertada en su posición (se acota al final).
    const destination = await columnIds(m, card.projectId, to, card.id);
    const index = Math.min(body.position ?? destination.length, destination.length);
    destination.splice(index, 0, card.id);

    const at = now();
    if (changed) {
      card.status = to;
      if (to === 'in_progress') card.startDate = autoStartDate(card.startDate, card.dueDate, at);
      if (to === 'done') card.completedAt = at;
      if (from === 'done') card.completedAt = null;
    }
    if (changed || card.position !== index) {
      card.position = index;
      await m.save(card);
    }
    if (changed) await compactColumn(m, card.projectId, from);
    await applyPositions(m, destination);

    if (changed) {
      await m.insert(LogEntry, {
        cardId: card.id,
        kind: 'moved',
        source,
        body: `${COLUMN_NAME[from]} → ${COLUMN_NAME[to]}`,
        occurredAt: at,
        metadata: { from, to },
      });
      if (to === 'blocked' && body.reason) {
        await m.insert(LogEntry, {
          cardId: card.id,
          kind: 'blocked',
          source,
          body: body.reason,
          occurredAt: at,
        });
      }
    }
    return loadCardDto(m, card.id);
  });
}

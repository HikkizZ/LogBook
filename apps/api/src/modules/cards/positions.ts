import type { EntityManager } from 'typeorm';
import type { CardStatus } from '../../entities/index.js';

/**
 * Una "columna" son las tarjetas activas (no archivadas) de un (proyecto, estado). Su `position` es
 * siempre `0..n-1` sin huecos: cada operación que la altera la renumera completa (§3.1).
 */

/** IDs de la columna ordenados por `position`, sin `exclude` (la tarjeta que se está moviendo). */
export async function columnIds(
  m: EntityManager,
  projectId: string,
  status: CardStatus,
  exclude?: string,
): Promise<string[]> {
  const rows = await m.query<{ id: string }[]>(
    `SELECT id FROM card
     WHERE project_id = $1 AND status = $2 AND archived_at IS NULL AND ($3::uuid IS NULL OR id <> $3)
     ORDER BY position, number`,
    [projectId, status, exclude ?? null],
  );
  return rows.map((r) => r.id);
}

/** Posición para agregar una tarjeta al final de la columna. */
export async function endPosition(
  m: EntityManager,
  projectId: string,
  status: CardStatus,
): Promise<number> {
  const rows = await m.query<{ next: number }[]>(
    `SELECT COALESCE(MAX(position) + 1, 0)::int AS next FROM card
     WHERE project_id = $1 AND status = $2 AND archived_at IS NULL`,
    [projectId, status],
  );
  return rows[0]?.next ?? 0;
}

/** Deja `position = índice` en cada ID de la lista (una sola sentencia). */
export async function applyPositions(m: EntityManager, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await m.query(
    `UPDATE card SET position = t.pos
     FROM unnest($1::uuid[], $2::int[]) AS t(id, pos)
     WHERE card.id = t.id AND card.position <> t.pos`,
    [ids, ids.map((_, i) => i)],
  );
}

/** Compacta la columna a `0..n-1`, sin la tarjeta `exclude` si se indica. */
export async function compactColumn(
  m: EntityManager,
  projectId: string,
  status: CardStatus,
  exclude?: string,
): Promise<void> {
  await applyPositions(m, await columnIds(m, projectId, status, exclude));
}

/**
 * Serializa las operaciones sobre las columnas de estos proyectos (single user, pero Express atiende
 * peticiones en paralelo). Siempre en orden de id para no provocar interbloqueos.
 */
export async function lockProjects(m: EntityManager, projectIds: string[]): Promise<void> {
  const ids = [...new Set(projectIds)].sort();
  await m.query(`SELECT id FROM project WHERE id = ANY($1::uuid[]) ORDER BY id FOR NO KEY UPDATE`, [
    ids,
  ]);
}

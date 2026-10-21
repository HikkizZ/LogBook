import { z } from 'zod';
import { cardStatusSchema } from './card-status.js';
import { text } from './common.js';

/** Mínimo de caracteres del motivo al bloquear (RF-14). */
export const BLOCK_REASON_MIN = 3;

/**
 * `POST /cards/:ref/move` (§4.4). `position` omitida = al final de la columna destino.
 * `reason` es obligatorio al pasar a `blocked` desde otro estado (RF-14): lo comprueba el servicio,
 * porque reordenar dentro de la propia columna Bloqueado no necesita motivo.
 */
export const moveCardBodySchema = z.object({
  status: cardStatusSchema,
  position: z.number().int().min(0).optional(),
  reason: text().trim().min(BLOCK_REASON_MIN).max(5000).optional(),
});
export type MoveCardBody = z.infer<typeof moveCardBodySchema>;

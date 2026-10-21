import { z } from 'zod';

/** Estados del kanban (RF-10), en el orden de las columnas. */
export const CARD_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'review',
  'blocked',
  'done',
] as const;
export const cardStatusSchema = z.enum(CARD_STATUSES);
export type CardStatus = z.infer<typeof cardStatusSchema>;

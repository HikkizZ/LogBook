import { z } from 'zod';
import { text, uuidSchema } from './common.js';

/** Texto de un ítem de checklist: `checklist_item.text` es varchar(300). */
export const checklistTextSchema = text().trim().min(1).max(300);

/** `Item` de checklist (§4.5). */
export const checklistItemSchema = z.object({
  id: uuidSchema,
  text: z.string(),
  done: z.boolean(),
  position: z.number().int(),
});
export type ChecklistItemDto = z.infer<typeof checklistItemSchema>;

export const checklistItemParamsSchema = z.object({ id: uuidSchema });

/** `POST /cards/:ref/checklist` (§4.5). */
export const createChecklistItemBodySchema = z.object({ text: checklistTextSchema });
export type CreateChecklistItemBody = z.infer<typeof createChecklistItemBodySchema>;

/** `PATCH /checklist/:id` (§4.5): `position` es el índice destino (0-based); se acota al rango. */
export const updateChecklistItemBodySchema = z.strictObject({
  text: checklistTextSchema.optional(),
  done: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});
export type UpdateChecklistItemBody = z.infer<typeof updateChecklistItemBodySchema>;

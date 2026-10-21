import { z } from 'zod';
import { uuidSchema } from './common.js';

/** Texto de un ítem de checklist: `checklist_item.text` es varchar(300). */
export const checklistTextSchema = z.string().trim().min(1).max(300);

/** `Item` de checklist (§4.5). */
export const checklistItemSchema = z.object({
  id: uuidSchema,
  text: z.string(),
  done: z.boolean(),
  position: z.number().int(),
});
export type ChecklistItemDto = z.infer<typeof checklistItemSchema>;

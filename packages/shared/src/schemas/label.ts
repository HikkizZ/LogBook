import { z } from 'zod';
import { dateTimeSchema, uuidSchema } from './common.js';
import { PROJECT_COLORS } from './project.js';

/** Paleta de etiquetas (diseño §2.4): las de proyecto más `gris`. */
export const LABEL_COLORS = [...PROJECT_COLORS, 'gris'] as const;
export const labelColorSchema = z.enum(LABEL_COLORS);
export type LabelColor = z.infer<typeof labelColorSchema>;

/** Nombre de etiqueta: `label.name` es varchar(40). */
export const labelNameSchema = z.string().trim().min(1).max(40);

/** `POST /labels` (§4.7). */
export const createLabelBodySchema = z.object({
  name: labelNameSchema,
  color: labelColorSchema,
});
export type CreateLabelBody = z.infer<typeof createLabelBodySchema>;

/** `PATCH /labels/:id`. */
export const updateLabelBodySchema = z.strictObject({
  name: labelNameSchema.optional(),
  color: labelColorSchema.optional(),
});
export type UpdateLabelBody = z.infer<typeof updateLabelBodySchema>;

export const labelIdParamsSchema = z.object({ id: uuidSchema });

export const labelSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  color: z.string(),
  createdAt: dateTimeSchema,
});
export type LabelDto = z.infer<typeof labelSchema>;

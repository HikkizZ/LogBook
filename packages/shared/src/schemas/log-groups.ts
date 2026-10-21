import { z } from 'zod';
import { cardSchema } from './card.js';
import { dateSchema } from './common.js';
import { logEntrySchema } from './log.js';
import { projectSchema } from './project.js';

/** `Card` sin `description`: es el que lleva `days[]` en `GET /log` y `GET /summary?format=json` (decidido 2026-10-21). */
export const logCardSchema = cardSchema.omit({ description: true });
export type LogCardDto = z.infer<typeof logCardSchema>;

/** `GET /log` (§4.6): día → proyecto → tarjeta, más las tarjetas que cambiaron de columna en el período. */
export const logGroupsSchema = z.object({
  days: z.array(
    z.object({
      date: dateSchema,
      projects: z.array(
        z.object({
          project: projectSchema,
          cards: z.array(z.object({ card: logCardSchema, entries: z.array(logEntrySchema) })),
        }),
      ),
    }),
  ),
  moved: z.array(cardSchema),
});
export type LogGroupsDto = z.infer<typeof logGroupsSchema>;

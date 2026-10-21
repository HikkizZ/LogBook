import { z } from 'zod';
import { blockReasonSchema } from './card-move.js';
import { cardStatusSchema } from './card-status.js';
import { checklistItemSchema, checklistTextSchema } from './checklist.js';
import {
  booleanQuerySchema,
  cardRefSchema,
  dateSchema,
  dateTimeSchema,
  inputDateSchema,
  slugSchema,
  text,
  uuidSchema,
} from './common.js';
import { labelNameSchema } from './label.js';
import { logEntrySchema } from './log.js';

export const CARD_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const cardPrioritySchema = z.enum(CARD_PRIORITIES);
export type CardPriority = z.infer<typeof cardPrioritySchema>;

const titleSchema = text().trim().min(1).max(200);
const descriptionSchema = text().max(20000);
const labelNamesSchema = z.array(labelNameSchema).max(20);

/** `due_date >= start_date` cuando ambas vienen en el body (la BD lo exige con un CHECK). */
function datesInOrder(v: { startDate?: string | null; dueDate?: string | null }): boolean {
  return !v.startDate || !v.dueDate || v.dueDate >= v.startDate;
}
const DATES_ISSUE = { message: 'dueDate no puede ser anterior a startDate', path: ['dueDate'] };

export const cardRefParamsSchema = z.object({ ref: cardRefSchema });

/** `POST /cards` (§4.4). `reason` es obligatorio con `status: blocked` (RF-14) y se ignora con los demás. */
export const createCardBodySchema = z
  .object({
    project: slugSchema,
    title: titleSchema,
    description: descriptionSchema.optional(),
    status: cardStatusSchema.optional(),
    priority: cardPrioritySchema.optional(),
    labels: labelNamesSchema.optional(),
    dueDate: inputDateSchema.nullish(),
    startDate: inputDateSchema.nullish(),
    checklist: z.array(checklistTextSchema).max(100).optional(),
    reason: blockReasonSchema.optional(),
  })
  .refine(datesInOrder, DATES_ISSUE)
  .refine((v) => v.status !== 'blocked' || v.reason !== undefined, {
    message: 'obligatorio al crear en Bloqueado',
    path: ['reason'],
  });
export type CreateCardBody = z.infer<typeof createCardBodySchema>;

/** `PATCH /cards/:ref`: no cambia `status` (para eso está `move`); cualquier otro campo es 400. */
export const updateCardBodySchema = z
  .strictObject({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    priority: cardPrioritySchema.optional(),
    labels: labelNamesSchema.optional(),
    dueDate: inputDateSchema.nullable().optional(),
    startDate: inputDateSchema.nullable().optional(),
    project: slugSchema.optional(),
  })
  .refine(datesInOrder, DATES_ISSUE);
export type UpdateCardBody = z.infer<typeof updateCardBodySchema>;

const statusListSchema = z
  .string()
  .transform((v) => v.split(',').map((s) => s.trim()))
  .pipe(z.array(cardStatusSchema).min(1));

/** `GET /cards` (§4.4). */
export const listCardsQuerySchema = z.object({
  project: slugSchema.optional(),
  status: statusListSchema.optional(),
  label: labelNameSchema.optional(),
  priority: cardPrioritySchema.optional(),
  due_before: inputDateSchema.optional(),
  archived: booleanQuerySchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.string().min(1).max(200).optional(),
});
export type ListCardsQuery = z.infer<typeof listCardsQuerySchema>;

export const labelRefSchema = z.object({ name: z.string(), color: z.string() });

/** `Card` (§4.4). */
export const cardSchema = z.object({
  id: uuidSchema,
  ref: z.string().regex(/^T-\d+$/),
  number: z.number().int(),
  project: z.string(),
  title: z.string(),
  description: z.string(),
  status: cardStatusSchema,
  priority: cardPrioritySchema,
  labels: z.array(labelRefSchema),
  position: z.number().int(),
  startDate: dateSchema.nullable(),
  dueDate: dateSchema.nullable(),
  completedAt: dateTimeSchema.nullable(),
  archivedAt: dateTimeSchema.nullable(),
  checklistDone: z.number().int(),
  checklistTotal: z.number().int(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export type CardDto = z.infer<typeof cardSchema>;

/** `CardDetail` = Card + checklist + últimas 50 entradas de bitácora + nombre de rama sugerido (RF-29). */
export const cardDetailSchema = cardSchema.extend({
  checklist: z.array(checklistItemSchema),
  log: z.array(logEntrySchema),
  branchName: z.string(),
});
export type CardDetailDto = z.infer<typeof cardDetailSchema>;

export const cardListSchema = z.object({
  items: z.array(cardSchema),
  nextCursor: z.string().nullable(),
});
export type CardListDto = z.infer<typeof cardListSchema>;

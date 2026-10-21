import { z } from 'zod';
import { dateSchema, dateTimeSchema, slugSchema, text, uuidSchema } from './common.js';

export const LOG_KINDS = ['note', 'blocked', 'moved', 'commit', 'pr'] as const;
export const logKindSchema = z.enum(LOG_KINDS);
export type LogKind = z.infer<typeof logKindSchema>;

export const LOG_SOURCES = ['ui', 'api', 'github'] as const;
export const logSourceSchema = z.enum(LOG_SOURCES);
export type LogSource = z.infer<typeof logSourceSchema>;

/** `LogEntry` (§4.6). */
export const logEntrySchema = z.object({
  id: uuidSchema,
  cardRef: z.string().regex(/^T-\d+$/),
  kind: logKindSchema,
  source: logSourceSchema,
  body: z.string(),
  occurredAt: dateTimeSchema,
  metadata: z.record(z.string(), z.unknown()),
  createdAt: dateTimeSchema,
});
export type LogEntryDto = z.infer<typeof logEntrySchema>;

/** Tipos que se escriben a mano (§4.6); `moved`, `commit` y `pr` los crea el sistema (RF-31). */
export const WRITABLE_LOG_KINDS = ['note', 'blocked'] as const;
export const writableLogKindSchema = z.enum(WRITABLE_LOG_KINDS);

const logBodySchema = text().trim().min(1).max(5000);
/** Con offset de zona (`-03:00`) o `Z`; se guarda como instante. */
const occurredAtSchema = z.iso.datetime({ offset: true });

const kindListSchema = z
  .string()
  .transform((v) => v.split(',').map((s) => s.trim()))
  .pipe(z.array(logKindSchema).min(1));

export const logIdParamsSchema = z.object({ id: uuidSchema });

/** `GET /cards/:ref/log` (§4.6). `limit` = las últimas N entradas, en orden cronológico. */
export const cardLogQuerySchema = z.object({
  kinds: kindListSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type CardLogQuery = z.infer<typeof cardLogQuerySchema>;

/** `POST /cards/:ref/log` (§4.6). */
export const createLogEntryBodySchema = z.object({
  body: logBodySchema,
  occurredAt: occurredAtSchema.optional(),
  kind: writableLogKindSchema.optional(),
});
export type CreateLogEntryBody = z.infer<typeof createLogEntryBodySchema>;

/** `PATCH /log/:id` (§4.6): solo `body` y `occurredAt`. */
export const updateLogEntryBodySchema = z.strictObject({
  body: logBodySchema.optional(),
  occurredAt: occurredAtSchema.optional(),
});
export type UpdateLogEntryBody = z.infer<typeof updateLogEntryBodySchema>;

/** Máximo de días de un período de `/log` y `/summary`. */
export const LOG_RANGE_MAX_DAYS = 366;

const rangeShape = {
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  project: slugSchema.optional(),
  kinds: kindListSchema.optional(),
};

/** `from <= to` y a lo más `LOG_RANGE_MAX_DAYS` días. */
function validRange(v: { from?: string | undefined; to?: string | undefined }): boolean {
  if (!v.from || !v.to) return true;
  const days = (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000;
  return days >= 0 && days < LOG_RANGE_MAX_DAYS;
}
const RANGE_ISSUE = {
  message: `from debe ser anterior o igual a to, con a lo más ${LOG_RANGE_MAX_DAYS} días de período`,
  path: ['to'],
};

/** Filtros de `GET /log` (§4.6). Sin `from`/`to` = hoy; uno solo = ese día. */
export const logRangeQuerySchema = z.object(rangeShape).refine(validRange, RANGE_ISSUE);
export type LogRangeQuery = z.infer<typeof logRangeQuerySchema>;

export const SUMMARY_FORMATS = ['md', 'json'] as const;

/** `GET /summary`: los filtros de `/log` más `format`. */
export const summaryQuerySchema = z
  .object({ ...rangeShape, format: z.enum(SUMMARY_FORMATS).default('md') })
  .refine(validRange, RANGE_ISSUE);
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;

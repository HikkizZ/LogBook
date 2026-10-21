import { z } from 'zod';
import { dateTimeSchema, uuidSchema } from './common.js';

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

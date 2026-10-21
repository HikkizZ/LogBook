import type { Request } from 'express';
import type { LogEntryDto } from 'shared';
import type { LogEntry } from '../../entities/index.js';

/** `T-<n>` de la tarjeta de la entrada. */
export function toLogEntryDto(entry: LogEntry, cardNumber: number): LogEntryDto {
  return {
    id: entry.id,
    cardRef: `T-${cardNumber}`,
    kind: entry.kind,
    source: entry.source,
    body: entry.body,
    occurredAt: entry.occurredAt.toISOString(),
    metadata: entry.metadata,
    createdAt: entry.createdAt.toISOString(),
  };
}

/** `source` de lo que se escribe a mano (§4.4/§4.6): `ui` con cookie de sesión, `api` con Bearer. */
export function sourceOf(req: Request): 'ui' | 'api' {
  return req.auth?.via === 'session' ? 'ui' : 'api';
}

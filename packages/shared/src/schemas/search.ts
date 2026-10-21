import { z } from 'zod';
import { cardSchema } from './card.js';
import { logEntrySchema } from './log.js';

/** Largo mínimo de `q` (RF-52) y tope para acotar el trabajo de la consulta. */
export const SEARCH_MIN_LENGTH = 3;
export const SEARCH_MAX_LENGTH = 200;

/** `GET /search` (§4.8). */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(SEARCH_MIN_LENGTH).max(SEARCH_MAX_LENGTH),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

/**
 * `snippet`: texto plano escapado (`&`, `<`, `>` como entidades) donde lo único que es HTML son las marcas
 * `<mark>…</mark>` de lo encontrado.
 */
export const searchResultSchema = z.object({
  cards: z.array(z.object({ card: cardSchema, snippet: z.string() })),
  entries: z.array(z.object({ entry: logEntrySchema, card: cardSchema, snippet: z.string() })),
});
export type SearchResultDto = z.infer<typeof searchResultSchema>;

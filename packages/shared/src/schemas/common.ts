import { z } from 'zod';

/**
 * Texto libre que entra por la API: rechaza el carácter NUL (`\u0000`), que Postgres no admite en `text`/`varchar`
 * (RS-07). Encadenar `.trim()`, `.min()` y `.max()` como en cualquier `z.string()`.
 */
export const text = () =>
  z.string().refine((s) => !s.includes('\0'), 'no puede contener el carácter NUL');

export const uuidSchema = z.uuid();

/** Referencia de tarjeta en la URL: `T-<n>` o uuid (spec §4, `:ref`). */
export const cardRefSchema = z.union([z.string().regex(/^T-\d+$/), z.uuid()]);

/** Fecha `YYYY-MM-DD` (columnas `date`). */
export const dateSchema = z.iso.date();

/** Instante ISO 8601 con zona (columnas `timestamptz`, tal como las serializa la API). */
export const dateTimeSchema = z.iso.datetime();

/** Rango de toda fecha que entra a la API (decidido 2026-10-21): `1970-01-01` .. `2100-12-31`, ambos incluidos. */
export const MIN_INPUT_DATE = '1970-01-01';
export const MAX_INPUT_DATE = '2100-12-31';
const MIN_INPUT_INSTANT = Date.parse(`${MIN_INPUT_DATE}T00:00:00Z`);
const MAX_INPUT_INSTANT = Date.parse(`${MAX_INPUT_DATE}T23:59:59.999Z`);
const RANGE_MESSAGE = `debe estar entre ${MIN_INPUT_DATE} y ${MAX_INPUT_DATE}`;

/** `YYYY-MM-DD` de entrada (body y query): como `dateSchema`, acotada a `MIN_INPUT_DATE..MAX_INPUT_DATE`. */
export const inputDateSchema = z.iso
  .date()
  .refine((d) => d >= MIN_INPUT_DATE && d <= MAX_INPUT_DATE, RANGE_MESSAGE);

/** Instante ISO 8601 de entrada con offset o `Z` (p. ej. `occurredAt`), acotado al mismo rango (en UTC). */
export const inputDateTimeSchema = z.iso.datetime({ offset: true }).refine((d) => {
  const t = Date.parse(d);
  return t >= MIN_INPUT_INSTANT && t <= MAX_INPUT_INSTANT;
}, RANGE_MESSAGE);

/** Slug de proyecto (§3.1: generado por la API, solo minúsculas, dígitos y guiones). */
export const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** Booleano en query string: `"true"` / `"false"`. */
export const booleanQuerySchema = z.enum(['true', 'false']).transform((v) => v === 'true');

import { z } from 'zod';

export const uuidSchema = z.uuid();

/** Referencia de tarjeta en la URL: `T-<n>` o uuid (spec §4, `:ref`). */
export const cardRefSchema = z.union([z.string().regex(/^T-\d+$/), z.uuid()]);

/** Fecha `YYYY-MM-DD` (columnas `date`). */
export const dateSchema = z.iso.date();

/** Instante ISO 8601 con zona (columnas `timestamptz`, tal como las serializa la API). */
export const dateTimeSchema = z.iso.datetime();

/** Slug de proyecto (§3.1: generado por la API, solo minúsculas, dígitos y guiones). */
export const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** Booleano en query string: `"true"` / `"false"`. */
export const booleanQuerySchema = z.enum(['true', 'false']).transform((v) => v === 'true');

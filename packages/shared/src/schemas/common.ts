import { z } from 'zod';

export const uuidSchema = z.uuid();

/** Referencia de tarjeta en la URL: `T-<n>` o uuid (spec §4, `:ref`). */
export const cardRefSchema = z.union([z.string().regex(/^T-\d+$/), z.uuid()]);

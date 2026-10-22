import { z } from 'zod';
import { dateTimeSchema, text } from './common.js';

/** `POST /auth/login` (spec §4.1). */
export const loginBodySchema = z.object({
  password: z.string().min(1).max(1024),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

/** `POST /tokens` (spec §4.9): `name` es varchar(80). */
export const createTokenBodySchema = z.object({
  name: text().trim().min(1).max(80),
});
export type CreateTokenBody = z.infer<typeof createTokenBodySchema>;

/** `GET /me` (docs/api.md §2): la forma depende de cómo se autenticó la petición. */
export const meSchema = z.discriminatedUnion('auth', [
  z.object({
    auth: z.literal('token'),
    name: z.string(),
    prefix: z.string(),
    expiresAt: dateTimeSchema,
  }),
  z.object({
    auth: z.literal('session'),
    expiresAt: dateTimeSchema,
    idleExpiresAt: dateTimeSchema,
  }),
]);
export type MeDto = z.infer<typeof meSchema>;

import { z } from 'zod';

/** `POST /auth/login` (spec §4.1). */
export const loginBodySchema = z.object({
  password: z.string().min(1).max(1024),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

/** `POST /tokens` (spec §4.9): `name` es varchar(80). */
export const createTokenBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
});
export type CreateTokenBody = z.infer<typeof createTokenBodySchema>;

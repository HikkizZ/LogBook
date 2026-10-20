import { z } from 'zod';

export const pingSchema = z.object({
  message: z.string().min(1),
});

export type Ping = z.infer<typeof pingSchema>;

export * from './schemas/index.js';

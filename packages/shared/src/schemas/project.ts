import { z } from 'zod';
import { dateTimeSchema, booleanQuerySchema, slugSchema, uuidSchema } from './common.js';

/** Claves de la paleta de proyectos (diseño §2.3); es lo que se guarda en `project.color`. */
export const PROJECT_COLORS = [
  'violeta',
  'magenta',
  'cafe',
  'pizarra',
  'turquesa',
  'oliva',
] as const;
export const projectColorSchema = z.enum(PROJECT_COLORS);
export type ProjectColor = z.infer<typeof projectColorSchema>;

/** `owner/repo` (§3.1). */
export const githubRepoSchema = z
  .string()
  .max(140)
  .regex(/^[\w.-]+\/[\w.-]+$/);

const wipLimitSchema = z.number().int().min(0).max(32767);
const nameSchema = z.string().trim().min(1).max(80);

/** `POST /projects` (§4.3). */
export const createProjectBodySchema = z.object({
  name: nameSchema,
  color: projectColorSchema,
  githubRepo: githubRepoSchema.nullish(),
  wipLimit: wipLimitSchema.optional(),
});
export type CreateProjectBody = z.infer<typeof createProjectBodySchema>;

/** `PATCH /projects/:slug`: cualquier campo salvo `slug` (estricto: `slug` u otro campo desconocido da 400). */
export const updateProjectBodySchema = z.strictObject({
  name: nameSchema.optional(),
  color: projectColorSchema.optional(),
  githubRepo: githubRepoSchema.nullable().optional(),
  wipLimit: wipLimitSchema.optional(),
});
export type UpdateProjectBody = z.infer<typeof updateProjectBodySchema>;

export const projectSlugParamsSchema = z.object({ slug: slugSchema });

/** `GET /projects?archived=true` incluye los archivados. */
export const listProjectsQuerySchema = z.object({ archived: booleanQuerySchema.optional() });

export const projectSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  color: z.string(),
  githubRepo: z.string().nullable(),
  wipLimit: z.number().int(),
  archivedAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export type ProjectDto = z.infer<typeof projectSchema>;

export const cardCountsSchema = z.object({
  backlog: z.number().int(),
  todo: z.number().int(),
  in_progress: z.number().int(),
  review: z.number().int(),
  blocked: z.number().int(),
  done: z.number().int(),
});
export type CardCounts = z.infer<typeof cardCountsSchema>;

/** Respuesta de `GET /projects`: `Project` + `cardCounts` (tarjetas no archivadas por estado). */
export const projectWithCountsSchema = projectSchema.extend({ cardCounts: cardCountsSchema });
export type ProjectWithCountsDto = z.infer<typeof projectWithCountsSchema>;

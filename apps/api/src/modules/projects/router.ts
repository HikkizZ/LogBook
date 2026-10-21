import { Router } from 'express';
import {
  createProjectBodySchema,
  listProjectsQuerySchema,
  projectSlugParamsSchema,
  updateProjectBodySchema,
} from 'shared';
import type { CreateProjectBody, UpdateProjectBody } from 'shared';
import { validate } from '../../http/validate.js';
import {
  archiveProject,
  createProject,
  findProjectBySlug,
  listProjects,
  toProjectDto,
  unarchiveProject,
  updateProject,
} from './service.js';

const params = validate({ params: projectSlugParamsSchema });
const slugOf = (p: Record<string, unknown>): string => p['slug'] as string;

/** `/projects` (spec §4.3). Se monta tras la autenticación obligatoria. */
export function projectsRoutes(): Router {
  const router = Router();

  router.get('/projects', validate({ query: listProjectsQuerySchema }), async (req, res) => {
    const { archived } = req.query as { archived?: boolean };
    res.json(await listProjects(archived ?? false));
  });

  router.post('/projects', validate({ body: createProjectBodySchema }), async (req, res) => {
    res.status(201).json(await createProject(req.body as CreateProjectBody));
  });

  router.get('/projects/:slug', params, async (req, res) => {
    res.json(toProjectDto(await findProjectBySlug(slugOf(req.params))));
  });

  router.patch(
    '/projects/:slug',
    validate({ params: projectSlugParamsSchema, body: updateProjectBodySchema }),
    async (req, res) => {
      res.json(await updateProject(slugOf(req.params), req.body as UpdateProjectBody));
    },
  );

  router.post('/projects/:slug/archive', params, async (req, res) => {
    res.json(await archiveProject(slugOf(req.params)));
  });

  router.post('/projects/:slug/unarchive', params, async (req, res) => {
    res.json(await unarchiveProject(slugOf(req.params)));
  });

  return router;
}

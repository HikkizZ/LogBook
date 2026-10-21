import { Router } from 'express';
import { createLabelBodySchema, labelIdParamsSchema, updateLabelBodySchema } from 'shared';
import type { CreateLabelBody, UpdateLabelBody } from 'shared';
import { validate } from '../../http/validate.js';
import { createLabel, deleteLabel, listLabels, updateLabel } from './service.js';

const idOf = (p: Record<string, unknown>): string => p['id'] as string;

/** `/labels` (spec §4.7). Se monta tras la autenticación obligatoria. */
export function labelsRoutes(): Router {
  const router = Router();

  router.get('/labels', async (_req, res) => {
    res.json(await listLabels());
  });

  router.post('/labels', validate({ body: createLabelBodySchema }), async (req, res) => {
    res.status(201).json(await createLabel(req.body as CreateLabelBody));
  });

  router.patch(
    '/labels/:id',
    validate({ params: labelIdParamsSchema, body: updateLabelBodySchema }),
    async (req, res) => {
      res.json(await updateLabel(idOf(req.params), req.body as UpdateLabelBody));
    },
  );

  router.delete('/labels/:id', validate({ params: labelIdParamsSchema }), async (req, res) => {
    await deleteLabel(idOf(req.params));
    res.status(204).end();
  });

  return router;
}

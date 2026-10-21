import { Router } from 'express';
import {
  checklistItemParamsSchema,
  createChecklistItemBodySchema,
  updateChecklistItemBodySchema,
} from 'shared';
import type { CreateChecklistItemBody, UpdateChecklistItemBody } from 'shared';
import { validate } from '../../http/validate.js';
import { currentCard, loadCard } from '../cards/load-card.js';
import { createItem, deleteItem, updateItem } from './service.js';

/** Checklist (spec §4.5, RF-24). Se monta tras la autenticación obligatoria. */
export function checklistRoutes(): Router {
  const router = Router();

  router.post(
    '/cards/:ref/checklist',
    validate({ body: createChecklistItemBodySchema }),
    ...loadCard,
    async (req, res) => {
      res
        .status(201)
        .json(await createItem(currentCard(res).id, req.body as CreateChecklistItemBody));
    },
  );

  router.patch(
    '/checklist/:id',
    validate({ params: checklistItemParamsSchema, body: updateChecklistItemBodySchema }),
    async (req, res) => {
      res.json(await updateItem(req.params['id'] as string, req.body as UpdateChecklistItemBody));
    },
  );

  router.delete(
    '/checklist/:id',
    validate({ params: checklistItemParamsSchema }),
    async (req, res) => {
      await deleteItem(req.params['id'] as string);
      res.status(204).end();
    },
  );

  return router;
}

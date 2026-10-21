import { Router } from 'express';
import {
  cardLogQuerySchema,
  createLogEntryBodySchema,
  logIdParamsSchema,
  logRangeQuerySchema,
  updateLogEntryBodySchema,
} from 'shared';
import type { CardLogQuery, CreateLogEntryBody, LogRangeQuery, UpdateLogEntryBody } from 'shared';
import { validate } from '../../http/validate.js';
import { currentCard, loadCard } from '../cards/load-card.js';
import { sourceOf } from './dto.js';
import {
  buildLog,
  createEntry,
  deleteEntry,
  listCardLog,
  resolveRange,
  updateEntry,
} from './service.js';

/** Bitácora (spec §4.6, RF-30..33). Se monta tras la autenticación obligatoria. */
export function logRoutes(): Router {
  const router = Router();

  router.get(
    '/cards/:ref/log',
    validate({ query: cardLogQuerySchema }),
    ...loadCard,
    async (req, res) => {
      res.json(await listCardLog(currentCard(res), req.query as unknown as CardLogQuery));
    },
  );

  router.post(
    '/cards/:ref/log',
    validate({ body: createLogEntryBodySchema }),
    ...loadCard,
    async (req, res) => {
      res
        .status(201)
        .json(await createEntry(currentCard(res), req.body as CreateLogEntryBody, sourceOf(req)));
    },
  );

  router.patch(
    '/log/:id',
    validate({ params: logIdParamsSchema, body: updateLogEntryBodySchema }),
    async (req, res) => {
      res.json(await updateEntry(req.params['id'] as string, req.body as UpdateLogEntryBody));
    },
  );

  router.delete('/log/:id', validate({ params: logIdParamsSchema }), async (req, res) => {
    await deleteEntry(req.params['id'] as string);
    res.status(204).end();
  });

  router.get('/log', validate({ query: logRangeQuerySchema }), async (req, res) => {
    const query = req.query as unknown as LogRangeQuery;
    res.json(await buildLog(await resolveRange(query), query));
  });

  return router;
}

import { Router } from 'express';
import { createCardBodySchema, listCardsQuerySchema, updateCardBodySchema } from 'shared';
import type { CreateCardBody, ListCardsQuery, UpdateCardBody } from 'shared';
import { validate } from '../../http/validate.js';
import { currentCard, loadCard } from './load-card.js';
import {
  archiveCard,
  createCard,
  getCardDetail,
  listCards,
  unarchiveCard,
  updateCard,
} from './service.js';

/** `/cards` (spec §4.4). Se monta tras la autenticación obligatoria. */
export function cardsRoutes(): Router {
  const router = Router();

  router.get('/cards', validate({ query: listCardsQuerySchema }), async (req, res) => {
    res.json(await listCards(req.query as unknown as ListCardsQuery));
  });

  router.post('/cards', validate({ body: createCardBodySchema }), async (req, res) => {
    res.status(201).json(await createCard(req.body as CreateCardBody));
  });

  router.get('/cards/:ref', ...loadCard, async (_req, res) => {
    res.json(await getCardDetail(currentCard(res)));
  });

  router.patch(
    '/cards/:ref',
    validate({ body: updateCardBodySchema }),
    ...loadCard,
    async (req, res) => {
      res.json(await updateCard(currentCard(res).id, req.body as UpdateCardBody));
    },
  );

  router.post('/cards/:ref/archive', ...loadCard, async (_req, res) => {
    res.json(await archiveCard(currentCard(res).id));
  });

  router.post('/cards/:ref/unarchive', ...loadCard, async (_req, res) => {
    res.json(await unarchiveCard(currentCard(res).id));
  });

  return router;
}

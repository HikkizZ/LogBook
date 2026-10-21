import { Router } from 'express';
import { moveCardBodySchema } from 'shared';
import type { MoveCardBody } from 'shared';
import { validate } from '../../http/validate.js';
import { sourceOf } from '../log/dto.js';
import { currentCard, loadCard } from './load-card.js';
import { moveCard } from './move.service.js';

/** `POST /cards/:ref/move` (spec §4.4). Se monta tras la autenticación obligatoria. */
export function moveRoutes(): Router {
  const router = Router();

  router.post(
    '/cards/:ref/move',
    validate({ body: moveCardBodySchema }),
    ...loadCard,
    async (req, res) => {
      res.json(await moveCard(currentCard(res).id, req.body as MoveCardBody, sourceOf(req)));
    },
  );

  return router;
}

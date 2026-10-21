import { Router } from 'express';
import { searchQuerySchema } from 'shared';
import type { SearchQuery } from 'shared';
import { validate } from '../../http/validate.js';
import { search } from './service.js';

/** `GET /search` (spec §4.8). Se monta tras la autenticación obligatoria. */
export function searchRoutes(): Router {
  const router = Router();

  router.get('/search', validate({ query: searchQuerySchema }), async (req, res) => {
    res.json(await search(req.query as unknown as SearchQuery));
  });

  return router;
}

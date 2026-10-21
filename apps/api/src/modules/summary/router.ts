import { Router } from 'express';
import { summaryQuerySchema } from 'shared';
import type { SummaryQuery } from 'shared';
import { validate } from '../../http/validate.js';
import { buildLog, resolveRange } from '../log/service.js';
import { renderSummary } from './markdown.js';

/** `GET /summary` (spec §4.6, RF-43): el markdown de la bitácora agregada, o su estructura con `format=json`. */
export function summaryRoutes(): Router {
  const router = Router();

  router.get('/summary', validate({ query: summaryQuerySchema }), async (req, res) => {
    const query = req.query as unknown as SummaryQuery;
    const range = resolveRange(query);
    const log = await buildLog(range, query);
    if (query.format === 'json') {
      res.json(log);
      return;
    }
    res.set('Content-Type', 'text/markdown; charset=utf-8').send(renderSummary(range, log));
  });

  return router;
}

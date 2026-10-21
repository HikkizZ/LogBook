import { Router } from 'express';
import { createTokenBodySchema, uuidSchema } from 'shared';
import type { CreateTokenBody } from 'shared';
import { z } from 'zod';
import { requireAuth, requireSession } from '../auth/middleware.js';
import { createToken, revokeToken } from '../auth/tokens.js';
import { getDataSource } from '../db/client.js';
import { ApiToken } from '../entities/index.js';
import { AppError } from '../http/errors.js';
import { validate } from '../http/validate.js';

/** `/tokens` (spec §4.9): solo con cookie de sesión (RS-03). */
export function tokensRoutes(): Router {
  const router = Router();
  router.use('/tokens', requireAuth, requireSession);

  router.get('/tokens', async (_req, res) => {
    const rows = await getDataSource()
      .getRepository(ApiToken)
      .find({ order: { createdAt: 'DESC' } });
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        prefix: `lb_${r.prefix}`,
        lastUsedAt: r.lastUsedAt,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        revokedAt: r.revokedAt,
      })),
    );
  });

  router.post('/tokens', validate({ body: createTokenBodySchema }), async (req, res) => {
    const { name } = req.body as CreateTokenBody;
    const { token, row } = await createToken(name);
    res.status(201).json({
      id: row.id,
      name: row.name,
      prefix: `lb_${row.prefix}`,
      token,
      expiresAt: row.expiresAt,
    });
  });

  router.delete(
    '/tokens/:id',
    validate({ params: z.object({ id: uuidSchema }) }),
    async (req, res) => {
      const id = req.params['id'] as string;
      const exists = await getDataSource().getRepository(ApiToken).existsBy({ id });
      if (!exists) throw new AppError('NOT_FOUND', 'Token no encontrado');
      await revokeToken(id);
      res.status(204).end();
    },
  );

  return router;
}

import { Router } from 'express';
import { updateSettingsBodySchema } from 'shared';
import type { UpdateSettingsBody } from 'shared';
import { validate } from '../../http/validate.js';
import { getSettings, updateSettings } from './service.js';

/** `/settings` (spec §4.12). Se monta tras la autenticación obligatoria. */
export function settingsRoutes(): Router {
  const router = Router();

  router.get('/settings', async (_req, res) => {
    res.json(await getSettings());
  });

  router.patch('/settings', validate({ body: updateSettingsBodySchema }), async (req, res) => {
    res.json(await updateSettings(req.body as UpdateSettingsBody));
  });

  return router;
}

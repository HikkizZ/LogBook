import { Router } from 'express';
import { cardsRoutes } from './cards/router.js';
import { moveRoutes } from './cards/move.router.js';
import { checklistRoutes } from './checklist/router.js';
import { labelsRoutes } from './labels/router.js';
import { logRoutes } from './log/router.js';
import { projectsRoutes } from './projects/router.js';
import { searchRoutes } from './search/router.js';
import { settingsRoutes } from './settings/router.js';
import { summaryRoutes } from './summary/router.js';

/** Rutas del dominio (fase 2). Se montan detrás de la autenticación obligatoria de `createApp`. */
export function domainRoutes(): Router {
  const router = Router();
  router.use(projectsRoutes());
  router.use(labelsRoutes());
  router.use(cardsRoutes());
  router.use(moveRoutes());
  router.use(checklistRoutes());
  router.use(logRoutes());
  router.use(summaryRoutes());
  router.use(searchRoutes());
  router.use(settingsRoutes());
  return router;
}

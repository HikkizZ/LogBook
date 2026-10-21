import { Router } from 'express';
import { cardsRoutes } from './cards/router.js';
import { moveRoutes } from './cards/move.router.js';
import { labelsRoutes } from './labels/router.js';
import { projectsRoutes } from './projects/router.js';

/** Rutas del dominio (fase 2). Se montan detrás de la autenticación obligatoria de `createApp`. */
export function domainRoutes(): Router {
  const router = Router();
  router.use(projectsRoutes());
  router.use(labelsRoutes());
  router.use(cardsRoutes());
  router.use(moveRoutes());
  return router;
}

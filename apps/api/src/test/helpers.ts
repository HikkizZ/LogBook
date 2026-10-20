import type { Express } from 'express';
import { createApp } from '../app.js';

/** App Express sin puerto, lista para pasarla a Supertest: `request(app())`. */
export function app(): Express {
  return createApp();
}

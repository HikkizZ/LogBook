import type { RequestHandler } from 'express';
import { cardRefParamsSchema } from 'shared';
import type { Card } from '../../entities/index.js';
import { validate } from '../../http/validate.js';
import { findCardByRef } from './service.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      /** Tarjeta resuelta por `loadCard` a partir de `:ref`. */
      card?: Card;
    }
  }
}

const resolveCard: RequestHandler = async (req, res, next) => {
  res.locals.card = await findCardByRef(req.params['ref'] as string);
  next();
};

/** Valida `:ref` (`T-42` o uuid) y deja la tarjeta en `res.locals.card`; 404 si no existe. */
export const loadCard = [validate({ params: cardRefParamsSchema }), resolveCard] as const;

/** La tarjeta que dejó `loadCard`. */
export function currentCard(res: { locals: Express.Locals }): Card {
  if (!res.locals.card) throw new Error('loadCard no corrió antes de este handler');
  return res.locals.card;
}

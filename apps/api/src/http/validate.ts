import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from './errors.js';
import type { ErrorDetail } from './errors.js';

interface Schemas {
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
}

/**
 * Valida params, query y body con Zod antes de llegar al handler (RS-07).
 * Si todo pasa, reemplaza cada parte por el valor ya parseado; si no, responde 400 con `details[].path`.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    const details: ErrorDetail[] = [];
    const parsed: Partial<Record<keyof Schemas, unknown>> = {};

    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (result.success) {
        parsed[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({ path: issue.path.map(String).join('.'), message: issue.message });
        }
      }
    }

    if (details.length > 0) {
      const message = details
        .map((d) => (d.path ? `${d.path}: ${d.message}` : d.message))
        .join('; ');
      next(new AppError('VALIDATION_ERROR', message, details));
      return;
    }

    if ('params' in parsed) req.params = parsed.params as typeof req.params;
    if ('body' in parsed) req.body = parsed.body;
    // En Express 5 `req.query` es un getter sin setter: se redefine en la instancia.
    if ('query' in parsed) {
      Object.defineProperty(req, 'query', {
        value: parsed.query,
        configurable: true,
        writable: true,
      });
    }
    next();
  };
}

import { QueryFailedError } from 'typeorm';

/** Nombre de la restricción UNIQUE violada (SQLSTATE 23505), o `undefined` si el error es otro. */
export function uniqueViolation(err: unknown): string | undefined {
  if (!(err instanceof QueryFailedError)) return undefined;
  const driver = err.driverError as { code?: string; constraint?: string } | undefined;
  return driver?.code === '23505' ? (driver.constraint ?? '') : undefined;
}

import { hash, verify } from 'argon2';

/** Hash argon2id (por defecto del paquete) para `ADMIN_PASSWORD_HASH` (RS-02). */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

/** `true` si la contraseña corresponde al hash argon2id. */
export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

// El binding de argon2 emite m,p,t (no m,t,p): se aceptan ambos órdenes.
const PHC_ARGON2ID =
  /^\$argon2id\$v=19\$m=(\d+),(?:t=\d+,p=\d+|p=\d+,t=\d+)\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/;
/** Mínimo OWASP para argon2id (19 MiB, en KiB). */
const MIN_MEMORY_KIB = 19456;

/** Lanza si `value` no es un hash PHC argon2id bien formado con `m >= 19456` (RS-02). No incluye el valor en el mensaje. */
export function assertPasswordHash(value: string): void {
  const match = PHC_ARGON2ID.exec(value);
  if (!match) {
    throw new Error(
      'ADMIN_PASSWORD_HASH no es un hash argon2id bien formado ($argon2id$v=19$m=…,t=…,p=…$salt$hash)',
    );
  }
  if (Number(match[1]) < MIN_MEMORY_KIB) {
    throw new Error(
      `ADMIN_PASSWORD_HASH usa m menor que ${MIN_MEMORY_KIB} KiB (parámetros débiles)`,
    );
  }
}

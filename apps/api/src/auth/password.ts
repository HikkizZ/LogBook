import { hash, verify } from 'argon2';

/** Hash argon2id (por defecto del paquete) para `ADMIN_PASSWORD_HASH` (RS-02). */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

/** `true` si la contraseña corresponde al hash argon2id. */
export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

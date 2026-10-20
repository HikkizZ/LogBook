export const SESSION_COOKIE_NAME = '__Host-lb_session';

// __Host- exige Secure, Path=/ y ningún Domain. Sin Max-Age/Expires: cookie de sesión del navegador (RS-10).
const FLAGS = 'Path=/; Secure; HttpOnly; SameSite=Strict';

/** Valor exacto del header `Set-Cookie` que abre la sesión. */
export function sessionCookie(sessionId: string): string {
  return `${SESSION_COOKIE_NAME}=${sessionId}; ${FLAGS}`;
}

/** Valor exacto del header `Set-Cookie` que borra la cookie. */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; ${FLAGS}; Max-Age=0`;
}

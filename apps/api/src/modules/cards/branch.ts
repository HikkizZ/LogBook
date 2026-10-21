import { slugify } from '../../lib/slug.js';

const MAX_SLUG_LENGTH = 50;

/** RF-29: `fix/T-7-titulo-slug` si la tarjeta tiene la etiqueta `bug`, `feat/T-7-titulo-slug` en otro caso. */
export function branchName(number: number, title: string, labelNames: string[]): string {
  const prefix = labelNames.some((n) => n.toLowerCase() === 'bug') ? 'fix' : 'feat';
  const slug = slugify(title, MAX_SLUG_LENGTH);
  return `${prefix}/T-${number}${slug ? `-${slug}` : ''}`;
}

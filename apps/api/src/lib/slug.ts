/** Minúsculas ASCII separadas por guiones, sin acentos ni signos: "Diseño API v2" → "diseno-api-v2". */
export function slugify(text: string, maxLength = 80): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/, '');
}

import createDOMPurify from 'dompurify';

/**
 * Único punto donde el `snippet` de la búsqueda se inyecta como HTML (§4.6, RS-12).
 * La API lo entrega como texto con `&`, `<` y `>` escapados y `<mark>` como único HTML; aun así se
 * sanitiza en el cliente permitiendo solo `<mark>` y ningún atributo (defensa en profundidad).
 * Instancia propia, para no compartir hooks con el markdown. Nada más de la paleta usa `innerHTML`.
 */
const purify = createDOMPurify(window);

export function sanitizeSnippet(snippet: string): string {
  return purify.sanitize(snippet, { ALLOWED_TAGS: ['mark'], ALLOWED_ATTR: [] });
}

export function Snippet({ html, className }: { html: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: sanitizeSnippet(html) }} />;
}

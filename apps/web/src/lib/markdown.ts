import createDOMPurify from 'dompurify';
import markdownIt from 'markdown-it';

/**
 * Markdown de descripciones y bitácora → HTML seguro (RF-22, RS-12). Dos capas:
 * 1. `markdown-it` con `html: false` (el HTML crudo se escapa como texto) y sin imágenes (no se cargan
 *    recursos externos desde una nota).
 * 2. `DOMPurify` con lista blanca de etiquetas y atributos: sin `<script>`, `<iframe>`, `on*` ni `javascript:`.
 * Los enlaces salen con `target="_blank"` y `rel="noopener noreferrer"`.
 */
const md = markdownIt({ html: false, linkify: true, breaks: true });
md.disable('image');

// El panel ya tiene su `h2` (el título): los encabezados del usuario bajan a `h3` o más (§6.1).
md.renderer.rules.heading_open = (tokens, idx) => {
  const token = tokens[idx];
  return `<h${Math.min(6, Number(token?.tag.slice(1)) + 2)}>`;
};
md.renderer.rules.heading_close = (tokens, idx) => {
  const token = tokens[idx];
  return `</h${Math.min(6, Number(token?.tag.slice(1)) + 2)}>\n`;
};

// Instancia propia: el hook de enlaces no debe tocar a otros usos de DOMPurify (p. ej. los `snippet` de la búsqueda).
const purify = createDOMPurify(window);
purify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

const ALLOWED_TAGS = [
  'a',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
];

export function renderMarkdown(source: string): string {
  return purify.sanitize(md.render(source), {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false,
    // RS-12, perfil estricto: ni `ftp:`, `tel:`, `sms:` ni `xmpp:` (el de fábrica de DOMPurify los admite).
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  });
}

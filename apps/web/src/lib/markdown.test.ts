import { renderMarkdown } from './markdown';

function parse(source: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = renderMarkdown(source);
  return root;
}

describe('renderMarkdown (RF-22, RS-12)', () => {
  it('RS-12: elimina <script> y los manejadores on* del HTML crudo', () => {
    const root = parse('hola <script>alert(1)</script> <b onclick="alert(2)">negrita</b>');

    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('[onclick]')).toBeNull();
    expect(root.textContent).toContain('hola');
  });

  it('RS-12: no deja pasar <iframe>, <img> ni <style>, ni siquiera como markdown de imagen', () => {
    const root = parse(
      '<iframe src="https://example.com"></iframe><style>*{}</style>\n\n![x](https://example.com/x.png)',
    );

    expect(root.querySelector('iframe, img, style')).toBeNull();
  });

  it('RS-12: los enlaces salen con rel="noopener noreferrer" y target="_blank"', () => {
    const root = parse('[uno](https://example.com) y https://example.org/dos');

    const links = root.querySelectorAll('a');
    expect(links).toHaveLength(2);
    for (const a of links) {
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      expect(a.getAttribute('target')).toBe('_blank');
    }
  });

  it('RS-12: un enlace javascript: no conserva su href', () => {
    const root = parse('[malo](javascript:alert(1)) <a href="javascript:alert(2)">crudo</a>');

    for (const a of root.querySelectorAll('a')) {
      expect(a.getAttribute('href') ?? '').not.toMatch(/javascript:/i);
    }
  });

  it('RF-22: soporta listas, código, enlaces, negrita y encabezados', () => {
    const root = parse('# T\n\n- a\n- b\n\n`c` **d**\n\n```\nbloque\n```');

    expect(root.querySelector('h3')).toHaveTextContent('T');
    expect(root.querySelectorAll('li')).toHaveLength(2);
    expect(root.querySelector('strong')).toHaveTextContent('d');
    expect(root.querySelector('pre code')).toHaveTextContent('bloque');
  });

  it('los encabezados bajan de nivel para no competir con el h1 de la vista ni con el h2 del panel', () => {
    const root = parse('# a\n\n## b\n\n###### f');

    expect(root.querySelector('h1, h2')).toBeNull();
    expect([...root.querySelectorAll('h3, h4, h5, h6')].map((h) => h.tagName)).toEqual([
      'H3',
      'H4',
      'H6',
    ]);
  });
});

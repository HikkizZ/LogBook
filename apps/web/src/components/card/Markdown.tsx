import { useMemo } from 'react';
import { renderMarkdown } from '../../lib/markdown';
import { cn } from '../../lib/cn';

const PROSE =
  'break-words text-base text-fg [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-3 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-fg-muted [&_code]:rounded-sm [&_code]:bg-surface-hover [&_code]:px-1 [&_code]:font-mono [&_code]:text-sm [&_h3]:text-md [&_h4]:text-base [&_h4]:font-semibold [&_h5]:text-base [&_h5]:font-semibold [&_h6]:text-base [&_h6]:font-semibold [&_hr]:my-3 [&_hr]:border-border [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface-hover [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_ul]:list-disc [&_ul]:pl-5';

/**
 * Markdown renderizado (RF-22, RS-12). Este es el ÚNICO `dangerouslySetInnerHTML` de la aplicación: el HTML
 * pasa antes por `renderMarkdown` (markdown-it sin HTML crudo + DOMPurify con lista blanca), que es lo que lo
 * hace seguro. Todo texto de usuario con formato (descripción, entradas de bitácora) se pinta con este componente.
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(source), [source]);
  return <div className={cn(PROSE, className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

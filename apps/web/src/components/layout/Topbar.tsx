import { useLocation, useMatch } from 'react-router';
import { useProjects } from '../../api/queries';
import { cn } from '../../lib/cn';
import { projectDotClass } from '../../lib/colors';
import { Button } from '../ui/Button';

const TITLES: Record<string, string> = {
  '/today': 'Mi día',
  '/week': 'Mi semana',
  '/timeline': 'Línea de tiempo',
  '/labels': 'Etiquetas',
  '/tokens': 'Tokens',
  '/settings': 'Ajustes',
  '/_kit': 'Kit de componentes',
};

/** Barra superior (§3): 56 px, título de la vista como único `h1`. */
export function Topbar() {
  const { pathname } = useLocation();
  const projectMatch = useMatch('/p/:slug/*');
  const { data: projects } = useProjects();
  const project = projectMatch && projects?.find((p) => p.slug === projectMatch.params.slug);

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface px-6">
      <h1 className="flex items-center gap-2 text-lg">
        {project && (
          <span
            aria-hidden="true"
            className={cn('size-2.5 shrink-0 rounded-full', projectDotClass(project.color))}
          />
        )}
        {project?.name ??
          (projectMatch ? projectMatch.params.slug : (TITLES[pathname] ?? 'Logbook'))}
      </h1>
      <div className="ml-auto flex items-center gap-2">
        {/* TODO(fase 6.3): campo de búsqueda (`/`, Ctrl+K). TODO(fase 4.4): "Nueva tarjeta" (`n`). */}
        <Button variant="secondary" disabled>
          Buscar
        </Button>
        <Button disabled>Nueva tarjeta</Button>
      </div>
    </header>
  );
}

import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { useProjects } from '../../api/queries';
import { cn } from '../../lib/cn';
import { projectDotSoftClass } from '../../lib/colors';
import { Skeleton } from '../ui/Skeleton';
import { Tooltip } from '../ui/Tooltip';
import {
  CalendarIcon,
  KeyIcon,
  SettingsIcon,
  SidebarIcon,
  SunIcon,
  TagIcon,
  TimelineIcon,
} from '../ui/icons';

const ITEM =
  'flex h-8 items-center gap-2 rounded-sm border-l-3 border-transparent px-3 text-base text-sidebar-fg-muted transition-colors duration-120 ease-out hover:bg-sidebar-hover hover:text-sidebar-fg aria-[current=page]:border-sidebar-fg aria-[current=page]:bg-sidebar-hover aria-[current=page]:text-sidebar-fg';

function SidebarItem({
  to,
  label,
  icon,
  trailing,
  collapsed,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  trailing?: ReactNode;
  collapsed: boolean;
}) {
  const link = (props: object) => (
    <NavLink
      to={to}
      aria-label={collapsed ? label : undefined}
      className={cn(ITEM, collapsed && 'justify-center px-0')}
      {...props}
    >
      {icon}
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!collapsed && trailing}
    </NavLink>
  );
  return collapsed ? (
    <Tooltip label={label} side="right" describe={false}>
      {link}
    </Tooltip>
  ) : (
    link({})
  );
}

function ProjectList({ collapsed }: { collapsed: boolean }) {
  const { data, isPending, isError } = useProjects();
  if (isPending) {
    return (
      <div className="flex flex-col gap-2 px-3" role="status" aria-label="Cargando proyectos">
        <Skeleton className="h-6 bg-sidebar-hover" />
        <Skeleton className="h-6 bg-sidebar-hover" />
      </div>
    );
  }
  if (isError) {
    return (
      <p className="px-3 text-sm text-sidebar-fg-muted">No se pudieron cargar los proyectos.</p>
    );
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {data.map((p) => (
        <li key={p.id}>
          <SidebarItem
            to={`/p/${p.slug}`}
            label={p.name}
            collapsed={collapsed}
            icon={
              <span
                aria-hidden="true"
                className={cn('size-2 shrink-0 rounded-full', projectDotSoftClass(p.color))}
              />
            }
            trailing={
              p.cardCounts.in_progress > 0 && (
                <>
                  <span aria-hidden="true" className="text-xs text-sidebar-fg-muted">
                    {p.cardCounts.in_progress}
                  </span>
                  <span className="sr-only">, {p.cardCounts.in_progress} en curso</span>
                </>
              )
            }
          />
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={title} className="flex flex-col gap-1">
      {children}
    </div>
  );
}

export function Sidebar({
  collapsed,
  narrow,
  onToggle,
}: {
  collapsed: boolean;
  /** Bajo 1024 px la sidebar está colapsada a la fuerza y el botón no hace nada. */
  narrow: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      id="sidebar"
      className={cn(
        'on-sidebar flex shrink-0 flex-col bg-sidebar text-sidebar-fg',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      <div className="flex h-14 items-center px-4">
        <span className="text-md text-sidebar-fg">{collapsed ? 'L' : 'Logbook'}</span>
      </div>
      <nav
        aria-label="Principal"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2"
      >
        <Section title="Vistas">
          <SidebarItem to="/today" label="Mi día" icon={<SunIcon />} collapsed={collapsed} />
          <SidebarItem to="/week" label="Mi semana" icon={<CalendarIcon />} collapsed={collapsed} />
          <SidebarItem
            to="/timeline"
            label="Línea de tiempo"
            icon={<TimelineIcon />}
            collapsed={collapsed}
          />
        </Section>
        <Section title="Proyectos">
          {!collapsed && (
            <h2 className="px-3 text-xs tracking-wide text-sidebar-fg-muted uppercase">
              Proyectos
            </h2>
          )}
          <ProjectList collapsed={collapsed} />
        </Section>
      </nav>
      <nav
        aria-label="Secundaria"
        className="flex flex-col gap-1 border-t border-sidebar-hover p-2"
      >
        <SidebarItem to="/labels" label="Etiquetas" icon={<TagIcon />} collapsed={collapsed} />
        <SidebarItem to="/tokens" label="Tokens" icon={<KeyIcon />} collapsed={collapsed} />
        <SidebarItem to="/settings" label="Ajustes" icon={<SettingsIcon />} collapsed={collapsed} />
        <Tooltip
          label={
            narrow
              ? 'La barra lateral se colapsa bajo 1024 px'
              : collapsed
                ? 'Expandir barra lateral ([)'
                : 'Colapsar barra lateral ([)'
          }
          side="right"
        >
          {(props) => (
            <button
              type="button"
              aria-label={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
              aria-expanded={!collapsed}
              aria-controls="sidebar"
              aria-disabled={narrow || undefined}
              onClick={narrow ? undefined : onToggle}
              className={cn(
                'flex h-8 cursor-pointer items-center gap-2 rounded-sm border-l-3 border-transparent bg-transparent px-3 text-base text-sidebar-fg-muted transition-colors duration-120 ease-out hover:bg-sidebar-hover hover:text-sidebar-fg',
                collapsed && 'justify-center px-0',
                narrow && 'cursor-not-allowed opacity-50',
              )}
              {...props}
            >
              <SidebarIcon />
              {!collapsed && <span>Colapsar</span>}
            </button>
          )}
        </Tooltip>
      </nav>
    </aside>
  );
}

import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { useHotkeys } from '../../hooks/useHotkeys';
import { ShortcutsDialog } from './ShortcutsDialog';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

// Preferencia de interfaz, no de autenticación (ADR 0001): lo único que se guarda en el navegador.
const COLLAPSED_KEY = 'logbook.sidebarCollapsed';
const NARROW_QUERY = '(max-width: 1023px)';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** §3: bajo 1024 px la sidebar se colapsa sola. */
function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(NARROW_QUERY).matches ?? false);
  useEffect(() => {
    const mql = window.matchMedia?.(NARROW_QUERY);
    if (!mql) return;
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

export function AppShell() {
  const navigate = useNavigate();
  const [userCollapsed, setUserCollapsed] = useState(readCollapsed);
  const [helpOpen, setHelpOpen] = useState(false);
  const narrow = useNarrowViewport();
  const collapsed = userCollapsed || narrow;

  const toggleSidebar = () => {
    const next = !userCollapsed;
    setUserCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      // Sin almacenamiento disponible: la preferencia solo dura la sesión de la pestaña.
    }
  };

  // TODO(fase 4.4 / 6.3): `n` (nueva tarjeta), `/` y Ctrl+K (búsqueda) se enlazan aquí cuando existan.
  useHotkeys({
    '[': toggleSidebar,
    'g d': () => void navigate('/today'),
    'g w': () => void navigate('/week'),
    'g t': () => void navigate('/timeline'),
    '?': () => setHelpOpen(true),
  });

  return (
    <div className="flex h-screen">
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-auto bg-bg p-6">
          <Outlet />
        </main>
      </div>
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

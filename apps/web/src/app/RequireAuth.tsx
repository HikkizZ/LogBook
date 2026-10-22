import { Outlet } from 'react-router';
import { ApiError } from '../api/client';
import { useMe } from '../api/queries';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';

/**
 * Guard: al cargar pregunta `GET /me`. Un 401 lo redirige a `/login` el cliente de API (ApiBridge);
 * no hay nada que leer en el navegador para saberlo (ADR 0001).
 */
export function RequireAuth() {
  const { isPending, error, refetch } = useMe();

  if (isPending) {
    // Primer arranque: único caso donde se admite una pantalla completa de carga (§5).
    return (
      <div role="status" aria-label="Cargando" className="flex h-screen gap-4 p-6">
        <Skeleton className="w-60" />
        <Skeleton className="flex-1" />
      </div>
    );
  }
  if (error instanceof ApiError && error.status === 401) return null;
  if (error) {
    return (
      <div role="alert" className="flex h-screen flex-col items-center justify-center gap-4">
        <p>{error instanceof ApiError ? error.message : 'No se pudo conectar con el servidor.'}</p>
        <Button onClick={() => void refetch()}>Reintentar</Button>
      </div>
    );
  }
  return <Outlet />;
}

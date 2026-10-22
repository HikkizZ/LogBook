import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { configureApiClient } from '../api/client';
import { useToast } from '../components/ui/Toast';

/**
 * Conecta el cliente de API (que vive fuera de React) con el router y los avisos:
 * 401 -> `/login` con el aviso de sesión vencida (§4.8); 403 -> toast con `error.message` (§5).
 */
export function ApiBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const here = useRef(location);
  const redirecting = useRef(false);

  useEffect(() => {
    here.current = location;
    if (location.pathname === '/login') redirecting.current = false;
  }, [location]);

  useEffect(() => {
    configureApiClient({
      onUnauthorized: ({ expired }) => {
        // Varias peticiones en vuelo pueden dar 401 a la vez: solo la primera redirige.
        if (redirecting.current || here.current.pathname === '/login') return;
        redirecting.current = true;
        queryClient.clear();
        void navigate('/login', {
          replace: true,
          state: { expired, from: here.current.pathname + here.current.search },
        });
      },
      onForbidden: (message) => toast.show({ tone: 'danger', message }),
    });
    return () => configureApiClient({});
  }, [navigate, queryClient, toast]);

  return null;
}

import { useState } from 'react';
import { useRevokeToken, useTokens, type ApiTokenDto } from '../api/admin-queries';
import { useSettings } from '../api/queries';
import { NewTokenDialog } from '../components/admin/NewTokenDialog';
import { formatInstant, tokenStatus } from '../components/admin/tokenStatus';
import { Button, Chip, Dialog, Skeleton, useToast } from '../components/ui';
import { ClockIcon, PlusIcon } from '../components/ui/icons';
import { cn } from '../lib/cn';

function RevokeDialog({ token, onClose }: { token: ApiTokenDto; onClose: () => void }) {
  const revoke = useRevokeToken();
  const toast = useToast();
  return (
    <Dialog open onClose={onClose} title={`Revocar ${token.name}`}>
      <p className="mt-0 mb-4 text-fg-muted">
        El token dejará de funcionar de inmediato. No se puede deshacer.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" data-autofocus onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="destructive"
          disabled={revoke.isPending}
          onClick={() =>
            revoke.mutate(token.id, {
              onSuccess: onClose,
              onError: (e) => toast.show({ tone: 'danger', message: e.message }),
            })
          }
        >
          Revocar
        </Button>
      </div>
    </Dialog>
  );
}

/** Tokens de API (RF-61, §4.7). */
export function TokensPage() {
  const { data: tokens, isPending, error, refetch } = useTokens();
  const { data: settings } = useSettings();
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiTokenDto | null>(null);
  const tz = settings?.timezone;
  const [now] = useState(() => Date.now());

  const expiring = (tokens ?? []).filter((t) => tokenStatus(t, now).kind === 'soon');

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="m-0 text-fg-muted">
          Cada token vence a los 90 días y no se renueva: crea uno nuevo y actualiza el{' '}
          <code className="font-mono">env</code> de la skill.
        </p>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon /> Nuevo token
        </Button>
      </div>

      {expiring.map((t) => (
        <div
          key={t.id}
          className="rounded-sm border-l-3 border-l-warning bg-warning-soft p-3 text-fg"
        >
          El token <strong>{t.name}</strong> vence el {formatInstant(t.expiresAt, tz)}. Crea uno
          nuevo y actualiza el <code className="font-mono">env</code> de la skill; el viejo se puede
          revocar después.
        </div>
      ))}

      {isPending && <Skeleton className="h-24" />}
      {error && (
        <div role="alert" className="flex items-center gap-3">
          <p className="m-0">{error.message}</p>
          <Button variant="secondary" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {tokens && tokens.length === 0 && <p className="m-0 text-fg-muted">Aún no hay tokens.</p>}
      {tokens && tokens.length > 0 && (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border text-sm text-fg-muted">
              <th className="py-2 pr-3 font-medium">Nombre</th>
              <th className="py-2 pr-3 font-medium">Prefijo</th>
              <th className="py-2 pr-3 font-medium">Creado</th>
              <th className="py-2 pr-3 font-medium">Último uso</th>
              <th className="py-2 pr-3 font-medium">Vence</th>
              <th className="py-2 font-medium">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => {
              const status = tokenStatus(t, now);
              const dimmed = status.kind === 'revoked' || status.kind === 'expired';
              return (
                <tr key={t.id} className={cn('border-b border-border', dimmed && 'opacity-60')}>
                  <td className="py-2 pr-3">{t.name}</td>
                  <td className="py-2 pr-3 font-mono">{t.prefix}</td>
                  <td className="py-2 pr-3">{formatInstant(t.createdAt, tz)}</td>
                  <td className="py-2 pr-3">
                    {t.lastUsedAt ? formatInstant(t.lastUsedAt, tz) : 'nunca'}
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-2">
                      {formatInstant(t.expiresAt, tz)}
                      {status.kind === 'soon' && (
                        <Chip tone="warning">
                          <ClockIcon />
                          {status.days === 1 ? 'vence en 1 día' : `vence en ${status.days} días`}
                        </Chip>
                      )}
                      {status.kind === 'expired' && <Chip tone="danger">vencido</Chip>}
                      {status.kind === 'revoked' && <Chip tone="neutral">revocado</Chip>}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {status.kind !== 'revoked' && (
                      <Button
                        variant="destructive"
                        aria-label={`Revocar ${t.name}`}
                        onClick={() => setRevoking(t)}
                      >
                        Revocar
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {creating && <NewTokenDialog timeZone={tz} onClose={() => setCreating(false)} />}
      {revoking && <RevokeDialog token={revoking} onClose={() => setRevoking(null)} />}
    </div>
  );
}

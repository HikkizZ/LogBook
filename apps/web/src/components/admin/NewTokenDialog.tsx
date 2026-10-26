import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createToken, tokensKey, type CreatedTokenDto } from '../../api/admin-queries';
import { Button, Dialog, Input } from '../ui';
import { formatInstant } from './tokenStatus';

/**
 * Crear un token (RF-61). El token en claro vive solo en el estado de este componente: la página lo
 * desmonta al cerrar, así que se descarta; no pasa por ninguna caché de TanStack ni por la URL.
 */
export function NewTokenDialog({ onClose, timeZone }: { onClose: () => void; timeZone?: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<(CreatedTokenDto & { days: number }) | null>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);

  const close = () => {
    setCreated(null);
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Escribe un nombre');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await createToken(trimmed);
      setCreated({
        ...res,
        days: Math.round((Date.parse(res.expiresAt) - Date.now()) / 86_400_000),
      });
      void queryClient.invalidateQueries({ queryKey: tokensKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el token');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.token);
      setCopied('ok');
      doneRef.current?.focus();
    } catch {
      setCopied('fail');
    }
  };

  // `key`: al pasar de formulario a token se monta otro `Dialog`, y con él el foco inicial en "Copiar".
  if (created) {
    return (
      <Dialog
        key="created"
        open
        onClose={close}
        title="Token creado"
        widthClass="max-w-dialog-wide"
      >
        <div className="flex flex-col gap-3">
          <p className="m-0 text-fg-muted">
            Copia el token de <strong className="text-fg">{created.name}</strong> ahora. No se
            vuelve a mostrar.
          </p>
          <code
            data-testid="new-token"
            className="block rounded-sm border border-border bg-bg p-3 font-mono text-sm break-all select-all"
          >
            {created.token}
          </code>
          <p className="m-0 text-fg-muted">
            Vence el {formatInstant(created.expiresAt, timeZone)} ({created.days} días)
          </p>
          <p role="status" className="m-0 min-h-5 text-sm text-fg-muted">
            {copied === 'ok' && 'Copiado'}
            {copied === 'fail' && 'No se pudo copiar; selecciona el texto y cópialo a mano'}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" data-autofocus onClick={() => void copy()}>
              Copiar
            </Button>
            <Button ref={doneRef} onClick={close}>
              Listo
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog key="form" open onClose={close} title="Nuevo token">
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="token-name">Nombre</label>
          <Input
            id="token-name"
            data-autofocus
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'token-name-error' : undefined}
          />
          {error && (
            <p id="token-name-error" role="alert" className="m-0 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            Crear token
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

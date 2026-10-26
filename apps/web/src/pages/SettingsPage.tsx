import { useState, type FormEvent, type ReactNode } from 'react';
import type { SettingsDto, UpdateSettingsBody } from 'shared';
import { useEndSession, useUpdateSettings } from '../api/admin-queries';
import { useSettings } from '../api/queries';
import { Button, Dialog, Input, Skeleton, useToast } from '../components/ui';

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function integerInRange(raw: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

interface Draft {
  timezone: string;
  doneDaysVisible: string;
  wipDefault: string;
}

type Errors = Partial<Record<keyof Draft, string>>;

/** Rangos de docs/api.md §10 y 01_especificacion §4.12; la API los vuelve a validar. */
function validate(draft: Draft): Errors {
  const errors: Errors = {};
  if (!isTimeZone(draft.timezone.trim())) errors.timezone = 'Zona horaria IANA inválida';
  if (integerInRange(draft.doneDaysVisible, 1, 365) === null) {
    errors.doneDaysVisible = 'Un número entero entre 1 y 365';
  }
  if (integerInRange(draft.wipDefault, 0, 32767) === null) {
    errors.wipDefault = 'Un número entero entre 0 y 32767';
  }
  return errors;
}

/** Solo lo que cambió respecto a lo guardado (el `PATCH` vacío es 400). */
function changes(draft: Draft, saved: SettingsDto): UpdateSettingsBody {
  const body: UpdateSettingsBody = {};
  if (draft.timezone.trim() !== saved.timezone) body.timezone = draft.timezone.trim();
  const days = Number(draft.doneDaysVisible);
  if (days !== saved.doneDaysVisible) body.doneDaysVisible = days;
  const wip = Number(draft.wipDefault);
  if (wip !== saved.wipDefault) body.wipDefault = wip;
  return body;
}

function Field({
  id,
  label,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  help: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id}>{label}</label>
      {children}
      <p id={`${id}-help`} className="m-0 text-sm text-fg-muted">
        {help}
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function SettingsForm({ saved }: { saved: SettingsDto }) {
  const update = useUpdateSettings();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>({
    timezone: saved.timezone,
    doneDaysVisible: String(saved.doneDaysVisible),
    wipDefault: String(saved.wipDefault),
  });
  const [errors, setErrors] = useState<Errors>({});
  const dirty = Object.keys(changes(draft, saved)).length > 0;

  const set = (key: keyof Draft) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const body = changes(draft, saved);
    if (Object.keys(body).length === 0) return;
    update.mutate(body, {
      onSuccess: () => toast.show({ tone: 'success', message: 'Ajustes guardados' }),
      onError: (err) => toast.show({ tone: 'danger', message: err.message }),
    });
  };

  const props = (key: keyof Draft) => ({
    id: key,
    value: draft[key],
    onChange: set(key),
    'aria-invalid': errors[key] ? (true as const) : undefined,
    'aria-describedby': errors[key] ? `${key}-help ${key}-error` : `${key}-help`,
  });

  return (
    <form onSubmit={submit} noValidate className="flex max-w-md flex-col gap-4">
      <Field
        id="timezone"
        label="Zona horaria"
        help="Agrupa Mi día y Mi semana y define qué día es «hoy» (por ejemplo America/Santiago)."
        error={errors.timezone}
      >
        <Input {...props('timezone')} autoComplete="off" spellCheck={false} />
      </Field>
      <Field
        id="doneDaysVisible"
        label="Días visibles en Hecho"
        help="Cuántos días se ven las tarjetas terminadas en el kanban (1 a 365)."
        error={errors.doneDaysVisible}
      >
        <Input {...props('doneDaysVisible')} inputMode="numeric" />
      </Field>
      <Field
        id="wipDefault"
        label="WIP por defecto"
        help="Límite de En curso para los proyectos nuevos (0 a 32767)."
        error={errors.wipDefault}
      >
        <Input {...props('wipDefault')} inputMode="numeric" />
      </Field>
      <div>
        <Button type="submit" disabled={!dirty || update.isPending}>
          Guardar
        </Button>
      </div>
    </form>
  );
}

function SessionSection() {
  const logout = useEndSession(false);
  const logoutAll = useEndSession(true);
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  return (
    <section aria-labelledby="session-title" className="max-w-md border-t border-border pt-6">
      <h2 id="session-title" className="mb-2 text-md">
        Sesión
      </h2>
      <p className="mt-0 mb-4 text-fg-muted">
        Tu sesión vence tras 12 h sin uso o 7 días después de entrar
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={logout.isPending}
          onClick={() =>
            logout.mutate(undefined, {
              onError: (e) => toast.show({ tone: 'danger', message: e.message }),
            })
          }
        >
          Salir
        </Button>
        <Button variant="destructive" onClick={() => setConfirming(true)}>
          Cerrar todas las sesiones
        </Button>
      </div>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Cerrar todas las sesiones"
      >
        <p className="mt-0 mb-4 text-fg-muted">
          Se cerrará la sesión en todos los navegadores, incluido este. Los tokens de API no se
          tocan.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" data-autofocus onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={logoutAll.isPending}
            onClick={() =>
              logoutAll.mutate(undefined, {
                onError: (e) => {
                  setConfirming(false);
                  toast.show({ tone: 'danger', message: e.message });
                },
              })
            }
          >
            Cerrar todas
          </Button>
        </div>
      </Dialog>
    </section>
  );
}

/** Ajustes (§4.8) y sesión (RF-63, RF-64). */
export function SettingsPage() {
  const { data, isPending, error, refetch } = useSettings();

  return (
    <div className="flex flex-col gap-6">
      {isPending && <Skeleton className="h-40 max-w-md" />}
      {error && (
        <div role="alert" className="flex items-center gap-3">
          <p className="m-0">{error.message}</p>
          <Button variant="secondary" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {data && <SettingsForm saved={data} />}
      <SessionSection />
    </div>
  );
}

import { useSearchParams } from 'react-router';
import { CARD_PRIORITIES } from 'shared';
import { useLabels } from '../../api/queries';
import { hasFilters, parseFilters, PRIORITY_NAME } from '../../lib/board';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';

/**
 * Filtros del kanban en la barra superior (RF-18, §3). El estado vive en la URL (`?label=&priority=&q=`):
 * recargar o compartir el enlace conserva el filtro. Usan `replace` para no llenar el historial al teclear.
 */
export function BoardFilters() {
  const [params, setParams] = useSearchParams();
  const labels = useLabels();
  const filters = parseFilters(params);

  const set = (key: 'label' | 'priority' | 'q', value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  // Una etiqueta que viene en la URL pero no existe (o aún no cargó) sigue apareciendo elegida.
  const labelNames = new Set((labels.data ?? []).map((l) => l.name));
  if (filters.label) labelNames.add(filters.label);

  return (
    <div role="group" aria-label="Filtros del tablero" className="flex items-center gap-2">
      <div className="w-36">
        <Select
          aria-label="Filtrar por etiqueta"
          value={filters.label}
          onChange={(e) => set('label', e.target.value)}
        >
          <option value="">Etiqueta</option>
          {[...labelNames].map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-32">
        <Select
          aria-label="Filtrar por prioridad"
          value={filters.priority}
          onChange={(e) => set('priority', e.target.value)}
        >
          <option value="">Prioridad</option>
          {CARD_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_NAME[p]}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-44">
        <Input
          aria-label="Filtrar por texto"
          placeholder="Filtrar por texto…"
          value={params.get('q') ?? ''}
          onChange={(e) => set('q', e.target.value)}
        />
      </div>
      {hasFilters(filters) && (
        <Button
          variant="secondary"
          onClick={() => setParams(new URLSearchParams(), { replace: true })}
        >
          Limpiar
        </Button>
      )}
    </div>
  );
}

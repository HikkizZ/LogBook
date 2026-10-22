import { SHORTCUTS } from '../../lib/shortcuts';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Atajos de teclado" widthClass="max-w-dialog-wide">
      <p className="mb-3 text-fg-muted">
        Los atajos de una letra no actúan mientras escribes en un campo.
      </p>
      <table className="mb-4 w-full border-collapse text-base">
        <thead className="sr-only">
          <tr>
            <th scope="col">Tecla</th>
            <th scope="col">Acción</th>
          </tr>
        </thead>
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.keys} className="border-b border-border last:border-b-0">
              <td className="py-1 pr-4 font-mono text-xs whitespace-nowrap">{s.keys}</td>
              <td className="py-1">{s.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Dialog>
  );
}

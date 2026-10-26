import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { CheckIcon } from '../ui/icons';
import { useToast } from '../ui/Toast';
import { CopyIcon } from './card-icons';

const FEEDBACK_MS = 1500;

/** Copia `text` al portapapeles (RF-20, RF-29) y lo confirma con el icono y un aviso "Copiado". */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), FEEDBACK_MS);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.show({ tone: 'success', message: 'Copiado' });
    } catch {
      toast.show({ tone: 'danger', message: 'No se pudo copiar al portapapeles' });
    }
  };

  return (
    <Button variant="secondary" iconOnly aria-label={label} onClick={() => void copy()}>
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}

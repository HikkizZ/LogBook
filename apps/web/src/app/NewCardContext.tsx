import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface NewCardContextValue {
  /** Acción "Nueva tarjeta" de la vista actual, o `null` si la vista no tiene (todo menos el kanban). */
  action: (() => void) | null;
  setAction: (action: (() => void) | null) => void;
}

const NewCardContext = createContext<NewCardContextValue | null>(null);

/**
 * Puente entre el kanban y lo que está fuera de él: el botón "Nueva tarjeta" de la barra superior y el
 * atajo `n` del `AppShell` llaman a lo que la vista registre con `useRegisterNewCard`.
 */
export function NewCardProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<(() => void) | null>(null);
  const value = useMemo(() => ({ action, setAction }), [action]);
  return <NewCardContext.Provider value={value}>{children}</NewCardContext.Provider>;
}

export function useNewCardAction(): (() => void) | null {
  const ctx = useContext(NewCardContext);
  if (!ctx) throw new Error('useNewCardAction requiere <NewCardProvider>');
  return ctx.action;
}

export function useRegisterNewCard(action: () => void): void {
  const ctx = useContext(NewCardContext);
  if (!ctx) throw new Error('useRegisterNewCard requiere <NewCardProvider>');
  const { setAction } = ctx;
  useEffect(() => {
    // `setAction` recibe una función: se envuelve para que React no la tome por un actualizador.
    setAction(() => action);
    return () => setAction(null);
  }, [action, setAction]);
}

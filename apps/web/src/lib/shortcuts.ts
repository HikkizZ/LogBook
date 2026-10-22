/** Tabla de atajos de docs/spec/02_diseno.md §6.2, para el diálogo de ayuda (`?`). */
export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: '/ o Ctrl+K', action: 'Buscar' },
  { keys: 'n', action: 'Nueva tarjeta (en el proyecto actual)' },
  { keys: '[', action: 'Colapsar o expandir la barra lateral' },
  { keys: 'g d / g w / g t', action: 'Ir a Mi día / Mi semana / Línea de tiempo' },
  { keys: 'j / k', action: 'Tarjeta siguiente / anterior en la columna' },
  { keys: 'h / l', action: 'Columna anterior / siguiente' },
  { keys: 'Enter', action: 'Abrir la tarjeta enfocada' },
  { keys: 'Espacio', action: 'Tomar o soltar la tarjeta enfocada (flechas para mover)' },
  { keys: 'm', action: 'Menú "Mover a…" sobre la tarjeta enfocada' },
  { keys: 'e', action: 'Editar el título (en el panel)' },
  { keys: 'Ctrl+Enter', action: 'Guardar entrada de bitácora o título' },
  { keys: 'Esc', action: 'Cerrar panel o diálogo, o cancelar la edición' },
  { keys: '?', action: 'Mostrar esta tabla' },
];

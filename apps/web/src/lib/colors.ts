import type { LabelColor, ProjectColor } from 'shared';

/** Clases completas (Tailwind las necesita literales) para las claves de color de proyecto/etiqueta. */
export const PROJECT_DOT_CLASS: Record<ProjectColor, string> = {
  violeta: 'bg-project-violeta',
  magenta: 'bg-project-magenta',
  cafe: 'bg-project-cafe',
  pizarra: 'bg-project-pizarra',
  turquesa: 'bg-project-turquesa',
  oliva: 'bg-project-oliva',
};

/** Punto sobre la sidebar (#03363D): el acento da 2,2:1, el suave ≥ 12:1 (D-5). */
const PROJECT_DOT_SOFT_CLASS: Record<ProjectColor, string> = {
  violeta: 'bg-project-violeta-soft',
  magenta: 'bg-project-magenta-soft',
  cafe: 'bg-project-cafe-soft',
  pizarra: 'bg-project-pizarra-soft',
  turquesa: 'bg-project-turquesa-soft',
  oliva: 'bg-project-oliva-soft',
};

/** Chip de proyecto o etiqueta: texto en acento sobre fondo suave (§2.3, §2.4). `gris` usa los tokens neutros. */
export const COLOR_KEY_CHIP_CLASS: Record<LabelColor, string> = {
  violeta: 'bg-project-violeta-soft text-project-violeta',
  magenta: 'bg-project-magenta-soft text-project-magenta',
  cafe: 'bg-project-cafe-soft text-project-cafe',
  pizarra: 'bg-project-pizarra-soft text-project-pizarra',
  turquesa: 'bg-project-turquesa-soft text-project-turquesa',
  oliva: 'bg-project-oliva-soft text-project-oliva',
  gris: 'bg-surface-hover text-neutral',
};

/** El campo `color` de la API es `string`; si llega una clave desconocida se usa `gris`. */
export function isColorKey(value: string): value is LabelColor {
  return value in COLOR_KEY_CHIP_CLASS;
}

export function projectDotClass(color: string): string {
  return color in PROJECT_DOT_CLASS ? PROJECT_DOT_CLASS[color as ProjectColor] : 'bg-fg-muted';
}

export function projectDotSoftClass(color: string): string {
  return color in PROJECT_DOT_SOFT_CLASS
    ? PROJECT_DOT_SOFT_CLASS[color as ProjectColor]
    : 'bg-sidebar-fg-muted';
}

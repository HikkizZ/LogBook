# Logbook — diseño

Cómo se ve y cómo se comporta la interfaz. Estilo **Zendesk Garden**: sidebar verde petróleo, superficies blancas sobre fondo gris muy claro, bordes finos, densidad media, nada de columnas de colores. El estado de una tarjeta se lee por un borde o un punto, no por el fondo de la columna. Requisitos funcionales en [[01_especificacion]]; índice en [[00_logbook]].

Regla para quien programe: **nada de colores, tamaños ni radios sueltos en los componentes**. Todo sale de los tokens de §2, declarados en `@theme` de Tailwind v4 en `apps/web/src/styles/global.css`.

---

## 1. Principios

1. **Densidad media**: una tarjeta del kanban ocupa 2–3 líneas; en una pantalla de 1440 px caben 6 columnas sin scroll horizontal y ~8 tarjetas por columna sin scroll vertical.
2. **El color significa algo**: verde = hecho, ámbar = por vencer, rojo = vencido/bloqueado, azul = acción primaria. Los colores de proyecto son suaves y nunca se parecen a esos cuatro.
3. **La bitácora es protagonista**: el detalle de la tarjeta dedica la mitad del espacio a la bitácora, no a los metadatos.
4. **Teclado primero**: todo lo que se hace con el ratón se hace con teclado. Atajos documentados en §6.2.
5. **Preparado para oscuro, no implementado**: todos los tokens son variables CSS; el modo oscuro es redefinirlas bajo `[data-theme="dark"]`. No se hace en v1.

---

## 2. Tokens

### 2.1 Color (modo claro)

| Token | Valor | Uso |
|---|---|---|
| `--color-sidebar` | `#03363D` | fondo de la sidebar |
| `--color-sidebar-hover` | `#17494D` | hover y activo en la sidebar |
| `--color-sidebar-fg` | `#FFFFFF` | texto en la sidebar (13.1:1 ✓) |
| `--color-sidebar-fg-muted` | `#B8C4C8` | texto secundario en la sidebar (7.4:1 ✓). **Ajuste**: el secundario general `#68737D` da **2.7:1 sobre la sidebar, falla AA**; no usarlo ahí |
| `--color-bg` | `#F8F9F9` | fondo de la app |
| `--color-surface` | `#FFFFFF` | tarjetas, paneles, diálogos, inputs |
| `--color-surface-hover` | `#F2F4F5` | hover de filas y tarjetas |
| `--color-border` | `#D8DCDE` | bordes decorativos: tarjetas, divisores, cabeceras |
| `--color-border-strong` | `#87929D` | **bordes de controles de formulario** (inputs, selects, checkboxes): 3.2:1 sobre blanco ✓ (WCAG 1.4.11). **Ajuste**: `#D8DCDE` da 1.4:1 y no sirve como contorno de un control |
| `--color-fg` | `#2F3941` | texto principal (11.8:1 ✓) |
| `--color-fg-muted` | `#68737D` | texto secundario, metadatos (4.8:1 blanco ✓, 4.6:1 fondo ✓) |
| `--color-fg-placeholder` | `#68737D` | placeholders. **Ajuste**: un gris más claro tipo `#87929D` da 3.2:1 y falla para texto; se usa el mismo que el secundario, en itálica para distinguirlo |
| `--color-primary` | `#1F73B7` | botones primarios, enlaces, foco (5.0:1 texto sobre blanco ✓; blanco sobre él 5.0:1 ✓) |
| `--color-primary-hover` | `#185F96` | hover del primario (blanco encima 6.7:1 ✓) |
| `--color-neutral` | `#5E6A74` | texto de chips grises (Backlog, Por hacer, etiqueta `gris`) sobre `--color-surface-hover` (5.0:1 ✓) |
| `--color-primary-soft` | `#EDF7FF` | fondo de selección, chips informativos (`#1F73B7` encima: 4.6:1 ✓) |
| `--color-success` | `#038153` | hecho (4.9:1 ✓ en ambos sentidos) |
| `--color-success-soft` | `#EDF8F4` | fondo chip "hecho" (`#038153` encima: 4.5:1 ✓, justo) |
| `--color-warning` | `#AD5918` | por vencer ≤ 3 días, WIP superado (5.0:1 ✓) |
| `--color-warning-soft` | `#FFF8ED` | fondo chip "por vencer" (`#AD5918` encima: 4.7:1 ✓) |
| `--color-danger` | `#CC3340` | bloqueado, vencido, acciones destructivas (5.1:1 ✓) |
| `--color-danger-soft` | `#FDF2F3` | fondo chip "vencido"/"bloqueado" (`#CC3340` encima: 4.7:1 ✓) |
| `--color-focus` | `#1F73B7` | anillo de foco, 2 px + 2 px de offset blanco |

Verificación hecha el 2026-10-20 con la fórmula WCAG 2.x. Todas las combinaciones texto/fondo de esta tabla cumplen **AA (≥ 4.5:1)** y los contornos de control cumplen **1.4.11 (≥ 3:1)**. Las dos que fallaban (secundario sobre sidebar; borde `#D8DCDE` como contorno de input) tienen su token de reemplazo arriba.

### 2.2 Color por estado de tarjeta

El estado no se pinta en la columna. Se muestra como una **barra vertical de 3 px en el borde izquierdo** de la tarjeta y como un punto en listas (búsqueda, Mi día).

| Estado | Barra / punto | Chip (texto sobre fondo soft) |
|---|---|---|
| Backlog | `--color-border` (gris) | gris: `--color-neutral` (`#5E6A74`) sobre `--color-surface-hover` (5.0:1 ✓; `--color-fg-muted` ahí daría 4.4:1 y falla) |
| Por hacer | `--color-fg-muted` | gris |
| En curso | `--color-primary` | azul: `--color-primary` sobre `--color-primary-soft` |
| Revisión | `--color-primary` con barra discontinua (`border-left-style: dashed`) | azul |
| Bloqueado | `--color-danger` | rojo: `--color-danger` sobre `--color-danger-soft` |
| Hecho | `--color-success` | verde: `--color-success` sobre `--color-success-soft` |

### 2.3 Colores de proyecto ([pregunta 10] cerrada: aprobados el 2026-10-20)

Seis pares: un **acento** (para el punto junto al nombre y para el texto del chip) y un **suave** (fondo del chip y de las barras de la línea de tiempo). Elegidos lejos del verde, ámbar, rojo y azul de estado. Las claves son lo que se guarda en `project.color`.

| Clave | Acento | Suave | Acento sobre suave |
|---|---|---|---|
| `violeta` | `#6B5CA5` | `#EEEAF8` | 4.8:1 ✓ |
| `magenta` | `#A63A70` | `#FBEAF2` | 5.3:1 ✓ |
| `cafe` | `#8C5A3C` | `#F6EDE7` | 5.0:1 ✓ |
| `pizarra` | `#5B6B7F` | `#EDF0F3` | 4.8:1 ✓ |
| `turquesa` | `#1A6B7B` | `#E6F3F6` | 5.4:1 ✓ |
| `oliva` | `#5C6B1F` | `#F1F4E6` | 5.3:1 ✓ |

Medido el 2026-10-20. Mi primera propuesta tenía magenta `#B5457D`, turquesa `#1F7A8C` y oliva `#6A7A2A`, que daban 4.2–4.4:1 sobre su suave (fallaban AA); los oscurecí. Todos los acentos dan ≥ 5:1 sobre blanco, así que sirven también como texto suelto (nombre del proyecto en una lista). Sobre las barras de la línea de tiempo el texto va en `--color-fg` (≥ 10:1 sobre cualquier suave). Si al verlos alguno choca con los de estado (turquesa vs sidebar es el que más dudo), se reemplaza; la clave queda.

En la revisión de la fase 3 medí los seis acentos sobre `--color-sidebar` (`#03363D`): dan **2,15–2,41:1**, no solo el turquesa. No los reemplazo: el acento es para fondos claros (barra superior, listas, chips). Sobre la sidebar el punto de proyecto usa el **suave** (≥ 12:1 sobre el verde), ver §3 (decidido 2026-10-22).

### 2.4 Colores de etiqueta

Mismas seis claves que los proyectos más `gris` (acento `#5E6A74` sobre suave `#F2F4F5`, 5.0:1 ✓; el secundario `#68737D` sobre ese gris da 4.4:1 y falla, por eso el acento gris es un token aparte: `--color-neutral`). Las etiquetas se muestran como chips pequeños con texto en acento sobre suave; nunca llenas de color.

### 2.5 Tipografía

- Familia: **Inter** autoalojada (`@fontsource-variable/inter`), `font-feature-settings: "cv11", "ss01"` opcional; fallback `system-ui, sans-serif`.
- Monoespaciada para IDs, sha y nombres de rama: `ui-monospace, "Cascadia Mono", Consolas, monospace`.

| Token | Tamaño / interlineado / peso | Uso |
|---|---|---|
| `--text-xs` | 12 / 16 / 500 | IDs, metadatos, chips |
| `--text-sm` | 13 / 18 / 400 | títulos de tarjeta en kanban, cuerpo de listas |
| `--text-base` | 14 / 20 / 400 | cuerpo general, inputs, bitácora |
| `--text-md` | 16 / 24 / 600 | título de tarjeta en el detalle, cabeceras de columna |
| `--text-lg` | 20 / 28 / 600 | título de vista ("Mi semana") |

Nada por debajo de 12 px. Pesos: 400, 500, 600 (no 700).

### 2.6 Espaciado, radios, sombras

- Escala de espaciado: `4, 8, 12, 16, 24, 32` px. No hay tokens `--space-*`: el espaciado sale de la escala `--spacing` de Tailwind (0,25 rem) con los multiplicadores `1, 2, 3, 4, 6, 8` (`gap-4`, `p-6`, …). Los `--space-1..6` que declaré en la fase 3 no los usaba nada y los eliminé (decidido 2026-10-22). La escala no se impone por CSS; se revisa a ojo (nada de `mb-5`).
- Radios: `--radius-sm: 4px` (chips, inputs, botones), `--radius-md: 6px` (tarjetas, paneles, diálogos). Nada más redondo.
- Sombras: `--shadow-card: 0 1px 2px rgb(0 0 0 / 6%)` (tarjeta en reposo), `--shadow-lift: 0 4px 12px rgb(0 0 0 / 12%)` (tarjeta arrastrándose, diálogos). Sin más niveles.
- Anchos fijos: `--container-dialog: 420px` (diálogo de §4.3), `--container-dialog-wide: 560px` (diálogo de atajos de §6.2), `--container-login: 360px` (formulario de login de §4.8).
- Scrim: `--color-scrim: rgb(0 0 0 / 40%)`, el fondo oscurecido del `Dialog` (§5).
- Skeleton: `--animate-skeleton: skeleton 1.6s ease-in-out infinite` (keyframe `skeleton`: opacidad 0,5 al 50 %), la "animación suave" de carga de §5.
- Transiciones: 120 ms `ease-out` para hover/foco; 180 ms para abrir el panel de detalle. Desactivadas bajo `prefers-reduced-motion`.

Los cuatro tokens de anchos, scrim y skeleton aparecieron en la fase 3 y los documento aquí para que §2 siga siendo la única fuente (decidido 2026-10-22).

### 2.7 Declaración en Tailwind v4

```css
@import "tailwindcss";
@theme {
  --color-sidebar: #03363D;
  --color-sidebar-hover: #17494D;
  /* ...todos los tokens de 2.1 y 2.3... */
  --font-sans: "Inter Variable", system-ui, sans-serif;
  --font-mono: ui-monospace, "Cascadia Mono", Consolas, monospace;
  --radius-sm: 4px;
  --radius-md: 6px;
  --color-scrim: rgb(0 0 0 / 40%);
  --container-dialog: 420px;
  --container-dialog-wide: 560px;
  --container-login: 360px;
  --animate-skeleton: skeleton 1.6s ease-in-out infinite;
}
```

Para modo oscuro después: mover los valores a `:root { ... }` y usar `@theme inline` apuntando a esas variables, redefiniéndolas bajo `[data-theme="dark"]`. En v1 basta `@theme` directo; la migración a `inline` es mecánica.

---

## 3. Layout

```
┌──────────┬──────────────────────────────────────────────────────┐
│ sidebar  │ barra superior: título de vista · filtros · buscar · + │
│ 240 px   ├──────────────────────────────────────────────────────┤
│          │                                                      │
│ Mi día   │   contenido (kanban / Mi día / timeline / tokens)    │
│ Mi semana│                                                      │
│ Timeline │                                                      │
│ ──────   │                                           ┌──────────┤
│ PROYECTOS│                                           │ panel    │
│ ● SIGA   │                                           │ detalle  │
│ ● Portaf.│                                           │ 480 px   │
│ ● Pers.  │                                           │          │
│ ──────   │                                           │          │
│ Etiquetas│                                           │          │
│ Tokens   │                                           │          │
└──────────┴───────────────────────────────────────────┴──────────┘
```

- **Sidebar** fija de 240 px, fondo `--color-sidebar`, texto blanco, ítem activo con fondo `--color-sidebar-hover` y barra blanca de 3 px a la izquierda. Secciones: vistas globales (Mi día, Mi semana, Línea de tiempo), proyectos (punto con el color **suave** del proyecto + nombre + contador de "En curso"), al pie: Etiquetas, Tokens, Ajustes. Colapsable a 56 px (solo iconos) con `[` ; estado recordado en `localStorage`. El punto va en suave y no en acento porque el acento sobre `#03363D` da ~2:1 y no distingue nada; sobre blanco (barra superior, listas) el punto sigue en acento (decidido 2026-10-22, §2.3).
- **Barra superior** de 56 px, fondo `--color-surface`, borde inferior `--color-border`. Izquierda: título de la vista (y nombre del proyecto con su punto). Centro/derecha: filtros, campo de búsqueda (`/`), botón primario "Nueva tarjeta" (`n`).
- **Contenido** con padding 24 px sobre `--color-bg`.
- **Panel de detalle** de tarjeta: lateral derecho de 480 px que se superpone al contenido (no lo empuja), con sombra `--shadow-lift`; se cierra con `Esc` o clic fuera. La URL cambia a `/p/<slug>/T-42` para poder enlazar. En pantallas < 1024 px ocupa todo el ancho.
- **Responsive**: la app está pensada para escritorio (uso en el trabajo y en el PC). Mínimo soportado 1024 px; bajo eso el kanban hace scroll horizontal y la sidebar se colapsa. No hay layout móvil (fuera de alcance).

---

## 4. Vistas

### 4.1 Kanban (`/p/<slug>`)

- Seis columnas de **ancho igual** (`minmax(10rem, 1fr)`), separadas por 16 px, **sin fondo**: solo una cabecera con nombre, contador (`En curso 4/3` en ámbar si supera WIP) y botón `+` para tarjeta rápida en todas las columnas **menos Bloqueado** (RF-14 exige motivo también al crear ahí, y una tarjeta rápida que abre un diálogo ya no es rápida; si la quiero bloqueada, la creo en Por hacer y la muevo). Antes decía `minmax(220px, 1fr)` y nunca cupo: a 1440 px el contenido mide 1440 − 240 de sidebar − 48 de padding = 1152 px, y seis columnas de 220 más cinco huecos de 16 suman 1400, contra el principio 1. Con 160 px de mínimo caben con ~178 px cada una (títulos de 13 px a dos líneas y dos chips: justo pero legible); bajo 1024 px hace scroll horizontal como dice §3 (decidido 2026-10-22).
- El contador de la cabecera cuenta **todas** las tarjetas de la columna, no las que deja ver el filtro: el WIP mide trabajo real y un `1/3` con `?label=bug` mentiría (decidido 2026-10-22).
- Tarjeta (`CardTile`): superficie blanca, borde `--color-border`, radio `--radius-md`, sombra `--shadow-card`, padding 12 px, barra de estado izquierda de 3 px. Contenido en orden: línea 1 `T-42` en mono `--text-xs` muted + chips de etiqueta a la derecha (máximo **2 chips**; el resto se resume en un chip "+N" con texto para lector, porque en ~178 px no caben más; decidido 2026-10-22); línea 2 título `--text-sm` en `--color-fg` (máximo 2 líneas, elipsis); línea 3 (solo si hay algo): fecha límite con icono y color por urgencia, `2/5` del checklist, punto de prioridad (`urgent` rojo, `high` ámbar, `medium` sin punto, `low` gris). Nada más: la descripción no se muestra en el kanban.
- Texto de la fecha límite (función `dueInfo` en `lib/dates.ts`; la misma la usan Mi día y la línea de tiempo, no se reescribe; decidido 2026-10-22):

  | Diferencia con hoy | Texto | Color |
  |---|---|---|
  | hace ≥ 2 días | "vencida hace N días" | `--color-danger` |
  | hace 1 día | "vencida ayer" | `--color-danger` |
  | hoy | "vence hoy" | `--color-warning` |
  | mañana | "vence mañana" | `--color-warning` |
  | en 2 o 3 días | "vence en N días" | `--color-warning` |
  | más de 3 días | fecha corta ("14 oct") | `--color-fg-muted` |

  En Hecho la fecha va siempre en muted con la fecha corta, aunque haya pasado: ya no "vence" (RF-25). Es el "icono + texto" de §6.1 y evita "hace 1 días".
- **Bloqueado** y **Hecho** van después de Revisión para que el flujo normal (Backlog → Hecho) se lea de izquierda a derecha; Bloqueado interrumpe visualmente, a propósito.
- Columna Hecho: muestra solo los últimos `doneDaysVisible` días de Ajustes (14 por defecto) y un botón "Ver todo (23)" al pie; al expandir, "Ver solo los últimos 14 días". N es el total **con el filtro aplicado**, porque el botón habla de lo que voy a ver al pulsarlo (al revés que el contador de la cabecera). Consideré "Ver N más" con las ocultas y me quedo con "Ver todo (N)" (decidido 2026-10-22).
- Tarjeta rápida: al presionar `+` aparece un input en la parte superior de la columna; `Enter` crea y abre otro; `Esc` cancela.
- Columna destino durante el arrastre: **contorno discontinuo de 2 px `--color-border-strong`** sobre toda la columna, **sin relleno**. Descarté el relleno `--color-primary-soft` porque dejaba el contador y "Nada aquí" (`fg-muted`) en 4,45:1 y el hueco en 2,9:1, por debajo de §6.1; el contorno no toca ningún texto y es el mismo lenguaje que el placeholder de la tarjeta en §5 (decidido 2026-10-22). El hueco (placeholder) se queda en la columna de **origen**; no se previsualiza en la de destino en esta fase (es el patrón "mover en `onDragOver`" de dnd-kit, un cambio mediano): posible mejora si tras una semana de uso lo echo de menos (decidido 2026-10-22).
- Filtros (RF-18) en la barra superior: etiqueta, prioridad y texto; el de texto busca solo en `T-42` + título, no en la descripción (el kanban no la muestra, buscar en ella sorprendería). Con algún filtro activo aparece un botón "Limpiar" que los quita todos de una vez (decidido 2026-10-22).
- Estado vacío de columna: texto muted "Nada aquí" en `--text-sm`, centrado, 24 px de padding. Estado vacío de proyecto: ilustración no; solo "Crea tu primera tarjeta" con el botón, que abre la tarjeta rápida de Por hacer; una vez abierta, el tablero con sus "Nada aquí" se queda aunque cancele (decidido 2026-10-22).

### 4.2 Detalle de tarjeta (panel)

Dos zonas verticales:

**Cabecera** (fija): `T-42` mono + botón copiar · chip de estado · botón cerrar. Debajo, el título editable en línea (`--text-md`, clic para editar, `Enter` guarda). Fila de metadatos en dos columnas: Proyecto (nombre con punto, **solo lectura**; se cambia desde `⋯` → Mover a otro proyecto, porque un `select` que mueve al cambiar es justo el "mover por accidente" que RF-28 no quiere; decidido 2026-10-26), Prioridad, Fecha inicio, Fecha límite, Etiquetas (multi-select con chips: un botón que abre un grupo de casillas nativas, ver §5). Las etiquetas se aplican de forma **optimista** en el selector y en el kanban (colores desde la caché de `labels`; la respuesta del `PATCH` normaliza), para que marcar dos o tres seguidas no pierda la primera (decidido 2026-10-26). Fila "Rama sugerida": `feat/T-42-slug` en mono con botón copiar.

**Cuerpo** (scroll): pestañas **Bitácora** (por defecto) · **Descripción** · **Checklist** (`2/5`) · **GitHub** (v2, solo si el proyecto tiene repo).

- *Bitácora*: lista cronológica ascendente (lo más nuevo abajo, como un chat) con fecha relativa ("hoy 14:32", "ayer", "mar 14 oct") y absoluta en tooltip. Entradas de sistema (`moved`, `commit`, `pr`) en `--color-fg-muted`, con icono pequeño, una línea; no se editan, pero sí llevan "Borrar" con la misma confirmación que las notas (RF-32): un arrastre equivocado deja un `moved` que ensucia la bitácora y el `/summary` (decidido 2026-10-26). Entradas `blocked` con punto rojo y el texto "Bloqueado". Al pie, fijo: textarea "Avancé… / quedó…" con `Ctrl+Enter` para guardar y un selector de **fecha y hora** (`datetime-local`, interpretado en la zona de Ajustes) oculto tras "Otra fecha": la bitácora ordena por `occurredAt` y "ayer a las 16:00" es la nota típica de la mañana siguiente; una fecha sola la pondría a medianoche (decidido 2026-10-26). Toggle "Solo mis notas".
- *Descripción*: markdown renderizado; clic en "Editar" cambia a textarea con vista previa **debajo** (no WYSIWYG): 480 − 32 de padding = 448 px, y dos columnas de ~200 px no sirven ni para el markdown ni para el textarea (decidido 2026-10-26).
- *Checklist*: ítems con checkbox, texto editable en línea, arrastre para ordenar, input al pie para agregar. Quitar un ítem **no pide confirmación**: es una línea corta y se vuelve a escribir; la nota de bitácora sí es texto largo y sí confirma (decidido 2026-10-26).

`Esc` dentro del panel va en **dos pasos** cuando hay un borrador: si el foco está en un campo de texto con contenido (nota de bitácora, formulario de creación), el primer `Esc` solo saca el foco del campo y el segundo cierra el panel; sin diálogo "¿Descartar?". Con el campo vacío, un `Esc` cierra. Es el mismo patrón de los editores de código y evita perder tres párrafos por un `Esc` reflejo (decidido 2026-10-26).

Acciones secundarias en un menú `⋯`: Mover a otro proyecto, Archivar.

### 4.3 Diálogo "Motivo del bloqueo"

Modal pequeño (420 px): título "¿Por qué queda bloqueada T-42?", textarea obligatorio, botones "Bloquear" (rojo, `--color-danger`) y "Cancelar". Cancelar devuelve la tarjeta a su columna original (el drop se revierte).

### 4.4 Mi día (`/today`) y Mi semana (`/week`)

- Cabecera: navegación `‹ hoy ›` o `‹ semana 43 ›`, selector de proyecto (todos por defecto), botón **"Copiar resumen"** (icono de portapapeles, confirmación "Copiado" 1,5 s).
- Cuerpo: un bloque por proyecto (punto + nombre); dentro, una fila por tarjeta (`T-42` + título + chip de estado) con sus entradas indentadas. Mi semana agrupa primero por día (cabecera "Martes 21") y dentro por proyecto.
- Sección final "Se movieron hoy": lista compacta `T-42 · Por hacer → En curso`.
- Estado vacío: "Sin registros este día" + enlace "Ir al tablero".

### 4.5 Línea de tiempo (`/timeline`, v1.5)

- Cabecera: zoom **Semana | Mes**, `‹ hoy ›`, selector de proyecto.
- Lienzo: columna izquierda fija de 260 px con `T-42 · título`; a la derecha la grilla de días (semana: 7 columnas de ≥ 120 px; mes: columnas por semana, ≥ 160 px). Fines de semana con fondo `--color-surface-hover`. Línea de hoy: 2 px `--color-primary` de alto completo con etiqueta "Hoy".
- Barra: alto 24 px, radio `--radius-sm`, fondo suave del proyecto, borde 1 px acento, texto (título truncado) en `--color-fg`. Vencida: borde y texto `--color-danger` + fondo `--color-danger-soft`. ≤ 3 días: ámbar. Bloqueada: trama rayada 45° con el acento al 30 %. Sin `due_date`: borde derecho discontinuo y la barra llega hasta hoy.
- Filas agrupadas por proyecto con cabecera plegable. Clic en barra abre el panel de detalle.

### 4.6 Búsqueda (`Ctrl+K` o `/`)

Paleta de comandos centrada (560 px): input arriba, resultados en dos grupos (Tarjetas / Bitácora) con fragmento resaltado en `--color-primary-soft`, proyecto y estado a la derecha. `↑↓` navega, `Enter` abre. Si el texto es `T-42`, el primer resultado es esa tarjeta. El fragmento (`snippet`) llega de la API como texto escapado con `<mark>` como único HTML: se inyecta solo tras `DOMPurify.sanitize(snippet, { ALLOWED_TAGS: ['mark'], ALLOWED_ATTR: [] })`, y el `<mark>` se pinta con `--color-primary-soft`; título, proyecto y todo lo demás van como texto. Las tarjetas archivadas aparecen con el chip "archivada" (decidido 2026-10-21).

### 4.7 Tokens (`/tokens`)

Tabla: nombre, prefijo (mono), creado, último uso, **vence**, botón "Revocar" (rojo, con confirmación). La columna "Vence" lleva fecha absoluta y, según cuánto falte, un chip al lado (RF-61): **≤ 14 días** → chip ámbar `--color-warning` sobre `--color-warning-soft` con texto "vence en N días" (icono de reloj; el color nunca va solo); **vencido** → chip rojo "vencido" y la fila en opacidad 60 % como las archivadas; **revocado** → chip gris "revocado", misma opacidad. Encima de la tabla, si algún token activo vence en ≤ 14 días, una franja de aviso (fondo `--color-warning-soft`, borde izquierdo 3 px `--color-warning`): "El token *Claude Code PC* vence el 18 ene. Crea uno nuevo y actualiza el `env` de la skill; el viejo se puede revocar después." Botón "Nuevo token" → diálogo con nombre → pantalla que muestra el token **una vez** en un bloque mono con botón copiar, debajo "Vence el <fecha> (90 días)" y el aviso "No se vuelve a mostrar". En esa pantalla el foco inicial va en **"Copiar"** y, tras copiar con éxito, pasa a "Listo": si cayera en "Listo", un segundo `Enter` por reflejo cerraría el diálogo con el token sin copiar; sin confirmación extra al cerrar (decidido 2026-10-26). No hay botón "renovar": renovar es crear uno nuevo.

### 4.8 Etiquetas, Ajustes, Login

- Etiquetas: lista editable con nombre, selector de color (las 7 claves), botón borrar con confirmación "Se quita de N tarjetas".
- Ajustes: zona horaria (es la que agrupa Mi día / Mi semana y define "hoy"; texto de ayuda que lo diga), días visibles en Hecho (1..365), WIP por defecto para proyectos nuevos (0..32767) (decidido 2026-10-21). Al pie, una sección **"Sesión"** separada por un divisor: texto muted "Tu sesión vence tras 12 h sin uso o 7 días después de entrar" y dos botones: "Salir" (secundario; `POST /auth/logout`) y **"Cerrar todas las sesiones"** (destructivo; diálogo "Se cerrará la sesión en todos los navegadores, incluido este. Los tokens de API no se tocan." → `POST /auth/logout-all` → ir a `/login`, RF-64).
- Login: pantalla centrada, logo texto, un campo contraseña (`autocomplete="current-password"`), botón "Entrar". Error genérico "Contraseña incorrecta". Tras 5 intentos fallidos la API responde 429: mostrar "Demasiados intentos, espera 15 minutos" (no un error genérico). Al entrar, la sesión queda en una cookie `httpOnly` que el frontend no ve ni guarda: no hay token en `localStorage`; la UI sabe si está autenticada preguntando `GET /me`. Cuando la sesión vence (12 h sin uso / 7 días) cualquier llamada responde 401 y la UI vuelve a `/login` con un aviso en la pantalla: "Tu sesión venció, vuelve a entrar" (texto muted bajo el formulario; no un toast, porque la pantalla cambió).

---

## 5. Componentes y estados

Componentes en `apps/web/src/components/ui/`. Cada uno tiene todos los estados de esta tabla; el kit (`/_kit`, **solo en desarrollo**) los muestra todos. No se borra: es la única comprobación visual de esta tabla y lo necesito en cada fase. La ruta se registra solo con `import.meta.env.DEV`, así que Vite la deja fuera del bundle de producción (decidido 2026-10-22).

| Componente | Reposo | Hover | Foco (teclado) | Activo / seleccionado | Deshabilitado |
|---|---|---|---|---|---|
| `Button` primario | fondo primary, texto blanco, radio sm, 32 px alto | primary-hover | anillo focus 2 px + offset 2 px | fondo primary-hover, translate 0 | opacidad 50 %, cursor not-allowed |
| `Button` secundario | surface, borde border-strong, texto fg | surface-hover | anillo | borde primary | ídem |
| `Button` destructivo | texto danger, borde danger | fondo danger-soft | anillo (color danger) | — | ídem |
| `Input` / `Textarea` | surface, borde border-strong, 32 px | borde fg-muted | borde primary + anillo | — | fondo bg, texto muted |
| `Select` | como Input, chevron a la derecha | ídem | ídem | lista nativa del navegador (v1, sin resaltado propio); el multi-select de etiquetas de la fase 5 es propio: un botón con chips que abre un grupo de **casillas nativas** (`checkbox` da teclado, estado y anuncio gratis; un `listbox` propio sería más código y peor en NVDA), y la casilla marcada lleva primary-soft (decidido 2026-10-22; casillas en vez de listbox, decidido 2026-10-26) | ídem |
| `Checkbox` | 16 px, borde border-strong, radio 4 | borde primary | anillo | fondo primary, check blanco | opacidad 50 % |
| `Chip` (estado, etiqueta, proyecto) | texto acento sobre soft, 20 px alto, radio sm, xs | — | — | — | — |
| `CardTile` | §4.1 | sombra lift ligera, borde fg-muted | anillo + borde primary | arrastrando: sombra lift, rotación 1°, opacidad 90 %; placeholder: contorno discontinuo border-strong | archivada: opacidad 60 % |
| `ColumnHeader` | nombre md + contador muted | — | — | WIP superado: contador warning + fondo warning-soft en el contador | — |
| `Column` | sin fondo, cabecera + lista | — | — | destino del arrastre: contorno discontinuo 2 px border-strong, sin relleno (§4.1, decidido 2026-10-22) | — |
| `SidebarItem` | sidebar-fg-muted | sidebar-hover, texto blanco | anillo blanco (sobre verde) | sidebar-hover, barra blanca izquierda, texto blanco | — |
| `Dialog` | surface, radio md, sombra lift, fondo oscurecido 40 % | — | foco atrapado dentro | — | — |
| `Toast` | surface, borde izq. 3 px (success/danger), 4 s, esquina inferior derecha | — | — | con acción (p. ej. "Reintentar"): no se cierra solo, queda hasta cerrarlo o usar la acción | — |
| `Tooltip` | fg sobre fondo `#2F3941`, texto blanco, xs, 300 ms de retardo | — | aparece también con foco | — | — |

Toasts: los que llevan un botón de acción no se cierran solos (un "Reintentar" que se esfuma a los 4 s no se alcanza con teclado); los demás siguen con sus 4 s (decidido 2026-10-22).

Carga: skeletons grises (`surface-hover`) con animación suave; nunca spinners de página completa salvo el primer arranque. Error de red: toast rojo + reintento; `401` → ir al login (con el aviso de sesión vencida de §4.8); `403` → toast rojo con el `message` de la API (no debería ocurrir desde la UI: significa que faltó el header CSRF o el `Origin` no coincide, es decir, un bug).

---

## 6. Accesibilidad

### 6.1 Reglas

- Contraste: los tokens de §2.1 ya están verificados; **cualquier combinación nueva se verifica antes de usarla** (≥ 4.5:1 texto, ≥ 3:1 contornos e iconos informativos).
- El color **nunca es el único indicador**: la urgencia lleva icono + texto ("vence en 2 días"); el estado lleva texto en el chip; WIP superado lleva el número (`4/3`) y un texto solo para lector ("4 tarjetas, límite 3: límite superado"). Ese contador es **todo** el aviso de RF-13: sin franja ni toast (decidido 2026-10-22).
- Foco visible siempre (`:focus-visible`), anillo 2 px `--color-focus` con offset; en la sidebar, anillo blanco.
- Objetivos de clic ≥ 32 px en escritorio (no hay móvil); botones de icono con `aria-label`.
- Jerarquía: un `h1` por vista (título en la barra superior), `h2` por columna/proyecto, `h3` por tarjeta en Mi día.
- Panel de detalle: `role="dialog"`, `aria-labelledby` al título, foco atrapado, `Esc` cierra, al cerrar el foco vuelve a la tarjeta.
- Drag & drop con `@dnd-kit`: anuncios en vivo (`aria-live`) "T-42 tomada", "T-42 sobre En curso, posición 2", "T-42 soltada en la columna Hecho", "Movimiento cancelado. T-42 sigue en su sitio"; sensor de teclado activado. Reglas de los anuncios (decidido 2026-10-22):
  - "posición N" es la posición **visible** (con el filtro o la ventana de Hecho aplicados), que es la que tiene sentido para quien escucha; la API recibe el índice real sobre la columna completa. No "arreglarlo" al revés.
  - Con teclado, "sobre X" significa **siempre antes de X** (con ratón, después si suelto en la mitad inferior de X), y el anuncio al soltar describe la posición real resultante, no la tarjeta sobre la que estaba: así lo que oigo coincide con dónde cae.
  - El arrastre por teclado usa un `coordinateGetter` propio (el `sortableKeyboardCoordinates` de dnd-kit no está pensado para varias columnas y exigía dos `→` para cruzar): `←`/`→` solo consideran tarjetas de **otras columnas** (o la columna si está vacía) y van a la misma fila de la columna vecina en una pulsación; `↑`/`↓` solo consideran tarjetas de la **misma columna**. Es una función pura de rectángulos y lleva test unitario.
- `prefers-reduced-motion`: sin transiciones ni rotación al arrastrar.
- Idioma: `<html lang="es">`.

### 6.2 Atajos de teclado

| Tecla | Acción |
|---|---|
| `/` o `Ctrl+K` | buscar |
| `n` | nueva tarjeta (en el proyecto actual) |
| `[` | colapsar/expandir sidebar |
| `g d` / `g w` / `g t` | ir a Mi día / Mi semana / Timeline |
| `j` / `k` | tarjeta siguiente / anterior en la columna |
| `h` / `l` | columna anterior / siguiente |
| `Enter` | abrir la tarjeta enfocada |
| `Space` | tomar/soltar la tarjeta enfocada (modo arrastre por teclado de dnd-kit; flechas para mover). Durante el arrastre, `Enter` también suelta (no abre la tarjeta) y `Esc` cancela; `j/k/h/l` y `m` quedan inactivos hasta soltar (decidido 2026-10-22) |
| `m` | menú "Mover a…" sobre la tarjeta enfocada (alternativa al arrastre) |
| `e` | editar título (en el panel) |
| `Ctrl+Enter` | guardar entrada de bitácora / título |
| `Esc` | cerrar panel, diálogo o cancelar edición. En el panel, si el foco está en un campo de texto con contenido, el primer `Esc` solo sale del campo y el segundo cierra (§4.2, decidido 2026-10-26) |
| `?` | mostrar esta tabla |

Los atajos de una letra no se activan cuando el foco está en un input.

Mi teclado es **latinoamericano**: `[` se escribe con AltGr, que en Windows llega como `ctrlKey && altKey`. El detector de atajos trata AltGr como "sin modificador" para los atajos de un carácter, así que `[` funciona en cualquier distribución; Alt solo sigue descartando el evento (decidido 2026-10-22). `/` es Shift+7 y llega como `/` sin AltGr, no tiene este problema.

### 6.3 Checklist de revisión (fin de fase 5)

- [x] Navegar todo el kanban, mover una tarjeta y bloquearla solo con teclado. `Space` → `→`: el primer anuncio ya dice la columna vecina (una sola pulsación).
- [x] Lector de pantalla (NVDA): el arrastre anuncia origen y destino. (2026-10-26: Felipe siguió la guía de `docs/reviews/fase-5-detalle.md` §8, que cubre el arrastre del checklist del panel.)
- [x] Zoom del navegador al 200 %: sin scroll horizontal en la barra superior ni en el panel.
- [ ] Capturas del kit a 1024 y 1440 px.
- [x] Ninguna combinación de color fuera de la tabla de tokens (grep de `#` en `components/` debe dar cero).

Pendientes de la revisión #2 de la fase 5 ([[../reviews/fase-5-detalle]] §7), que solo se cierran con mi prueba manual con NVDA y zoom 200 % (guía en §8 de esa revisión; decidido 2026-10-26 dejarlos abiertos hasta entonces):

- [x] **D-1** (NVDA) — verificado por Felipe el 2026-10-26, sin cambios necesarios: los anuncios del checklist (`aria-live` de su `DndContext`) se oyen dentro del panel bajo `aria-modal`. Por construcción deberían (dnd-kit sin `container` deja la región viva dentro del diálogo); si no se oyen, el ajuste es `accessibility.container` con el `ref` del `tabpanel`.
- [x] **D-9** (zoom 200 %) — verificado por Felipe el 2026-10-26, sin cambios necesarios: cabecera del panel con tope de 55 vh (M-11: si la bitácora se queda sin sitio, bajar a 45 vh o pasar la cabecera menos la fila del ID al cuerpo con scroll) y barra superior sin scroll horizontal a 720 px CSS (M-12: `min-w-0` + `truncate` en el título, filtros que encojan o segunda fila bajo `lg`). Se decide con lo que mida.

---

## 7. Lo que dependía de preguntas abiertas ([[00_logbook]], todas cerradas el 2026-10-20)

- Nombre y logo (1): Logbook; en v1 el logo es el nombre en texto, `--text-md` 600, blanco sobre la sidebar.
- Paleta de proyectos (10): la de §2.3, aprobada.
- Columna Revisión (6): confirmada; el kanban tiene 6 columnas y Revisión lleva la barra discontinua de §2.2.
- Login y sesión (7, 12): cookie `httpOnly`, 12 h / 7 d; lo que afecta al diseño está en §4.7 (vencimiento de tokens) y §4.8 (Ajustes → Sesión, Login).

`TODO(diseño)` del código de la fase 3, resueltos el 2026-10-22 tras la revisión ([[../reviews/fase-3-diseno]]):

- `Select.tsx`: nativo en v1, §5 corregido; el multi-select de etiquetas (fase 5) será propio.
- `KitPage.tsx`: `/_kit` no se borra, queda solo en desarrollo; §5 corregido.

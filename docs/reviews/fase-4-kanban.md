# Revisión de la fase 4 — kanban (diseño, accesibilidad y código)

Fecha: 2026-10-22. Commit revisado: `ee56671` (`fase-4-kanban`). Revisé el código nuevo de `apps/web/src/` (`components/board/`, `pages/BoardPage.tsx`, `lib/board.ts`, `lib/dates.ts`, `api/queries.ts`, `app/NewCardContext.tsx` y los cambios en `AppShell`, `Topbar`, `KitPage`) contra [[../spec/02_diseno]] (§2, §3, §4.1, §4.3, §5, §6), [[../spec/03_plan_implementacion]] fase 4, RF-10..RF-18 y RF-26 de [[../spec/01_especificacion]] y [[../api]]. Lo que no se lee en el código lo miré en la fuente de `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0` y `@tanstack/query-core@5.104.5` (en `node_modules`), en el CSS compilado y en los tests. No levanté la API; lo que comprobé en el navegador antes de esta revisión (1440 px, 30 tarjetas) está citado donde corresponde.

Comandos: `pnpm --filter web test` → 11 archivos, **104 tests en verde**. `pnpm --filter web build` → `tsc` + `vite build` en verde (CSS 25,8 kB; JS 482 kB / 150 kB gzip; dnd-kit suma ~60 kB sobre la fase 3).

## Veredicto: **Aprobado con cambios**

Nada bloqueante. El tablero cumple lo que pide el plan: seis columnas sin scroll a 1440 px, WIP en ámbar con texto para lector, arrastre con ratón y teclado que persiste, optimismo con reversión probada contra msw, diálogo de motivo que revierte al cancelar, tarjeta rápida encadenada, filtros en la URL y `j/k/h/l`/`m`. Los tokens se respetan (el `grep` de hex en `components/` y `pages/` da cero) y el kit muestra los 6 estados × urgencias.

Tres hallazgos importantes, todos del arrastre por teclado: la doble pulsación de `→` para cambiar de columna (I-1), el anuncio "posición N" que no siempre coincide con dónde cae la tarjeta (I-2) y los atajos `j/k/h/l/m` que siguen vivos mientras hay una tarjeta tomada (I-3). El resto son menores. Opino sobre las diez decisiones en §5 y dejo las que me tocan en §6.

---

## 1. Diseño vs `02_diseno`

### 1.1 Tarjeta (`CardTile`, §4.1 y §5)

| Elemento / estado | Diseño | Código (`CardTile.tsx`) | |
|---|---|---|---|
| Superficie, borde, radio, sombra, padding | surface, border, md, shadow-card, 12 px | `bg-surface border-border rounded-md shadow-card p-3` (:234-238) | ✓ |
| Barra de estado 3 px | §2.2, Revisión discontinua | `border-l-3` + `STATUS_BAR` (:183-190); Revisión `[border-left-style:dashed]` | ✓ |
| Línea 1 | `T-42` mono xs muted + chips a la derecha | `font-mono text-xs text-fg-muted` + chips (:252-271) | ✓ (máx. 2 chips + "+N", ver nota) |
| Línea 2 | título sm fg, 2 líneas, elipsis | `line-clamp-2 text-sm text-fg` (:273) | ✓ |
| Línea 3 | solo si hay algo: fecha con icono y urgencia, `2/5`, punto de prioridad | `(due \|\| hasChecklist \|\| priority)` (:274); icono reloj/calendario; `2/5` con sr "Checklist: 2 de 5"; punto urgent rojo / high ámbar / low gris / medium sin punto, con sr-only (:200-204, :296-304) | ✓ |
| Descripción | no se muestra | no se muestra | ✓ |
| Hover | sombra lift, borde fg-muted | `hover:border-y-fg-muted hover:border-r-fg-muted hover:shadow-lift` (conserva la barra de estado) | ✓ |
| Foco | anillo + borde primary | `focus-visible:border-y-primary focus-visible:border-r-primary` + anillo global | ✓ |
| Arrastrando | sombra lift, rotación 1°, opacidad 90 % | `state="overlay"`: `rotate-1 opacity-90 shadow-lift motion-reduce:rotate-0` (:242-243) | ✓ |
| Placeholder | contorno discontinuo border-strong | `border-dashed border-border-strong bg-transparent` + contenido `invisible` (:236, :250) | ✓ |
| Archivada | opacidad 60 % | `opacity-60` (:244) | ✓ |

Notas: el tope de 2 chips con "+N" (`MAX_LABELS`, :206) no está en §4.1; con columnas de ~174 px es necesario y el "+N" lleva texto para lector. Lo anoto como decisión implícita, de acuerdo. La tarjeta es un `div` con `role="button"` y `tabIndex=0` (atributos de dnd-kit), así que el clic y `Enter` la abren y `Space` la toma: coherente con §6.2.

### 1.2 Columnas y tablero (§4.1, §5 `ColumnHeader`)

- Seis columnas de ancho igual, 16 px de separación, **sin fondo**: `grid-cols-[repeat(6,minmax(10rem,1fr))] gap-4` (Board.tsx:280). §4.1 dice `minmax(220px, 1fr)`; ver decisión 1 en §5.
- Cabecera: `h2` en `text-md` (16/24/600) ✓, contador `text-xs text-fg-muted` ✓, WIP superado → `bg-warning-soft text-warning` en el contador (Column.tsx:82) ✓ exactamente lo que pide §5. Botón `+` secundario de 32 px con `aria-label="Nueva tarjeta en …"` ✓.
- Orden Backlog → Por hacer → En curso → Revisión → Bloqueado → Hecho (`COLUMNS`, board.ts:105-112) ✓ RF-10.
- Hecho: últimos `doneDaysVisible` días (de `/settings`, con 14 por defecto) y "Ver todo (N)" al pie; al expandir, "Ver solo los últimos N días" (Column.tsx:115-126) ✓ RF-17.
- Estado vacío de columna: "Nada aquí" `text-sm text-fg-muted`, centrado, `p-6` (24 px) ✓ literal. Estado vacío de proyecto: "Crea tu primera tarjeta" + botón, sin ilustración (BoardPage.tsx:61-68) ✓ literal.
- Tarjeta rápida en la parte superior de la columna, `Enter` crea y deja otro campo, `Esc` cancela (QuickAdd.tsx) ✓; el input lleva `maxLength={200}`, el mismo tope que `titleSchema` en `shared`.
- Columna destino resaltada con `bg-primary-soft` al arrastrar (Column.tsx:72): no está en §5; ver decisión 6 y M-1.
- Skeleton de carga con la misma rejilla y `role="status"` ✓ §5.

### 1.3 Diálogo "Motivo del bloqueo" (§4.3)

420 px (`max-w-dialog` por defecto en `Dialog`), título "¿Por qué queda bloqueada T-42?", textarea obligatorio, "Bloquear" destructivo + "Cancelar", y cancelar no mueve (BlockReasonDialog.tsx) ✓ literal. Extras razonables: `Ctrl+Enter` envía (coherente con §6.2) y el formulario se remonta en cada apertura para que el texto no sobreviva a un cancelar (test lo cubre).

**Scrim**: en la captura no se veía el fondo oscurecido. En el código está: `Dialog.tsx:86` pone `bg-scrim` en el contenedor `fixed inset-0`, y el CSS compilado contiene `.bg-scrim{background-color:var(--color-scrim)}` con `--color-scrim:#0006` (= `rgb(0 0 0 / 40%)`). El diálogo va por portal a `document.body`, sin ancestros con `transform`/`filter` que lo rompan, y el `DragOverlay` ya se desmontó cuando el diálogo abre (`clearDrag()` corre antes de `requestMove`). Lo doy por **pérdida de la captura**, no por bug. Para cerrarlo a mano: con el diálogo abierto, `getComputedStyle(document.querySelector('[role=dialog]').parentElement).backgroundColor` debe dar `rgba(0, 0, 0, 0.4)`.

### 1.4 Tokens y tamaños

- Cero hex en `components/` y `pages/`. Todos los colores nuevos salen de tokens (`text-warning`, `bg-warning-soft`, `border-l-danger`, `bg-primary-soft`…).
- Tamaños fuera de la escala de §2.6: `w-36`/`w-32`/`w-44` de los filtros (BoardFilters.tsx:199-227) y `w-44` en el kit; `size-2` del punto de prioridad (8 px, dentro de la escala). Los anchos de los filtros son layout, no espaciado; no me molestan, pero el mismo criterio de M-7 de la fase 3 diría que vayan a un sitio con nombre. Ver M-6.
- `grid-cols-[repeat(6,minmax(10rem,1fr))]` está escrito tres veces (Board.tsx:280, BoardPage.tsx:90, KitPage.tsx). Ver M-6.

---

## 2. Accesibilidad (§6)

Lo que está bien y comprobé en el código y los tests:

- Región `aria-live` de dnd-kit con anuncios en español: "T-42 tomada.", "T-42 sobre En curso, posición 2.", "T-42 soltada en la columna Hecho.", "Movimiento cancelado. T-42 sigue en su sitio." (Board.tsx:212-227). Instrucciones para lector en `aria-describedby` (:56-57). `aria-roledescription="tarjeta arrastrable"` (SortableCard.tsx:146). Test en BoardDrag.test.tsx:186-202 y BoardPage.test.tsx:609-634.
- Foco tras soltar y tras "Mover a…": `pendingFocus` + efecto sobre `[cards]` devuelve el foco a la tarjeta remontada en la otra columna (Board.tsx:133-142); test BoardPage.test.tsx:176. Tras cancelar el diálogo de bloqueo, `Dialog` devuelve el foco al elemento que lo tenía (la tarjeta) y la tarjeta no se movió (test :287-312).
- Diálogo de motivo: foco entra al textarea (`data-autofocus`), `Esc` cancela, error con `role="alert"` + `aria-invalid` + `aria-describedby`, "Escribe al menos 3 caracteres." con el mínimo sacado de `BLOCK_REASON_MIN` de `shared`. Tests :249-312.
- `j/k/h/l` recorren tarjetas y saltan columnas vacías; `m` abre "Mover a…" con el ID; `Enter` abre; `Space` toma sin navegar; ninguno actúa en un input ni con modal abierto (tests :507-607). Enter durante el arrastre suelta y **no** abre (`e.defaultPrevented`, SortableCard.tsx:159-170; test :585-597).
- Clic tras un arrastre con ratón no abre la tarjeta: dnd-kit detiene la propagación del `click` en captura una vez activado el arrastre (`AbstractPointerSensor`, core.esm.js:1506). Con `distance: 5`, el clic quieto sí abre.
- `h2` por columna, `section[aria-labelledby]` (seis regiones con nombre; aceptable para un tablero y es lo que usan los tests). Contador con `sr-only` "4 tarjetas, límite 3: límite superado" (Column.tsx:86-90). Botón "Nueva tarjeta" con `aria-keyshortcuts="n"`.
- `prefers-reduced-motion` anula la rotación (`motion-reduce:rotate-0`) y las transiciones de dnd-kit (regla global con `!important`).

Contrastes de combinaciones **nuevas** (fórmula WCAG 2.x, calculados hoy):

| Combinación | Dónde | Ratio | |
|---|---|---|---|
| `#AD5918` sobre `#FFF8ED` | contador WIP superado | 4,7:1 | ✓ |
| `#AD5918` sobre blanco | "vence en 2 días", "vence hoy" | 5,0:1 | ✓ |
| `#CC3340` sobre blanco | "vencida hace 3 días" | 5,1:1 | ✓ |
| `#68737D` sobre blanco | `T-42`, fecha lejana, `2/5` | 4,8:1 | ✓ |
| `#1F73B7` sobre `#F8F9F9` | "Ver todo (N)" | 4,75:1 | ✓ |
| `#2F3941` sobre `#EDF7FF` | `h2` de la columna resaltada | 10,8:1 | ✓ |
| `#1F73B7` sobre `#EDF7FF` | "Ver todo" en la columna resaltada | 4,6:1 | ✓ |
| `#68737D` sobre `#EDF7FF` | contador y "Nada aquí" en la **columna resaltada** al arrastrar | **4,45:1** | ✗ (transitorio; M-1) |
| `#87929D` (placeholder discontinuo) sobre `#F8F9F9` | hueco en la columna de origen | 3,0:1 | ✓ justo (no texto, ≥ 3:1) |
| `#87929D` sobre `#EDF7FF` | hueco cuando se reordena **dentro** de la columna resaltada | **2,9:1** | ✗ marginal (M-1) |
| puntos `#CC3340` / `#AD5918` / `#68737D` sobre blanco | prioridad | ≥ 4,8:1 | ✓ (y llevan texto sr-only) |

Hallazgos de accesibilidad: I-1, I-2, I-3, M-1, M-8, M-9, M-10 (abajo).

---

## 3. Código

### 3.1 Actualización optimista y reversión (`queries.ts:397-431`, `board.ts:195-220`)

- `onMutate` cancela la query, guarda `previous` y aplica `applyMove` (índice final acotado, renumeración `0..n-1` en origen y destino, `completedAt` al entrar/salir de Hecho): espejo fiel de lo que hace `POST /move`. Tests en board.test.ts:16-67.
- `onError` restaura `previous` y avisa; "Reintentar" solo con `status === 0` (red), como pide §5. El 409 de proyecto archivado revierte y muestra el `message` de la API (test BoardPage.test.tsx:213-235) ✓.
- **Dos movimientos seguidos**: el `onSettled` salta la invalidación si `isMutating({ mutationKey: ['move-card'] }) > 1` (queries.ts:424). Verifiqué en `query-core/mutation.js:195-198` que `onSettled` corre **antes** del `dispatch({ type: 'success' })`, así que la mutación que termina sigue contando como `pending`: el `> 1` es correcto (con `> 0` nunca se invalidaría). Casos: A termina con B en vuelo → A no invalida, B sí; A falla con B en vuelo → A restaura un `previous` sin el cambio de B (parpadeo) y la invalidación de B lo arregla al llegar. Aceptable para uso personal; lo anoto, no lo pido.
- `applyMove` no completa `startDate` al entrar a En curso (RF-15); el kanban no lo muestra y el refetch lo trae. Sin efecto visible.

### 3.2 `position` con filtros y ventana de Hecho (`board.ts:241-267`)

`resolveDrop` calcula el índice sobre la **columna completa** (con las ocultas por filtro o por la ventana de Hecho), no sobre la visible; misma columna = semántica de `arrayMove` (índice de la tarjeta sobre la que se suelta); otra columna = antes de ella, o después si cae en su mitad inferior; sobre la columna = sin `position` (al final). `isNoop` evita llamadas inútiles. Tests board.test.ts:69-105 y BoardDrag.test.tsx:86-104 (filtro activo). Correcto. El único hueco es el de I-2 (teclado y la mitad inferior).

### 3.3 Carga con cursor (`queries.ts:361-375`)

`do … while (cursor)` con `limit=200` (el máximo de la API). El cursor de la API es opaco y monótono (`{ s, p, n }` del último ítem), así que en condiciones normales termina. Pero si un día la API devolviera el mismo `nextCursor` (bug, proxy que cachea), el bucle no acaba y la pestaña se cuelga. Ver M-2.

### 3.4 Tarjeta rápida (`Board.tsx:161-171`)

Las altas se encadenan en una promesa (`createQueue`): tres `Enter` llegan en orden y cada una va al final de su columna; un fallo no corta la cadena (`catch` por alta) y ofrece "Reintentar". `useCreateCard.onSuccess` añade la tarjeta a la caché sin duplicarla (`appendCard`). Dos cosas menores: M-4 (carrera con un refetch en vuelo) y M-5 ("Reintentar" también para 400/409).

### 3.5 Listeners y limpieza

`useHotkeys` quita su `keydown`; `Dialog` quita `focusin` y restaura `overflow`; `useRegisterNewCard` deja `null` al desmontar; `AutoDismiss` limpia su temporizador; dnd-kit limpia sus sensores. No encontré fugas. El `pendingFocus` puede quedar pendiente si la tarjeta movida no se renderiza (no se me ocurre un caso real: la tarjeta conserva etiquetas y prioridad al moverse, y al entrar a Hecho cuenta como reciente), y en ese caso solo enfocaría esa tarjeta en el siguiente cambio de `cards`. No lo pido.

### 3.6 Lo que no revisé con el navegador pero sí con la fuente de dnd-kit

El arrastre con ratón usa `pointerWithin` y prefiere la tarjeta a la columna (Board.tsx:60-65); con teclado no hay puntero y cae a `closestCorners`. Es la combinación que dnd-kit recomienda para sortable. La causa de la doble pulsación **no** está en esa elección (I-1).

---

## 4. Hallazgos

Severidad: **B** bloqueante, **I** importante, **M** menor. Ninguno bloqueante.

### I-1 — Cruzar a la columna vecina con `→` requiere dos pulsaciones

- `Board.tsx:107`: `coordinateGetter: sortableKeyboardCoordinates`.
- Diseño §6.2 / RF-12: "Space toma, flechas mueven". Observado en el navegador: la primera `→` anuncia "sobre Por hacer, posición 2" (misma columna) y la segunda "sobre En curso".
- Causa. No es la detección de colisiones de `Board` (`closestCorners` para teclado): el destino de cada flecha lo decide **el getter**, antes de que `Board` calcule `over`. `sortableKeyboardCoordinates` (sortable.esm.js:657-760) filtra los droppables candidatos comparando **solo el borde izquierdo** con `<` estricto: para `→` entran todos los que cumplen `collisionRect.left < rect.left`, y entre ellos elige el más cercano con su propio `closestCorners`. `collisionRect` es el rectángulo del `DragOverlay` trasladado (core.esm.js:2948, 2983), y los candidatos son las 30 tarjetas más las 6 secciones de columna. Basta que el `left` del overlay quede una fracción de píxel por debajo del de las tarjetas de su propia columna (el overlay es un `div` `position: fixed` posicionado con el `left` medido de la tarjeta; las columnas miden ~178,67 px, así que los bordes caen en fracciones) para que las tarjetas de **la propia columna** pasen el filtro, y entonces ganan por distancia: la tarjeta de abajo está a ~80 px y la de la columna vecina a ~190 px. Primera `→` → tarjeta vecina de la misma columna ("posición 2"); segunda `→`, ya con el `left` exacto de esa tarjeta, el `<` estricto la excluye y por fin salta a En curso. Esa es la hipótesis que explica exactamente lo observado; `closestCenter` o `rectIntersection` en `Board` no la tocan (y `rectIntersection` daría `over = null` cuando el overlay no solapa nada). Confirmación en un minuto, en el navegador: envolver `collisionDetection` con un `console.log(args.collisionRect.left, args.droppableRects.get('<id de la tarjeta de abajo>').left)` al pulsar `Space`; si el primero es menor, es esto.
- Ajuste: un `coordinateGetter` propio (es lo que hace el propio ejemplo "MultipleContainers" de dnd-kit, `multipleContainersKeyboardCoordinates`, precisamente porque el de sortable no está pensado para varias columnas). Reglas: `←`/`→` comparan rectángulos completos (`collisionRect.left + collisionRect.width <= rect.left` para `→`, `collisionRect.left >= rect.left + rect.width` para `←`) y solo consideran **tarjetas de otras columnas o la sección `col:` cuando la columna está vacía**; `↑`/`↓` solo consideran tarjetas de la **misma columna** (`collisionRect.top < rect.top` / `>`), que es lo que ya hace `sortableKeyboardCoordinates` para el eje vertical. Entre los candidatos, el más cercano con `closestCorners`; coordenadas = `{ x: rect.left, y: rect.top }`. Con eso `→` significa "misma fila en la columna de al lado", que es lo que esperaba al probarlo, y el eje vertical no cambia. Son ~40 líneas en `lib/board.ts` o en `Board.tsx`; `COLUMN_DROP_PREFIX` ya distingue secciones de tarjetas. Si la confirmación de arriba dijera que los `left` son iguales, el getter propio sigue siendo el arreglo: elimina la ambigüedad sea cual sea la causa.
- Test: el getter es una función pura de rectángulos, así que sí se puede probar en jsdom: `droppableRects` falso con dos columnas de tarjetas (`{ left: 0 }` y `{ left: 194 }`, alturas distintas) y `droppableContainers` con `getEnabled()`/`get()`; `→` desde `id-2` devuelve el `top/left` de la tarjeta de la fila 2 de la otra columna en **una** llamada; `↓` devuelve la de abajo en la misma columna y nunca una de la vecina; `→` desde la última columna devuelve `undefined`. Además, dejar el caso manual en la checklist de §6.3: "`Space` → `→` → el anuncio dice la columna vecina a la primera".

### I-2 — Con teclado, el anuncio "posición N" no siempre coincide con dónde cae la tarjeta

- `Board.tsx:188-192`: `after` se calcula comparando centros (`translated.top + height/2 > over.rect.top + over.rect.height/2`) también cuando el activador es el teclado; `Board.tsx:220-225`: el anuncio de `onDragEnd` describe `over`, no el destino que calculó `resolveDrop`.
- §6.1: el arrastre anuncia "movida a En curso, posición 2". Con teclado el overlay se coloca en el `top/left` exacto de la tarjeta sobre la que está; si la tarjeta arrastrada es **más alta** que esa (3 líneas vs 2), su centro queda más abajo y `after` da `true`: el anuncio dice "soltada en En curso, posición 2" y la tarjeta queda en la 3. Con alturas iguales queda en la 2. Para un usuario de teclado es impredecible.
- Ajuste: `after = false` cuando `e.activatorEvent instanceof KeyboardEvent` (con teclado "sobre X" significa "antes de X", que es lo que anuncia `onDragOver`), y que `onDragEnd` anuncie a partir de `resolveDrop` (índice visible del destino real) en vez de `over`. Mientras, en `onDragOver`, no anunciar cuando `over.id === active.id` (ruido: "T-1 sobre Por hacer, posición 2" nada más tomarla; ver M-9).
- Test (BoardDrag.test.tsx, con el `DndContext` capturado): `dropEvent('id-1', 'id-3', below = true)` con `activatorEvent: new KeyboardEvent('keydown')` → `api.moves[0].body.position` es el índice de `id-3`, no +1; con `activatorEvent: new Event('pointerdown')` sigue siendo +1.

### I-3 — `j/k/h/l` y `m` siguen activos mientras hay una tarjeta tomada

- `Board.tsx:255-264`: `useHotkeys` no mira `activeId`. El `KeyboardSensor` de dnd-kit escucha `keydown` en el documento y no cancela al perder el foco.
- Con una tarjeta tomada (`Space`), `l` mueve el foco a otra tarjeta mientras el arrastre sigue vivo (el siguiente `Space` lo suelta donde estaba el overlay, no donde está el foco), y `m` abre "Mover a…" encima del arrastre: `Esc` cierra el diálogo **y** cancela el arrastre a la vez. Nada se rompe, pero el usuario de teclado pierde el hilo y el lector anuncia dos cosas.
- Ajuste: en los cinco manejadores, `if (activeId !== null) return;` (o registrar las teclas solo cuando `activeId === null`).
- Test: `focusCard('T-1')`, `Space`, `l` → `T-1` conserva el foco; `m` → no hay `dialog`; `Escape` → se anuncia la cancelación.

### M-1 — La columna resaltada baja el contraste del contador, "Nada aquí" y el hueco

- `Column.tsx:72` (`highlighted && 'bg-primary-soft'`), `:82` (`text-fg-muted` del contador), `:113` ("Nada aquí"), y el placeholder `border-border-strong` de `CardTile.tsx:236` cuando se reordena dentro de la columna resaltada.
- §6.1: cualquier combinación nueva se verifica (≥ 4,5:1 texto, ≥ 3:1 contornos). `#68737D` sobre `#EDF7FF` da **4,45:1** y `#87929D` sobre `#EDF7FF` da **2,9:1**. Es transitorio (solo mientras se arrastra) y §2.1 ya avisa que `fg-muted` sobre un gris claro falla; `surface-hover` tampoco serviría (4,4:1).
- Ajuste, dos opciones (decisión 6, §5 y D-4): (a) mantener el relleno `primary-soft` y, mientras `highlighted`, pasar contador y "Nada aquí" a `text-neutral` (`#5E6A74` sobre `#EDF7FF` = 5,1:1) y el hueco a `border-fg-muted` (4,45:1 como contorno, ✓ ≥ 3); o (b) sin relleno: contorno discontinuo de 2 px `border-strong` en la columna (`outline-2 outline-dashed outline-border-strong`), que usa el mismo lenguaje que el hueco de §5 y no toca ningún texto. Prefiero (b).
- Test: con `captured.props.onDragOver({ over: { id: 'col:review' } })` la región "Revisión" lleva la clase elegida y la de "Por hacer" no.

### M-2 — El bucle del cursor no tiene salida si la API repite `nextCursor`

- `queries.ts:367-373`.
- Ajuste: `if (page.nextCursor === cursor) throw new Error('Cursor repetido')` (o un tope de páginas, p. ej. 50 = 10 000 tarjetas) antes de `cursor = page.nextCursor`.
- Test: msw devuelve siempre `nextCursor: 'x'` → la query termina en error y la página muestra "No se pudieron cargar las tarjetas." en vez de colgarse.

### M-3 — Posición anunciada: índice visible, no el real

- `Board.tsx:203-210`: `describePlace` usa `visible[status]`. Con `?label=bug` o la ventana de Hecho, "posición 2" es la segunda **visible**; la API recibe el índice real (correcto). Para quien escucha, el índice visible es el que tiene sentido; lo dejo así, pero lo anoto en §6.1 para que nadie lo "arregle" al revés. Sin cambio de código.

### M-4 — Una tarjeta recién creada puede desaparecer un instante si hay un refetch en vuelo

- `queries.ts:439-444`: `onSuccess` hace `appendCard` en la caché. Si justo antes un `move` invalidó `['cards', slug]` y ese refetch empezó **antes** de que el `POST /cards` terminara, la respuesta del refetch (sin la nueva tarjeta) pisa la caché y la tarjeta se va hasta el siguiente refetch.
- Ajuste: `await queryClient.cancelQueries({ queryKey })` al principio de `onSuccess` (igual que en `onMutate` del move), o invalidar `cards` además de `projects`.
- Test: difícil de encadenar con msw sin un gate en `GET /cards`; comprobar a mano (mover y crear seguido con la red lenta en DevTools).

### M-5 — "Reintentar" en cada error de alta, también 400/409

- `Board.tsx:163-169` ofrece "Reintentar" siempre; `useMoveCard` solo con red (`status === 0`). Reintentar un 409 ("proyecto archivado") vuelve a fallar.
- Ajuste: misma regla que el move: `action` solo si `error instanceof ApiError && error.status === 0`.
- Test: `POST /cards` → 409 → el toast no tiene botón "Reintentar"; con `HttpResponse.error()` sí.

### M-6 — Tamaños sueltos y rejilla repetida

- `BoardFilters.tsx:199, 213, 227` (`w-36`, `w-32`, `w-44`); `KitPage.tsx` (`w-44` ×3); la rejilla `grid-cols-[repeat(6,minmax(10rem,1fr))]` en `Board.tsx:280`, `BoardPage.tsx:90` y `KitPage.tsx`.
- Ajuste: una constante `BOARD_GRID_CLASS` en `lib/board.ts` para la rejilla; los anchos de filtro pueden quedarse (son layout), pero si prefiero la regla "nada suelto", van a `--container-filter-*` en `@theme`. Sin test.

### M-7 — Los filtros desaparecen en `/p/:slug/:ref`

- `Topbar.tsx` usa `useMatch('/p/:slug')` para mostrar `BoardFilters`. En la fase 5 el detalle será un panel **sobre** el tablero (§3), con la URL `/p/<slug>/T-42`: al abrir una tarjeta los filtros se irían de la barra aunque el tablero siga detrás.
- Ajuste (cuando llegue la fase 5): `useMatch('/p/:slug/*')`, que ya existe en la misma línea para el nombre del proyecto. Lo dejo anotado para no olvidarlo.

### M-8 — "Limpiar" se desmonta a sí mismo y el foco cae al `body`

- `BoardFilters.tsx:235-242`: el botón solo existe con filtros; al pulsarlo desaparece y el foco se pierde.
- Ajuste: tras limpiar, enfocar el campo "Filtrar por texto" (un `ref`).
- Test: `user.click('Limpiar')` → `getByRole('textbox', { name: 'Filtrar por texto' })` tiene el foco.

### M-9 — Anuncio de más nada más tomar la tarjeta

- `Board.tsx:214-219`: al iniciar, dnd-kit calcula `over` = la propia tarjeta y `onDragOver` anuncia "T-1 sobre Por hacer, posición 2" justo después de "T-1 tomada." (el test de BoardPage.test.tsx:623 ya lo tolera con `/^T-1 (tomada|sobre)/`).
- Ajuste: `if (over?.id === active.id) return undefined;` en `onDragOver` (la firma de `Announcements` admite `undefined`).
- Test: `announcements.onDragOver({ active: { id: 'id-1' }, over: { id: 'id-1' } })` es `undefined`.

### M-10 — El textarea del motivo no tiene etiqueta visible ni pista del mínimo

- `BlockReasonDialog.tsx:54-62`: solo `aria-label`. El mínimo de 3 caracteres se descubre al fallar.
- Ajuste: una línea muted bajo el título ("Mínimo 3 caracteres; queda en la bitácora como entrada de bloqueo") enlazada con `aria-describedby` cuando no hay error. Es copy, no estructura.
- Test: el textarea tiene `aria-describedby` apuntando a la pista; tras el error, al mensaje.

### M-11 — El contador WIP parpadea sin límite mientras carga `/projects`

- `BoardPage.tsx:43` espera `cards` y `settings`, pero no `projects`; `wipLimit={project?.wipLimit ?? 0}` (:75) muestra "4" y luego "4/3".
- Ajuste: incluir `projects.isPending` en la condición del skeleton.
- Test: con `GET /projects` retrasado, el contador no se renderiza hasta que llega.

### M-12 — "Ver todo" con `aria-expanded` sin `aria-controls`

- `Column.tsx:116-125`. Sin `aria-controls`, el lector no sabe qué se expande.
- Ajuste: `id` en el `div` de la lista y `aria-controls` en el botón. Una línea.

---

## 5. Las diez decisiones de quien programó

1. **Columnas `minmax(10rem, 1fr)` en vez de 220 px.** De acuerdo, y es §4.1 el que estaba mal: a 1440 px el contenido mide 1440 − 240 − 48 = 1152 px y seis columnas de 220 px más cinco huecos de 16 suman 1400: con la medida de §4.1 el tablero **nunca** cabía sin scroll, contra el principio 1 de §1. Con 160 px de mínimo caben con ~178 px cada una; títulos de 13 px a dos líneas (~44 caracteres) y dos chips en la línea 1: justo pero legible, lo vi en la captura. Bajo 1024 px hace scroll horizontal como dice §3 (incluso a 1024 exactos, porque la sidebar sigue en 240). Cambiar §4.1 y la tarea 4.2 del plan a `minmax(10rem, 1fr)` (D-2).
2. **Sin `+` en Bloqueado.** De acuerdo: RF-14 exige motivo también al crear en `blocked`, y una tarjeta rápida que abra un diálogo ya no es rápida. Si algún día lo quiero, el flujo es crear en Por hacer y mover. Anotar en §4.1 ("todas las columnas menos Bloqueado").
3. **WIP 0 = sin límite; aviso solo con el contador ámbar.** De acuerdo con el 0 (la API admite 0..32767 y "sin límite" es la lectura natural del 0; `wipDefault` también puede ser 0). Sobre el "aviso" de RF-13: §6.1 dice que "WIP superado lleva el número", y el código da número + color + texto para lector ("límite superado"). Para mí el `4/3` en ámbar **es** el aviso; una franja o un toast cada vez que arrastro la cuarta tarjeta sería ruido en una app de una persona. Propongo dejar RF-13 como "contador en ámbar con el límite (`4/3`) y texto para lector" (D-3).
4. **El contador cuenta todas las tarjetas, no las filtradas.** De acuerdo: el WIP mide trabajo real, no lo que el filtro deja ver, y un `1/3` con filtro `bug` mentiría. Única mejora barata: cuando hay filtro, el `sr-only` puede decir "4 tarjetas, 1 visible con el filtro". Opcional.
5. **"Ver todo (N)" con el total filtrado de Hecho.** De acuerdo: N es lo que voy a ver al pulsar, y es coherente con la decisión 4 al revés (aquí sí importa lo filtrado porque el botón habla de lo visible). Alternativa "Ver N más" con las ocultas; §4.1 dice "Ver todo (23)", así que mantengo el texto (D-5 si quiero cambiarlo).
6. **Columna destino resaltada con `primary-soft`.** De acuerdo con que exista (§5 no define el estado "destino" de una columna y hace falta, sobre todo para columnas vacías). El problema es el contraste de lo que queda encima (M-1): o cambio los textos a `neutral` mientras está resaltada, o uso un contorno discontinuo `border-strong` en vez de relleno. Prefiero el contorno: no toca texto, y es el mismo lenguaje del hueco. Decidir en D-4 y anotar el estado en la fila `ColumnHeader` (o una fila `Column`) de §5.
7. **Proyecto vacío con "Crea tu primera tarjeta".** Es literalmente §4.1; bien resuelto que el botón abra la tarjeta rápida de Por hacer y que, una vez abierta, el tablero vacío con sus "Nada aquí" se quede (no vuelve al mensaje al cancelar). Nada que decidir.
8. **Botón "Limpiar" filtros.** De acuerdo; sin él, limpiar tres filtros son tres gestos. Solo el foco (M-8).
9. **Textos de fecha.** De acuerdo: "vencida hace N días" / "vencida ayer" / "vence hoy" / "vence mañana" / "vence en N días" (≤ 3) / fecha corta. Es exactamente el "icono + texto" de §6.1 y evita "hace 1 días". Tono ámbar desde hoy hasta 3 días y rojo desde ayer, como §2.1. Las hechas muestran la fecha en muted aunque haya pasado (correcto: ya no "vencen"). Anotar la tabla en §4.1 para que Mi día y la línea de tiempo usen la misma función (`dueInfo`).
10. **Solo `Space` toma/suelta; `Enter` también suelta durante el arrastre.** De acuerdo. `Enter` = abrir es lo de §6.2 y se respeta fuera del arrastre; durante el arrastre, dejar `Enter` como "soltar" es el valor por defecto de dnd-kit y evita que un `Enter` reflejo abra la tarjeta a medio mover (el `defaultPrevented` lo garantiza y el test lo cubre). Anotar en §6.2 la fila `Space`: "(durante el arrastre, `Enter` también suelta y `Esc` cancela)".

Dos decisiones que no estaban en la lista y que también tomó el código: el filtro de texto busca en `T-42` + título, no en la descripción (RF-18 dice "texto"; el kanban no muestra la descripción, así que buscar en ella sorprendería; de acuerdo), y el máximo de 2 chips + "+N" por tarjeta (de acuerdo, §1.1).

---

## 6. Decisiones que tengo que tomar

| # | Decisión | Mi propuesta |
|---|---|---|
| D-1 | I-1: getter de teclado propio (una `→` = columna vecina, misma fila) o aceptar las dos pulsaciones. | Getter propio (~40 líneas, con test unitario de rectángulos). Antes, el `console.log` de un minuto para confirmar la causa. |
| D-2 | Decisión 1: corregir §4.1 y la tarea 4.2 a `minmax(10rem, 1fr)`. | Sí; la medida de 220 px nunca cupo. |
| D-3 | Decisión 3: ¿qué es el "aviso" de RF-13? | Contador ámbar con límite + texto para lector; reescribir RF-13 así. Sin franja ni toast. |
| D-4 | Decisión 6 / M-1: relleno `primary-soft` con textos en `neutral`, o contorno discontinuo `border-strong` sin relleno. | Contorno. Añadir el estado a §5. |
| D-5 | Decisión 5: "Ver todo (N)" con el total filtrado, o "Ver N más" con las ocultas. | Dejar "Ver todo (N)" como dice §4.1. |
| D-6 | I-2: con teclado, "sobre X" = antes de X siempre, y anunciar el destino real al soltar. | Sí; es lo que hace coherente el anuncio con el resultado. |
| D-7 | Previsualizar el hueco en la columna destino al arrastrar con ratón (hoy solo se resalta la columna; el hueco se queda en la de origen). Es el patrón "mover en `onDragOver`" de dnd-kit, un cambio mediano. | No en esta fase: el resalte de columna basta para una persona; revisitar si tras una semana de uso echo de menos el hueco. |
| D-8 | Decisión 10 y M-3: anotar en §6.2 que `Enter` suelta durante el arrastre y en §6.1 que "posición N" es la visible. | Sí, dos líneas de spec. |

Lo que no necesita decisión y va directo al commit de ajuste: I-3, M-2, M-5, M-6, M-8, M-9, M-10, M-11, M-12 (y M-4 si cabe; M-7 queda para la fase 5).

## 7. Qué no revisé

- Nada renderizado en esta pasada: lo que cito del navegador es lo que comprobé antes de leer el código (1440 px, 30 tarjetas, ratón y teclado, diálogo, tarjeta rápida, `?label=bug`). No repetí la prueba de I-1 con el `console.log` propuesto; esa confirmación queda para el commit de ajuste.
- Zoom al 200 %, NVDA y la checklist completa de §6.3 son de fin de fase 5.
- No probé un proyecto archivado desde la UI (`/projects` no los lista, así que `project` llega `undefined` y el tablero carga sin WIP); el 409 del `move` revierte y avisa (test), que es lo que importa hasta que la fase 5 o 6 decida cómo se muestra un proyecto archivado.
- RF-15 y RF-16 (fechas y entradas `moved`) son de la API; aquí solo verifiqué que el espejo optimista no las contradice.

# Revisión de la fase 5 — panel de tarjeta, bitácora y páginas de administración (seguridad, diseño, accesibilidad y código)

Fecha: 2026-10-26. Commit revisado: `3dfb955` (`fase-5-detalle`). Revisé el código nuevo de `apps/web/src/` (`components/card/`, `components/admin/`, `components/board/CloseNoteDialog.tsx`, `api/card-queries.ts`, `api/admin-queries.ts`, `lib/markdown.ts`, `lib/dates.ts`, `hooks/usePersistedBoolean.ts`, `pages/LabelsPage.tsx`, `pages/TokensPage.tsx`, `pages/SettingsPage.tsx` y los cambios en `Board`, `BoardPage`, `Topbar`, `queries.ts`, `global.css`) contra [[../spec/02_diseno]] (§3, §4.2, §4.3, §4.7, §4.8, §5, §6), [[../spec/03_plan_implementacion]] fase 5, RF-20..RF-34, RF-60..RF-64, RS-03, RS-10 y RS-12 de [[../spec/01_especificacion]] y [[../api]]. Lo que no se lee en el código lo miré en la fuente de `@dnd-kit/core` (`Accessibility`, `core.esm.js:86-172`), de `dompurify` (`IS_ALLOWED_URI`) y en los tests. No levanté la API en esta pasada; lo que comprobé antes en el navegador (API de dev, 1440 px) está citado donde corresponde.

Comandos: `pnpm --filter web test` → 21 archivos, **213 de 214 tests en verde**; el que falla es `BoardPage.test.tsx:26` ("RF-10: seis columnas…") por **timeout en `boardReady`** con la suite completa (37 s, 21 jsdom) y pasa solo (`vitest run src/pages/BoardPage.test.tsx` → 43/43). Es un flake de arranque, no una regresión (M-12). `pnpm --filter web build` → `tsc` + `vite build` en verde (aviso de chunk > 500 kB, ya existía: dnd-kit + markdown-it + DOMPurify).

## Veredicto: **Aprobado con cambios**

Nada bloqueante. La seguridad del frontend está como la pide la spec: markdown en dos capas (`markdown-it` sin HTML crudo + DOMPurify con lista blanca en una instancia propia), un solo `dangerouslySetInnerHTML`, CSRF en toda mutación por construcción del cliente, 401 → `/login` y 403 → toast por `ApiBridge`, nada de autenticación en el navegador (dos claves de `localStorage`, ambas preferencias) y el token de API vive solo en el estado del diálogo que lo muestra, fuera de TanStack, de la URL y de la consola (test que lo demuestra). El panel cumple §4.2 y §6.1 (480 px, `role="dialog"`, foco atrapado, `Esc` devuelve el foco a la ficha, pestañas con `tablist`/`tab`/`tabpanel` y flechas), y las tres páginas cumplen §4.7 y §4.8 casi al pie de la letra.

Cuatro hallazgos importantes, ninguno de seguridad: dos clics rápidos en el selector de etiquetas pierden el primero (I-1), el campo de fecha manda un `PATCH` por cada año parcial que se teclea (I-2), `Esc` en el cuadro de bitácora cierra el panel y tira el borrador (I-3) y el diálogo del token nuevo enfoca "Listo" en vez de "Copiar" (I-4). El resto son menores. Lo que me preocupaba de los anuncios del checklist con dos `DndContext` bajo `aria-modal` lo verifiqué en la fuente de dnd-kit y está bien por construcción (§3); solo queda oírlo con NVDA. Opino sobre las decisiones del código en §6, dejo las mías en §7 y la guía de prueba manual (NVDA + zoom 200 %) en §8.

---

## 1. Seguridad del frontend (RS-10, RS-12, RF-61, RF-63, plan "Revisión de Fable #2")

### 1.1 Markdown (`lib/markdown.ts`, `components/card/Markdown.tsx`)

| Qué | Dónde | Cómo está | |
|---|---|---|---|
| HTML crudo | `markdown.ts:11` `markdownIt({ html: false, linkify: true, breaks: true })` | el HTML del usuario se escapa como texto antes de llegar a DOMPurify | ✓ |
| Imágenes | `:12` `md.disable('image')` + `img` fuera de `ALLOWED_TAGS` | `![x](url)` sale como texto; nada carga recursos externos desde una nota | ✓ |
| Lista blanca | `:33-58` `ALLOWED_TAGS` (a, blockquote, br, code, del, em, h3-h6, hr, li, ol, p, pre, s, strong, table…, ul); `:63` `ALLOWED_ATTR: ['href', 'title']`; `:64` `ALLOW_DATA_ATTR: false` | sin `script`, `iframe`, `style`, `img`, `on*`, `data-*`, `class`, `id` | ✓ |
| `javascript:` | regexp por defecto de DOMPurify (`IS_ALLOWED_URI`) + `validateLink` de markdown-it | doble capa; test `markdown.test.ts:257` | ✓ (ver M-7: la regexp por defecto también deja `ftp:`, `tel:`, `sms:`, `xmpp:`, `matrix:`) |
| `target`/`rel` | `:26-31` hook `afterSanitizeAttributes` en una **instancia propia** (`createDOMPurify(window)`) | todo `<a>` sale con `target="_blank" rel="noopener noreferrer"`; el hook no contamina otros usos de DOMPurify (el `snippet` de búsqueda de la fase 6 usará el suyo con `ALLOWED_TAGS: ['mark']`, RS-12) | ✓ |
| Encabezados | `:15-22` | `#` → `h3`, `##` → `h4`… (tope `h6`): no compite con el `h1` de la vista ni el `h2` del panel (§6.1); `h1`/`h2` tampoco están en la lista blanca | ✓ |
| Único `innerHTML` | `Markdown.tsx:15` | `grep innerHTML` en `src/` (sin tests) da solo esa línea; lo usan la descripción, su vista previa y las notas de bitácora | ✓ |
| Texto sin formato | `LogTab.tsx:117` (`entry.body` de `moved`/`commit`/`pr`), `TitleEditor.tsx:96`, `CardDetail` (`card.ref`, `branchName`, nombres de proyecto/etiqueta), `LabelsPage`, `TokensPage` | todo va como texto React (escapado) | ✓ |

Lo que vi en el navegador coincide: una descripción con `<script>`, `<img onerror>`, `<a onclick>` y `[x](javascript:…)` se pinta como texto, sin `script` ni atributos `on*`, y el único enlace real lleva `target=_blank rel="noopener noreferrer"`. Tests: `markdown.test.ts` (6), `DescriptionTab.test.tsx:22`, `LogTab.test.tsx:161`.

### 1.2 Sesión, CSRF, 401/403 y almacenamiento

- **CSRF**: `client.ts:52` añade `X-Logbook-CSRF: 1` a todo `POST/PATCH/PUT/DELETE`; `credentials: 'same-origin'` y la URL es `window.location.origin + /api/v1`, así que el navegador manda `Origin` igual a `APP_ORIGIN`. `grep fetch(` en `src/` da solo `client.ts:57`: **ninguna mutación nueva salta el cliente** (`card-queries.ts`, `admin-queries.ts`, `NewTokenDialog`, `useEndSession` usan `api.*`). ✓
- **401**: `client.ts:73-76` → `ApiBridge.tsx:26-35` (`queryClient.clear()` + `/login` con `expired`). Las mutaciones nuevas lo heredan. "Salir" y "Cerrar todas" (`admin-queries.ts:113-123`) hacen el mismo flujo a mano: `clear()` + `navigate('/login', { state: { expired: false } })`; `client.ts:68` pone `sessionActive = false` tras `/auth/logout*`, así que el `GET /me` que sigue no muestra "Tu sesión venció" (test `SettingsPage.test.tsx:120`). ✓ Único matiz: la mutación que recibió el 401 además muestra su toast de error ("No se pudo guardar el cambio: …") encima de `/login` (M-6).
- **403**: `client.ts:77-78` → toast con el `message` de la API (§5). ✓ `/tokens` y `/auth/logout-all` solo con cookie (RS-03): desde la UI siempre es cookie. ✓
- **409 / 400**: `useUpdateCard.onError` (`card-queries.ts:210-213`) revierte y avisa con el mensaje de la API (test `CardPanel.test.tsx:133`); `useEditLogEntry` avisa el 400 de una entrada de sistema, aunque la UI no ofrece editarlas (`LogTab.test.tsx:152`). ✓
- **`localStorage`/`sessionStorage`**: `grep` da dos claves, `logbook.sidebarCollapsed` (`AppShell.tsx:15,55`) y `logbook.logOnlyNotes` (`LogTab.tsx:24` vía `usePersistedBoolean`), ambas preferencias de UI (RS-10 las permite). Nada de `document.cookie`. ✓ En el navegador: `localStorage`, `sessionStorage` y `document.cookie` vacíos (la cookie es `httpOnly`).
- **Token de API mostrado una vez** (RF-61, plan): `admin-queries.ts:88-90` `createToken` es un `api.post` suelto, **no** un `useMutation` (el `MutationCache` guardaría `data` con el token); `NewTokenDialog.tsx:16` lo tiene en `useState` solo mientras el diálogo existe; `:19-22` `close()` hace `setCreated(null)` y `TokensPage.tsx:140` desmonta el diálogo. No va a la URL (no hay `navigate`), no hay `console.*` en `src/` (`grep` da cero), y `GET /tokens` no lo trae (`ApiTokenDto` no tiene `token`). Test `TokensPage.test.tsx:150`: tras "Listo", el secreto no está en el DOM, ni en `QueryCache`, ni en `MutationCache`, ni al reabrir el diálogo. ✓ Lo que sigue siendo inevitable: el `fetch` queda en la pestaña Red de DevTools de esa pestaña, y en el estado del componente (React DevTools) mientras el diálogo está abierto. Aceptable.
- **Copia al portapapeles** del token y del ID/rama: `navigator.clipboard.writeText` con fallo manejado (`NewTokenDialog.tsx:47-55`, `CopyButton.tsx:23-31`). ✓

### 1.3 Dependencias

`markdown-it@15`, `dompurify@3.4`, `@types/markdown-it` (dev). El commit además sube `body-parser` transitivo por GHSA-27r3-jxmh-p828 (DoS), que hacía fallar `pnpm audit`. Bien.

---

## 2. Diseño vs `02_diseno`

### 2.1 Panel (§3, §4.2, §5 `Dialog`)

| Elemento | Diseño | Código | |
|---|---|---|---|
| Ancho, posición, sombra | 480 px, lateral derecho, superpuesto, `--shadow-lift`, todo el ancho < 1024 px | `CardPanel.tsx:105` `fixed inset-y-0 right-0 w-full lg:w-panel shadow-lift`; `--container-panel: 480px` (`global.css:79`) | ✓ |
| Sin velo | §3 "se superpone (no lo empuja)"; §5 `Dialog` sí lleva scrim 40 % | `:97` capa transparente `fixed inset-0 z-40` solo para el clic fuera | ✓ (decisión 7, §6) |
| Cierre | `Esc` o clic fuera; URL `/p/<slug>/T-42` | `:53-59` `Esc` (si nadie lo detuvo), `:97` `onMouseDown` fuera; `BoardPage.tsx` navega y conserva `search` | ✓ |
| `role="dialog"`, `aria-labelledby` al título, foco atrapado, foco vuelve a la tarjeta | §6.1 | `:100-103`, `:73-92` (Tab cicla), `:62-71` (red de seguridad `focusin`), `:37-44` (vuelve a `[data-card-ref]`) | ✓ tests `CardPanel.test.tsx:43,69,291` |
| Cabecera fija | `T-42` mono + copiar · chip de estado · cerrar; título `--text-md` editable en línea; metadatos en dos columnas; "Rama sugerida" mono + copiar | `CardDetail.tsx:180-261`: `font-mono text-xs`, `CopyButton`, `Chip` por estado, cerrar `iconOnly` 32 px; `TitleEditor` en `h2 text-md`; `grid-cols-2`; `code font-mono text-sm` + copiar | ✓ (ver decisión 8: la cabecera lleva su propio scroll, `max-h-[55vh]`) |
| Proyecto | "selector con punto" | solo lectura con punto; mover desde `⋯` | ≠ decisión 2 (de acuerdo, §6) |
| Chip de estado | §2.2 | `STATUS_TONE` (`:26-33`): backlog/todo gris (`neutral` sobre `surface-hover`), in_progress/review azul, blocked rojo, done verde | ✓ literal |
| Pestañas | Bitácora (defecto) · Descripción · Checklist (`2/5`) | `:140-157`, `useState<TabId>('log')`, `2/5` como `text-xs` dentro de la pestaña | ✓ |
| Menú `⋯` | Mover a otro proyecto, Archivar | `ActionsMenu.tsx` (patrón `menu`), "Desarchivar" si está archivada | ✓ |
| Modo creación | Plan 4.4: `n` y "Nueva tarjeta" | `CardCreate.tsx`: título obligatorio con error anunciado, columna (sin Bloqueado), prioridad, fechas, etiquetas; al crear pasa al detalle | ✓ |

### 2.2 Pestañas (§4.2)

- **Bitácora**: cronológica ascendente (`useCardLog` pide `limit=500`, el máximo; la API ya devuelve en orden y `useAddLogEntry` reordena por `occurredAt`), fecha relativa "hoy 14:32" / "ayer" / "mar 14 oct" (`dates.ts:70-83`, tests) con absoluta en tooltip (`LogTab.tsx:96-106`), entradas de sistema en `text-fg-muted` con icono en una línea (`:109-120`), `blocked` con punto rojo **y** el texto "Bloqueado" (`:158-163`, §6.1), textarea fija al pie con placeholder "Avancé… / quedó…" y `Ctrl+Enter` (`:269-278`), "Otra fecha" con `datetime-local` (`:281-302`, decisión 6), toggle "Solo mis notas" recordado (`:39`). Editar/borrar notas propias con confirmación (`:172-189`, `ConfirmDialog`). RF-34: `CloseNoteDialog` tras un `move` aceptado a Hecho, "Omitir" no escribe nada (`Board.tsx:162-167`; tests `LogTab.test.tsx:174,195`). ✓
- **Descripción**: `Markdown` renderizado; "Editar descripción" → textarea mono con vista previa **debajo** (decisión 3) y "Ctrl+Enter guarda"; `Esc` cancela sin cerrar el panel (`DescriptionTab.tsx:59-67`, test `:97`). ✓ Estado vacío "Sin descripción." ✓
- **Checklist**: "N de M hechos", casilla con nombre `Marcar "texto"`, texto editable en línea (botón → input, `Enter`/blur guardan, `Esc` cancela), asa de arrastre con `aria-label` y `aria-roledescription="ítem reordenable"`, input al pie "Agregar ítem…" con `Enter`. Hecho = tachado + muted (no solo color). Reordenar manda `position` = índice destino, igual que la API (`ChecklistTab.tsx:60-64`; `card-queries.ts:285-287` espejo con `arrayMove`). ✓

### 2.3 Tokens (§4.7, RF-61)

Tabla nombre · prefijo mono · creado · último uso ("nunca") · **vence** · Revocar (destructivo, con diálogo "El token dejará de funcionar de inmediato. No se puede deshacer."). Chips: `≤ 14 días` → `Chip tone="warning"` (`--color-warning` sobre `--color-warning-soft`) con `ClockIcon` y "vence en N días" (`TokensPage.tsx:112-116`); vencido → chip rojo "vencido" + fila `opacity-60`; revocado → chip gris "revocado" + `opacity-60`, sin botón. Franja sobre la tabla con `border-l-3 border-l-warning bg-warning-soft` y el texto de §4.7 con el nombre en negrita (`:62-71`). "Nuevo token" → diálogo con nombre → pantalla "Token creado" con bloque `font-mono` + "Copiar", "Vence el <fecha> (90 días)" y "No se vuelve a mostrar". Sin botón "renovar". ✓ literal. `tokenStatus` (`tokenStatus.ts:10-16`): revocado > vencido > ≤ 14 días > vigente, con `Math.ceil` (a 14 días exactos avisa, a 15 no; test `:82`). Desvíos: una franja **por token** que vence (§4.7 habla de una; mejor así), "Revocar" sigue visible en los **vencidos** (la API lo admite; razonable para limpiar), y el diálogo del token usa `max-w-lg` (512 px) en vez del token `max-w-dialog-wide` (M-8).

### 2.4 Etiquetas (§4.8, RF-23)

Lista con nombre (input, guarda al salir o con `Enter`, `Esc` restaura), selector de color con las 7 claves en español, Borrar con confirmación "Se quita de N tarjetas." / "No está en ninguna tarjeta." / "Se quita de más de 200 tarjetas." (`useLabelUsage` cuenta hasta una página de 200 con `archived=true`, `admin-queries.ts:66-76`). 409 → "Ya existe una etiqueta con ese nombre" (`LabelsPage.tsx:40-45`). Alta con nombre + color + "Añadir". ✓

### 2.5 Ajustes (§4.8, RF-63, RF-64)

Zona horaria con ayuda "Agrupa Mi día y Mi semana y define qué día es «hoy»…" ✓, "Días visibles en Hecho" (1..365) ✓, "WIP por defecto" (0..32767) ✓; validación en cliente con los rangos de `api.md` y `Intl.DateTimeFormat` para la zona; `PATCH` solo con lo que cambió (el vacío es 400) ✓ test `:50`. Sección **"Sesión"** tras un divisor (`border-t`), texto muted literal de §4.8, "Salir" secundario sin confirmación → `POST /auth/logout`, "Cerrar todas las sesiones" destructivo → diálogo con el texto literal → `POST /auth/logout-all` → `/login` ✓ tests `:108,120,138`.

### 2.6 Tokens de color y tamaños

`grep` de `#` en `components/` y `pages/` → **cero** (§6.3). Tamaños nuevos fuera de la escala: `max-h-[55vh]` (cabecera del panel), `max-h-60` (lista de etiquetas), `min-h-40`/`min-h-16` (editor y vista previa), `w-40`/`w-60` (campos de Etiquetas), `max-w-lg`/`max-w-3xl`/`max-w-4xl` (anchos de página). Son layout; el único que pisa un token existente es `max-w-lg` (M-8).

---

## 3. Accesibilidad (§6, §6.3)

Lo que está bien y comprobé en el código y los tests:

- **Foco al abrir**: `CardPanel.tsx:47-50` enfoca el propio panel (`tabIndex=-1`) si ningún campo lo tomó antes; en modo creación el título lleva `autoFocus` (test `:268`). Mientras carga, el nombre accesible es "Cargando T-34" (`CardDetail.tsx:61-63`) y luego el título real.
- **Foco al cerrar**: vuelve a la ficha `[data-card-ref]` de la tarjeta (o, si se creó una nueva, a la nueva); si no hay ficha, a quien tenía el foco al abrir (test `:43`, `:291`). Hueco: tarjeta archivada o movida de proyecto (M-10).
- **Foco atrapado**: Tab/Shift+Tab ciclan dentro (`:73-92`, test `:69`); `focusin` fuera del panel vuelve dentro, salvo diálogos y avisos (`:62-71`).
- **Diálogos anidados y `Esc`**: `Dialog.tsx:111-116` detiene la propagación en React; como la sintética llama a `nativeEvent.stopPropagation()` y el listener de React del portal está en `document.body`, el `keydown` **no llega** al listener del panel en `document` (`CardPanel.tsx:53-59`). Mismo mecanismo en `ActionsMenu.tsx:42-44`, `LabelPicker.tsx:57-61`, `TitleEditor.tsx:66-69`, `DescriptionTab.tsx:59-62`, `LogTab.tsx:144-147` (edición de nota) y `ChecklistTab.tsx:173-176`. Tests: `Esc` en el menú (`CardPanel.test.tsx:219`), en el título (`:192`), en el editor (`DescriptionTab.test.tsx:97`). Al cerrar un `Dialog`, `previous?.focus()` devuelve el foco al botón del panel que lo abrió (`Dialog.tsx:105`). ✓ Es correcto, pero depende de que ningún listener futuro de `Esc` se cuelgue de `document` **antes** de React; lo anoto, no lo pido.
- **Pestañas**: `role="tablist"` con nombre, `role="tab"` con `aria-selected`, `aria-controls`, `tabIndex` itinerante, `←`/`→`/`Home`/`End` mueven y seleccionan (`CardDetail.tsx:159-176`, `:263-289`); `role="tabpanel"` con `aria-labelledby` (`:291-296`). ✓ (M-1: `aria-controls` de las pestañas inactivas apunta a un `id` que no existe).
- **Atajos con el panel abierto**: `useHotkeys.ts:41` desactiva los de una letra con cualquier `[aria-modal="true"]` → `n`, `j/k/h/l`, `m`, `[`, `?` no actúan tras el panel; `e` (`TitleEditor.tsx:34-47`) solo con un modal y fuera de un campo. ✓
- **Checklist con dos `DndContext` y `aria-live` bajo `aria-modal`**: el del tablero (detrás) y el del checklist son independientes; dnd-kit genera `DndDescribedBy-N`/`DndLiveRegion-N` únicos por contexto. Anuncios en español con posición ("… tomado, posición 2.", "… sobre la posición 3.", "… soltado en la posición 3.", "Movimiento cancelado…") e instrucciones propias (`ChecklistTab.tsx:33-34`, `:51-58`). Dónde se monta la región viva: `ChecklistTab.tsx:88-96` no pasa `accessibility.container`, y en `@dnd-kit/core` (`core.esm.js:172`, `return container ? createPortal(markup, container) : markup`; `:3363` la renderiza como hermana de `children` dentro de `DndContext`) sin `container` **no hay portal**: la región y las instrucciones quedan en el DOM del checklist, es decir, **dentro** del `role="dialog" aria-modal="true"` del panel. Chrome, que con `aria-modal` oculta al lector lo que está fuera del diálogo, la expone. La región del **tablero** sí queda fuera (y no debe oírse mientras el panel está abierto; con el panel cerrado vuelve a funcionar como en la fase 4). ✓ por construcción; los tests de `ChecklistReorder.test.tsx` cubren el reordenamiento y el nombre del asa pero no el `aria-live`, así que queda **oírlo** con NVDA (§8, paso 4). Si no se oyera, el ajuste es una línea: `accessibility={{ …, container: <ref del tabpanel> }}`, y el test, `dialog.querySelector('[id^="DndLiveRegion"]')` no nulo con el panel abierto.
- **Formularios**: `label` envolvente o `htmlFor` en todos los campos del panel, Etiquetas, Tokens y Ajustes; botones de icono con `aria-label` (copiar, cerrar, más acciones, quitar ítem, reordenar); errores con `role="alert"` + `aria-invalid` + `aria-describedby` (título nuevo, nombre del token, los tres campos de Ajustes con ayuda **y** error enlazados). Falta el `aria-describedby` en los errores de Etiquetas (M-5).
- `prefers-reduced-motion`: la regla global ya anula transiciones; el checklist no rota.
- Idioma, `h1` por vista, `h2` del panel (título) y `h2` "Sesión" en Ajustes. ✓

Contrastes de combinaciones **nuevas** (fórmula WCAG 2.x):

| Combinación | Dónde | Ratio | |
|---|---|---|---|
| `#AD5918` sobre `#FFF8ED` | chip "vence en N días", franja (borde) | 4,7:1 | ✓ (ya en fase 4) |
| `#2F3941` sobre `#FFF8ED` | texto de la franja | ≈ 11:1 | ✓ |
| `#68737D` sobre `#FFFFFF` | pestaña inactiva, fechas, "Sin ítems todavía", botones de nota | 4,8:1 | ✓ |
| `#68737D` sobre `#F8F9F9` | "Nada que mostrar todavía" (vista previa sobre `bg`) | 4,6:1 | ✓ justo |
| `#1F73B7` sobre `#F8F9F9` | enlaces dentro de la vista previa | 4,75:1 | ✓ |
| `#68737D` sobre `surface-hover` | `code` **dentro de una cita** (`blockquote` muted + `code` con fondo) | ≈ 4,4:1 | ✗ marginal (M-13) |
| `#CC3340` sobre blanco | "Bloqueado" con punto | 5,1:1 | ✓ |
| chips de etiqueta sobre `#EDF7FF` | casilla marcada en el selector | el chip lleva su propio fondo soft; no cambia | ✓ |

Hallazgos de accesibilidad: I-3, I-4, M-1, M-3, M-4, M-5, M-10, M-11, M-12.

---

## 4. Código

### 4.1 Sincronía entre tablero y detalle (`card-queries.ts:15-98`)

Dos cachés: `['cards', slug]` (tablero) y `['card', ref]` (detalle, con `['card', ref, 'log']` debajo para la bitácora). Todo cambio del panel pasa por `syncCard`/`patchBoardCard`/`editChecklist`: `mergeCard` copia solo los campos de `Card` (`CARD_FIELDS`) y deja checklist, bitácora y rama del detalle. Casos:

- Fecha, prioridad, título, descripción: optimistas en las dos cachés (`OPTIMISTIC_FIELDS`, `:186`), reversión con `restore` (test `CardPanel.test.tsx:116,133`). ✓
- Etiquetas y proyecto: esperan la respuesta (`:185`). Correcto para el proyecto; para las etiquetas provoca I-1.
- Título o etiquetas → además invalida el detalle para traer `branchName` (`:228-230`). ✓ RF-29.
- Archivar: la tarjeta sale del tablero (`syncCard` → `null`) y el chip "Archivada" aparece; desarchivar invalida para que vuelva al final de su columna (`:242-247`; test `:204`). ✓ RF-27.
- Mover de proyecto: sale del tablero origen, invalida destino y `projects`, y la URL sigue a la tarjeta (`:214-223`, `BoardPage.showCard` con `replace`; test `:232`). ✓ RF-28.
- Checklist: `editChecklist` renumera, recalcula `checklistDone/Total` y los copia al tablero (`:84-98`); el `2/5` del kanban cambia al marcar (test `ChecklistTab.test.tsx:51`). ✓ RF-24.
- `move` desde el tablero invalida `['card', ref]` (prefijo: detalle y bitácora) en `onSettled` (`queries.ts:118-120`): el chip de estado y la entrada `moved` llegan al panel sin recargar. ✓
- Etiquetas editadas en `/labels` invalidan `labels` y `['cards']` pero **no** `['card']` (M-9).

### 4.2 Carreras

- Dos `PATCH` seguidos (p. ej. prioridad y luego fecha): si A falla con B en vuelo, `restore` de A pisa el optimismo de B hasta que llega B; y el `onSuccess` de A aplica la foto del servidor **sin** B (parpadeo). Mismo compromiso que el `move` de la fase 4 (§3.1 de aquella revisión); aceptable para una persona. No lo pido.
- `useUpdateCard.onMutate` cancela el detalle pero no el tablero: un refetch de `['cards', slug]` en vuelo puede pisar el optimismo un instante; la respuesta del `PATCH` lo corrige. No lo pido.
- Etiquetas: I-1 (sí lo pido).
- `DateField`: I-2.
- Bitácora: `useAddLogEntry` inserta y reordena por `occurredAt` (`:142-146`); si la bitácora aún no cargó, no toca nada y el `GET` la traerá. ✓ `Composer.submit` ignora envíos con `add.isPending` (`LogTab.tsx:240`). ✓
- Checklist: `add.isPending` deshabilita el input (`ChecklistTab.tsx:118`); toggles rápidos en ítems distintos van cada uno con su `snapshot` (misma salvedad del primer punto).

### 4.3 409 y 400

- Proyecto archivado: el `PATCH` y el `move` dan 409 → `onError` revierte y muestra el `message`; la bitácora y el checklist siguen funcionando (la API lo permite). ✓ El panel no muestra que el proyecto está archivado (la fase 6 decidirá cómo se ve un proyecto archivado; `useProjects` no los lista).
- `dueDate < startDate`: 400 con mensaje → revierte (test). ✓ `MIN_DATE`/`MAX_DATE` en los inputs coinciden con el rango de la API.
- Entradas de sistema: la UI no ofrece editarlas ni borrarlas (decisión 5); si un día se ofrece borrar, `DELETE /log/:id` lo admite.
- Etiqueta inexistente al crear (RF-21): el `LabelPicker` solo ofrece las que existen; el 400 llegaría como toast.

### 4.4 Listeners y limpieza

`CardPanel` quita `keydown` y `focusin`; `TitleEditor` su `keydown`; `ActionsMenu` y `LabelPicker` su `mousedown` (solo mientras están abiertos); `CopyButton` su temporizador; `Tooltip` su `scroll`; `Dialog` ya estaba. `usePersistedBoolean` no suscribe nada. No encontré fugas. `LogTab` baja el scroll al cambiar el número de entradas (`:45-49`) sin listener.

### 4.5 Otros

- `DescriptionEditor` vuelve a renderizar el markdown en cada tecla (`useMemo` por `source`): con 20 000 caracteres sigue siendo barato; nada que hacer.
- `createDOMPurify(window)` a nivel de módulo: válido en Vite y en jsdom; si algún día hay SSR, habría que diferirlo.
- `useLabelUsage` con `gcTime: 0`: no deja basura en caché. ✓
- `TokensPage` fija `now` al montar (`useState(() => Date.now())`): los chips no necesitan reloj en vivo. ✓
- `localInputToIso` interpreta el `datetime-local` en la zona de Ajustes (dos pasadas para el cambio de hora) y manda `Z` (RF-30 exige zona). ✓ tests `dates.test.ts:33-45`.

---

## 5. Hallazgos

Severidad: **B** bloqueante, **I** importante, **M** menor. Ninguno bloqueante.

### I-1 — Dos clics rápidos en el selector de etiquetas pierden el primero

- `LabelPicker.tsx:49-50`: `toggle` calcula el conjunto nuevo a partir de `value`, y `value` viene de `card.labels` (`CardDetail.tsx:243-247`), que solo cambia cuando responde el `PATCH` (`labels` no está en `OPTIMISTIC_FIELDS`, `card-queries.ts:186`).
- Marcar `bug` y, antes de que llegue la respuesta (en producción pasa por Cloudflare, 200-300 ms), marcar `docs`: el segundo `PATCH` manda `['docs']` y `bug` se pierde. RF-21: "etiquetas (0..n)"; §4.2: "multi-select con chips". Es el flujo normal de poner dos o tres etiquetas seguidas.
- Ajuste: añadir `labels` al optimismo. En `onMutate`, si `patch.labels` viene, construir `labels: patch.labels.map(name => ({ name, color: colorOf(name) }))` con los colores de `queryClient.getQueryData(queryKeys.labels)` (gris si no está) y aplicarlo al detalle y al tablero; la respuesta lo normaliza (orden por nombre). Alternativa más local: que `LabelPicker` mantenga un `pending` propio mientras `update.isPending`.
- Test (`CardPanel.test.tsx`): `PATCH /cards/:ref` con `delay(100)` en msw; marcar `feature` y luego `bug` sin esperar → el segundo `PATCH` lleva `['feature', 'bug']` y la ficha muestra los dos chips.

### I-2 — El campo de fecha manda un `PATCH` por cada año parcial que se teclea

- `CardDetail.tsx:401-405`: `onChange` guarda en cuanto `e.target.value` no está vacío. Chrome (y Edge) actualizan el valor de un `<input type="date">` mientras se teclea el año: `2`, `20`, `202` dan `0002-10-26`, `0020-10-26`, `0202-10-26`, cada uno con su evento `change`, y `min`/`max` no los filtran (solo marcan `validity`).
- Para quien escribe la fecha con el teclado (que es lo que pide §6.3), cada tecla del año dispara un `PATCH` que la API rechaza (400: fuera de `1970..2100`), el toast "No se pudo guardar el cambio" se apila tres veces y el valor se revierte en medio de la escritura. Con el selector del ratón no pasa.
- Ajuste: ignorar los valores inválidos: `if (!e.target.validity.valid) return;` (con `min`/`max` presentes, `rangeUnderflow` cubre `0002-…`), o guardar en `blur`/`Enter` como hace el título. Prefiero la primera: una línea y conserva el "se refleja en el kanban sin recargar" de la tarea 5.1.
- Test: `fireEvent.change(dueDate, { target: { value: '0002-10-26' } })` → `api.patches` vacío; con `2099-01-15` → un `PATCH`. En jsdom `validity.rangeUnderflow` funciona con `min`.

### I-3 — `Esc` en el cuadro de bitácora (y en el formulario de creación) cierra el panel y tira el borrador

- `CardPanel.tsx:53-59`: `Esc` cierra salvo que alguien lo haya detenido; `LogTab.tsx:254-259` (`Composer.onKeyDown`) solo trata `Ctrl+Enter`; `CardCreate.tsx` no trata `Esc`.
- §6.2: `Esc` = "cerrar panel, diálogo **o cancelar edición**". Escribir una nota es la acción central de la app (RF-31); un `Esc` por reflejo (cerrar el autocompletado del navegador, salir de un acento muerto, costumbre de Vim) con tres párrafos escritos los pierde sin aviso. Lo mismo con un título y etiquetas a medio poner en "Nueva tarjeta". El editor de descripción y el de notas existentes sí lo hacen bien (`Esc` cancela la edición, no el panel).
- Ajuste: en el manejador de `Esc` del panel, si `e.target` es un `input`/`textarea` **con contenido**, hacer `(e.target as HTMLElement).blur()` y no cerrar; el segundo `Esc` (ya fuera del campo) cierra. Es el mismo "dos pasos" que usan los editores de código, no necesita diálogo de confirmación y no cambia nada para un campo vacío.
- Test: escribir "hola" en "Nueva entrada de bitácora", `Esc` → el panel sigue y el textarea pierde el foco; `Esc` otra vez → se cierra. Con el textarea vacío, un `Esc` cierra.

### I-4 — El diálogo del token nuevo enfoca "Listo" en vez de "Copiar"

- `NewTokenDialog.tsx:82`: `data-autofocus` en "Listo"; "Copiar" (`:79`) queda antes en el orden de Tab pero sin foco inicial.
- §4.7: el token se muestra **una vez** y "No se vuelve a mostrar". Después de teclear el nombre y `Enter`, el foco cae en "Listo": un segundo `Enter` (reflejo de "aceptar") cierra el diálogo con el token sin copiar, y hay que crear otro y revocar este. Para un usuario de lector de pantalla es peor: oye "Token creado, diálogo, Listo, botón" y el bloque mono queda atrás.
- Ajuste: `data-autofocus` en "Copiar"; tras copiar con éxito, mover el foco a "Listo" (y dejar el `role="status"` "Copiado" como está). Opcional: que "Listo" pida confirmación si no se copió ("¿Cerrar sin copiar? No se vuelve a mostrar"), pero el cambio de foco ya resuelve el reflejo.
- Test: tras crear, `expect(getByRole('button', { name: 'Copiar' })).toHaveFocus()`; tras pulsarlo, "Listo" tiene el foco.

### M-1 — `aria-controls` de las pestañas inactivas apunta a un `id` que no existe

- `CardDetail.tsx:275` pone `aria-controls={`${ids}-panel-${t.id}`}` en las tres pestañas, pero solo se monta el `tabpanel` activo (`:291-296`). axe lo marca (`aria-valid-attr-value`); NVDA lo ignora.
- Ajuste: un solo `id` para el `tabpanel` (`${ids}-panel`) y el mismo en las tres pestañas, o `aria-controls` solo en la activa. Una línea. Test: `getByRole('tab', { name: 'Descripción' })` no tiene `aria-controls` o apunta a un elemento existente.

### M-2 — Flake: `BoardPage.test.tsx:26` agota el timeout en la suite completa

- `boardReady()` (`:13-15`) espera el `h2` "Backlog" con el timeout por defecto de Testing Library (1 s) mientras los 21 jsdom arrancan en paralelo (37 s de suite). Pasa solo.
- Ajuste: `findByRole(…, {}, { timeout: 5000 })` en `boardReady`, o `testTimeout`/`asyncUtilTimeout` en `vitest.config`. Sin test (es el test).

### M-3 — Botones y fechas de la bitácora sin contexto para el lector

- `LogTab.tsx:174,184`: todas las notas tienen "Editar entrada" y "Borrar entrada" con el mismo nombre; en la lista de botones de NVDA (`Insert+F7`) son N pares iguales. `:96-106`: la fecha absoluta solo está en el tooltip de un `<time>` **no enfocable**: con teclado o lector no hay forma de saber el día exacto de "ayer" o "mar 14 oct".
- Ajuste: `aria-label={`Editar entrada de ${formatLogTime(…)}`}` y `title`/`sr-only` con `formatAbsolute` en el `<time>` (o `tabIndex={0}` para que el tooltip aparezca con foco, que es lo que §5 promete).
- Test: `getByRole('button', { name: 'Borrar entrada de hoy 14:32' })`.

### M-4 — Quitar un ítem del checklist o borrar una nota deja el foco en el `body`

- `ChecklistTab.tsx:235` y `LogTab.tsx:219-222`: el botón pulsado se desmonta con su fila. Tras confirmar el borrado, el foco vuelve al botón "Borrar" (lo hace `Dialog`) justo antes de que desaparezca → `body`.
- Ajuste: tras borrar, enfocar el ítem siguiente (o el input "Agregar ítem") y el textarea de la bitácora, con el patrón `pendingFocus` del tablero.
- Test: borrar el último ítem → "Agregar ítem" tiene el foco.

### M-5 — En Etiquetas, renombrar con `Enter` pierde el foco y los errores no van enlazados

- `LabelsPage.tsx:237`: `key={`${l.id}:${l.name}:${l.color}`}` remonta la fila al cambiar nombre o color; `:183-186`: `Enter` hace `blur()` → guarda → la fila se remonta → el foco queda en `body`. `:187` y `:208`: `aria-invalid` sin `aria-describedby` al `role="alert"`.
- Ajuste: `key={l.id}` y un `useEffect` que sincronice `name` con `label.name` cuando cambie; `aria-describedby` al `id` del error (como en Ajustes).
- Test: renombrar con `Enter` → el input del nuevo nombre tiene el foco.

### M-6 — Un 401 en una mutación muestra su toast sobre `/login`

- `card-queries.ts:100-104` (`useErrorToast`) y los `onError` de las páginas avisan de cualquier error; el 401 ya redirigió (`ApiBridge`), así que en el login aparece "No se pudo guardar el cambio: Unauthorized" junto a "Tu sesión venció".
- Ajuste: en `useErrorToast` y en los `onError` de Tokens/Etiquetas/Ajustes, `if (error instanceof ApiError && error.status === 401) return;`.
- Test: `PATCH /cards/:ref` → 401 → ningún toast y `location` es `/login`.

### M-7 — Perfil de URI de DOMPurify: el de fábrica, no el "estricto" de RS-12

- `markdown.ts:61-65` no pasa `ALLOWED_URI_REGEXP`; el valor por defecto admite `ftp:`, `tel:`, `callto:`, `sms:`, `cid:`, `xmpp:`, `matrix:` además de `http(s)` y `mailto`. Ninguno ejecuta código, pero `tel:`/`sms:` abren aplicaciones en Windows y RS-12 pide "perfil estricto".
- Ajuste: `ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i` (también se puede dejar solo `https?`). Test: `[x](ftp://a) [y](tel:123)` → ningún `href`; `[z](https://a)` → `href` presente.

### M-8 — Ancho del diálogo del token fuera de los tokens

- `NewTokenDialog.tsx:59` `widthClass="max-w-lg"` (512 px de Tailwind). §3/§4.3 definen `--container-dialog-wide: 560px` (`global.css:78`).
- Ajuste: `max-w-dialog-wide`. Sin test.

### M-9 — Editar etiquetas en `/labels` no refresca el detalle en caché

- `admin-queries.ts:32-38` invalida `labels` y `['cards']`; el detalle `['card', ref]` conserva nombre y color 30 s (`staleTime`). Volver al kanban y abrir la tarjeta en ese lapso muestra el chip viejo en la cabecera (el kanban ya lo muestra nuevo).
- Ajuste: `invalidateQueries({ queryKey: ['card'] })` en `useRefreshLabels`. Test: renombrar `bug` → `error`; `getQueryState(['card','T-1']).isInvalidated` es `true`.

### M-10 — Al cerrar, el foco vuelve a una ficha que ya no existe

- `CardPanel.tsx:37-44`: tras archivar o mover de proyecto, `[data-card-ref]` no está; `previous` es esa misma ficha (ya desmontada) → `focus()` no hace nada y el foco queda en `body`.
- Ajuste: si no hay ficha, enfocar la primera `[data-card-ref]` de la columna del tablero, y si no hay, el botón "Nueva tarjeta" de la barra (siempre existe). Test: archivar y `Esc` → `document.activeElement` no es `body`.

### M-11 — Cabecera del panel con `max-h-[55vh]`: comprobar a 200 %

- `CardDetail.tsx:180`: la cabecera (ID, título, 5 campos, rama) tiene su propio scroll y tope de 55 % de la altura. A zoom 200 % en 1440×900 el viewport mide ~720×450 px CSS: cabecera ≤ 248 px, pestañas 40, y la bitácora se queda con ~160 px (dos líneas de nota + el cuadro de 3 filas). Usable pero justo; no lo puedo medir aquí (§8, paso Z-3).
- Ajuste, si molesta: `max-h-[45vh]` o hacer que toda la cabecera **menos** la fila del ID sea parte del cuerpo con scroll. Decidir tras la prueba.

### M-12 — Barra superior a 720 px CSS (zoom 200 %): probable scroll horizontal

- `Topbar.tsx:30` `flex h-14 … gap-4 px-6` sin `flex-wrap`/`min-w-0`; con los filtros (`w-36`+`w-32`+`w-44` ≈ 448 px), el título, "Buscar" y "Nueva tarjeta" supera los 720 px. §6.3 pide "sin scroll horizontal en la barra superior" a 200 %. No lo puedo medir aquí (§8, paso Z-1).
- Ajuste, si ocurre: `min-w-0` en el `h1` con `truncate`, filtros con `shrink` (`w-36` → `max-w-36 min-w-24`) o pasar los filtros a una segunda fila con `flex-wrap` bajo `lg`.

### M-13 — `code` dentro de una cita en el markdown: 4,4:1

- `Markdown.tsx:6`: `[&_blockquote]:text-fg-muted` y `[&_code]:bg-surface-hover`; un `code` dentro de un `blockquote` hereda el muted sobre `surface-hover` (§2.1 avisa que esa pareja falla).
- Ajuste: `[&_code]:text-fg`. Una clase. Sin test.

---

## 6. Las decisiones de quien programó

Los seis `TODO(diseño)` del código (`grep -rn "TODO(diseño)" apps/web/src` da seis, no nueve; añado tres decisiones implícitas del panel que no llevan `TODO`) y las menores de las páginas (no están listadas en el código ni en el commit; son las que inferí leyendo).

**Panel**

1. **`CardCreate.tsx:32` — Bloqueado no se ofrece al crear.** De acuerdo: es la decisión 2 de la fase 4 aplicada al panel (RF-14 exige motivo; crear en Por hacer y mover). Anotar en Plan 4.4.
2. **`CardDetail.tsx:205` — Proyecto de solo lectura; mover desde `⋯`.** De acuerdo. Un `select` que mueve la tarjeta al cambiar (sin confirmación, y con 409 si el destino está archivado) es justo el "mover por accidente" que RF-28 no quiere; el diálogo "Mover T-42 a otro proyecto" con su explicación ("conserva ID, bitácora y checklist…") es mejor. Corregir §4.2: "Proyecto (nombre con punto; se cambia desde `⋯` → Mover a otro proyecto)".
3. **`DescriptionTab.tsx:82` — Vista previa debajo, no al lado.** De acuerdo: 480 − 32 de padding = 448 px; dos columnas de ~200 px no sirven ni para el markdown ni para el textarea. Corregir §4.2: "vista previa debajo".
4. **`LabelPicker.tsx:22` — Casillas nativas en vez de un listbox propio.** De acuerdo: `checkbox` nativo da teclado, estado y anuncio ("casilla de verificación, marcada") gratis, y la casilla marcada lleva `primary-soft` como pide §5. Un `listbox` con `aria-multiselectable` sería más "estándar" pero más código y peor en NVDA (hay que gestionar `aria-activedescendant`). Corregir la fila `Select` de §5: "el multi-select de etiquetas es un botón con chips que abre un grupo de casillas; la marcada lleva primary-soft".
5. **`LogTab.tsx:125` — No borrar entradas de sistema desde la UI.** Aquí discrepo a medias. RF-32 (decidido el 2026-10-21) permite borrarlas, y hay un caso real: un arrastre equivocado deja un `moved` que ensucia la bitácora y el `/summary`. Propongo ofrecer **"Borrar"** (no "Editar") también en `moved`/`commit`/`pr`, con la misma confirmación; el `DELETE` ya existe y `useDeleteLogEntry` sirve tal cual. Es una decisión mía (D-5).
6. **`LogTab.tsx:280` — "Otra fecha" con fecha y hora.** De acuerdo: la bitácora ordena por `occurredAt` y "ayer a las 16:00" es la nota típica de la mañana siguiente; una fecha sola la pondría a medianoche. Corregir §4.2: "selector de fecha y hora".
7. **Sin velo (implícita, `CardPanel.tsx:97`).** De acuerdo: §3 dice "se superpone, no lo empuja" y el tablero sigue leyéndose detrás (los filtros siguen en la barra, M-7 de la fase 4). El clic fuera cierra, como pide §3.
8. **Cabecera con scroll propio y tope de 55 vh (implícita, `CardDetail.tsx:180`).** De acuerdo en principio (las pestañas y el cuadro de bitácora siempre a la vista); ver M-11 para el 200 %.
9. **`Esc` cierra desde cualquier campo (implícita, `CardPanel.tsx:53-59`).** No de acuerdo con un borrador escrito: I-3.

**Páginas** (menores)

10. **Una franja por token que vence** (`TokensPage.tsx:62-71`) en vez de una sola. De acuerdo: cada una nombra su token y su fecha.
11. **"Revocar" visible en tokens vencidos.** De acuerdo: deja limpiar la tabla y la API lo admite.
12. **"Se quita de más de 200 tarjetas"** (`admin-queries.ts:66-76`, una sola página). De acuerdo: no vale la pena paginar para un diálogo; el texto es honesto.
13. **Validación de zona horaria en el cliente con `Intl`** (`SettingsPage.tsx:7-14`) antes del `PATCH`. De acuerdo: la API vuelve a validar y el error aparece junto al campo en vez de en un toast.
14. **"Salir" sin confirmación.** De acuerdo: §4.8 lo llama "secundario" y es reversible (volver a entrar); "Cerrar todas" sí confirma.
15. **Fila de etiqueta remontada por `key` con nombre y color** (`LabelsPage.tsx:237`). Funciona pero pierde el foco: M-5.

Dos cosas más que el código decidió bien y no estaban escritas: `useCardLog` pide 500 entradas (el máximo) en vez de las 50 del detalle, y las entradas se filtran en el cliente (el toggle no vuelve a pedir). Y las fichas `moved` del tablero llegan al panel por la invalidación de `onSettled`, no por un segundo canal.

---

## 7. Decisiones que tengo que tomar

| # | Decisión | Mi propuesta |
|---|---|---|
| D-1 | §3 (dnd-kit bajo `aria-modal`): confirmar con NVDA que los anuncios del checklist se oyen dentro del panel; si no, `accessibility.container` con el `ref` del `tabpanel`. | Probar primero (§8, paso 4); el cambio es una línea si hiciera falta. |
| D-2 | I-1: etiquetas optimistas en `useUpdateCard` (colores desde la caché de `labels`) o estado `pending` local en `LabelPicker`. | Optimismo en `useUpdateCard`: así el kanban también muestra el chip al instante. |
| D-3 | I-3: primer `Esc` sale del campo con texto, segundo cierra; o diálogo "¿Descartar?". | Dos pasos, sin diálogo. |
| D-4 | I-4: foco inicial en "Copiar" (+ foco a "Listo" tras copiar), o además confirmación al cerrar sin copiar. | Solo el foco. |
| D-5 | Decisión 5: ofrecer "Borrar" (no "Editar") en entradas de sistema, como permite RF-32. | Sí; cambiar el `TODO` por el botón y un test. |
| D-6 | M-7: `ALLOWED_URI_REGEXP` solo `https?` y `mailto`, o también `tel:`. | `https?` + `mailto`. |
| D-7 | Corregir §4.2 (proyecto solo lectura, vista previa debajo, fecha y hora), §5 (fila `Select`, multi-select de casillas) y Plan 4.4 (sin Bloqueado al crear), según §6. | Sí, seis líneas de spec. |
| D-8 | Quitar un ítem del checklist sin confirmación (hoy) o con `ConfirmDialog` como las notas. | Dejar sin confirmación: es una línea corta y se vuelve a escribir; la nota de bitácora sí es texto largo. |
| D-9 | M-11 y M-12: qué hacer con la cabecera del panel y la barra superior a 200 %. | Decidir tras la prueba de §8 (Z-1, Z-3); propuestas en cada hallazgo. |

Lo que no necesita decisión y va directo al commit de ajuste: I-2, M-1, M-2, M-3, M-4, M-5, M-6, M-8, M-9, M-10, M-13.

---

## 8. Guía de prueba manual: NVDA y zoom 200 % (checklist §6.3)

Preparación: API de dev y `pnpm --filter web dev`; Chrome o Edge a 1440×900 (ventana maximizada); un proyecto con al menos 6 tarjetas repartidas, una con checklist de 3 ítems y bitácora con una `moved` y dos notas (`T-34` sirve). NVDA instalado (gratuito, nvaccess.org), voz en español, verbosidad por defecto. Teclas de NVDA: `Insert` es la tecla NVDA (`Bloq Mayús` si lo configuré así); `Insert+Espacio` alterna navegación/foco; `Insert+F7` lista de elementos; `Insert+T` lee el título; `Insert+Tab` lee lo enfocado.

### 8.1 NVDA (lector de pantalla)

**Paso 1 — Abrir y cerrar el panel desde el kanban (§6.1).**
1. `/p/<slug>`, `Tab` hasta la primera tarjeta, `j`/`k` hasta `T-34`. Debo oír: "T-34 … tarjeta arrastrable, botón" (y la descripción de arrastre la primera vez).
2. `Enter`. Debo oír: "**<título de T-34>**, diálogo" (el nombre del diálogo es el título; si aún carga, "Cargando T-34, diálogo" y luego nada más: anotarlo si el cambio de título no se anuncia; es esperable y no es fallo).
3. `Tab` una vez. Debo oír: "Copiar T-34, botón". (Es el primer control: confirma que el foco entró al panel.)
4. `Esc`. Debo oír: "T-34 … tarjeta arrastrable, botón" (el foco volvió a la ficha). Mirar que la URL volvió a `/p/<slug>` con los filtros que hubiera.
5. Repetir con el ratón: clic en la tarjeta → panel; clic fuera (en el tablero) → se cierra.

**Paso 2 — Cabecera y edición en línea.**
1. Abrir `T-34`. `Tab` por la cabecera. Debo oír, en orden: "Copiar T-34, botón" · "Más acciones, botón, menú, contraído" · "Cerrar panel, botón" · "<título>, botón" (con `Insert+Tab` el tooltip "Editar título (e)") · "Prioridad, cuadro combinado, Media" · "Fecha de inicio, …" · "Fecha límite, …" · "Sin etiquetas Editar etiquetas, botón, contraído" (o los nombres de los chips) · "Copiar nombre de rama, botón" · "Solo mis notas, casilla de verificación, no marcada" · "Bitácora, pestaña, seleccionada, 1 de 3" (según cómo lo lea NVDA: "pestaña" y "seleccionada" son lo importante).
2. Con el foco en cualquier sitio del panel que **no** sea un campo (p. ej. "Cerrar panel"), pulsar `e`. Debo oír: "Título de la tarjeta, editar, <título>" (el cuadro de edición con el texto). Escribir algo, `Enter`. Debo oír que el foco vuelve al botón del título con el texto nuevo; el diálogo ahora se llama con el título nuevo (`Insert+T`).
3. `e`, escribir, `Esc`. El panel **no** se cierra (si se cierra, es un fallo); el título queda como estaba.
4. "Fecha límite": con el foco en el campo, teclear una fecha completa **con el teclado** (día, mes, año de cuatro cifras). **Qué mirar (I-2)**: si aparecen toasts rojos "No se pudo guardar el cambio" mientras tecleo el año, es I-2 (está previsto); si no se oye nada raro y el kanban muestra la fecha nueva al salir del campo, I-2 ya está corregido.
5. "Editar etiquetas": `Enter` → debo oír "Etiquetas, grupo" y, con `Tab`/flechas, "bug, casilla de verificación, no marcada". `Espacio` marca; debo oír "marcada". `Esc` cierra la lista y vuelve al botón ("… Editar etiquetas, botón, contraído"); el panel sigue abierto.
6. "Más acciones": `Enter` → "Acciones de la tarjeta, menú" y el foco en "Mover a otro proyecto…, elemento de menú"; `↓` → "Archivar tarjeta"; `Esc` → vuelve al botón, panel abierto.

**Paso 3 — Pestañas y bitácora.**
1. Foco en "Bitácora, pestaña". `→` → "Descripción, pestaña, seleccionada"; `→` → "Checklist 1/3, pestaña, seleccionada"; `End`/`Home` saltan a la última/primera. (Cada flecha cambia el contenido: el `tabpanel` de debajo cambia.)
2. En Bitácora, `Insert+Espacio` (navegación) y leer la lista con `↓`: debo oír "Bitácora, lista", cada entrada de sistema como una línea ("Por hacer → En curso, hoy 14:32") y cada nota con su hora y, si es `blocked`, la palabra "Bloqueado". **Qué anotar (M-3)**: los botones "Editar entrada"/"Borrar entrada" se oyen iguales en todas las notas y la hora absoluta no se oye: está previsto.
3. Volver a foco (`Insert+Espacio`), `Tab` hasta "Nueva entrada de bitácora, editar, multilínea". Escribir "Prueba NVDA", `Ctrl+Enter`. Debo oír que el campo queda vacío (y nada más: la entrada nueva **no** se anuncia; eso es esperable, no hay `aria-live` en la lista). `Shift+Tab` dos veces y `↑` en navegación: la nota nueva está al final de la lista.
4. Escribir "borrador" en el cuadro y pulsar `Esc`. **Qué mirar (I-3)**: si el panel se cierra, es I-3 (previsto); corregido, el primer `Esc` solo saca el foco del cuadro.
5. En una nota propia: `Tab` hasta "Borrar entrada, botón", `Enter`. Debo oír "¿Borrar esta entrada?, diálogo" y el foco en "Cancelar, botón". `Esc` → debo oír "Borrar entrada, botón" (volvió al botón) y el panel sigue abierto (**Esc cierra solo el diálogo de arriba**). Repetir y confirmar con "Borrar": la nota desaparece; **anotar dónde queda el foco** (M-4 prevé que en el documento).

**Paso 4 — Checklist con dos `DndContext` (§3 / D-1).**
1. Pestaña Checklist (`→` desde Bitácora dos veces). `Tab`: "N de M hechos" se lee en navegación; el primer control es "Reordenar "<texto>", botón, ítem reordenable" (con `Insert+Tab`, las instrucciones "Para reordenar pulsa Espacio sobre el asa…").
2. En el asa del **primer** ítem, `Espacio`. Debo oír: "**"<texto>" tomado, posición 1.**" Si no oigo nada en 2 s, repetir con `Insert+Espacio` en modo foco; si sigue sin oírse, es D-1 (el `aria-live` no se expone bajo `aria-modal`): anotar y aplicar el `container`.
3. `↓`. Debo oír "**"<texto>" sobre la posición 2.**" `Espacio`. Debo oír "**"<texto>" soltado en la posición 2.**" y el ítem queda segundo (comprobar con `↓` en navegación). Recargar la página: el orden persiste.
4. `Espacio` sobre un asa, `Esc`. Debo oír "Movimiento cancelado. "<texto>" sigue en su sitio." y el panel **sigue abierto** (el `Esc` lo consumió dnd-kit).
5. `Tab` a la casilla: "Marcar "<texto>", casilla de verificación, no marcada"; `Espacio` → "marcada". Mirar el kanban detrás: el `2/3` de la ficha cambió.
6. `Tab` al texto ("<texto>, botón"), `Enter` → "Texto del ítem, editar"; cambiar, `Enter` → vuelve al botón con el texto nuevo. `Esc` dentro del campo cancela sin cerrar el panel.
7. `Tab` a "Quitar "<texto>", botón", `Enter`: el ítem se va; anotar dónde queda el foco (M-4).
8. `Tab` hasta "Agregar ítem, editar"; escribir y `Enter`: el ítem aparece al final y el foco sigue en el campo (vacío).

**Paso 5 — Descripción (RS-12).**
1. Pestaña Descripción, `Tab` a "Editar descripción, botón", `Enter`. Debo oír "Descripción (markdown), editar, multilínea" con el foco dentro. Escribir `# Título\n\n<script>alert(1)</script> [x](javascript:alert(2)) **ok**`. En navegación, bajo "Vista previa": un encabezado de nivel 3 "Título", el texto literal `<script>…` como texto, "x" **sin** "enlace" y "ok" en negrita. `Ctrl+Enter` guarda; `Esc` antes de guardar cancela sin cerrar el panel.

**Paso 6 — Páginas.**
1. `/tokens`: `Tab` a "Nuevo token", `Enter` → "Nuevo token, diálogo, Nombre, editar". `Enter` vacío → debo oír "Escribe un nombre" (alerta). Escribir un nombre, `Enter`. Debo oír "Token creado, diálogo" y **qué botón tiene el foco** (I-4 prevé "Listo"; corregido, "Copiar"). `Tab` hasta "Copiar", `Enter` → "Copiado". "Listo" cierra; la tabla tiene la fila nueva con el prefijo. Revocar: "Revocar <nombre>, botón" → diálogo "Revocar <nombre>" con foco en "Cancelar"; `Esc` vuelve al botón.
2. `/labels`: en el nombre de una etiqueta, cambiarlo y `Enter`; anotar dónde queda el foco (M-5 prevé el documento). "Borrar <nombre>" → diálogo "Borrar «nombre»" con "Se quita de N tarjetas."; `Esc` vuelve al botón.
3. `/settings`: borrar "Días visibles en Hecho", escribir `0`, `Tab` hasta "Guardar", `Enter`. Debo oír "Un número entero entre 1 y 365" (alerta) y, al volver al campo, "Días visibles en Hecho, editar, inválido, 0, Cuántos días se ven… Un número entero entre 1 y 365" (ayuda **y** error por `aria-describedby`). "Cerrar todas las sesiones" → diálogo con el texto de §4.8, foco en "Cancelar"; `Esc` vuelve al botón sin cerrar nada.

### 8.2 Zoom 200 % (Chrome `Ctrl` + `+` hasta 200 %; viewport ≈ 720×450 px CSS)

- **Z-1 Barra superior (§6.3)**: en `/p/<slug>`, ¿hay scroll horizontal de la página (barra abajo) o se corta "Nueva tarjeta"? Lo espero (M-12). Anotar qué se corta.
- **Z-2 Tablero**: el kanban hace scroll horizontal (§3 lo admite bajo 1024 px); la sidebar debería estar colapsada o colapsable con `[`.
- **Z-3 Panel**: abrir `T-34`. Debe ocupar **todo el ancho** (`lg:w-panel` no aplica bajo 1024 px). ¿Hay scroll horizontal **dentro** del panel? No debería (los `code` largos llevan `truncate`/`overflow-x-auto`). ¿Cuánto espacio queda para la bitácora bajo la cabecera y las pestañas? Si el cuadro de nota más dos líneas de lista no caben, es M-11: anotar la altura de la cabecera (DevTools → `header` → Computed → height).
- **Z-4 Pestañas**: Bitácora · Descripción · Checklist 1/3 en una fila sin cortarse.
- **Z-5 Descripción en edición**: textarea + vista previa debajo; sin scroll horizontal; un `pre` largo (pegar una línea de 200 caracteres en un bloque de código) hace scroll **dentro** del `pre`, no del panel.
- **Z-6 Diálogos**: "Mover T-34 a otro proyecto", "¿Borrar esta entrada?", "Token creado": el diálogo cabe en 720 px (los anchos son `max-w`, así que deben encogerse) y el velo cubre todo.
- **Z-7 Tokens**: la tabla de 6 columnas a 720 px: ¿hace scroll horizontal la página? Si sí, envolverla en `overflow-x-auto` (es lo razonable para una tabla; §6.3 solo exige barra superior y panel).
- **Z-8 Foco visible**: con `Tab` por el panel, el anillo de 2 px se ve en cada control, también en las pestañas y en el asa del checklist.
- **Z-9** Volver a 100 % (`Ctrl+0`).

Resultado a anotar en `02_diseno` §6.3: las cinco casillas, con fecha, y los números de los hallazgos que la prueba confirme (D-1, I-2, I-3, I-4, M-3, M-4, M-5, M-11, M-12).

---

## 9. Qué no revisé

- Nada renderizado en esta pasada: lo del navegador es lo que comprobé antes de leer el código (panel abierto desde `/p/<slug>/T-34`, nota con `Ctrl+Enter`, descripción con `<script>`/`onerror`/`onclick`/`javascript:`, `/tokens`, `/settings`, `/labels`, almacenamiento vacío). No pude sacar capturas ni probar foco/`Esc` con teclado real; lo cubren los tests citados y la guía de §8.
- NVDA, zoom 200 % y las capturas del kit a 1024/1440 son de §8 y de Felipe.
- No probé un proyecto archivado desde la UI (sigue sin listarse en `/projects`).
- `curl.exe` con un token creado desde la UI → `/me` 200 y, revocado, 401 (tarea 5.5): es prueba manual contra la API; el flujo de la UI está cubierto por `TokensPage.test.tsx`.
- "Cerrar todas las sesiones" con dos navegadores (tarea 5.5): manual.
- RF-34 con arrastre de ratón a Hecho: el test lo hace con `m`; el código comparte `requestMove`, así que vale para ambos, pero no lo vi con el ratón.

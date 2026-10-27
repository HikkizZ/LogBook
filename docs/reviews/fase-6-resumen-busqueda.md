# Revisión de la fase 6 — Mi día, Mi semana, Copiar resumen y paleta de búsqueda (seguridad, diseño, accesibilidad y código)

Fecha: 2026-10-27. Commits revisados: `be79ecb` (6.1 + 6.2) y `804af4f` (6.3), rama `fase-6-resumen-busqueda`, `git diff main..` (16 archivos, +1419/−11). Revisé `components/log/LogView.tsx`, `components/search/{SearchPalette,Snippet}.tsx`, `api/log-queries.ts`, `api/search-queries.ts`, `lib/week.ts`, `pages/{TodayPage,WeekPage}.tsx` y los cambios en `api/client.ts`, `AppShell.tsx`, `Topbar.tsx` y `App.tsx`, contra [[../spec/02_diseno]] (§3, §4.4, §4.6, §5, §6), [[../spec/03_plan_implementacion]] fase 6, RF-40..RF-44, RF-50..RF-52 y RS-12 de [[../spec/01_especificacion]] y [[../api]] (`/log`, `/summary`, `/search`). Lo que no se lee en el frontend lo miré en `apps/api/src/modules/summary/router.ts` y `search/service.ts` (escape del `snippet`). Lo que comprobé antes en el navegador (API de dev) está citado donde corresponde; no pude probar con teclado real ni sacar capturas.

Comandos: `pnpm --filter web test` → 24 archivos, **258 de 258 tests en verde** (70 s; el flake M-2 de la fase 5 no apareció). `pnpm --filter web build` → `tsc` + `vite build` en verde (aviso de chunk > 500 kB, ya existía).

## Veredicto: **Aprobado con cambios**

Nada bloqueante y nada de seguridad. El `snippet` entra por un único punto (`Snippet.tsx`) con una instancia propia de DOMPurify que solo deja `<mark>` sin atributos, y el test `SearchPalette.test.tsx:205` lo demuestra con `onclick`, `<script>`, `<img onerror>` y entidades; las notas de Mi día/semana se pintan con el `Markdown` sanitizado de la fase 5 y todo lo demás (títulos, nombres, `moved`) va como texto React. `api.getText()` es un `GET` sin CSRF que hereda 401/403 del cliente y no rompe el resto; el resumen copiado es exactamente lo que devuelve `/summary` (lo vi en 110 ms con el markdown exacto de la semana 43). Las vistas y la paleta cumplen §4.4 y §4.6 casi al pie de la letra, y la semana ISO está bien, incluido el cambio de año (semana 53 de 2026).

Cuatro hallazgos importantes, ninguno de seguridad: cerrar el panel de una tarjeta abierta desde Mi día o desde la paleta deja al usuario en el tablero, no donde estaba (I-1); Mi día/semana pueden mostrar datos viejos hasta 30 s después de escribir una nota o mover una tarjeta (I-2); con `↓` la opción activa de la paleta se sale de la vista y no hay `scrollIntoView` (I-3); las tarjetas de Mi día no son encabezados como pide §6.1 (I-4). El resto son menores. Opino sobre las decisiones del código en §6, dejo las mías en §7 y la guía de prueba manual en §8.

---

## 1. Seguridad del frontend (RS-12, RF-43, RF-50)

### 1.1 `snippet` de la búsqueda (`Snippet.tsx`, `SearchPalette.tsx`)

| Qué | Dónde | Cómo está | |
|---|---|---|---|
| Lista blanca | `Snippet.tsx:12` `purify.sanitize(snippet, { ALLOWED_TAGS: ['mark'], ALLOWED_ATTR: [] })` | exactamente lo que piden §4.6, RF-50 y RS-12; `<mark onclick>` pierde el atributo, `<script>` se va con su contenido, `<img>`/`<b>` se quitan y dejan solo el texto (`KEEP_CONTENT` por defecto, que es lo que quiero: el texto del fragmento no se pierde) | ✓ test `:205` |
| Instancia propia | `Snippet.tsx:9` `createDOMPurify(window)` | no comparte el hook `afterSanitizeAttributes` de `lib/markdown.ts` (que añade `target`/`rel` a `<a>`); aquí no hay `<a>` posible | ✓ |
| Entidades | la API escapa `&`, `<`, `>` antes de `ts_headline` (`search/service.ts:14,41,52,64`) | `&lt;i&gt;texto&lt;/i&gt;` se ve como `<i>texto</i>` literal; doble capa, como RS-12 | ✓ |
| Único `innerHTML` de la paleta | `grep innerHTML` en `src/` (sin tests) da `Markdown.tsx:15` y `Snippet.tsx:16` | título, `T-n`, proyecto, estado y chip "archivada" van como texto (`SearchPalette.tsx:138-150`) | ✓ (ver M-1: el comentario de `Markdown.tsx:9` dice "ÚNICO" y ya no lo es) |
| Estilo del `<mark>` | `SearchPalette.tsx:135` `[&_mark]:bg-primary-soft [&_mark]:font-semibold [&_mark]:text-fg` | sin `style` ni `class` en el HTML inyectado; el color viene de tokens y la negrita es el indicador no cromático | ✓ |
| Navegación | `:86` `navigate(\`/p/${row.card.project}/${row.card.ref}\`)` | `project` y `ref` vienen validados por `cardSchema` (slug y `T-\d+`); no hay texto libre en la URL | ✓ |
| `q` en la URL | `search-queries.ts:15` `encodeURIComponent(q)`; `maxLength={200}` en el campo | coincide con `SEARCH_MAX_LENGTH`; `< 3` no consulta (`enabled`) | ✓ |

### 1.2 Mi día / Mi semana (`LogView.tsx`)

- Notas y bloqueos: `EntryRow` (`:382-391`) → `<Markdown source={entry.body}>` (markdown-it sin HTML + DOMPurify, M-7 de la fase 5 ya aplicado). `moved`/`commit`/`pr`: `:397` texto React. Títulos, `T-n`, nombres de proyecto: texto. Test `LogViews.test.tsx:103`. ✓
- Parámetros de la URL: `?date=` pasa por `DATE_RE` + `Date.parse` (`:40-43`); `?project=` va por `URLSearchParams` (`log-queries.ts:25-27`) y un slug inexistente es un 404 que la vista muestra como "Este proyecto no existe." sin reintento (`:255-261`). ✓
- Enlaces: `/p/${project.slug}/${card.ref}` y `/p/${card.project}/${card.ref}` con valores de la API. ✓

### 1.3 `api.getText()` y "Copiar resumen" (`client.ts`, `log-queries.ts:42`, `LogView.tsx:165-236`)

- Es un `GET`: sin `X-Logbook-CSRF` (correcto, `MUTATING` no lo incluye), `credentials: 'same-origin'`, mismo origen. ✓
- `Accept: text/markdown` solo con `text: true` (`client.ts:57-59`); el router no negocia por `Accept` (`summary/router.ts:20` fija `text/markdown` siempre), así que el header es informativo y no cambia nada para el resto de llamadas. ✓
- Errores: la rama `!res.ok` sigue leyendo JSON (`readError`), que es lo que devuelve la API también en `/summary` (400 por `format=xml`, 404 por proyecto). 401 → `onUnauthorized` como siempre; `CopySummary.copy` (`:191-199`) no muestra toast si `isUnauthorized` (evita el M-6 de la fase 5). 403 → `onForbidden`. ✓
- El markdown no entra en TanStack (`fetchSummary` es un `api.getText` suelto), no va a la URL y solo queda en `useState` (`fallback`) si el portapapeles falló; `key` del componente (`:148`) lo descarta al cambiar de período o proyecto. ✓
- Contenido copiado: mismos `from`/`to`/`project` que la vista (`LogViews.test.tsx:223,241`), sin `kinds`, así que lleva notas, bloqueos y movimientos, que es lo que RF-43 describe. El escape de títulos y nombres lo hace la API (RF-43); el frontend no toca el texto. ✓ En el navegador: el texto pegado coincidió con `GET /summary?from=2026-10-19&to=2026-10-25&format=md`.
- `navigator.clipboard.writeText` después de un `await fetch`: en Chrome/Edge cabe en la activación transitoria (~5 s); en Safari suele fallar por haber perdido el gesto y ahí entra el respaldo con el `Textarea` seleccionado (`:208-213`). Buen diseño; ver M-6 por el layout del respaldo.

---

## 2. Diseño vs `02_diseno`

### 2.1 Mi día y Mi semana (§4.4, RF-40..RF-44)

| Elemento | Diseño | Código | |
|---|---|---|---|
| Navegación `‹ hoy ›` / `‹ semana 43 ›` | §4.4 | `LogView.tsx:92-123`: dos `Button` icono (32 px, `aria-label` "Día/Semana anterior/siguiente"), texto central "hoy" o fecha larga; en semana "semana 43" + rango en xs muted | ✓ + botón "Hoy" extra (decisión 3, de acuerdo) |
| Selector de proyecto, todos por defecto | §4.4, RF-44 | `:129-145` `Select` nativo con `label` "Proyecto", opción "Todos", proyectos activos (y el archivado si está en la URL) | ✓ |
| "Copiar resumen" con icono y "Copiado" 1,5 s | §4.4 | `:219-222` `CopyIcon`/`CheckIcon`, texto cambia 1,5 s (`FEEDBACK_MS`) + toast "Copiado" (plan 6.2) | ✓ (doble confirmación; no molesta) |
| Bloque por proyecto (punto + nombre), fila por tarjeta `T-42` + título + chip de estado, entradas indentadas | §4.4 | `:301-334`: `h2`/`h3` con punto del proyecto (`projectDotClass`, en acento sobre blanco, §2.3), `li` con `Link` (`T-n` mono xs muted, título truncado, `Chip` por `STATUS_TONE`), `ul` de entradas con `pl-4`, hora `HH:mm` en la zona de Ajustes | ✓ (ver I-4: la fila no es encabezado) |
| Mi semana: cabecera "Martes 21" y dentro por proyecto | §4.4, RF-41 | `:296-300` `h2` `formatDayHeading` ("Martes 21", `Intl` es + mayúscula inicial); proyectos en `h3` | ✓ |
| "Se movieron hoy": `T-42 · Por hacer → En curso` | §4.4, RF-42 | `:338-358` sección con `h2` y lista compacta; `movePath` reconstruye el recorrido desde las entradas `moved` del período (`:403-417`), con el estado actual si no hay `from` | ✓; título según período (decisión 2) |
| Estado vacío: "Sin registros este día" + "Ir al tablero" | §4.4 | `:265-281`; en semana "Sin registros esta semana"; el enlace solo si hay proyecto destino | ✓ (adaptación razonable) |
| Carga y error | §5 | `LogSkeleton` (`role="status"`), `LoadError` (`role="alert"`) con "Reintentar" salvo 404 | ✓ |
| Chip de estado | §2.2 | `STATUS_TONE` idéntico al de `CardDetail.tsx:26-33` | ✓ (duplicado, M-9) |

Lo visto en el navegador coincide: `/week?date=2026-10-22` agrupa día → proyecto → tarjeta con notas, bloqueos y movimientos; `/today` vacío muestra el texto y el enlace.

### 2.2 Paleta de búsqueda (§4.6, RF-50..RF-52)

| Elemento | Diseño | Código | |
|---|---|---|---|
| Centrada, 560 px, input arriba | §4.6 | `Dialog` con `max-w-dialog-wide` (`--container-dialog-wide: 560px`, `global.css:78`), `Input` primero | ✓ (título "Buscar" visible encima: decisión 7) |
| Dos grupos Tarjetas / Bitácora | §4.6, RF-50 | `:185-186` `renderGroup`, en ese orden | ✓ |
| Fragmento resaltado en `primary-soft` | §4.6 | `[&_mark]:bg-primary-soft` + negrita | ✓ |
| Proyecto y estado a la derecha | §4.6 | `:141-151` columna derecha: nombre del proyecto, punto + nombre del estado, chip "archivada" | ✓ |
| `↑↓` navega, `Enter` abre | §4.6 | `:89-99`, circular; `Enter` respeta `isComposing` | ✓ (ver I-3) |
| `T-42` primero | RF-51 | lo hace la API; la UI no reordena | ✓ (visto: `T-23` → "1 resultado.") |
| Chip "archivada" | §4.6 | `:150` `<Chip>archivada</Chip>` + fila al 60 % | ✓ chip; opacidad: M-5 |
| Debounce 200 ms, mínimo 3 | plan 6.3, RF-52 | `:53-60`, `enabled: q.length >= 3` | ✓ tests `:75,:90` |
| Campo de búsqueda en la barra superior (`/`) | §3 | `Topbar.tsx:43` botón "Buscar" con `aria-keyshortcuts`, no un campo | ≈ razonable: la paleta ya es el campo; anotar en §3 |

### 2.3 Tokens

`grep '#' components/log components/search` da cero. Nuevas combinaciones: `mark` (`primary-soft` + `fg`, 12,6:1 ✓); fila activa `surface-hover` con el `mark` encima (`#EDF7FF` sobre `#F2F4F5`: el fondo del resaltado casi desaparece en la fila activa y queda la negrita como único indicador; aceptable por §6.1, ver decisión 6); filas archivadas al 60 % (M-5).

---

## 3. Accesibilidad (§6)

### 3.1 Paleta (combobox + listbox)

- `Input` con `role="combobox"`, `aria-label`, `aria-expanded`, `aria-controls` al `listbox`, `aria-autocomplete="list"` y `aria-activedescendant` a la opción activa (`SearchPalette.tsx:161-178`); opciones `role="option"` con `aria-selected` e `id` estables dentro de `role="group"` con `aria-labelledby` a "Tarjetas"/"Bitácora" (`:112-123`). Es el patrón APG de combobox con lista; el foco nunca sale del campo. ✓ Test `:138`.
- Anuncios: `<p role="status">` (`:188-190`) con "Escribe al menos 3 caracteres." / "Buscando…" / "Sin resultados." / "N resultados." Visto en el navegador ("1 resultado.", "4 resultados."). ✓ Es parlanchín (M-11).
- `Esc` y foco: el `Dialog` de la fase 5 cierra con `Esc` (`Dialog.tsx:61-64`) y devuelve el foco al elemento previo (`:54`); test `:41` (vuelve al botón "Buscar") y `:58` (vuelve al campo de filtro). ✓ Un solo `Esc` aunque haya texto escrito: correcto aquí (no hay borrador que perder, a diferencia del panel).
- `Enter` desde la paleta: `onClose()` y luego `navigate` (`:85-86`); el `Dialog` devuelve el foco al elemento previo y acto seguido el panel lo toma. ✓ (visto: `Enter` abre `T-12` en Bitácora).
- Clic con el ratón sobre una opción no mueve el foco (son `div`), y `onMouseMove` sincroniza `aria-activedescendant` con el puntero. ✓
- Falta `scrollIntoView` de la opción activa: I-3.

### 3.2 Atajos (`useHotkeys.ts`, `AppShell.tsx:63-70`)

- `/`: en teclado latinoamericano es Shift+7 y llega como `key: '/'` con `shiftKey`; `useHotkeys.ts:39` solo baja a minúscula sin Shift, así que la tabla recibe `'/'` tal cual. ✓ No se dispara en campos (`isEditable`) ni con un modal abierto. ✓ test `:58`.
- `Ctrl+K`: `:43-49` funciona escribiendo (bloquea el "enfocar barra de direcciones" de Chrome/Firefox) pero no con `aria-modal` abierto (decisión 5). `Cmd+K` también por `metaKey`. AltGr+K (`ctrlKey && altKey`) no cuenta como Ctrl: correcto. ✓
- `g d` / `g w`: `AppShell.tsx:66-67`, con el timeout de 1 s de la secuencia. ✓ `?` lista `/ o Ctrl+K` (`lib/shortcuts.ts:3`). ✓
- Botón "Buscar" con `aria-keyshortcuts="/ Control+K"`. ✓

### 3.3 Mi día / Mi semana

- Navegación de fechas: botones de icono con `aria-label` claros, 32 px; el texto central es `aria-live="polite"` (`LogView.tsx:100`), así que al pulsar "Día siguiente" se oye la fecha nueva sin mover el foco. ✓ "Hoy" deshabilitado cuando ya es la actual (sale del orden de tabulación; aceptable).
- Jerarquía: `h1` en la barra superior ("Mi día"/"Mi semana", `Topbar.tsx:10-11`); Mi día: `h2` por proyecto ✓, **sin `h3` por tarjeta** (§6.1 lo pide): I-4. Mi semana: `h2` por día, `h3` por proyecto ✓, tarjetas sin encabezado.
- Enlaces de tarjeta con `T-n` + título + estado como nombre accesible; `Link` con anillo de foco (`focus-visible:outline-2`). ✓
- Horas en `<time dateTime>`; las entradas de sistema en xs muted como en `LogTab`. ✓ Zona de Ajustes en `clock` (`:45-52`).
- Skeleton con `role="status" aria-label="Cargando bitácora"`; error con `role="alert"`. ✓
- Respaldo del portapapeles: `Textarea` con `aria-label`, toma el foco y selecciona (`:178-182`). ✓

---

## 4. Código

### 4.1 Zona horaria y semana ISO (`lib/week.ts`, `lib/dates.ts`, `LogView.tsx:66-70`)

- "Hoy" = `todayIn(settings.data.timezone)` (`en-CA` → `YYYY-MM-DD`, con respaldo UTC si la zona no es válida), la misma zona con la que la API agrupa `/log` y `/summary` (api.md "Zona horaria"). Las flechas y la semana trabajan en aritmética pura de `YYYY-MM-DD` sobre UTC (`toMs`/`fromMs`), sin horario de verano de por medio. ✓
- Semana ISO: `mondayOf` (`(weekday + 6) % 7`) y `isoWeek` = semana del jueves contra el 1 de enero de **su** año: `2026-10-21` → 43, `2027-01-01` (viernes) → 53 de 2026, `2026-01-01` → 1 (`week.test.ts`). Comprobé a mano `2026-12-28` → jueves `2026-12-31` → 53 ✓, `2024-12-30` → jueves `2025-01-02` → 1 ✓. Rango de la semana 53: `2026-12-28`..`2027-01-03`, dentro de los 366 días que admite la API. ✓ El subtítulo no lleva año (M-7).
- `today` se calcula en cada render: una pestaña abierta de un día para otro sigue diciendo "hoy" hasta que algo la vuelva a pintar (M-8).
- `?date=` inválido cae en silencio a hoy (`parseDate`): bien para la URL escrita a mano.

### 4.2 Búsqueda (`search-queries.ts`, `SearchPalette.tsx:53-62`)

- Debounce de 200 ms con `setTimeout` limpiado en cada tecla (`:53-60`); `q` solo cambia con ≥ 3 caracteres recortados; `useQuery` por `['search', q]`, `enabled`, `placeholderData: keepPreviousData`, `staleTime: 10 s`. Mientras `q !== trimmedText` el estado dice "Buscando…". ✓ test `:90` (varias teclas, una petición).
- Cancelación: ninguna. `queryFn` no recibe `signal` y `api.get` no lo acepta; con dos consultas en vuelo la respuesta de la vieja queda en su clave y TanStack muestra la de la clave actual, así que no hay resultados cruzados. Es correcto aunque no cancele (M-3).
- `keepPreviousData`: las filas viejas siguen visibles y **operables** mientras llega la nueva consulta (M-2).
- Caché: `['search', q]` no se invalida con ninguna mutación (`syncCard`, `useArchiveCard`, `useUpdateCard`); con `staleTime: 10 s` y `gcTime` de 5 min, repetir una búsqueda tras editar un título muestra el viejo (M-4).

### 4.3 Sincronía con el panel y el kanban

- `['log', from, to, project]` con `staleTime` global de 30 s (`query-client.ts:6`). Ninguna mutación lo invalida: `useAddLogEntry`/`useEditLogEntry`/`useDeleteLogEntry` (`card-queries.ts:139-190`) tocan solo `cardLog(ref)`; `useMoveCard` (`queries.ts:120-124`) `card`, `cards(slug)` y `projects`; `useUpdateCard` (status, proyecto) y `useArchiveCard` tampoco. Escribir una nota en el panel y volver a Mi día dentro de 30 s muestra la bitácora sin la nota: I-2. (Como abrir una tarjeta sale de `/today`, el caso no es "panel abierto sobre la vista", es "volver a la vista".)
- Abrir una tarjeta desde Mi día o desde la paleta navega a `/p/<slug>/T-n`; cerrar el panel va a `/p/<slug>` (`BoardPage.tsx:54-57`): I-1.
- `/summary` no pasa por caché: siempre fresco. ✓
- `useProjects` y `useSettings` ya estaban; el selector lee `projects.data` y el "Ir al tablero" el primer activo. ✓

### 4.4 Otros

- `CopySummary` con `key` por filtros (`:147-150`): limpia `copied`, `busy` y `fallback` al cambiar de vista. Bien.
- `LoadError` sin "Reintentar" en 404 (`:259`): correcto, reintentar no arregla un slug malo.
- `Dialog` + `PaletteBody` desmontado al cerrar: cada apertura empieza vacía (comentario `:33`); es lo que quiero (no arrastra la consulta anterior).
- Duplicados: `clock` (`LogView.tsx:45-52` vs `dates.ts:64-67`, privada) y `STATUS_TONE` (`LogView.tsx:30-37` vs `CardDetail.tsx:26-33`): M-9.
- `<Markdown className="text-sm">` (`:388`): `cn` concatena sin fusionar y `PROSE` ya trae `text-base`; cuál gana depende del orden del CSS generado, no del `className` (M-10).

---

## 5. Hallazgos

Sin bloqueantes. Importantes I-1..I-4; menores M-1..M-11.

### I-1 — Cerrar el panel de una tarjeta abierta desde Mi día/semana o desde la paleta deja al usuario en el tablero

- **Dónde**: `LogView.tsx:318-319` y `:346-347` (`Link to="/p/<slug>/<ref>"`), `SearchPalette.tsx:86` (`navigate`), `BoardPage.tsx:54-57` (`closePanel` → `/p/<slug>`).
- **Diseño/requisito**: §3 "panel lateral que se superpone al contenido"; §4.2 "se cierra con `Esc` o clic fuera"; plan 6.3 "Enter abre esa tarjeta". El modelo mental es "miro la tarjeta y vuelvo a lo que hacía".
- **Código**: la tarjeta se abre como ruta del tablero; `Esc` navega a `/p/<slug>` y la vista de origen (con su `?date=`/`?project=`) se pierde. Para volver hay que usar Atrás dos veces (el panel y el tablero).
- **Ajuste**: pasar el origen en el estado de la navegación: `navigate(to, { state: { from: location.pathname + location.search } })` en los tres puntos; en `closePanel`, `const from = location.state?.from; from ? navigate(from) : navigate({ pathname: \`/p/${slug}\`, search })`. Alternativa: `navigate(-1)` cuando `history.state.idx > 0` (más simple, pero Atrás después de cerrar vuelve a abrir la tarjeta). Prefiero `state.from` (D-1).
- **Test**: en `LogViews.test.tsx`, abrir `T-1` desde `/today?date=2026-10-21`, `Esc`, esperar `location.pathname === '/today'` y `search === '?date=2026-10-21'`; lo mismo desde la paleta en `SearchPalette.test.tsx:182`.

### I-2 — Mi día/semana no se refrescan tras escribir una nota, mover o archivar una tarjeta

- **Dónde**: `card-queries.ts:139-190` (`useAddLogEntry`, `useEditLogEntry`, `useDeleteLogEntry`), `queries.ts:118-125` (`useMoveCard.onSettled`), `card-queries.ts:229-253` (`useUpdateCard.onSuccess`, cambio de estado/proyecto), `:257-274` (`useArchiveCard`); `query-client.ts:6` `staleTime: 30_000`; `log-queries.ts:30-32`.
- **Diseño/requisito**: RF-40/RF-42 ("las entradas de hoy", "las que cambiaron de columna en el período"); fase 5 §4.1 ya exigía que tablero y detalle no se contradigan.
- **Código**: ninguna mutación invalida `['log']`. Flujo real: en `/today` abro `T-12`, escribo "avancé X", cierro, `g d` → la nota no está (hasta 30 s, o hasta que cambie la fecha o el proyecto). Lo mismo con un arrastre en el kanban y "Se movieron hoy".
- **Ajuste**: `void qc.invalidateQueries({ queryKey: ['log'] })` en el `onSuccess`/`onSettled` de esas seis mutaciones (una línea cada una), o una `invalidateLog(qc)` en `log-queries.ts` que llamen todas. No hace falta optimismo: la vista no está montada en ese momento, y si lo estuviera la invalidación la refresca.
- **Test**: en `LogViews.test.tsx`, pintar `/today`, montar un `useAddLogEntry` (o disparar la mutación desde el `CardPanel`), y esperar una segunda petición a `/log` con los mismos filtros.

### I-3 — `↓`/`↑` en la paleta no desplazan la lista: la opción activa se sale de la vista

- **Dónde**: `SearchPalette.tsx:89-99` (`onKeyDown`), `:183` (`max-h-96 overflow-y-auto`), `:168` (`aria-activedescendant`).
- **Diseño/requisito**: §4.6 "`↑↓` navega"; §6.1 foco visible siempre. Con `limit=20` por grupo caben hasta 40 filas de ~60 px en 384 px: desde la séptima la fila activa queda bajo el borde y el usuario de teclado no ve qué va a abrir con `Enter` (el lector sí la oye por `aria-activedescendant`).
- **Ajuste**: `useEffect(() => { document.getElementById(optionId(current))?.scrollIntoView({ block: 'nearest' }); }, [current])` (sin `smooth`, que además respeta `prefers-reduced-motion` por no animar). Con `onMouseMove` no hace falta condicionar: `nearest` no mueve nada si ya se ve.
- **Test**: jsdom no desplaza; `vi.spyOn(Element.prototype, 'scrollIntoView')` y comprobar que se llama con el `id` activo tras `{ArrowDown}`.

### I-4 — Las tarjetas de Mi día no son encabezados (§6.1 pide `h3` por tarjeta)

- **Dónde**: `LogView.tsx:313-325` (`li` + `Link`), `:296-311` (`h2` día / `h3` proyecto en semana; `h2` proyecto en día).
- **Diseño/requisito**: §6.1 "un `h1` por vista, `h2` por columna/proyecto, `h3` por tarjeta en Mi día". Con NVDA la tecla `H`/`3` es la forma de saltar de tarjeta en tarjeta en una semana con 30 notas; hoy se salta de proyecto en proyecto y dentro hay que leer todo.
- **Código**: la fila es un enlace dentro de `li`, sin encabezado.
- **Ajuste**: envolver el `Link` en `<h3 className="m-0 text-sm font-normal">` en Mi día y `<h4>` en Mi semana (donde el día es `h2` y el proyecto `h3`), y mover el `ul` de entradas fuera del encabezado. Sin cambio visual (`text-sm font-normal`). Anotar en §6.1 que en Mi semana la jerarquía baja un nivel (`h2` día, `h3` proyecto, `h4` tarjeta).
- **Test**: `screen.getAllByRole('heading', { level: 3 })` con los títulos de las tarjetas en `LogViews.test.tsx:71` y `:178`.

### M-1 — El comentario de `Markdown.tsx:9` ("el ÚNICO `dangerouslySetInnerHTML`") quedó viejo

Ahora son dos (`Snippet.tsx:16`). `Snippet.tsx:7` ya se describe como el único de la paleta; cambiar el de `Markdown.tsx` a "uno de los dos `dangerouslySetInnerHTML` de la aplicación (el otro es `Snippet.tsx`, solo `<mark>`)". Es el comentario que leerá la próxima revisión de seguridad, conviene que sea exacto.

### M-2 — Con `keepPreviousData`, `Enter` abre una fila de la consulta anterior mientras llega la nueva

`SearchPalette.tsx:65-77,97`: entre que `q` cambia y llega la respuesta, `rows` son las de la consulta previa, con el mismo aspecto, y `Enter` las abre; el estado dice "Buscando…" pero visualmente nada lo distingue (y un `Enter` rápido tras teclear es el gesto normal). Ajuste: cuando `search.isPlaceholderData || q !== trimmedText`, poner `aria-busy="true"` y `opacity-60` en el `listbox`, y que `Enter` no haga nada (o abra igual: D-2). Test: `fakeSearch` que no resuelva hasta un `resolve()` manual, teclear, `Enter`, comprobar que no navega.

### M-3 — Las búsquedas en vuelo no se cancelan

`search-queries.ts:14-15` ignora el `signal` que TanStack pasa al `queryFn`; `client.ts:49-52` no acepta `signal`. Es inofensivo con 200 ms de debounce (los resultados no se cruzan, §4.2), pero una consulta lenta (`ILIKE` de respaldo, RF-52) sigue ocupando la conexión. Ajuste: `signal?: AbortSignal` en `RequestOptions` → `fetch(..., { signal })`, `api.get(path, { signal })`, y `queryFn: ({ signal }) => api.get(..., { signal })`. Cuidado: el `catch` de `client.ts:72` convierte el `AbortError` en `ApiError(0, 'NETWORK')`; TanStack descarta el error de una consulta cancelada, así que no llega a toast, pero conviene relanzar el `AbortError` tal cual para no confundir en el futuro.

### M-4 — La caché de búsqueda no se entera de las ediciones

`['search', q]` con `staleTime: 10_000` y `gcTime` de 5 min; `syncCard` (`card-queries.ts`), `useArchiveCard` y `useUpdateCard` no la invalidan. Repetir la misma búsqueda tras renombrar o archivar una tarjeta muestra el título o estado viejo, 10 s si está fresca y, con `keepPreviousData`, un parpadeo del viejo al nuevo si está rancia. Ajuste: `staleTime: 0` (el debounce ya limita las peticiones; cada apertura de la paleta empieza vacía, así que la caché aporta poco) o `invalidateQueries({ queryKey: ['search'] })` en `syncCard`. Prefiero `staleTime: 0`.

### M-5 — Filas archivadas al 60 %: el fragmento baja de 4,5:1

`SearchPalette.tsx:129` `opacity-60` en toda la fila. `fg` `#2F3941` sobre blanco al 60 % ≈ `#828990` (≈ 3,4:1); `fg-muted` `#68737D` al 60 % ≈ `#A4ABB1` (≈ 2,3:1). §6.1 exige verificar toda combinación nueva (≥ 4,5:1 texto). El precedente es `CardTile` archivada (§5), pero ahí la ficha es un recordatorio; aquí el fragmento es lo que se lee para decidir. El chip "archivada" ya es el indicador no cromático. Ajuste: opacidad solo en la columna derecha (`:141`) y el fragmento al 100 %, o `opacity-75` (≈ `#5B6369`, 5,9:1 en `fg`; `fg-muted` quedaría en 3,1:1, aceptable para metadatos de 12 px si se lo considera secundario, pero mejor dejarlo al 100 %). D-3.

### M-6 — El `Textarea` de respaldo del portapapeles se aprieta en la fila de la cabecera

`LogView.tsx:128` (`ml-auto flex items-center gap-2`, sin `flex-wrap`) contiene el `Button` y el `Textarea` con `basis-full` (`:230`): en un `flex` sin `wrap`, `basis-full` no salta de línea, se encoge junto al botón y al `Select`. Solo se ve cuando el portapapeles falla (Safari, permisos). Ajuste: renderizar el `Textarea` fuera de esa fila (por ejemplo `CopySummary` devuelve el botón y expone `fallback` por un callback, o el `Textarea` se pinta tras la cabecera con el estado subido a `LogViewScreen`), o poner `flex-wrap` en el contenedor exterior (`:90`, ya lo tiene) y colocar `CopySummary` directamente ahí con `ml-auto` en el botón. Verificación visual (jsdom no mide).

### M-7 — El rango de la semana no lleva año

`LogView.tsx:110-112` "28 dic – 3 ene" en la semana 53/1 y en cualquier semana de hace un año al navegar con `‹`. Ajuste: `formatShortDate` con año cuando `range.from.slice(0,4) !== today.slice(0,4)` o cuando `from` y `to` están en años distintos ("28 dic 2026 – 3 ene 2027"). Test en `LogViews.test.tsx:134` con `?date=2026-12-30`.

### M-8 — "hoy" no cambia a medianoche con la pestaña abierta

`LogView.tsx:66` calcula `today` en cada render; nada vuelve a pintar a las 00:00. Al día siguiente la vista sigue mostrando "hoy" sobre ayer y "Hoy" deshabilitado hasta recargar o navegar. Es un caso de uso real (dejar `/today` abierto en el PC del trabajo). Ajuste barato: un `useEffect` que escuche `visibilitychange`/`focus` y fuerce un `setState` (o un `useNow` con intervalo de 60 s) para recalcular `today`. Se puede dejar para después.

### M-9 — `clock` y `STATUS_TONE` duplicados

`LogView.tsx:45-52` repite `dates.ts:64-67` (privada; exportarla) y `LogView.tsx:30-37` repite `CardDetail.tsx:26-33` (moverla a `lib/board.ts` junto a `STATUS_NAME`). Dos cambios de estilo en un sitio y se desincronizan.

### M-10 — `<Markdown className="text-sm">`: el tamaño depende del orden del CSS

`LogView.tsx:388` y `Markdown.tsx:5-15`: `cn` concatena (`cn.ts`), `PROSE` trae `text-base`, y Tailwind emite ambas utilidades en el orden que le toca, no en el del `className`. Si en el navegador las notas de Mi día salen a 14 px, es por suerte. Ajuste: un prop `size?: 'sm' | 'base'` en `Markdown` que elija la clase, o quitar `text-base` de `PROSE` y ponerla en los usos. Verificación visual.

### M-11 — El `role="status"` anuncia "Buscando…" en cada tecla

`SearchPalette.tsx:101-106,188`: con NVDA cada pulsación dispara "Buscando…" y 200 ms después "N resultados."; en una palabra de ocho letras son dieciséis anuncios. Ajuste: dejar "Buscando…" visible pero fuera de la región viva (dos `<p>`: uno `role="status"` solo con resultados/errores/"al menos 3", otro `aria-hidden` con el estado transitorio), o anunciar solo cuando `rows` cambie. D-4; confirmar con NVDA (§8).

---

## 6. Las decisiones de quien programó

No están marcadas en el código; son las que inferí leyendo (y las que me pasaron en el encargo).

1. **`?date=` y `?project=` en la URL** (`LogView.tsx:55-79`). De acuerdo: la vista es enlazable ("mira el martes"), Atrás funciona y los tests son triviales. Matiz: cada flecha hace `setParams` sin `replace` (`:78`), así que Atrás recorre día a día; a mí me gusta, pero es una decisión (D-5). Anotar en §4.4.
2. **Títulos de "Se movieron" según el período** ("hoy"/"ese día"/"esta semana"/"esa semana", `:283-290`). De acuerdo: "Se movieron hoy" sobre el martes pasado sería mentira. Anotar en §4.4.
3. **Botón "Hoy" adicional** (`:124-126`). De acuerdo: tras diez `‹` es la única vuelta rápida, y deshabilitado cuando ya estás en hoy no estorba. Anotar en §4.4.
4. **Chip con el estado actual de la tarjeta, no el de ese día** (`:324`). De acuerdo, y además es lo único posible: el `card` de `days[]` es el actual y la API no guarda el estado por día. El recorrido de "Se movieron" cuenta la historia. Conviene decirlo en §4.4 para que nadie lo tome por bug al ver "Hecho" junto a una nota del lunes.
5. **"Ir al tablero" al proyecto filtrado o al primero activo** (`:158, :271-278`). De acuerdo. Sin proyectos activos no hay enlace, que es correcto (no hay tablero al que ir).
6. **`/` y `Ctrl+K` inactivos con otro modal abierto, incluido el panel** (`useHotkeys.ts:41-51`). De acuerdo para v1: dos `aria-modal` apilados harían pelear los dos `focusin` (el del panel devolvería el foco al panel mientras la paleta lo quiere). Lo que sí echaría de menos es buscar otra tarjeta desde el panel; cuando se quiera, la forma limpia es que `Ctrl+K` cierre el panel y abra la paleta (D-6). El botón "Buscar" de la barra sigue visible tras el panel, pero la capa de clic fuera (`CardPanel.tsx:118`) lo cierra antes: consistente.
7. **Título "Buscar" visible** en el `Dialog` (`SearchPalette.tsx:37`). De acuerdo: es el nombre accesible del diálogo y cuesta 24 px; §4.6 no lo dibuja, pero tampoco lo prohíbe. Si molesta, `sr-only` en el `h2` del `Dialog` con un prop. Anotar en §4.6.
8. **Opción activa con `surface-hover`** (`:128`) para no tapar el `<mark>`. De acuerdo en la intención; en la práctica `primary-soft` sobre `surface-hover` casi no se distingue (§2.3) y es la negrita la que sostiene el resaltado en la fila activa. Cumple §6.1 (no depende solo del color). Alternativa sin coste: fila activa con borde izquierdo de 3 px `primary` y sin fondo. Lo dejaría como está.
9. **Filas archivadas al 60 %** (`:129`). Discrepo a medias por contraste: M-5.
10. **`keepPreviousData`** (`search-queries.ts:16`). De acuerdo: evita el parpadeo a lista vacía en cada tecla. Pide el ajuste de M-2 para que lo viejo no se confunda con lo nuevo.
11. **La pestaña Bitácora se abre por el valor por defecto de `CardDetail`** (`CardDetail.tsx:124` `useState<TabId>('log')`; comentario `SearchPalette.tsx:82`). De acuerdo hoy; es frágil: el día que el panel recuerde la última pestaña (o abra Descripción por defecto), el requisito del plan 6.3 se rompe sin que nadie lo toque. El test `SearchPalette.test.tsx:182` lo protege, que es lo importante. Cuando haga falta, `?tab=log` o `state.tab` desde la paleta.
12. **Dos confirmaciones de "Copiado"** (texto del botón 1,5 s + toast). De acuerdo: el botón es lo que mira el ratón y el toast lo que oye el lector.
13. **`limit=20` por consulta** (`search-queries.ts:7`). De acuerdo: 40 filas máximo en la paleta; más no se recorre con flechas.
14. **Respaldo de portapapeles con `Textarea` seleccionado** (`LogView.tsx:223-233`). Muy de acuerdo: es el único camino cuando el navegador niega `clipboard.writeText`. Solo el layout (M-6).

Dos cosas más que el código decidió bien y no estaban escritas: el `moved[]` de la API se pinta reconstruyendo el recorrido desde las entradas `moved` de `days[]` (`movePath`), así "Se movieron" no necesita una segunda llamada; y `Snippet` sanitiza en cada render sin `useMemo`, que es lo correcto (DOMPurify es barato y memorizar HTML es una tentación de bugs).

---

## 7. Decisiones que tengo que tomar

| # | Decisión | Mi propuesta |
|---|---|---|
| D-1 | I-1: volver a la vista de origen al cerrar el panel con `state.from`, o con `navigate(-1)`. | `state.from` en los tres puntos de origen; `closePanel` lo usa si existe. |
| D-2 | M-2: mientras llega la consulta nueva, atenuar + `aria-busy` y que `Enter` no abra; o solo atenuar. | Atenuar y no abrir: un `Enter` rápido tras teclear es el gesto normal y abrir lo viejo es peor que esperar 200 ms. |
| D-3 | M-5: filas archivadas de la paleta: opacidad solo en la columna derecha, `opacity-75`, o dejar el 60 % como en `CardTile`. | Opacidad solo en la columna derecha; el chip ya marca "archivada". |
| D-4 | M-11: anunciar solo los resultados (no "Buscando…"), o dejarlo y oírlo con NVDA primero. | Oírlo primero (§8, paso 3); si cansa, sacar "Buscando…" de la región viva. |
| D-5 | Flechas de fecha con `push` (Atrás recorre los días) o `replace` (Atrás sale de la vista). | `push`, como está. |
| D-6 | Decisión 6: en v1.5, `Ctrl+K` desde el panel cierra el panel y abre la paleta. | Sí, anotarlo en el plan como pendiente de v1.5; no tocar ahora. |
| D-7 | Actualizar la spec según §6: §3 (botón "Buscar" en vez de campo), §4.4 (`?date=`/`?project=`, "Hoy", títulos de "Se movieron", chip con estado actual, destino de "Ir al tablero", "Sin registros esta semana"), §4.6 (título visible, fila activa, archivadas), §6.1 (`h2`/`h3`/`h4` en Mi semana) y añadir la checklist §6.3 de la fase 6. | Sí. |

Lo que no necesita decisión y va directo al commit de ajuste: I-2, I-3, I-4, M-1, M-3, M-4 (`staleTime: 0`), M-6, M-7, M-9, M-10. M-8 puede esperar.

---

## 8. Guía de prueba manual (NVDA, teclado latinoamericano, zoom 200 %)

No pude probar con teclado real; esto es lo que falta oír y ver.

1. **`/` y `Ctrl+K`** (teclado latinoamericano): en el tablero, Shift+7 abre la paleta con el foco en el campo; dentro del campo de filtro, Shift+7 escribe `/` y `Ctrl+K` abre la paleta; AltGr+K no hace nada. Con el panel abierto, ninguno de los dos abre la paleta. `Esc` devuelve el foco a donde estaba (botón "Buscar" o campo de filtro).
2. **Combobox con NVDA**: al abrir, NVDA dice "Buscar, diálogo, Buscar tarjetas y bitácora, cuadro combinado, editable". Teclear `espero`: tras 200 ms, "4 resultados." (una vez). `↓`: anuncia el texto de la opción con el fragmento (el `<mark>` no se oye distinto; está bien) y el grupo "Bitácora" al entrar en él. `Enter`: se oye el panel de `T-12` con "Bitácora, pestaña, seleccionada".
3. **Ruido del `status`** (M-11, D-4): teclear una palabra de 8 letras despacio y contar cuántas veces se oye "Buscando…". Si molesta, aplicar M-11.
4. **I-3**: buscar algo con más de 10 resultados (`avan` o similar) y pulsar `↓` 10 veces: la fila activa debe seguir visible (hoy no).
5. **Mi semana con NVDA**: `H` recorre "Mi día"/"Mi semana" (`h1`), "Martes 21" (`h2`), proyectos (`h3`); tras I-4, `4` salta de tarjeta en tarjeta. Las flechas de fecha anuncian "semana 44, 26 oct – 1 nov" sin mover el foco.
6. **Copiar resumen**: `Tab` hasta "Copiar resumen", `Enter`: se oye el toast "Copiado" y el botón cambia 1,5 s; pegar en el vault da el markdown exacto. Con el portapapeles denegado (Chrome → Configuración del sitio → Portapapeles → Bloquear): aparece el `Textarea` con el texto seleccionado y el foco dentro (y comprobar M-6: hoy se aprieta en la fila).
7. **Zoom 200 %** (viewport ≈ 720 px): la cabecera de Mi día debe envolver (`flex-wrap`) sin scroll horizontal; la paleta (560 px máximo, `p-4` del velo) debe caber; las filas de resultado con `line-clamp-2` no deben desbordar.
8. **Cambio de día** (M-8): dejar `/today` abierto hasta pasada la medianoche y ver si sigue diciendo "hoy".

---

## 9. Qué no revisé

- La API de la fase 6 (`/log`, `/summary`, `/search`) más allá del escape del `snippet` y el `Content-Type` de `/summary`; la revisó la fase correspondiente.
- Capturas a 1024 y 1440 px (sin render): queda en la checklist.
- Rendimiento del `ILIKE` de respaldo con datos reales (RF-52 lo deja para medir).
- `/timeline` (fase 9) y el `g t`, que sigue apuntando al placeholder.

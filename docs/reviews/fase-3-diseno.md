# Revisión de la fase 3 — diseño, accesibilidad y seguridad del frontend

Fecha: 2026-10-22. Commit revisado: `85f5a8f` (`fase-3-frontend-base`). Revisé leyendo `apps/web/src/` completo contra [[../spec/02_diseno]] (§2, §3, §4.8, §5, §6), [[../spec/03_plan_implementacion]] fase 3, RS-08/RS-10/RS-12 de [[../spec/01_especificacion]] y [[../adr/0001-autenticacion-cookie-y-bearer]]. No hay capturas (el navegador no renderiza ahora mismo); lo que no se puede leer en el código lo comprobé en el build (`dist/`) y con los tests.

Comandos: `pnpm --filter web test` → 4 archivos, 20 tests en verde. `pnpm --filter web build` → `tsc --noEmit` + `vite build` en verde (CSS extraído a `assets/index-*.css`, 22 kB; JS 420 kB / 129 kB gzip; fuentes Inter autoalojadas en `assets/`).

## Veredicto: **Aprobado con cambios**

Nada bloqueante. La base es sólida: tokens exactos, ningún color suelto, cliente de API limpio respecto a RS-10, CSP compatible, foco atrapado en el diálogo con test, atajos que no se disparan en campos. Dos hallazgos importantes (`[` inalcanzable con AltGr en teclados en español; toast con "Reintentar" que desaparece a los 4 s) y una lista de menores que caben en un commit de ajuste antes de abrir la fase 4. Además, el encargo decía "6 decisiones `TODO(diseño)`": el grep da **2** `TODO(diseño)` y **2** `TODO(fase …)`; opino sobre los cuatro en §5.

---

## 1. Diseño vs `02_diseno`

### 1.1 Tokens (§2)

Comparé `apps/web/src/styles/global.css` línea por línea con las tablas de §2.1, §2.3, §2.5 y §2.6.

- §2.1: los 23 colores están con el valor exacto (hex en minúsculas, mismo valor). `--color-fg-placeholder` = `#68737d` con itálica en `::placeholder` (global.css:126-130) como pide el ajuste de la tabla.
- §2.3: los seis pares acento/suave exactos, como `--color-project-<clave>` y `-soft`. Las etiquetas (§2.4) reutilizan esos y `gris` = `--color-neutral` sobre `--color-surface-hover` (`lib/colors.ts:21`), que es justo lo que dice §2.4.
- §2.5: Inter Variable autoalojada (`@fontsource-variable/inter`), `font-feature-settings: 'cv11', 'ss01'`, mono con la pila pedida. Los cinco tamaños con su interlineado **y su peso** vía `--text-*--font-weight` (verifiqué en el CSS compilado que `.text-md` aplica 16/24/600). Nada bajo 12 px; no aparece `font-bold` en ningún componente.
- §2.6: radios 4/6 exactos; sombras exactas; transiciones 120 ms `ease-out` en botones, campos y sidebar (`duration-120 ease-out`, compila a `.12s`); `prefers-reduced-motion` anula animaciones y transiciones (global.css:141-150). Los 180 ms del panel llegan en la fase 5.
- Los espacios de nombres por defecto de Tailwind (`--color-*`, `--text-*`, `--radius-*`, `--shadow-*`) se vacían con `initial` (global.css:10-13): `bg-red-500` o `text-xl` no existen. Es la forma correcta de imponer la regla "nada de colores sueltos" y cumple el "listo cuando" de la tarea 3.1 (`grep "#[0-9A-Fa-f]{6}"` en `components/` y `pages/` da cero).
- Tokens **nuevos** que no están en §2 y hay que documentar: `--color-scrim: rgb(0 0 0 / 40%)` (fondo del diálogo, §5 lo describe como "oscurecido 40 %"), `--container-dialog: 420px`, `--container-login: 360px`, `--animate-skeleton`. Ver M-7.
- `--space-1..6` (global.css:76-81) están declarados pero **no los usa nada** (no aparecen en el CSS compilado): los utilitarios `gap-4`, `p-6`, etc. salen de `--spacing` de Tailwind (0,25 rem), que coincide en píxeles pero no restringe la escala. Ver M-7.

### 1.2 Layout (§3)

| Medida | Diseño | Código | |
|---|---|---|---|
| Sidebar | 240 px / 56 px colapsada | `w-60` / `w-14` (Sidebar.tsx:116) | ✓ |
| Barra superior | 56 px, surface, borde inferior border | `h-14 border-b border-border bg-surface` (Topbar.tsx:25) | ✓ |
| Contenido | padding 24 px sobre bg | `bg-bg p-6` (AppShell.tsx:64) | ✓ |
| Ítem activo | fondo sidebar-hover + barra blanca 3 px | `border-l-3 … aria-[current=page]:border-sidebar-fg … bg-sidebar-hover` (Sidebar.tsx:19) | ✓ |
| Logo | texto, `--text-md` 600, blanco | `text-md text-sidebar-fg` (Sidebar.tsx:120) | ✓ |
| Secciones | vistas, proyectos (punto + nombre + contador En curso), pie: Etiquetas, Tokens, Ajustes | igual; el contador se oculta cuando es 0 (Sidebar.tsx:85), detalle razonable que §3 no dice | ✓ |
| Colapso | `[`, recordado en `localStorage` | `useHotkeys({'[': …})`, clave `logbook.sidebarCollapsed` | ✓ |
| < 1024 px | sidebar colapsada | `matchMedia('(max-width: 1023px)')` (AppShell.tsx:21-31) | ✓ (ver M-3) |

Desviaciones: ninguna de medida. Colapsada, el logo es una "L" (Sidebar.tsx:120); §3 no lo dice, me parece bien.

### 1.3 Componentes y estados (§5)

| Componente | Reposo | Hover | Foco | Activo | Deshabilitado | Nota |
|---|---|---|---|---|---|---|
| Button primario | ✓ primary/blanco, sm, 32 px | ✓ primary-hover | ✓ anillo global | ✓ primary-hover + `translate-y-0` | ✓ opacidad 50 + not-allowed | |
| Button secundario | ✓ | ✓ surface-hover | ✓ | ✓ borde primary | ✓ | |
| Button destructivo | ✓ texto y borde danger | ✓ danger-soft | ✓ anillo danger (`focus-visible:outline-danger`) | — | ✓ | |
| Input / Textarea | ✓ border-strong, 32 px | ✓ borde fg-muted | ✓ borde primary + anillo | — | ✓ fondo bg, texto muted | `aria-invalid` → borde danger (Input.tsx:5), no está en §5 pero es lo esperado |
| Select | ✓ como Input + chevron | ✓ | ✓ | ✗ lista nativa | ✓ | TODO(diseño) 1, §5 de abajo |
| Checkbox | ✓ 16 px, border-strong, radio 4 | ✓ borde primary | ✓ | ✓ fondo primary, check blanco | ✓ opacidad 50 | |
| Chip | ✓ acento sobre soft, 20 px, sm, xs | | | | | |
| SidebarItem | ✓ fg-muted | ✓ sidebar-hover + blanco | ✓ anillo blanco (`.on-sidebar :focus-visible`) | ✓ | | |
| Dialog | ✓ surface, md, lift, scrim 40 % | | ✓ foco atrapado (test) | | | ver M-4, M-5 |
| Toast | ✓ surface, borde izq 3 px, 4 s, abajo a la derecha | | | | | ver I-2 |
| Tooltip | ✓ fg/blanco, xs, 300 ms | | ✓ aparece con foco | | | ver M-6 |
| Skeleton | ✓ surface-hover + animación suave | | | | | |

Carga/errores (§5 final): skeleton de pantalla completa solo en el primer arranque (RequireAuth.tsx:14-22) ✓; 401 → login con aviso ✓; 403 → toast con `message` ✓; error de red → `ApiError NETWORK` con mensaje fijo y botón "Reintentar" en el guard ✓.

### 1.4 Login (§4.8)

Pantalla centrada, logo texto, campo contraseña con `autocomplete="current-password"`, botón "Entrar" ✓. Mensajes: 401 → "Contraseña incorrecta", 429 → "Demasiados intentos, espera 15 minutos", sesión vencida → "Tu sesión venció, vuelve a entrar" como texto muted bajo el formulario con `role="status"` (LoginPage.tsx:10-18, 79-83) ✓. Los tres tienen test (App.test.tsx:75-129). El error va con `role="alert"` + `aria-describedby` + `aria-invalid` ✓. Para otros códigos muestra `error.message` de la API, que la fase 2 ya dejó genérico: aceptable.

---

## 2. Accesibilidad (§6)

Lo que está bien y comprobé: `:focus-visible` global de 2 px + 2 px de offset y blanco en la sidebar; `Dialog` con `role="dialog"`, `aria-modal`, `aria-labelledby`, foco al entrar, Tab/Shift+Tab ciclando, Esc y retorno del foco (Dialog.test.tsx cubre los tres); `aria-current="page"` de `NavLink`; `nav` con nombres; un solo `h1` en la barra superior; iconos `aria-hidden` + `focusable="false"`; botones de icono con `aria-label`; `<html lang="es">`; `prefers-reduced-motion`; atajos que no actúan en `input`/`textarea`/`select`/contentEditable ni con un modal abierto (useHotkeys.test.tsx); sidebar colapsada con `aria-label` en cada enlace y tooltip al pasar y al enfocar; `aria-expanded`/`aria-controls` en el botón de colapso.

Contrastes de combinaciones **nuevas** que no están en §2 (fórmula WCAG 2.x, calculados hoy):

| Combinación | Dónde | Ratio | |
|---|---|---|---|
| `#B8C4C8` sobre `#17494D` | contador "en curso" cuando el ítem está en hover/activo (Sidebar.tsx:87 no cambia a blanco) | 5,6:1 | ✓ |
| blanco sobre `#17494D` | texto y anillo de foco del ítem activo | 10,0:1 | ✓ |
| `#1F73B7` sobre `#F8F9F9` | anillo de foco sobre el fondo de la app | 4,75:1 | ✓ (≥ 3:1) |
| `#CC3340` sobre `#FDF2F3` | hover del botón destructivo | 4,7:1 | ✓ |
| `#68737D` sobre `#F8F9F9` | input deshabilitado | 4,6:1 | ✓ |
| `#CC3340` sobre blanco | error del login | 5,1:1 | ✓ |
| `#68737D` sobre blanco | chevron del Select | 4,8:1 | ✓ |
| `#2F3941` fondo + blanco | tooltip | 11,8:1 | ✓ |
| acentos de proyecto sobre `#03363D` | punto junto al nombre en la sidebar | **2,15–2,41:1** (los seis, no solo turquesa) | ver M-9 |
| `#17494D` sobre `#03363D` | divisor del pie de la sidebar | 1,3:1 | decorativo, no aplica |

Hallazgos de accesibilidad: I-1, I-2, M-1, M-2, M-3, M-4, M-5, M-6, M-8, M-9 (abajo).

---

## 3. Seguridad del frontend

Todo lo que pedía la fase está, y lo verifiqué contra el código y el build:

- **Nada de auth en el navegador** (RS-10, ADR 0001): `grep localStorage|sessionStorage apps/web/src` solo da `AppShell.tsx:14,44` (preferencia de sidebar). El cliente (`api/client.ts`) no toca tokens; la única memoria es `sessionActive`, un booleano en el módulo. El test de login comprueba `localStorage.length === 0` y `sessionStorage.length === 0`.
- **CSRF**: `X-Logbook-CSRF: 1` en `POST/PATCH/PUT/DELETE` y nunca en `GET` (client.ts:52, test client.test.ts:189-215 con interceptor de msw). `POST /auth/login` también lo lleva (test App.test.tsx:87-109). `credentials: 'same-origin'` ✓; la URL se arma con `window.location.origin + '/api/v1'`, así que `Origin` siempre coincide con `APP_ORIGIN`.
- **Sin HTML inyectado**: cero `dangerouslySetInnerHTML`/`innerHTML`/`eval` en `src/`. DOMPurify no hace falta todavía (markdown y `snippet` llegan en fases 5 y 6; RS-12 sigue pendiente ahí, no aquí).
- **CSP de RS-08** (`style-src 'self'` sin `unsafe-inline`): el `dist/index.html` solo tiene `<script type="module" src>` y `<link rel="stylesheet">`, sin `<script>` ni `<style>` inline; Tailwind queda en `assets/index-*.css`; las fuentes de `@fontsource` van por `@font-face` a `assets/*.woff2` (`font-src 'self'`). En el bundle no hay `setAttribute("style")`, `createElement("style")`, `new Function` ni `eval(`. El único `style={…}` del código es la posición del `Tooltip` (Tooltip.tsx:53-61): React lo aplica por CSSOM (`element.style.prop = …`), que la CSP **no** bloquea (`style-src` gobierna el atributo `style` del marcado y `setAttribute`, no el CSSOM). Queda justificado; lo anoto como verificado para que nadie lo "arregle". En dev, Vite inyecta `<style>` para HMR, pero el servidor de Vite no sirve la CSP (la sirve la API en producción), así que no choca.
- **Redirección tras login**: `destination()` (LoginPage.tsx:21-26) solo acepta `from` que empiece por `/` y no por `//`, y el `from` sale de `location.state` que escribe `ApiBridge` con `pathname + search` del router, no de la URL ni de la respuesta. `navigate()` de React Router usa `pushState`, que no puede cambiar de origen. Sin open redirect.
- **Errores**: `ApiError` expone solo `status`, `code`, `message`, `details` del JSON de la API (ya genéricos desde la fase 2); si la respuesta no es JSON (p. ej. un 502 del proxy), cae en `Error <status>` (client.ts:95-97). El 403 se muestra tal cual en un toast, como pide §5. El 401 en sesión hace `queryClient.clear()` antes de ir al login (ApiBridge.tsx:30): no quedan datos en caché tras vencer la sesión. Bien.
- **Rutas**: `/_kit` está dentro de `RequireAuth` (App.tsx:54), no es pública.

Sin hallazgos de seguridad bloqueantes ni importantes. Solo la decisión sobre `/_kit` en producción (§5, TODO 2).

---

## 4. Hallazgos

Severidad: **B** bloqueante, **I** importante, **M** menor. Ninguno bloqueante.

### I-1 — `[` no se puede teclear con AltGr (teclados en español)

- `hooks/useHotkeys.ts:32`: `if (e.defaultPrevented || e.isComposing || e.altKey) return;`
- Diseño §6.2: `[` colapsa/expande la sidebar. En las distribuciones española y latinoamericana `[` y `]` se escriben con **AltGr**, que en Windows llega como `ctrlKey && altKey`. Con el código actual, la línea 32 descarta el evento por `altKey`, y aunque no lo hiciera, la línea 39 lo trataría como `ctrl+[`. El test pasa porque `user.keyboard('[')` no simula AltGr. Si uso distribución en inglés no me afecta; si uso la latinoamericana (lo más probable), el atajo no existe para mí.
- Ajuste: tratar AltGr como "sin modificador": `const altGr = e.ctrlKey && e.altKey; if (e.altKey && !altGr) return; const ctrl = (e.ctrlKey || e.metaKey) && !altGr;`. Test: `fireEvent.keyDown(document, { key: '[', ctrlKey: true, altKey: true })` dispara el manejador de `[`; `{ key: 'k', altKey: true }` (Alt solo) no dispara nada.

### I-2 — El toast con acción "Reintentar" desaparece a los 4 s sin que el foco llegue a él

- `components/ui/Toast.tsx:28,58-64`: `DURATION_MS = 4000` y `AutoDismiss` para todos los toasts, también los que traen `action`.
- Diseño §5: "Error de red: toast rojo + reintento". Un toast con un botón que se esfuma en 4 s no es alcanzable con teclado (el foco sigue donde estaba, llegar al botón con Tab lleva más de 4 s) y roza WCAG 2.2.1 (límite de tiempo sin control). Los de éxito ("Copiado") sí pueden ser efímeros.
- Ajuste: no autocerrar cuando hay `action` (queda hasta que se cierre con el botón o con la acción); como mínimo, pausar el temporizador con hover/foco dentro del toast. Test: `toast.show({ tone: 'danger', message, action })` + `vi.advanceTimersByTime(10_000)` → el `alert` sigue en el documento; sin `action` → desaparece.

### M-1 — `aria-label` y `title` en un `<span>` genérico (contador de la sidebar)

- `Sidebar.tsx:86-92`: `<span title="Tarjetas en curso" aria-label="2 en curso">2</span>`.
- ARIA 1.2 prohíbe `aria-label` en elementos sin rol; los lectores lo aplican de forma desigual, y `title` no es accesible por teclado. El nombre del enlace lo salva el algoritmo de nombre-desde-contenido, pero es frágil.
- Ajuste: `<span aria-hidden="true">2</span><span class="sr-only">, 2 en curso</span>` y quitar `title` (el tooltip ya no aporta nada). Test: `getByRole('link', { name: 'Personal, 2 en curso' })`.

### M-2 — Enlace colapsado anunciado dos veces

- `Sidebar.tsx:37` (`aria-label={collapsed ? label : undefined}`) + `Tooltip` que añade `aria-describedby` con el mismo texto (Tooltip.tsx:40).
- Con la sidebar colapsada, NVDA lee "Mi día, enlace, Mi día". No es un error, es ruido.
- Ajuste: que `Tooltip` reciba `describe?: boolean` (por defecto `true`) y en `SidebarItem` colapsado pasar `describe={false}`, dejando `aria-label` como nombre. O al revés: sin `aria-label` y que el tooltip sea `aria-labelledby`. Lo primero es una línea.

### M-3 — `[` bajo 1024 px cambia un estado que no se ve

- `AppShell.tsx:38` (`collapsed = userCollapsed || narrow`) y `Sidebar.tsx:159-160` (el botón dice "Expandir" y `aria-expanded=false`).
- Con la ventana estrecha, pulsar `[` o el botón alterna `userCollapsed` sin efecto visible, y al ensanchar la ventana la sidebar aparece en el estado contrario al esperado. §3 dice que bajo 1024 px "la sidebar se colapsa", no que se bloquee, pero la UI miente al decir "Expandir".
- Ajuste: con `narrow`, el botón va `aria-disabled` con tooltip "La barra lateral se colapsa bajo 1024 px" y `[` no hace nada. Test con `matchMedia` falso que devuelva `matches: true`.

### M-4 — El contenedor del diálogo quita su propio anillo de foco

- `Dialog.tsx:92`: `focus:outline-none` en el `div[role=dialog]` con `tabIndex=-1`.
- §6.1: "Foco visible siempre". Solo recibe foco cuando no hay nada enfocable dentro (Dialog.tsx:38), caso raro, pero en ese caso el teclado no ve dónde está. Un anillo sobre el borde del diálogo no molesta.
- Ajuste: quitar `focus:outline-none` (el `:focus-visible` global ya resuelve el caso del ratón).

### M-5 — La "red de seguridad" del foco se traga los toasts y el scroll del fondo sigue vivo

- `Dialog.tsx:41-44`: cualquier `focusin` fuera del diálogo devuelve el foco adentro. Los toasts se montan en `document.body` (Toast.tsx:81) con `z-60`, encima del diálogo (`z-50`): si aparece un toast con un diálogo abierto, su botón "Cerrar aviso" no se puede enfocar ni clicar con efecto (el `focusin` lo devuelve al diálogo).
- Además no hay bloqueo de scroll del `body` mientras el diálogo está abierto (la rueda sobre el scrim desplaza el fondo).
- Ajuste: ignorar en `onFocusIn` los objetivos dentro de `[role="region"][aria-label="Avisos"]`; añadir `document.body.style.overflow = 'hidden'` en el efecto (CSSOM, compatible con la CSP) con su limpieza. Test: toast abierto sobre diálogo → `user.click('Cerrar aviso')` cierra el toast.

### M-6 — El tooltip se queda flotando al hacer scroll

- `Tooltip.tsx:19-30`: posición `fixed` calculada una vez al abrir; no se cierra ni se recalcula con scroll.
- La `nav` de la sidebar tiene `overflow-y-auto` (Sidebar.tsx:124): con muchos proyectos y la sidebar colapsada, el tooltip queda donde estaba el ítem.
- Ajuste: `window.addEventListener('scroll', hide, true)` mientras `pos` no sea `null`. Sin test (jsdom no hace layout); comprobar a mano en la fase 4.

### M-7 — Escala de espaciado sin imponer, tokens muertos y tokens sin documentar

- `global.css:76-81` declara `--space-1..6` que nada usa; `LoginPage.tsx:54` usa `mb-5` (20 px, fuera de la escala 4/8/12/16/24/32 de §2.6); `ShortcutsDialog.tsx:7` usa `max-w-lg` (512 px, un ancho suelto).
- Regla 2 del plan: "cero tamaños sueltos". No es grave (son 20 px y un ancho de un diálogo de ayuda), pero el mecanismo que lo impediría no existe.
- Ajuste: borrar `--space-*` y anotar en `global.css` que la escala es `--spacing` de Tailwind con los multiplicadores 1, 2, 3, 4, 6, 8 (4…32 px); `mb-5` → `mb-6`; `max-w-lg` → un token `--container-dialog-wide: 560px` (que después sirve para la paleta de búsqueda de §4.6). Documentar en §2 de `02_diseno` los tokens nuevos: `--color-scrim`, `--container-dialog`, `--container-login`, `--animate-skeleton`.

### M-8 — Atajos sensibles a Bloq Mayús

- `useHotkeys.ts:51`: busca `table[e.key]` tal cual; con Bloq Mayús activo `e.key` es `N` y `n` no dispara.
- Ajuste: normalizar las teclas de una letra con `toLowerCase()` cuando `!e.shiftKey` (así `?` sigue llegando como `?`). Test: `fireEvent.keyDown(document, { key: 'N' })` dispara `n`.

### M-9 — Los puntos de proyecto sobre la sidebar quedan apagados (2,2:1)

- `Sidebar.tsx:79-82` pinta el punto con el acento (`bg-project-<clave>`) sobre `#03363D`. Los seis acentos dan entre 2,15:1 y 2,41:1, no solo el turquesa que dudaba en §2.3.
- No es un fallo de WCAG: el punto es `aria-hidden`, el nombre está al lado y el color no es el único indicador. Pero no servirá para distinguir proyectos de un vistazo, que es su función.
- Ajuste (decisión mía, ver §6): en la sidebar usar el **suave** (`bg-project-<clave>-soft`, ≥ 12:1 sobre el verde) o un punto con borde blanco de 1 px; en la barra superior y en las listas sobre blanco, el acento como hasta ahora.

### M-10 — `Section` de la sidebar crea landmarks de más

- `Sidebar.tsx:102-108`: `<section aria-label>` dentro de `<nav>` produce tres regiones anidadas ("Vistas", "Proyectos", y el `nav` "Secundaria" con otro `nav`). En la lista de landmarks de NVDA aparece como cinco entradas para una barra lateral.
- Ajuste: `Section` como `<div role="group" aria-label>` (o sin rol, dejando el `h2` "Proyectos" que ya existe). Sin test.

### M-11 — `Button iconOnly` no exige `aria-label` en el tipo

- `Button.tsx:17-18`: el comentario dice "exige `aria-label`", el tipo no.
- Ajuste: unión discriminada `({ iconOnly: true; 'aria-label': string } | { iconOnly?: false })`. Es una línea y convierte la regla de §6.1 en error de compilación.

---

## 5. Los `TODO` del código

`grep -rn "TODO" apps/web/src` da cuatro, dos de ellos `TODO(diseño)`:

1. **`components/ui/Select.tsx:8` — `TODO(diseño)`: §5 pide la lista desplegable con el ítem resaltado en primary-soft; el `<select>` nativo no admite ese estilo.** Mi opinión: **mantener el nativo y corregir §5**. En v1 los selects son prioridad, proyecto, zona horaria y color de etiqueta: pocos ítems, sin búsqueda. Un listbox propio son ~150 líneas más el patrón ARIA combobox (teclas, `aria-activedescendant`, cierre al perder foco) para ganar un color de hover. El único selector que de verdad necesitará algo propio es el multi-select de etiquetas con chips (§4.2, fase 5), y ese sí puede llevar el resaltado primary-soft. Cambio en §5: fila Select, columna "Activo / seleccionado" → "lista nativa del navegador (v1); el multi-select de etiquetas lleva ítem resaltado primary-soft".

2. **`pages/KitPage.tsx:17` — `TODO(diseño)`: §5 pide borrar `/_kit` antes de publicar.** Mi opinión: **no borrarlo; sacarlo del build de producción**. El kit es la única comprobación visual de los estados de §5 y lo voy a necesitar en cada fase. Está detrás de Cloudflare Access y del login, así que publicarlo tampoco expone nada; pero tampoco aporta nada en producción. Lo limpio: `{import.meta.env.DEV && <Route path="_kit" element={<KitPage />} />}` en `App.tsx` y Vite lo elimina del bundle (verificar: `grep -c "Kit de componentes" dist/assets/*.js` da 0). Cambio en §5: "el kit (`/_kit`, solo en desarrollo) los muestra todos".

3. **`components/layout/AppShell.tsx:50` — `TODO(fase 4.4 / 6.3)`: `n`, `/` y `Ctrl+K` se enlazan cuando existan.** De acuerdo. Dos cosas para cuando se haga: `/` en Firefox abre la búsqueda rápida y el `preventDefault` de useHotkeys.ts:53 ya lo evita; y en la distribución latinoamericana `/` es Shift+7, que sí llega como `e.key === '/'` sin AltGr, así que no tiene el problema de I-1.

4. **`components/layout/Topbar.tsx:37` — `TODO(fase 6.3 / 4.4)`: "Buscar" y "Nueva tarjeta" como botones deshabilitados.** De acuerdo como marcador: un botón `disabled` no entra en el orden de tabulación ni promete nada. Si la fase 4 se retrasa y esto llega a producción, prefiero ocultarlos a mostrarlos apagados, pero no vale la pena tocarlo ahora.

---

## 6. Decisiones que tengo que tomar

| # | Decisión | Mi propuesta |
|---|---|---|
| D-1 | I-1: ¿qué distribución de teclado uso? Si es latinoamericana o española, el arreglo de AltGr va antes de la fase 4. | Arreglar AltGr en `useHotkeys` (vale para cualquier distribución) en vez de cambiar la tecla. |
| D-2 | I-2: toast con acción persistente, o solo más largo (8 s con pausa en hover/foco). | Persistente hasta cerrarlo: un "Reintentar" que se va solo no sirve. Anotar en §5. |
| D-3 | TODO 1: Select nativo o listbox propio. | Nativo en v1; corregir §5. |
| D-4 | TODO 2: `/_kit` borrado o solo en dev. | Solo en dev (`import.meta.env.DEV`); corregir §5. |
| D-5 | M-9: puntos de proyecto en la sidebar con acento (2,2:1) o con suave (≥ 12:1). | Suave en la sidebar, acento sobre blanco. Anotar en §3. |
| D-6 | M-7: tokens `--space-*` muertos y tokens nuevos (`scrim`, `container-*`) sin documentar. | Borrar `--space-*`, documentar los nuevos en §2.7. |

Lo que no necesita decisión y va directo al commit de ajuste: M-1, M-2, M-3, M-4, M-5, M-6, M-8, M-10, M-11.

## 7. Qué no revisé

- Nada renderizado: medidas, hover, foco y tooltip están verificados en el código y el CSS compilado, no en pantalla. La captura de `/_kit` a 1440 px (tarea 3.3) sigue pendiente de hacerse a mano; igual que "login real contra la API de dev deja la cookie `__Host-lb_session` con `HttpOnly`" (tarea 3.4), que no probé porque no levanté la API.
- Zoom al 200 % y NVDA: son de la checklist de fin de fase 5 (§6.3).

# CLAUDE.md — Bitácora técnica y memoria de trabajo

> Este archivo es la memoria viva del proyecto para Claude (y para el equipo).
> Aquí se registra **cómo funciona el proyecto**, los **cambios realizados**, los
> **errores encontrados y su solución**, y las **lecciones aprendidas** para no
> repetir los mismos fallos. Mantener actualizado en cada intervención.

---

## 1. Resumen del proyecto

- **Nombre:** Connexo Sellers (app interna: `connexo-ventas-app`).
- **Qué es:** App web (SPA) de gestión de ventas, comisiones, red de
  vendedores/distribuidores, inventario por sede y academia de certificación
  para el ecosistema Connexo (tarjetas/hardware NFC + planes SaaS PRO/ULTRA).
- **Stack:** React 19 + Vite 8, Framer Motion, lucide-react, jsPDF (reportes).
- **Backend:** Supabase (PostgreSQL + REST). **No usa Supabase Auth.**
- **Gestor de paquetes:** pnpm (`pnpm-lock.yaml`, `pnpm-workspace.yaml`).
- **Hosting:** Vercel (deploy automático al hacer push a `main`).
- **Node requerido:** **24.x** (definido en `package.json > engines`).

## 2. Arquitectura (mapa rápido)

| Archivo | Rol |
|---------|-----|
| `src/lib/supabase.js` | Crea el cliente Supabase con las env vars `VITE_SUPABASE_*`. |
| `src/services/dataService.js` | **Núcleo de toda la lógica de negocio** (login, métricas, comisiones, ventas, equipo, inventario, sedes, seeds). |
| `src/App.jsx` | Estado global, navegación por tabs, dashboard, herramientas de admin, generación de PDF. |
| `src/components/auth/Login.jsx` | Pantalla de acceso + accesos rápidos de prueba. |
| `src/components/team/TeamManager.jsx` | Crear/gestionar red, asignar rango (tier), insignias, eliminar usuarios. |
| `src/components/sales/SaleForm.jsx` | Modal para registrar una venta (PRO/ULTRA/CONNECTA, anual/mensual). |
| `src/components/inventory/InventoryManager.jsx` | Almacén por sede + pedidos de stock. |
| `src/components/academy/Academy.jsx` | Cursos + examen de certificación. |
| `src/components/badges/BadgeGrid.jsx` | Catálogo de 12 insignias (`BADGES_INFO`). |
| `src/components/layout/BottomNav.jsx` | Navegación inferior (varía según rol). |
| `supabase/schema.sql` | Esquema de las 6 tablas + desactivación de RLS. |

### Patrón clave: "Supabase con fallback a LocalStorage"
Casi todas las funciones de `dataService.js` siguen el patrón
`try { ...supabase... } catch { ...localStorage... }`. Si Supabase no responde,
la app **sigue funcionando con datos locales del navegador**. ⚠️ Esto puede
ocultar problemas de conexión: la app "parece" andar aunque la base esté caída.

## 3. Base de datos (Supabase)

- **Proyecto actual:** `aisjtkezgumawgjmwckb` (URL en `.env`).
- **Tablas (6):** `profiles`, `sales`, `inventory`, `inventory_requests`,
  `academy_courses`, `sedes`. Esquema completo en `supabase/schema.sql`.
- **RLS:** debe estar **DESACTIVADO** en las 6 tablas (la app usa la `anon key`
  directamente, sin Supabase Auth). Ver lección #1.
- **Credenciales:** en `.env` (local, ignorado por git) y en **Vercel →
  Environment Variables** (producción). Los dos deben coincidir.

## 4. Roles, niveles y comisiones (lógica de negocio)

> Fuente de verdad: `dataService.js` (`calcMetrics`, `TIERS`, `PLANS`).

### Roles
- `SUPER_ADMIN` — control total: ve todo, crea cualquier rol, certifica, asigna
  rangos, gestiona sedes, siembra/purga datos. No vende ni gana comisión.
- `DISTRIBUTOR` — construye una red de vendedores; gana comisión propia +
  "override" sobre las ventas de su red. Maneja inventario.
- `SELLER` — vende; gana comisión solo si está **certificado**.

### Super Admin hardcodeado (en `dataService.login`)
- `thony.karter@gmail.com`, clave `ConnexoApp666`. **Es el único.**
- Se **crea solo** en su primer login si no existe en `profiles`.
- Es el **Master Admin** (único que puede borrar sedes).
- ⚠️ `emapmvisual@gmail.com` fue **eliminado de raíz** el 2026-07-22 (código, docs y DB).
  No re-añadirlo.

### Planes y precios (`PLANS` / `SaleForm`)
| Plan | Anual | Mensual |
|------|-------|---------|
| PRO | $97.00 | $9.00 |
| ULTRA | $197.00 | $17.00 |
| CONNECTA | Gratis (prueba 7 días, 0 comisión) | — |

### Niveles, cuotas y comisiones (cifras vigentes desde 2026-08-05)

| Nivel | Planes vendidos | Comisión | Meta anuales/mes | Sueldo base |
|-------|-----------------|----------|------------------|-------------|
| VENDEDOR PRO | 31 | 7% | 8 | $250 |
| VENDEDOR ULTRA | 50 | 9% | 13 | $350 |
| DISTRIBUIDOR 1 | 100 | 12% | 25 | $500 |
| DISTRIBUIDOR 2 | 200 | 15% | 50 | $700 |
| DISTRIBUIDOR 3 | 300 | 18% | 75 | $850 |

> ⚠️ **TODO SE CUENTA POR MES CALENDARIO Y SE REINICIA EL DÍA 1.** Tanto los
> planes para el nivel como las anuales para el sueldo base. Un mes flojo puede
> hacer *bajar* de ULTRA/D2/D3; PRO y D1 son niveles base y no se pierden.

**Vendedor** (sobre el precio del plan):
- VENDEDOR PRO → 7% (nivel base; su cuota son 31 planes en el mes).
- VENDEDOR ULTRA → 9% (a partir de 50 planes **en el mes**).

**Distribuidor** (sobre el volumen de su red = él + sus vendedores):
- DISTRIBUIDOR 1 → 12% (base, cuota 100) · DISTRIBUIDOR 2 → 15% (≥200) ·
  DISTRIBUIDOR 3 → 18% (≥300), todo **en el mes**.

**Comisión por venta** = `precio × tasa` (solo si el vendedor está certificado;
si no, 0). El distribuidor padre recibe además un **override** = `precio × tasa_del_padre`.

### Regla clave: las ventas del vendedor suman a su distribuidor
Cuando un vendedor **hijo** de un distribuidor vende un plan, esa venta cuenta
**dos veces**: para el vendedor y para el total de su distribuidor. Implementado en
tres puntos (no romperlos):
1. `calcMetrics` (rama DISTRIBUTOR): `teamIds = [uid, ...hijos]` y cuenta las
   ventas de todos ellos → así sube de nivel por volumen de red.
2. `registerSale`: calcula el **override** del padre (`precio × tasa_del_padre`)
   y se lo abona a su `wallet_balance`.
3. `getSalesForTeam`: el historial del distribuidor incluye las ventas de sus hijos.

### Meta mensual de ventas anuales (`annualSalesGoal`)
Cuenta solo planes con "ANUAL" del **mes calendario actual**. Desbloquea el
"base" del nivel. Umbrales: PRO 8 · ULTRA 13 · DIST.1 25 · DIST.2 50 · DIST.3 75.

### Qué número muestra cada tarjeta del dashboard (¡no mezclar mes e histórico!)
Como el nivel, la comisión y el sueldo base se calculan **por mes**, el dashboard
muestra el mes; lo acumulado va siempre etiquetado como "Histórico".

| Elemento | Qué muestra |
|----------|-------------|
| Barra "Progreso de Nivel" | planes del mes / **objetivo del siguiente rango** (o su cuota si ya es el máximo) |
| "Objetivo de Rango" | el **mismo** objetivo que la barra, en texto |
| Tarjeta MIS VENTAS / VENTAS RED | planes del mes / **cuota del nivel actual**, con "Histórico: N" debajo |
| Tarjeta SUELDO BASE | "Req: anuales del mes / meta del nivel" |
| Tarjeta COMISIÓN | `metrics.rate` del nivel del mes |
| Tarjeta BILLETERA | acumulada de siempre (etiquetada "Comisiones acumuladas") |
| Super Admin "Ventas del mes" | del mes, con "Histórico: N" debajo |

**Fuente única: la constante `NIVELES` en `App.jsx`** (`cuota`, `siguiente`,
`objetivo`) más `planesMes`. La barra, el objetivo de rango y la tarjeta de ventas
salen los tres de ahí, para que no puedan volver a divergir. Se resuelve por
`metrics.level` (nivel real calculado), **nunca** por `user.tier` (rango manual):
un vendedor en AUTO que ya llegó a ULTRA debe ver los datos de ULTRA.

⚠️ Ojo: la cuota y el objetivo son números distintos a propósito. Un VENDEDOR PRO
ve "14 / 31" en la tarjeta (su cuota) y "14 / 50" en la barra (lo que necesita para
ser ULTRA). No es un error.

### Historial por mes y por rol (Super Admin)
En la pestaña **Movimientos** hay tres filas de filtros: plan, **mes** y **rol**
(este último solo para el Super Admin). El selector de mes se arma solo con los
meses que existan en los datos (`monthKey`/`monthLabel` en `App.jsx`); "🗓️ Histórico"
muestra todo y el mes en curso lleva un punto •. Arriba de la lista hay un resumen
de lo filtrado: planes, anuales, facturado y comisiones.
El Super Admin ya recibía TODAS las ventas (`getSalesForTeam` no filtra por fecha),
así que el filtrado es en cliente: no hace falta tocar Supabase.

### Tier manual vs. AUTO
El Super Admin puede fijar el rango (tier) manualmente o dejarlo en AUTO
(se calcula por número de ventas del mes en curso). **Esto no se toca:** el
selector vive en `TeamManager.jsx` (dropdown "🤖 CÁLCULO AUTO" + los `TIERS` del
rol) y escribe `profiles.tier`. Con tier manual, `calcMetrics` respeta el rango
asignado pero igual sube solo si el vendedor supera el umbral del siguiente nivel.
Si `tier_start_date` cae dentro del mes en curso, el conteo arranca en esa fecha
en vez del día 1.

## 5. Cómo crear usuarios
- **Super Admin:** automático al primer login con las credenciales hardcodeadas.
- **Distribuidores / Vendedores / otros admins:** desde la app, tab **Admin/Red**
  → "Crear Nuevo" (rol, rango, sede). Clave temporal por defecto: `connexo123`.
- Un distribuidor solo puede crear **vendedores** dentro de su propia red.

## 6. Deploy y entornos
- **Local:** `pnpm install` → `pnpm dev`. Vite lee `.env` **solo al arrancar**
  (cambios en `.env` requieren reiniciar el dev server).
- **Producción:** push a `main` → Vercel construye y publica. Cambiar env vars en
  Vercel **requiere Redeploy** para que apliquen.

---

## 7. Registro de cambios (changelog)

### 2026-08-07 — "Credenciales inválidas" al entrar con un vendedor recién creado
- **Reporte:** "creo un vendedor desde el super admin y no me deja entrar, dice
  credenciales inválidas". **La creación no fallaba**: el perfil estaba en la
  base con la clave correcta y la consulta de login devolvía la fila. Fallaba el
  **login**, y el mensaje no permitía saber por qué.
- **Causa raíz — un solo mensaje para dos fallos distintos.** `login` buscaba con
  `.eq('email', …).eq('password', …)` en la **misma** consulta, así que "ese
  correo no existe" y "la clave no coincide" daban idéntico resultado y acababan
  en "Credenciales incorrectas". Sin saber cuál de los dos era, no hay forma de
  corregirlo desde la pantalla.
- **Y el `eq` del correo es exacto:** un espacio final (los teclados del móvil lo
  añaden al autocompletar) o una mayúscula hacían "no existe la cuenta" aunque la
  cuenta estuviera perfecta. Nada normalizaba el correo, ni al crear ni al entrar.
- **Arreglos:**
  - `login` normaliza (`trim` + minúsculas el correo, `trim` la clave), busca
    **solo por correo** y compara la clave en JS → mensajes separados: *"No existe
    ninguna cuenta con ese correo"* vs. *"La contraseña no coincide. Si la cuenta
    es nueva, la clave temporal es: connexo123"*.
  - Reintento sin distinguir mayúsculas (`ilike`) para las cuentas viejas ya
    guardadas con mayúsculas. ⚠️ `ilike` trata `_` como comodín y hay correos con
    guion bajo, así que la igualdad real se reconfirma en JS.
  - `addTeamMember` y `updateProfile` guardan el correo ya normalizado, para que
    el problema no vuelva a entrar por la puerta de la creación.
  - El "no se pudo verificar" final ya no dice "credenciales incorrectas": si se
    llega ahí es que **no hubo conexión** con la base (el fallback local tampoco
    encontró nada), y decir "credenciales" mandaba a diagnosticar lo que no era.
  - Duplicado de correo → *"Ya existe una cuenta con el correo X"* en vez del
    texto crudo de Postgres.
- **Bug latente encontrado al probar (Lección #8 otra vez):** en `addTeamMember`
  la actualización de la caché `connexo_team` estaba **dentro del `try` del
  INSERT**. El usuario ya estaba guardado en la base, pero un fallo de
  `localStorage` (cuota, JSON corrupto) saltaba al `catch`, mostraba "No se pudo
  registrar" y **caía al fallback offline, que lo duplicaba en local**. Ahora la
  caché va en su propio `try` y nunca tumba la creación.
- **Verificado** con el `dataService` real contra Supabase (Vite +
  `ssrLoadModule`), 8 casos de login: correo con espacios ✅, en MAYÚSCULAS ✅,
  clave con espacios ✅, clave equivocada → mensaje de clave, correo inexistente →
  mensaje de correo, rol equivocado → "Acceso denegado", super admin con
  mayúsculas ✅. Y el ciclo crear (correo sucio) → entrar → duplicado → borrar.
- 🔎 **Ojo:** la base está **purgada** — quedan 2 perfiles y **0 ventas** (el
  2026-08-06 eran 24 y 1.405). Alguien corrió "PURGAR". `inventory` conserva sus
  17 filas y `sedes` las 2.

### 2026-08-06 (6) — Carga del historial en dos fases
- **Al entrar solo se piden las ventas del MES en curso**; el histórico completo
  llega después, en segundo plano, sin bloquear la pantalla. Medido en el Super
  Admin: la primera carga baja de **908 ms / 632 KB** a **380 ms / 310 KB**.
  - Lo importante no es el número de hoy sino que **deja de crecer**: el mes en
    curso es más o menos constante, mientras que el histórico se acumula sin
    límite. Antes, cada mes nuevo hacía el arranque más lento para siempre.
- `getSales` y `getSalesForTeam` aceptan `{ desde }` (filtro `gte` sobre
  `created_at`). Nuevas `countSales` / `countSalesForTeam`: **COUNT sin traer
  filas**, para el dato "Histórico: N" del dashboard, que ya no puede salir de
  `sales.length` porque el array solo tiene el mes.
- **El corte usa la medianoche LOCAL del día 1**, no UTC, para que coincida
  exactamente con `monthKey()` (que también trabaja en hora local). Con UTC, en
  Ecuador (-05:00) se habrían colado en agosto las ventas del 31 de julio por la
  tarde. Verificado: el mes filtrado en servidor da las mismas 689 ventas que
  filtrar el histórico completo en cliente, con los mismos ids.
- **Cuándo se completa el histórico** (`cargarHistorial` en `App.jsx`):
  · al instante si se abre **Movimientos** o **Red**;
  · al instante para un **DISTRIBUIDOR**, porque su dashboard lleva el historial
    embebido (`renderHistoryContent(false)`);
  · a los 1,2 s en el resto de casos, para no competir con el primer pintado.
- Mientras falta, Movimientos muestra un aviso ("mostrando el mes en curso,
  cargando meses anteriores"). Sin él parecería que faltan ventas. El selector
  de mes solo lista el mes actual hasta que termina la carga.
- El "Histórico" del Super Admin está filtrado por sede, así que mientras no
  esté el histórico completo muestra el total global (si el contexto es GLOBAL)
  o `…` si hay una sede seleccionada: es preferible a enseñar un número falso.
- **Verificado**: el COUNT coincide con el histórico real en los tres roles
  (1405 super admin · 107 vendedor · 630 distribuidor), la primera carga trae
  solo el mes y no pierde ni una venta, y la segunda fase sigue devolviendo los
  3 meses ordenados y sin duplicados.
- 🔎 Al verificar se vio que **`Vendedor 1 — PRO` ahora se llama
  `Andres Ramirez`**: alguien lo renombró desde la app, lo que confirma que el
  arreglo de "Editar Perfil" (Lección #8) funciona en producción. Sus métricas
  siguen correctas (VENDEDOR PRO · 7% · $250).

### 2026-08-06 (5) — Rendimiento y rediseño neón de las insignias
- **🐢 "Cada vez más lenta": era coste cuadrático en `dataService`.** Ambas
  funciones del historial fusionaban las ventas de la nube con la caché local
  así: `cache.forEach(l => nube.some(s => s.id === l.id))`. Con ~1.400 ventas a
  cada lado son **~2 millones de comparaciones en CADA carga**, y crece con el
  cuadrado de los datos: por eso empeoraba con el uso. Encima ordenaba con
  `new Date()` dentro del comparador (~30.000 objetos Date por carga).
  - `fusionarPorId` usa un `Set` (O(n+m)) y `ordenarPorFechaDesc` parsea cada
    fecha **una sola vez**. Medido: **13 ms → 0,9 ms (15×)**, verificando que el
    resultado y el orden son idénticos.
  - `teamIds.includes()` por venta → `Set`.
- **No recargar el historial al registrar una venta.** `refreshData` acepta
  `{ recargarVentas: false }`. La venta ya se añade al estado de forma
  optimista, así que volver a descargar ~1.400 filas (632 KB, **~900 ms**) era
  puro desperdicio. Es el ahorro más grande de todos.
- **Derivados memoizados en `App.jsx`** (`useMemo`): `salesThisMonth`,
  `mesesDisponibles`, `rolPorVendedor` y el par `filteredSales` +
  `resumenHistorial`. Antes el filtro del historial recorría las 1.400 ventas
  **en cada render** —o sea, en cada tecla del buscador— y el filtro por rol
  hacía un `team.find()` por venta (~34.000 comparaciones). El resumen se
  calcula ahora en un solo recorrido en vez de cuatro.
  - ⚠️ `filteredSales` **no** puede vivir dentro del IIFE de
    `renderHistoryContent`: ahí se recalcula siempre. Va memoizado arriba.
- **Insignias rediseñadas (feedback: "están muy IA").** Fuera los degradados
  metálicos y el brillo blanco, que era lo que las hacía parecer genéricas.
  Ahora: cara de cristal casi negra, **filo de luz de color** y halo — el color
  solo aparece en el contorno y el resplandor, que es lo que da el aire de neón.
  El icono lleva su propio `drop-shadow` de color.
  - **4 por fila** (`repeat(4, 1fr)` + hexágono fluido con `aspectRatio`).
  - **Barra de progreso eliminada**; queda solo el contador discreto "N / 14".
  - La etiqueta "AUTO" pasó a ser un punto verde tenue, menos ruidoso.
  - El modal sigue la misma línea y explica cómo se consigue cada insignia.

### 2026-08-06 (4) — Insignias automáticas, banderas y ajustes de la campana
- **🔴 Las insignias automáticas NO funcionaban.** Comprobado en la base:
  **0 de 24 perfiles tenía una sola insignia**, con gente de cientos de ventas y
  certificada. Causa: solo 2 de las 14 tenían lógica, y vivía **dentro de
  `handleRegisterSale`** — o sea, se evaluaban únicamente en el instante exacto
  de registrar una venta y en esa pestaña. Si la venta entraba por otra vía, si
  la app se recargaba, o si el estado `userBadges` venía pisado por el
  `refreshData` que corre justo antes, no se otorgaba nada.
  - **Arreglo:** los criterios se mudaron a **`src/lib/badges.js`** (lógica
    pura, sin React, comprobable fuera del navegador) y se evalúan en un
    `useEffect` **contra los datos reales en cada carga**. Se reparan solas para
    quien ya cumplía el requisito. **Solo suman**: jamás quitan una insignia
    puesta a mano por el Super Admin.
  - **Automáticas (5):** `FIRST_BLOOD` (1ª venta), `SAAS_STARTER` (1ª venta de
    plan de pago — CONNECTA no cuenta, es gratis), `ACADEMY_LV1` (certificarse),
    `MONTHLY_CHAMP` (30+ planes de pago en el mes), `BASE_SALARY_UNLOCKED`
    (`metrics.baseUnlocked`). Las otras 9 siguen siendo manuales.
  - Cada desbloqueo genera una notificación de tipo `badge` (con push) y un
    toast, con `dedupeKey` para no repetirse.
  - ⚠️ El efecto NO puede depender de `salesThisMonth`: se recalcula en cada
    render (es un `.filter` del cuerpo del componente), así que lo haría correr
    sin parar. El filtro del mes se hace dentro del efecto.
  - **Verificado** con la función real contra los datos de Supabase: Vendedor 2
    (53 de pago en el mes) saca las 5; Vendedor 1 (14) saca 4 y NO el Campeón
    Mensual; 29 planes no lo dan y 30 sí; sin datos no sale ninguna.
- **Las banderas no se veían en PC.** `🇪🇨` y `🇻🇪` son *regional indicators*, y
  **Windows no trae esos glifos**: salen como dos letras sueltas o un cuadrito.
  En Android/iPhone se ven, por eso el fallo parecía solo de escritorio. Ahora
  se dibujan en SVG (`src/components/layout/Flag.jsx`) y se ven igual en todo.
- **El panel de la campana se desfasaba en el teléfono.** Estaba anclado al
  botón con `position: absolute`, pero la campana no está pegada al borde
  derecho (a su lado van el rango y el ✓CERT), así que un panel de `88vw`
  anclado a ella se salía por la izquierda. Ahora se pinta en un **portal con
  posición fija calculada** desde el rectángulo del botón y **acotada a la
  pantalla**, recalculando al redimensionar y al hacer scroll. De paso cierra
  con Escape.
- **Vitrina de insignias rediseñada:** hexágonos con marco metálico, degradado,
  halo y brillo esmaltado; nombre bajo cada una; barra de progreso "N / 14"; las
  conseguidas se ordenan primero; etiqueta **AUTO** en las que se ganan solas; y
  el modal ahora explica **cómo se consigue** cada insignia y si ya la tienes.
- **Limpieza:** el estado `notifications` de `App.jsx` quedó huérfano al
  reemplazar la campana vieja (nadie lo leía). Eliminado; `addNotification`
  ahora solo dispara el toast, y el recordatorio de pedidos pendientes del Super
  Admin se muestra una vez por sesión con un `useRef`.

### 2026-08-06 (3) — Inventario en la base + bug de avisos multicuenta
- **Catálogo de inventario sembrado en Supabase**
  (`20260806180000_seed_inventory.sql`). Los 16 productos vivían **solo en el
  fallback de localStorage** de `getInventory`: se generaban en el navegador de
  cada persona y nunca llegaban a la base, así que **el almacén no era
  compartido** (cada dispositivo veía su propia copia) y un pedido de stock
  apuntaba a productos que el Super Admin no tenía. Ahora son 17 filas reales:
  9 en Ecuador y 8 en Venezuela. La siembra es **idempotente** (compara por
  `name` + `sede_id`) y no toca lo cargado a mano.
  - ⚠️ Los ids ya no son `inv-ec-plan` etc. sino uuid generados por Postgres.
    El fallback de localStorage sigue usando los antiguos; solo importa si se
    trabaja sin conexión.
  - 🔎 Queda una fila anterior de prueba: `Tarjeta NFC Negra` (descripción
    "Hola", $0.27, 200 u, sede-ec-1). Se dejó a propósito, no es del catálogo.
- **Bug: no se podían activar los avisos con una segunda cuenta en el mismo
  navegador.** `push_subscriptions` se creó con `endpoint text not null unique`
  (heredado de ConnexoClients), pero el cliente hace upsert sobre
  `(user_id, endpoint)`. Con la restricción suelta, un endpoint solo puede
  pertenecer a UNA fila de toda la tabla → la segunda cuenta chocaba con
  `23505 duplicate key ... push_subscriptions_endpoint_key`.
  Arreglado en `20260806170000_fix_push_endpoint_unique.sql`: se elimina la
  restricción suelta y manda la compuesta, que es la regla real —
  **una suscripción por (cuenta, dispositivo)**.
  - ⚠️ **ConnexoClients tiene el mismo fallo latente** en su
    `setup_notifications.sql`; su comentario promete multicuenta pero la
    restricción lo impide. Conviene aplicarle el mismo arreglo.
- **Mensaje de error corregido.** Ante *cualquier* fallo de base, el panel decía
  "falta preparar la base de datos, ejecuta …setup_notifications.sql" — que era
  falso y mandaba a ejecutar un SQL ya aplicado. Ahora solo lo dice si el error
  es realmente de tabla inexistente (`does not exist`); el resto muestra la
  causa y sugiere el botón "¿No llegan?".

### 2026-08-06 (2) — Sistema de alertas y notificaciones
> Guía completa: **`NOTIFICACIONES_SETUP.md`**. Portado de ConnexoClients.
> **DESPLEGADO Y VERIFICADO** en `aisjtkezgumawgjmwckb`: migraciones aplicadas,
> secretos VAPID cargados, `sendPush` desplegada y el disparo de push conectado.
> Solo falta que cada persona active los avisos en su dispositivo.
> Diagnóstico en una línea: `select * from public.estado_notificaciones();`
> (7 columnas, todas deben dar `true`).

- **Dos capas:** centro in-app (campana + panel + toast, por Supabase Realtime)
  y **Web Push** al dispositivo (Android/PC/iOS) con interruptor de activar y
  desactivar por dispositivo.
- **Diferencia clave con ConnexoClients:** allí las tablas cuelgan de
  `auth.users` con RLS y políticas `auth.uid()`. Aquí **no hay Supabase Auth**,
  así que las FK apuntan a `public.profiles` y el **RLS va desactivado** en las
  dos tablas nuevas, igual que en las otras 6 (Lección #1).
- **Archivos nuevos:**
  - `supabase/migrations/20260806120000_setup_notifications.sql` — tablas
    `notifications` y `push_subscriptions`, triggers, publicación de Realtime y
    autolimpieza (100 avisos por usuario como máximo).
  - `supabase/functions/sendPush/index.ts` — Edge Function que reparte la push;
    la dispara un Database Webhook sobre `notifications` (INSERT).
  - `public/sw.js` — service worker (no existía). Muestra la push y hace la app
    instalable, **requisito para que el push funcione en iOS**.
  - `src/lib/push.js` — permiso, suscripción, reparación y baja por dispositivo.
  - `src/components/notifications/NotificationCenter.jsx` — campana, panel,
    interruptor y toast, con el lenguaje visual de la app (estilos en línea +
    variables CSS + framer-motion, no Tailwind).
- **Qué avisa y desde dónde** (la tabla completa está en la guía):
  - **Triggers de Postgres:** nueva venta (al distribuidor padre + super admins)
    y pedidos de stock (creación → super admins; aprobación/rechazo → al
    distribuidor).
  - **Desde la app:** ascenso de nivel, sueldo base desbloqueado, alta de un
    miembro nuevo y certificación aprobada.
- **⚠️ Por qué esos cuatro NO van por trigger:**
  1. El nivel, la comisión y el sueldo base los calcula `calcMetrics` en
     JavaScript: Postgres no puede verlos. Se detectan en `App.jsx` comparando
     con el último nivel visto y se escriben con `dedupeKey` (que incluye el mes,
     porque el nivel se reinicia el día 1).
  2. `seedCompleteScenario` inserta los 21 perfiles directo en la tabla, así que
     un trigger en `profiles` dispararía 21 avisos falsos en cada siembra.
- **Guarda anti-siembra en el trigger de ventas:** solo notifica ventas creadas
  en los últimos 5 minutos. Una venta real no fija `created_at` (se queda en el
  `now()` por defecto); la siembra lo pone a medianoche de un día pasado. Sin
  esto, sembrar generaría ~1.400 notificaciones y otras tantas push.
- **⚠️ El "Database Webhook" del panel NO se pudo usar.** Ese mecanismo es
  `supabase_functions.http_request`, un esquema que **solo existe si alguna vez
  se habilitó la integración de webhooks en el panel** — y en este proyecto
  nunca se hizo. La migración `20260806140000` lo intenta dentro de una guarda
  (`to_regproc(...) is null`), así que no falla: simplemente no crea nada.
  El disparo real lo hace `20260806160000` con **`pg_net`** directamente
  (`net.http_post` asíncrono desde un trigger). Ventaja: queda versionado en el
  repo y no depende de que alguien entre al panel. El trigger atrapa cualquier
  error, así que **un fallo de push nunca impide guardar la notificación**.
- **Verificación de punta a punta** (sin necesitar un teléfono): se inserta una
  suscripción falsa con claves P-256 **válidas**, se crea una notificación y se
  comprueba que la suscripción **desaparece sola**. Eso solo puede pasar si
  corrió la cadena entera: trigger → pg_net → `sendPush` → cifrado web-push →
  POST al servidor de push → 404 → borrado de la suscripción caducada. Tardó 3 s.
  Los triggers se probaron igual, con INSERT/DELETE reales y limpieza posterior.
- **Trampa al probar por tiempo:** la primera prueba de la guarda anti-siembra
  dio falso negativo porque filtraba las notificaciones por `created_at >= (hora
  local)`, y **el reloj del servidor va ~2 s por delante del local**, así que
  colaban avisos del paso anterior. Al filtrar por **contenido** en vez de por
  marca de tiempo, las dos guardas (fecha antigua y nota de escenario) pasaron.
- **Iconos del PWA regenerados.** Los cuatro PNG de `public/` eran **el mismo
  wordmark de 543×301** mientras el manifest declaraba 192×192 y 512×512. Con
  iconos no cuadrados el instalador los rechaza o los deforma, y **sin app
  instalada no hay push en iOS**. Ahora: `icon-192.png`, `icon-512.png`
  (cuadrados, con el logo dentro del área segura para *maskable*),
  `apple-touch-icon.png` 180×180 y `connexo-badge.png` 96×96 **transparente**
  (Android pinta el badge usando solo el canal alfa: una imagen opaca saldría
  como un cuadrado blanco). El wordmark original se conservó en
  `public/connexo-wordmark.png`.
- **La campana vieja se reemplazó.** Antes hacía `alert(mensajes.join('\n'))`
  sobre un array en memoria que se perdía al recargar. Ese `addNotification`
  sigue existiendo para el feedback de **tu propia** acción ("venta registrada"),
  pero ahora se ve como un toast abajo; el centro de notificaciones trae lo que
  hacen **los demás** y sí se persiste.
- **Auditoría de datos guardados (a petición):** las 1.405 ventas tienen los 12
  campos completos y ninguna huérfana; `customer_company` sale 0% solo porque la
  siembra no lo llena (el formulario sí lo pide y `registerSale` lo mapea).
  `inventory_requests` acepta inserciones correctamente (probado con INSERT +
  DELETE real); está en 0 filas porque nadie ha pedido stock todavía.
  **Pendiente real:** `inventory` tiene 1 sola fila en Supabase — el catálogo de
  16 productos por defecto solo existe en el fallback de localStorage y nunca se
  sembró en la base.

### 2026-08-06
- **Causa raíz de "las imágenes no cargan" y "editar perfil falla": la cuota de
  localStorage.** La foto de perfil se guardaba **sin comprimir**: el JPEG
  original del celular (2088×3712) daba **4,03 MB de base64**. El navegador solo
  concede ~5 MB por origen y cuenta cada carácter como 2 bytes, así que ese solo
  valor ya no cabía. `localStorage.setItem` lanzaba `QuotaExceededError` y, como
  estaba **dentro del `try` del flujo de negocio**, se llevaba por delante la
  operación entera aunque Supabase ya hubiera guardado bien. Ver **Lección #8**.
  - Subir foto: el `setItem` era la **primera** línea, fuera del `try` → reventaba
    antes de intentar nada. La foto no se guardaba en ningún lado y no salía ni
    un aviso: fallo totalmente silencioso.
  - Editar perfil: `updateProfile` actualizaba la base, y acto seguido el
    `setItem` de la sesión lanzaba → saltaba al `catch` → alert de error y el
    formulario se quedaba abierto. Parecía que no guardaba, pero **sí guardaba**.
  - Login: mismo `setItem` en `handleLogin` → alert de error y no se entraba.
- **Arreglos aplicados:**
  - `src/lib/image.js` (nuevo): `compressImage` redimensiona en canvas a 512 px
    de lado mayor y recomprime a JPEG 0.82 → **4 MB pasan a ~32 KB (129×)**.
    Pinta fondo opaco antes de dibujar para que los PNG con transparencia no
    salgan negros al pasar a JPEG.
  - `src/lib/storage.js` (nuevo): `safeSetItem` (nunca propaga un fallo de
    cuota), `saveSession`/`loadSession`/`clearSession`. **La sesión ya no lleva
    la foto dentro**: el avatar vive en `connexo_avatar_<uid>` y `loadSession`
    lo vuelve a unir al recargar. Así una foto grande no puede impedir guardar
    la sesión. Sustituye los 10 `setItem(SESSION_KEY, …)` de `App.jsx` y las 20
    escrituras de caché grandes de `dataService.js` (`connexo_team`,
    `connexo_sales`, `connexo_inventory`).
  - `updateProfile`: un error de **datos** (correo duplicado → `23505`) ya no cae
    al fallback local disfrazado de "Usuario no encontrado en caché local"; se
    reporta tal cual ("Ese correo ya está registrado por otro usuario"). Al
    fallback solo se cae si falla la **red**. Y editar el perfil propio estando
    sin conexión ya no falla por no estar uno en la caché de equipo.
  - Subir foto: aplica optimista (se ve al instante) y luego sincroniza; se
    limpia el `input.value` para poder reelegir la misma foto.
- **Consultas de lista sin `avatar_url`** (`PROFILE_LIST_COLUMNS` en
  `dataService.js`): `getAllProfiles` y `getTeam` usaban `select('*')` y traían
  la foto en cada carga. **El listado pasó de 4.130 KB a 8,9 KB.** Ningún
  componente usa `avatar_url` en listados; el perfil individual lo sigue
  pidiendo con `select('*')`. De paso deja de exponer `password` (`getTeam` ya
  lo descartaba a mano; `getAllProfiles` no).
- **Dato ya guardado corregido en Supabase:** la fila de `thony.karter@gmail.com`
  tenía los 4,03 MB. Recomprimida in situ a 31,9 KB respetando la orientación
  EXIF; la foto se ve igual.
- **Rediseño visual (solo color y presentación, cero lógica):** paleta más
  saturada en `index.css` — naranja `#f97316 → #ff7a1a` con `--accent-light` y
  `--accent-gradient`, `--accent-glow` de alpha 0.15 → 0.28 (los bordes y halos
  por fin se ven), verde `#10b981 → #1ee0a0`, rojo `#ef4444 → #ff4d5e`, tiers más
  vivos. Fondo en capas (brasa naranja + rebotes violeta/verde, `fixed`), h1 con
  texto en degradado, `.card` con filo de luz superior, `.card.glass` con lavado
  cálido, `.btn-primary` en degradado con barrido de brillo, barra inferior con
  hilo de luz y activo con halo, scrollbar a tono, `::selection`, `:focus-visible`.
  Nuevas clases `.progress-fill` (barra de nivel con brillo que corre) y
  `.pulse-glow` (chip de nivel del perfil), más `prefers-reduced-motion`.
  Solo se tocaron 2 líneas de JSX (añadir esas clases): nada de estructura.
- **Verificado** con el `dataService` real fuera del navegador (Vite +
  `ssrLoadModule`): 24 perfiles, nivel/tasa/sueldo base correctos en los 5 roles
  clave, `getSalesForTeam` sigue paginando (1.405 ventas) y los listados ya no
  traen foto ni contraseña. Más un test de `localStorage` con cuota simulada de
  5 MB que reproduce el fallo viejo y comprueba el nuevo comportamiento.

### 2026-08-05
- **Actualización de CIFRAS de niveles/comisiones** (ver §4). Solo números: la
  lógica de `calcMetrics`, el tier manual del Super Admin y la UI quedan igual.
  - Umbrales de ascenso: ULTRA 31→**50** · D2 101→**200** · D3 201→**300**.
    PRO (31) y D1 (100) siguen siendo los niveles base.
  - Sueldos base: ULTRA $300→**$350** · D2 $600→**$700** · D3 $600→**$850**.
    PRO ($250) y D1 ($500) sin cambio.
  - Comisiones sin cambio: 7 · 9 · 12 · 15 · 18 %.
  - Metas de anuales del mes: PRO 7→**8** · ULTRA 10→**13** · D3 100→**75**
    (D1 25 y D2 50 sin cambio).
  - Archivos tocados: `dataService.js` (`TIERS`, mapeo de `goal` en `cache()`,
    umbrales de `calcMetrics`, cantidades del seed), `App.jsx` (objetivos del
    dashboard + texto del confirm de siembra), `BadgeGrid.jsx` (descripción de
    la insignia de sueldo).
  - Sin cambios de esquema en Supabase (no hace falta DDL).
- **Reinicio MENSUAL del nivel + historial por mes/rol + escenario realista:**
  - `calcMetrics`: el conteo de planes para el nivel ya no es acumulado desde
    `tier_start_date`, sino del **mes calendario en curso** (`startDate` = día 1
    del mes, o `tier_start_date` si es posterior). Se reinicia solo cada mes.
  - `App.jsx`: helpers `monthKey()` / `monthLabel()` / `salesThisMonth`. El
    "Progreso de Nivel" y el "Objetivo de Rango" del dashboard pasan a contar
    `salesThisMonth` en vez de `sales.length` (que era el histórico completo y
    ya no correspondía con un umbral mensual).
  - **Movimientos:** nuevos filtros por mes (todos los roles) y por rol del
    vendedor (solo Super Admin), más una tarjeta de resumen (planes, anuales,
    facturado, comisiones) de lo que se está viendo. Estados `selectedMonth` y
    `roleFilter`; el filtro de rol resuelve el rol vía `team.find(...)`, que para
    el Super Admin son todos los perfiles (`getAllProfiles`).
  - **`seedCompleteScenario` realista:** cada rol cumple su meta de anuales
    (sueldo base activo) y suma mensuales extra → V1 8a+6m=14 · V2 13a+40m=53
    (supera los 50 ⇒ ULTRA real) · D1 3×34=102 de equipo · D2 5×42=210 (⇒ D2 real)
    · D3 10×31=310 (⇒ D3 real). `makeSale` acepta `monthOffset` y `processSeller`
    siembra además los **2 meses anteriores al ~50%** para poder comparar meses.
    Las ventas del mes en curso ya no caen en días futuros (se reparten del 1 a hoy).
    Son ~1.400 filas: la siembra tarda más que antes.
  - Sin cambios de esquema en Supabase (no hace falta DDL).
- **Escenario sembrado y verificado en Supabase (`aisjtkezgumawgjmwckb`).**
  24 perfiles (21 de prueba + super admin) y **1.405 ventas**: 689 en agosto,
  358 en julio y 358 en junio. Los 5 roles clave dan el nivel, la tasa, el sueldo
  base y la meta de anuales esperados, todos con sueldo base ACTIVO, y ninguna
  venta cae en fecha futura. Verificado ejecutando el `dataService` real fuera del
  navegador (runtime de Vite + `ssrLoadModule`), no una copia de la lógica.
- **Bug encontrado al verificar y corregido:** `getSalesForTeam` no paginaba y el
  Super Admin solo recibía 1000 de las 1405 ventas → ver **Lección #7**.
- **Dashboard coherente mes vs. histórico** (reporte: "MIS VENTAS 28 pero la barra
  14/31"). Se mezclaban ambos criterios en la misma pantalla:
  - La tarjeta MIS VENTAS / VENTAS RED mostraba `sales.length` (histórico) mientras
    la barra ya contaba el mes. Ahora muestra los planes del mes sobre la cuota del
    nivel, con el histórico como dato secundario.
  - La barra usaba `user.tier` (rango manual) en vez de `metrics.level`, así que un
    vendedor en AUTO que llegaba a ULTRA seguía viendo el objetivo de PRO.
  - La barra medía contra la **cuota** (31) y el objetivo de rango contra el
    **umbral del siguiente nivel** (50): dos cifras distintas para lo mismo. Ahora
    ambos salen de `NIVELES` (ver §4) y siempre coinciden.
  - También: BILLETERA etiquetada "Comisiones acumuladas", "TOTAL FACTURADO" →
    "FACTURADO HISTÓRICO" (la lista de abajo sí está filtrada) y la tarjeta de
    ventas del Super Admin pasa a mes + histórico.
  - **Verificado** con un script que simula el render de los **23 perfiles** y
    contrasta nivel/tasa/base/meta/anuales/barra/tarjeta contra la base y contra
    las reglas de negocio, en 4 corridas seguidas: sin incoherencias.
- **⚠️ Incidente:** a mitad del trabajo la base pasó de 24 perfiles/1405 ventas a
  16/901. Faltaban exactamente los vendedores D3-3 a D3-10 y sus 504 ventas, es
  decir, los que se crean **después** del último creado: una siembra lanzada desde
  la app y cortada en `Vendedor D3-2` (Lección #5, que sigue vigente). Se resembró
  y se volvió a verificar. **No lanzar la siembra desde la app y dejarla a medias.**

### 2026-06-29
- Migración a un **nuevo proyecto Supabase** (`aisjtkezgumawgjmwckb`) porque el
  anterior (`udysvmpnivuybneeetnj`) dejó de resolver por DNS (pausado/eliminado).
- Creado `supabase/schema.sql` con las 6 tablas + sedes por defecto + RLS off.
- `.env` actualizado con URL y anon key nuevas.
- `package.json`: Node engine `20.x` → `24.x` (Vercel deja de soportar 20.x el 2026-10-01).
- Commiteado `pnpm-lock.yaml` y `pnpm-workspace.yaml`.
- Creada documentación técnica (`DOCUMENTACION_TECNICA.md` + PDF) y este `CLAUDE.md`.

### 2026-07-06
- **Diagnóstico completo por reporte de "muchas funciones fallando":**
  - Supabase (`aisjtkezgumawgjmwckb`) verificado sano: SELECT en las 6 tablas → 200,
    INSERT + DELETE de prueba en `profiles` → OK, RLS desactivado.
  - App local probada en vivo (login super admin + las 6 pestañas): **cero errores**
    de consola y cero requests fallidos.
  - La base está casi vacía: `sales`, `inventory_requests` y `academy_courses` sin
    registros (los datos históricos se perdieron con el proyecto Supabase anterior).
    "No hay registros" en Movimientos NO es un bug.
  - Conclusión: si producción falla, la causa más probable es la Lección #2
    (env vars viejas en Vercel sin Redeploy) y/o caché localStorage del navegador
    con datos del proyecto viejo.
- **Causa raíz confirmada del "no se ven ventas/volumen":** el
  `seedCompleteScenario` del 2026-06-29 19:54 se interrumpió a mitad de camino
  (se detuvo en `Vendedor D3-6`: wallet en 0, faltan D3-7 a D3-10, Distribuidor 3
  con wallet 0). Como las ~380 ventas se insertan en UN solo bulk insert al FINAL
  de la función (`dataService.js` → `seedCompleteScenario`), la interrupción dejó
  los perfiles creados pero la tabla `sales` totalmente VACÍA. Ver Lección #5.

### 2026-07-22
- **Tipo de perfil del cliente en la terminal de ventas.** Al activar un plan,
  vendedores y distribuidores ahora eligen el perfil que recibe el cliente:
  Estándar · Barbería · Gastronomía · Petcare/Veterinaria · Salud/Médico ·
  E-commerce · Artista/Músico · Inmobiliaria · Sublimados/Textil.
  - Catálogo único en `src/constants/customerProfiles.js` (`CUSTOMER_PROFILES`,
    `DEFAULT_PROFILE_TYPE`, `getProfileLabel`). Añadir perfiles nuevos SOLO ahí.
  - `SaleForm.jsx`: grilla de 3 columnas con iconos lucide; default `ESTANDAR`;
    se envía en `customerData.profileType`.
  - `dataService.registerSale`: persiste en la nueva columna `sales.profile_type`.
  - `App.jsx`: el perfil se muestra como chip/sufijo en el historial de Movimientos.
  - **Requiere migración SQL** (`supabase/schema.sql`):
    `alter table public.sales add column if not exists profile_type text default 'ESTANDAR';`
    Mientras no se ejecute, `registerSale` detecta el error de columna inexistente
    y **reintenta el INSERT sin `profile_type`** (la venta no se pierde, pero el
    perfil no queda guardado en la DB). Ver Lección #6.
- **`emapmvisual@gmail.com` eliminado de raíz.** Ya no es super admin ni existe
  en la app: quitado de `hardcodedAdmins` en `dataService.login`, quitado de la
  exclusión de `purgeAllData` (antes sobrevivía a toda purga) y de la docs
  (`CLAUDE.md`, `DOCUMENTACION_TECNICA.md`). Verificado en Supabase
  (`aisjtkezgumawgjmwckb`): no existe ninguna fila con ese email en `profiles`.
  **Único super admin: `thony.karter@gmail.com`.**

### Lección #8 — Nada de base64 sin comprimir, y la caché nunca tumba el flujo
- **Síntoma:** subir la foto de perfil no hacía absolutamente nada (ni error), y
  guardar el perfil daba error aunque el cambio **sí** llegaba a la base.
- **Causa:** una foto de celular pesa 3-5 MB; en base64 crece otro ~33%. El
  navegador da ~5 MB por origen **contando 2 bytes por carácter**, así que un
  solo avatar ya no cabía y `localStorage.setItem` lanzaba `QuotaExceededError`.
  El `setItem` estaba dentro del `try` de la operación de negocio (o antes de
  él), así que un fallo de **caché** hacía fracasar la operación **completa**.
- **Reglas para no repetirlo:**
  1. **Toda imagen que entre por un `<input type="file">` se comprime primero**
     (`compressImage` en `src/lib/image.js`). Nunca guardar `reader.result` crudo.
  2. **Escribir en localStorage con `safeSetItem`** (`src/lib/storage.js`). La
     caché es un extra: si falla, se avisa por consola y el flujo sigue. Un
     `localStorage.setItem` pelado dentro de un `try/catch` de negocio es un bug.
  3. **La sesión no lleva la foto dentro** (`saveSession`/`loadSession`): el
     avatar va en su propia clave y se vuelve a unir al restaurar.
  4. **Los listados no piden `avatar_url`** (`PROFILE_LIST_COLUMNS`). `select('*')`
     sobre `profiles` arrastra todas las fotos: eran 4 MB por carga.
- **Cómo detectarlo:** si algo "falla" pero la base **sí** quedó actualizada,
  sospechar de un `setItem` posterior. En la consola sale
  `Failed to execute 'setItem' on 'Storage': ... exceeded the quota`.
- **Ojo con el patrón "Supabase con fallback a LocalStorage" (§2):** hace que un
  error de datos (correo duplicado, columna inexistente) se disfrace de problema
  de conexión y termine en un mensaje sin sentido. `updateProfile` ya distingue
  ambos casos (`err.esDeDatos`); replicarlo si se toca otra función de escritura.

### Lección #7 — PostgREST devuelve máximo 1000 filas: hay que paginar
- **Síntoma:** con la base grande (el escenario completo son ~1.400 ventas) el
  Super Admin veía solo 1000 registros y los meses viejos salían incompletos en
  Movimientos. Ningún error en consola: PostgREST simplemente trunca.
- **Causa:** `supabase.from('sales').select('*')` sin `.range()` trae como mucho
  1000 filas (límite por defecto del servidor).
- **Solución aplicada (2026-08-05):** `getSalesForTeam` pagina en bloques de 1000
  con `.range(desde, desde + 999)` hasta que una página vuelve incompleta.
- **Prevención:** cualquier consulta que pueda superar las 1000 filas debe paginar.
  Los conteos de `calcMetrics` NO se ven afectados porque usan
  `select('*', { count: 'exact', head: true })`, que devuelve el número real.
  Ojo también al verificar por `curl`/scripts: ahí aplica el mismo tope.

### Lección #6 — Cambiar el esquema requiere DDL manual en Supabase
- La app solo tiene la `anon key`, que **no puede correr DDL** (`alter table`).
  Toda columna nueva hay que añadirla a mano en el SQL Editor de Supabase además
  de dejarla en `supabase/schema.sql`.
- **Síntoma si se olvida:** PostgREST devuelve `42703 - column X does not exist`
  y, por el patrón "Supabase con fallback a LocalStorage", el error queda oculto
  y la app parece funcionar mientras el dato nunca llega a la base.
- **Prevención:** verificar la columna con
  `curl "$URL/rest/v1/<tabla>?select=<columna>&limit=1" -H "apikey: $ANON"`
  antes de dar por hecho el cambio.

### Lección #5 (preliminar) — Seed interrumpido = perfiles sin ventas
- **Síntoma:** los usuarios de prueba existen y tienen wallet, pero volumen,
  ventas y niveles marcan 0; "Movimientos" vacío.
- **Causa:** `seedCompleteScenario` inserta perfiles uno a uno pero acumula TODAS
  las ventas en memoria y las inserta en un único bulk al final. Si algo falla a
  mitad (red, cierre de pestaña), no hay rollback: quedan perfiles huérfanos sin
  ventas.
- **Remedio inmediato:** re-ejecutar "SEMBRAR ESCENARIO COMPLETO" (hace purga
  automática antes de sembrar).
- **Fix aplicado (2026-07-06):** las 3 funciones de siembra (`seedCompleteScenario`,
  `seedTestData`, `seedTestDataAnnual`) ahora insertan las ventas de CADA vendedor
  inmediatamente después de crearlo (y antes de actualizar su wallet). Una
  interrupción ya no pierde todas las ventas.
- **Bug similar reparado:** `updateRequestStatus` leía el estado del pedido
  DESPUÉS de marcarlo APPROVED, por lo que la condición `status !== 'APPROVED'`
  siempre era falsa y **el stock nunca se descontaba** al aprobar un pedido (vía
  Supabase). Ahora lee el estado previo ANTES de actualizar y descuenta una sola vez.
- **⚠️ Advertencia (no modificado):** `seedCompleteScenario` llama a `purgeAllData`,
  que borra TODOS los perfiles excepto los 2 super admins — incluidos vendedores
  REALES creados a mano. No re-sembrar el escenario si ya hay usuarios reales
  cargados, o respaldarlos antes.
- **Observado, no tocado (riesgo bajo):** `deleteSale` revierte la wallet después
  de borrar la venta sin rollback si falla el paso 2; el fallback localStorage de
  `registerSale`/`deleteSale` puede divergir de la DB si falla un paso intermedio.

---

## 8. Errores encontrados y lecciones aprendidas

> Revisar esta sección ANTES de tocar Supabase, deploy o login.

### Lección #1 — RLS activado rompe el login (error 42501)
- **Síntoma:** la tabla se puede leer pero los INSERT fallan con
  `42501 - new row violates row-level security policy`. El super admin no se crea
  y no se puede entrar.
- **Causa:** los proyectos Supabase nuevos activan RLS por defecto, y la app usa
  la `anon key` sin políticas.
- **Solución:** `alter table public.<tabla> disable row level security;` en las 6
  tablas (ya incluido en `supabase/schema.sql`). Verificar con
  `select tablename, rowsecurity from pg_tables where schemaname='public';`
  (todas deben dar `rowsecurity = false`).
- **Prevención:** al crear/recrear un proyecto Supabase, correr `schema.sql`
  COMPLETO (incluye el disable RLS) y verificar con un INSERT de prueba.

### Lección #2 — "Failed to fetch" = la app apunta al Supabase equivocado
- **Síntoma:** error `TypeError: Failed to fetch` al hacer login.
- **Causa:** la app intenta conectar a una URL de Supabase inalcanzable (URL vieja
  o proyecto caído). NO es un error de la base.
- **Solución:** confirmar que `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` apunten
  al proyecto correcto **en el entorno que se está usando**:
  - Vercel → Settings → Environment Variables → **Redeploy**.
  - Local → reiniciar `pnpm dev`.
- **Tip de diagnóstico:** un error de RLS (42501) significa que SÍ se está
  llegando a la base correcta; "Failed to fetch" significa que NO se llega.

### Lección #3 — Verificar la conexión con una prueba real, no por inspección
- Antes de pedirle al usuario que pruebe el login, validar contra el endpoint REST
  con la `anon key`: un `SELECT` (¿existe la tabla?) y un `INSERT` de prueba
  (¿pasa el RLS?). Limpiar el registro de prueba después. Esto evita ciclos de
  "prueba y avísame" innecesarios.

### Lección #4 — Las credenciales NO se commitean
- `.env` está en `.gitignore` (correcto). Nunca subir la `anon key`/URL al repo.
- Nota de seguridad pendiente: contraseñas en texto plano en `profiles` + anon key
  + RLS off = base totalmente expuesta. Endurecer a futuro (hash + RLS o Supabase Auth).

---

## 9. Deuda técnica / pendientes
- `src/store/mockStore.js`: código muerto (no se importa). Eliminar.
- `fetch_users.mjs`: script de prueba con credenciales viejas hardcodeadas. Eliminar.
- Sin migraciones SQL versionadas más allá de `schema.sql`; el esquema real vive
  solo en Supabase.
- Seguridad: ver Lección #4.

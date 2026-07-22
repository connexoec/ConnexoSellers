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

### Niveles y tasas de comisión
**Vendedor** (sobre el precio del plan):
- VENDEDOR PRO → 7% (a partir de 20 ventas; es también el nivel base).
- VENDEDOR ULTRA → 9% (a partir de 31 ventas acumuladas).

**Distribuidor** (sobre el volumen de su red = él + sus vendedores):
- DISTRIBUIDOR 1 → 12% (base) · DISTRIBUIDOR 2 → 15% (≥101) · DISTRIBUIDOR 3 → 18% (≥201).

**Comisión por venta** = `precio × tasa` (solo si el vendedor está certificado;
si no, 0). El distribuidor padre recibe además un **override** = `precio × tasa_del_padre`.

### Meta mensual de ventas anuales (`annualSalesGoal`)
Cuenta solo planes con "ANUAL" del **mes calendario actual**. Desbloquea el
"base" del nivel. Umbrales: PRO 7 · ULTRA 10 · DIST.1 25 · DIST.2 50 · DIST.3 100.

### Tier manual vs. AUTO
El Super Admin puede fijar el rango (tier) manualmente o dejarlo en AUTO
(se calcula por número de ventas desde `tier_start_date`).

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

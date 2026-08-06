# 🔔 Notificaciones de Connexo Ventas

> ## ✅ YA ESTÁ DESPLEGADO (2026-08-06)
> Los pasos 1, 2 y 3 **están hechos** en el proyecto `aisjtkezgumawgjmwckb`:
> migración aplicada, secretos VAPID cargados, `sendPush` desplegado y el
> disparo de push conectado. Verificado de punta a punta.
>
> **Lo único que falta es el Paso 4: que cada persona active los avisos en su
> dispositivo.** El resto de esta guía queda como referencia y para diagnóstico.
>
> Comprobar el estado en cualquier momento:
> ```sql
> select * from public.estado_notificaciones();
> ```
> Las 7 columnas deben dar `true`. También responde por REST:
> `POST /rest/v1/rpc/estado_notificaciones`.


Dos capas:

1. **In-app** — la campana 🔔 del header, con contador, panel y aviso instantáneo
   por Supabase Realtime. **Funciona en cuanto se ejecuta el Paso 1.**
2. **Push al dispositivo** — llega al teléfono o la PC aunque la app esté
   cerrada. Necesita además los Pasos 2 y 3.

| Evento | Quién recibe el aviso | De dónde sale |
|---|---|---|
| 💰 Nueva venta | El distribuidor del vendedor + los super admins | Trigger en `sales` |
| 📦 Pedido de stock | Los super admins | Trigger en `inventory_requests` |
| ✅ Pedido aprobado/rechazado | El distribuidor que lo pidió | Trigger en `inventory_requests` |
| 👥 Nuevo miembro en la red | Su distribuidor + los super admins | La app (`TeamManager`) |
| 🎓 Certificación aprobada | Su distribuidor + los super admins | La app (`Academy`) |
| 🚀 Ascenso de nivel | El propio vendedor/distribuidor | La app (`calcMetrics`) |
| 💵 Sueldo base desbloqueado | El propio vendedor/distribuidor | La app (`calcMetrics`) |

> **¿Por qué unos por trigger y otros desde la app?** El nivel, la comisión y el
> sueldo base se calculan en JavaScript (`calcMetrics`), así que Postgres no
> puede verlos. Y las altas de red no van por trigger a propósito: la siembra de
> escenario inserta 21 perfiles de golpe y dispararía 21 avisos falsos.

---

## Paso 1 — Base de datos (obligatorio)

Supabase → proyecto **ConnexoSellers** (`aisjtkezgumawgjmwckb`) → **SQL Editor** →
pega y ejecuta completo:

```
supabase/migrations/20260806120000_setup_notifications.sql
```

O, si prefieres el CLI (el proyecto ya está vinculado):

```bash
npx supabase db push
```

Crea las tablas `notifications` y `push_subscriptions`, los triggers y la
publicación de Realtime. Es **idempotente**: se puede reejecutar sin romper nada.

> ⚠️ Las dos tablas quedan con **RLS desactivado**, igual que las otras 6. Esta
> app entra con la `anon key` sin Supabase Auth: con RLS activo dejaría de
> funcionar (Lección #1 de `CLAUDE.md`).

**Comprobar que quedó bien:**
```sql
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and tablename in ('notifications','push_subscriptions');
-- las dos deben dar rowsecurity = false
```

Con esto la campana ya funciona. Los pasos 2 y 3 activan el push al dispositivo.

---

## Paso 2 — Edge Function `sendPush`

### Secretos (Supabase → Edge Functions → **Secrets** → Add)

| Nombre | Valor |
|---|---|
| `VAPID_PUBLIC_KEY` | `BFJpgAAVjDr9FR37uKLA3UchVJ_og0Bst2W6Bpv5cPabXtv7yM_qehgqCcPsiU268j2kzj6yYmFwd05x3JaG72Q` |
| `VAPID_PRIVATE_KEY` | *(se entregó por chat — NO va en el repositorio)* |
| `VAPID_SUBJECT` | `mailto:soporte@connexo.ec` |

> 🔐 **La llave privada nunca se commitea**: es la que firma los envíos. Guárdala
> en tu gestor de contraseñas. Son un par **nuevo y exclusivo de Connexo Ventas**
> (ConnexoClients usa otro distinto).
>
> Si la pierdes, genera otro par y actualiza los dos sitios (el secreto y
> `VITE_VAPID_PUBLIC_KEY`); los dispositivos ya suscritos tendrán que volver a
> activarse con el botón **"¿No llegan?"** del panel.

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` las inyecta la plataforma sola.

### Desplegar

```bash
npx supabase functions deploy sendPush --no-verify-jwt
```

O por panel: Edge Functions → *Create a function* → nombre `sendPush` → pega el
contenido de `supabase/functions/sendPush/index.ts` → Deploy, y desactiva
*"Verify JWT"* (la llama un webhook, no una persona).

---

## Paso 3 — Disparo de la push ✅ (hecho por SQL, sin panel)

Cada notificación nueva tiene que llamar a `sendPush`. Normalmente eso se hace
con un **Database Webhook** del panel… pero ese mecanismo
(`supabase_functions.http_request`) **no existe en este proyecto**, porque nunca
se habilitó la integración de webhooks.

En vez de depender de eso, el disparo se hace con **`pg_net` directamente**
(`supabase/migrations/20260806160000_notifications_push_hook.sql`): un trigger
sobre `notifications` que encola un `net.http_post` a la Edge Function. Mismo
efecto, sin tocar el panel, y versionado en el repositorio.

Detalles que importan:
- `net.http_post` es **asíncrono**: insertar una notificación no espera a la
  función, así que el aviso in-app aparece al instante igual.
- El trigger atrapa cualquier error: **si la push falla, la notificación se
  guarda igual**. Nunca se pierde el aviso in-app por un problema de red.
- La Edge Function está desplegada con `--no-verify-jwt`, por eso no se manda
  ninguna credencial en la cabecera.

> Si algún día prefieres el webhook del panel, primero habilítalo una vez
> (Database → Webhooks) y luego la migración `20260806140000` lo creará sola.
> No hace falta: el mecanismo actual ya funciona.

---

## Paso 4 — Activar en cada dispositivo

En la app: **campana 🔔 → interruptor "Avisos activos en este dispositivo"** y
aceptar el permiso del navegador. Se guarda **una suscripción por dispositivo**,
así que cada quien lo activa en su teléfono y, si quiere, también en su PC.

El mismo interruptor los **desactiva**: cancela la suscripción y borra el
registro. No hay que tocar la configuración del navegador para apagarlos.

### 📱 Android y 💻 PC
Funcionan directo, incluso con el navegador cerrado.

### 🍎 iPhone / iPad
Las push web en iOS **solo funcionan con la app instalada**:

1. Safari → **Compartir** (el cuadrito con la flecha ↑)
2. **"Añadir a pantalla de inicio"**
3. Abrir Connexo desde ese ícono
4. Ahí sí, campana 🔔 → activar

Requiere **iOS 16.4 o superior**. La app detecta este caso y muestra las
instrucciones sola en vez de fallar sin explicación.

---

## Probar

1. Con el Paso 1 hecho: registra una venta desde la cuenta de un vendedor. Al
   distribuidor y al super admin les debe aparecer el aviso al instante (sin
   recargar) y sonar el toast.
2. Con los Pasos 2-4 hechos y la app cerrada: la misma venta debe llegar como
   notificación del sistema al teléfono.
3. Botón **"Probar notificación en este dispositivo"** (al pie del panel):
   comprueba permiso + service worker sin tocar la base ni el backend.

---

## Diagnóstico

**Lo primero, siempre:** `select * from public.estado_notificaciones();`
Devuelve de un vistazo si están las tablas, los 3 triggers, el disparo de push
y el Realtime, más cuántos dispositivos hay suscritos.

| Síntoma | Dónde mirar |
|---|---|
| La campana no se actualiza sola | `realtime_activo` en `estado_notificaciones()` |
| El panel dice "Push sin registrar (db: …)" | Falta el Paso 1: las tablas no existen |
| No llega nada al teléfono | Edge Functions → `sendPush` → **Logs**. `sent: 0` = no hay suscripciones en ese dispositivo (repetir Paso 4) |
| "Están verdes pero no llegan" | Botón **"¿No llegan?"** del panel: la suscripción quedó atada a una llave VAPID anterior y hay que renovarla. Es la causa nº1 de "en la PC sí y en el teléfono no" |
| En iPhone no aparece el interruptor | La app no está instalada en la pantalla de inicio (ver Paso 4) |

**Silenciar a alguien sin tocar la app:**
```sql
delete from public.push_subscriptions where user_id = '<uuid del perfil>';
```

**Ver los últimos avisos de una persona:**
```sql
select created_at, type, title, body, read
  from public.notifications
 where user_id = '<uuid>'
 order by created_at desc limit 20;
```

---

## Notas técnicas

- La llave **pública** VAPID está en `.env` (`VITE_VAPID_PUBLIC_KEY`) y como
  fallback en `src/lib/push.js`, para que funcione en Vercel aunque no inyecte
  las variables (mismo patrón que el cliente de Supabase).
- `notifications` se autolimpia: un trigger conserva las **100 más recientes por
  usuario**, así que la tabla no crece sin fin.
- El trigger de ventas **ignora la siembra de escenario**: solo notifica ventas
  creadas en los últimos 5 minutos (una venta real no fija `created_at`; la
  siembra lo pone a medianoche de un día pasado). Sin eso, una siembra generaría
  ~1.400 avisos y otras tantas push.
- El service worker (`public/sw.js`) es también lo que hace la app instalable,
  requisito del push en iOS. Los iconos del manifest se regeneraron cuadrados
  (192/512 + `apple-touch-icon` 180) porque antes eran todos el mismo wordmark
  de 543×301 y el instalador los rechazaba o los deformaba.

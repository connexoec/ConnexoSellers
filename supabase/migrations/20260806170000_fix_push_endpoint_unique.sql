-- ============================================================================
--  Arregla el registro de avisos cuando VARIAS CUENTAS comparten un dispositivo.
--
--  Síntoma: la primera cuenta activa los avisos sin problema; al entrar otra
--  cuenta en el mismo navegador y activarlos, PostgREST devuelve
--    23505 - duplicate key value violates unique constraint
--            "push_subscriptions_endpoint_key"
--  y la app mostraba (mal) un aviso pidiendo ejecutar el SQL de notificaciones.
--
--  Causa: la tabla se creó con `endpoint text not null unique`, heredado de
--  ConnexoClients. Esa restricción hace que un endpoint solo pueda pertenecer a
--  UNA fila en toda la tabla, así que dos cuentas nunca pueden registrar el
--  mismo dispositivo — justo lo contrario de lo que dice el índice compuesto
--  (user_id, endpoint) y de lo que hace el upsert del cliente
--  (`onConflict: 'user_id,endpoint'`).
--
--  Se quita la restricción suelta y se conserva la compuesta, que es la que
--  representa la regla real: **una suscripción por (cuenta, dispositivo)**.
-- ============================================================================

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_key;

-- Red de seguridad: la compuesta es la que usa el upsert como árbitro.
create unique index if not exists push_subscriptions_user_endpoint_idx
  on public.push_subscriptions(user_id, endpoint);

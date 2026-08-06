-- ============================================================================
--  Función de diagnóstico del sistema de avisos.
--  Va en su propia migración porque la del webhook ya estaba aplicada.
-- ============================================================================

-- ── Diagnóstico ─────────────────────────────────────────────────────────────
-- Responde si el sistema de avisos está completo, sin entrar al panel:
--   select * from public.estado_notificaciones();
-- (desde la app o por REST: /rest/v1/rpc/estado_notificaciones)
create or replace function public.estado_notificaciones()
returns table (
  tabla_notificaciones  boolean,
  tabla_suscripciones   boolean,
  trigger_ventas        boolean,
  trigger_stock         boolean,
  trigger_stock_estado  boolean,
  webhook_push          boolean,
  realtime_activo       boolean,
  dispositivos          bigint,
  avisos                bigint
)
language sql security definer set search_path = public as $$
  select
    to_regclass('public.notifications')      is not null,
    to_regclass('public.push_subscriptions') is not null,
    exists (select 1 from pg_trigger where tgname = 'trg_notify_new_sale'     and not tgisinternal),
    exists (select 1 from pg_trigger where tgname = 'trg_notify_stock_request' and not tgisinternal),
    exists (select 1 from pg_trigger where tgname = 'trg_notify_stock_status'  and not tgisinternal),
    exists (select 1 from pg_trigger where tgname = 'trg_notifications_push'   and not tgisinternal),
    exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ),
    (select count(*) from public.push_subscriptions),
    (select count(*) from public.notifications);
$$;

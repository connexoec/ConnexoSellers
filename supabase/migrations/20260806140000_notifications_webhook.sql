-- ============================================================================
--  Webhook: cada notificación nueva llama a la Edge Function `sendPush`.
--
--  Un "Database Webhook" del panel de Supabase no es más que un trigger que
--  llama a `supabase_functions.http_request` (extensión pg_net). Crearlo aquí
--  deja el sistema completo sin tener que tocar el panel.
--
--  ⚠️ Ese esquema solo existe si el proyecto tiene los webhooks habilitados.
--  Por eso todo va dentro de una guarda: si no está, la migración NO falla,
--  solo avisa para crearlo a mano (Paso 3 de NOTIFICACIONES_SETUP.md).
--
--  La función se desplegó con --no-verify-jwt, así que no hace falta mandar
--  ninguna credencial en la cabecera.
-- ============================================================================

do $$
begin
  if to_regproc('supabase_functions.http_request') is null then
    raise notice
      'supabase_functions.http_request no existe: crea el webhook a mano '
      '(Database → Webhooks → tabla public.notifications, evento INSERT, '
      'Edge Function sendPush).';
    return;
  end if;

  drop trigger if exists trg_notifications_push on public.notifications;

  execute $sql$
    create trigger trg_notifications_push
      after insert on public.notifications
      for each row
      execute function supabase_functions.http_request(
        'https://aisjtkezgumawgjmwckb.supabase.co/functions/v1/sendPush',
        'POST',
        '{"Content-Type":"application/json"}',
        '{}',
        '5000'
      );
  $sql$;

  raise notice 'Webhook de push creado sobre public.notifications.';
end $$;

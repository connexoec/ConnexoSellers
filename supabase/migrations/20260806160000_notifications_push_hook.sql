-- ============================================================================
--  Disparo de la push: cada notificación nueva llama a la Edge Function.
--
--  La migración anterior intentaba usar `supabase_functions.http_request`, que
--  es lo que crea el panel al configurar un "Database Webhook". En este
--  proyecto ese esquema NO existe (nunca se habilitaron webhooks), así que la
--  guarda lo detectó y no hizo nada.
--
--  Aquí se hace igual pero con `pg_net` directamente: mismo efecto, sin
--  depender de que alguien entre al panel a habilitar la integración.
--  `net.http_post` es ASÍNCRONO (encola la petición), así que insertar una
--  notificación no se queda esperando a la función.
--
--  La Edge Function se desplegó con --no-verify-jwt, por eso no se manda
--  ninguna credencial en la cabecera.
-- ============================================================================

create extension if not exists pg_net with schema extensions;

create or replace function public.tg_push_notification()
returns trigger
language plpgsql security definer set search_path = public, extensions, net as $$
begin
  perform net.http_post(
    url                  := 'https://aisjtkezgumawgjmwckb.supabase.co/functions/v1/sendPush',
    -- sendPush acepta { record: … } (formato de webhook) o el objeto plano.
    body                 := jsonb_build_object('record', to_jsonb(new)),
    headers              := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  -- Que un fallo enviando la push JAMÁS impida guardar la notificación:
  -- el aviso in-app debe llegar igual.
  raise warning 'No se pudo encolar la push: %', sqlerrm;
  return new;
end $$;

drop trigger if exists trg_notifications_push on public.notifications;
create trigger trg_notifications_push
  after insert on public.notifications
  for each row execute function public.tg_push_notification();

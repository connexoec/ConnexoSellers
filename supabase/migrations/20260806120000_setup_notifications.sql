-- ============================================================================
--  setup_notifications.sql — Connexo Sellers
--  Sistema de alertas: centro in-app (tiempo real) + Web Push al dispositivo.
--  Ejecutar COMPLETO en: Supabase → SQL Editor del proyecto de Sellers.
--  Es idempotente: se puede reejecutar sin romper nada.
--
--  ⚠️ DIFERENCIA CLAVE con ConnexoClients: esta app NO usa Supabase Auth.
--  Entra con la `anon key` contra `public.profiles`, así que:
--    · las claves foráneas apuntan a `public.profiles`, no a `auth.users`
--    · el RLS va DESACTIVADO en las dos tablas nuevas, igual que en las otras 6
--      (ver Lección #1 en CLAUDE.md: con RLS activo la app deja de funcionar).
-- ============================================================================

create extension if not exists pgcrypto;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Suscripciones Web Push — una fila por dispositivo/navegador de cada usuario
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

-- Único por (usuario, dispositivo): el mismo teléfono puede tener varias
-- cuentas y cada una conserva su propia suscripción.
create unique index if not exists push_subscriptions_user_endpoint_idx
  on public.push_subscriptions(user_id, endpoint);

alter table public.push_subscriptions disable row level security;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Centro de notificaciones in-app
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,   -- sale | stock | stock_status | team | certified | level | base
  title      text not null,
  body       text,
  url        text,            -- ej. '?tab=history' → la app abre esa pestaña
  data       jsonb not null default '{}'::jsonb,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx
  on public.notifications(user_id, created_at desc);

alter table public.notifications disable row level security;

-- Realtime: es lo que hace que la campana se actualice al instante.
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when others then null; end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) Helpers
-- ────────────────────────────────────────────────────────────────────────────

-- Crea una notificación para un usuario concreto.
create or replace function public.notify_user(
  p_user_id uuid, p_type text, p_title text, p_body text, p_url text,
  p_data jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null then return; end if;
  insert into public.notifications(user_id, type, title, body, url, data)
  values (p_user_id, p_type, p_title, p_body, p_url, coalesce(p_data, '{}'::jsonb));
end; $$;

-- Igual pero a TODOS los super admins (puede haber más de uno a futuro).
create or replace function public.notify_super_admins(
  p_type text, p_title text, p_body text, p_url text,
  p_data jsonb default '{}'::jsonb, p_except uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare admin_id uuid;
begin
  for admin_id in
    select id from public.profiles
    where role = 'SUPER_ADMIN' and (p_except is null or id <> p_except)
  loop
    perform public.notify_user(admin_id, p_type, p_title, p_body, p_url, p_data);
  end loop;
end; $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) Trigger: NUEVA VENTA
--    Avisa al distribuidor padre del vendedor y a los super admins.
--
--    ⚠️ GUARDA ANTI-SIEMBRA: `seedCompleteScenario` inserta ~1.400 ventas de
--    golpe y fija `created_at` a medianoche de un día pasado. Sin este filtro,
--    una siembra generaría miles de notificaciones y otras tantas push.
--    Una venta REAL no fija `created_at` (se queda en el `now()` por defecto),
--    así que exigir que sea reciente distingue las dos con precisión.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_notify_new_sale()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_seller   public.profiles%rowtype;
  v_titulo   text;
  v_cuerpo   text;
begin
  -- Siembra / carga histórica → no se notifica.
  if new.created_at < now() - interval '5 minutes' then return new; end if;
  if coalesce(new.customer_notes, '') like '%Escenario prueba%' then return new; end if;

  select * into v_seller from public.profiles where id = new.seller_id;
  if not found then return new; end if;

  v_titulo := '💰 Venta de ' || coalesce(v_seller.full_name, 'tu red');
  v_cuerpo := coalesce(new.plan_type, 'Plan') || ' · $' ||
              to_char(coalesce(new.amount, 0), 'FM999999990.00') ||
              coalesce(' · Cliente: ' || new.customer_name, '');

  -- Al distribuidor padre (no a uno mismo si el padre es el propio vendedor).
  if v_seller.parent_id is not null and v_seller.parent_id <> new.seller_id then
    perform public.notify_user(
      v_seller.parent_id, 'sale', v_titulo, v_cuerpo, '?tab=history',
      jsonb_build_object('sale_id', new.id, 'seller_id', new.seller_id)
    );
  end if;

  -- A los super admins (salvo que la venta sea suya).
  perform public.notify_super_admins(
    'sale', v_titulo, v_cuerpo, '?tab=history',
    jsonb_build_object('sale_id', new.id, 'seller_id', new.seller_id),
    new.seller_id
  );

  return new;
end; $$;

drop trigger if exists trg_notify_new_sale on public.sales;
create trigger trg_notify_new_sale
  after insert on public.sales
  for each row execute function public.tg_notify_new_sale();

-- ────────────────────────────────────────────────────────────────────────────
-- 5) Trigger: PEDIDO DE STOCK creado → a los super admins
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_notify_stock_request()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nombre text;
  v_items  int;
begin
  select full_name into v_nombre from public.profiles where id = new.distributor_id;

  begin
    v_items := jsonb_array_length(to_jsonb(new.items));
  exception when others then v_items := null; end;

  perform public.notify_super_admins(
    'stock',
    '📦 Pedido de stock',
    coalesce(v_nombre, 'Un distribuidor') || ' solicitó inventario' ||
      coalesce(' (' || v_items || ' productos)', ''),
    '?tab=inventory',
    jsonb_build_object('request_id', new.id, 'distributor_id', new.distributor_id)
  );
  return new;
end; $$;

drop trigger if exists trg_notify_stock_request on public.inventory_requests;
create trigger trg_notify_stock_request
  after insert on public.inventory_requests
  for each row execute function public.tg_notify_stock_request();

-- ────────────────────────────────────────────────────────────────────────────
-- 6) Trigger: PEDIDO RESUELTO (aprobado/rechazado) → al distribuidor
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_notify_stock_status()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_titulo text;
  v_cuerpo text;
begin
  if new.status is not distinct from old.status then return new; end if;

  if new.status = 'APPROVED' then
    v_titulo := '✅ Pedido aprobado';
    v_cuerpo := 'Tu solicitud de inventario fue aprobada y el stock ya está descontado del almacén.';
  elsif new.status = 'REJECTED' then
    v_titulo := '❌ Pedido rechazado';
    v_cuerpo := 'Tu solicitud de inventario fue rechazada. Revisa el detalle en Inventario.';
  else
    v_titulo := '📦 Pedido actualizado';
    v_cuerpo := 'El estado de tu solicitud cambió a ' || coalesce(new.status, '?') || '.';
  end if;

  perform public.notify_user(
    new.distributor_id, 'stock_status', v_titulo, v_cuerpo, '?tab=inventory',
    jsonb_build_object('request_id', new.id, 'status', new.status)
  );
  return new;
end; $$;

drop trigger if exists trg_notify_stock_status on public.inventory_requests;
create trigger trg_notify_stock_status
  after update on public.inventory_requests
  for each row execute function public.tg_notify_stock_status();

-- ────────────────────────────────────────────────────────────────────────────
-- 7) Limpieza: conservar como mucho 100 notificaciones por usuario
--    Se ejecuta sola en cada inserción; evita que la tabla crezca sin fin.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_trim_notifications()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.notifications
  where user_id = new.user_id
    and id not in (
      select id from public.notifications
      where user_id = new.user_id
      order by created_at desc
      limit 100
    );
  return null;
end; $$;

drop trigger if exists trg_trim_notifications on public.notifications;
create trigger trg_trim_notifications
  after insert on public.notifications
  for each row execute function public.tg_trim_notifications();

-- ────────────────────────────────────────────────────────────────────────────
-- Comprobación rápida (debe devolver rowsecurity = false en las dos)
-- ────────────────────────────────────────────────────────────────────────────
-- select tablename, rowsecurity from pg_tables
--  where schemaname = 'public' and tablename in ('notifications','push_subscriptions');

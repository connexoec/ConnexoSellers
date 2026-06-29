-- ============================================================================
-- Connexo Sellers — Esquema completo de base de datos (Supabase / PostgreSQL)
-- ----------------------------------------------------------------------------
-- Ejecuta este archivo COMPLETO en el SQL Editor del nuevo proyecto Supabase.
-- Reproduce las 6 tablas que la app espera, derivadas de src/services/dataService.js
-- ============================================================================

-- ── 1. PROFILES (usuarios: admins, distribuidores, vendedores) ──────────────
create table if not exists public.profiles (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  full_name       text,
  email           text unique,
  password        text,                       -- ⚠️ texto plano (ver nota de seguridad)
  role            text not null default 'SELLER', -- SUPER_ADMIN | DISTRIBUTOR | SELLER
  tier            text,                        -- PRO | ULTRA | D1 | D2 | D3 | null
  tier_start_date timestamptz,
  is_certified    boolean not null default false,
  wallet_balance  numeric not null default 0,
  parent_id       uuid references public.profiles(id) on delete set null,
  sede_asignada   text,                        -- 'sede-ec-1', 'sede-ve-1', 'GLOBAL'...
  badges          jsonb,
  avatar_url      text
);

-- ── 2. SALES (ventas y comisiones) ──────────────────────────────────────────
create table if not exists public.sales (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  seller_id         uuid references public.profiles(id) on delete cascade,
  plan_type         text,            -- 'PRO ANUAL', 'ULTRA MENSUAL', 'CONNECTA 7 DIAS'...
  amount            numeric not null default 0,
  commission_earned numeric not null default 0,
  customer_name     text,
  customer_phone    text,
  customer_email    text,
  customer_company  text,
  customer_notes    text,
  status            text default 'COMPLETED',
  sede_id           text
);

-- ── 3. INVENTORY (productos / stock por sede) ───────────────────────────────
create table if not exists public.inventory (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  name             text not null,
  description      text,
  category         text default 'NFC',   -- PLAN | NFC | PACKAGING | MERCH
  stock_quantity   integer not null default 0,
  unit_type        text default 'UNIDAD',
  detail_packaging text,
  price            numeric not null default 0,
  sede_id          text default 'sede-ec-1'
);

-- ── 4. INVENTORY_REQUESTS (pedidos de stock de los distribuidores) ──────────
create table if not exists public.inventory_requests (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  distributor_id uuid references public.profiles(id) on delete cascade,
  items          jsonb,            -- [{ product_id, quantity, product_name }]
  status         text default 'PENDING', -- PENDING | APPROVED | REJECTED
  notes          text
);

-- ── 5. ACADEMY_COURSES (cursos / examen de certificación) ───────────────────
create table if not exists public.academy_courses (
  id          text primary key,    -- '1', '2', '3'... (la app hace upsert por id)
  title       text,
  type        text,                -- video | document | quiz
  url         text,
  duration    text,
  description text,
  questions   jsonb                -- solo para type = 'quiz'
);

-- ── 6. SEDES (sucursales / países) ──────────────────────────────────────────
create table if not exists public.sedes (
  id          text primary key default ('sede-' || gen_random_uuid()::text),
  created_at  timestamptz not null default now(),
  nombre_sede text,
  pais        text
);

-- Sedes por defecto que la app referencia directamente (sede-ec-1 / sede-ve-1)
insert into public.sedes (id, nombre_sede, pais)
values
  ('sede-ec-1', 'Sede Quito',   'Ecuador'),
  ('sede-ve-1', 'Sede Caracas', 'Venezuela')
on conflict (id) do nothing;

-- ============================================================================
-- RLS / SEGURIDAD
-- ----------------------------------------------------------------------------
-- La app NO usa Supabase Auth: se conecta con la ANON KEY y consulta las tablas
-- directamente (incluido el login leyendo email+password). Por eso, para que
-- funcione tal cual está hoy, las tablas deben quedar accesibles por 'anon'.
--
-- OPCIÓN A (igual que el proyecto anterior, lo más simple): RLS DESACTIVADO.
--   IMPORTANTE: en proyectos nuevos Supabase suele dejar el RLS ACTIVADO, lo que
--   bloquea los INSERT con anon (error 42501) y rompe el login. Ejecuta esto para
--   desactivarlo en las 6 tablas:
alter table public.profiles            disable row level security;
alter table public.sales               disable row level security;
alter table public.inventory           disable row level security;
alter table public.inventory_requests  disable row level security;
alter table public.academy_courses     disable row level security;
alter table public.sedes               disable row level security;
--
-- OPCIÓN B (RLS activado con políticas permisivas — mismo nivel de acceso,
--   pero explícito). Descomenta el bloque siguiente si lo prefieres:
--
-- do $$
-- declare t text;
-- begin
--   foreach t in array array['profiles','sales','inventory','inventory_requests','academy_courses','sedes']
--   loop
--     execute format('alter table public.%I enable row level security;', t);
--     execute format('drop policy if exists anon_all on public.%I;', t);
--     execute format('create policy anon_all on public.%I for all to anon using (true) with check (true);', t);
--   end loop;
-- end $$;
-- ============================================================================

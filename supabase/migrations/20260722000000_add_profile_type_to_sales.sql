-- Tipo de perfil que el cliente recibe al activarse el plan.
-- Valores: ESTANDAR | BARBERIA | GASTRONOMIA | PETCARE | SALUD | ECOMMERCE
--          ARTISTA | INMOBILIARIA | SUBLIMADOS
-- Ver src/constants/customerProfiles.js (catalogo unico en la app).
alter table public.sales
  add column if not exists profile_type text default 'ESTANDAR';

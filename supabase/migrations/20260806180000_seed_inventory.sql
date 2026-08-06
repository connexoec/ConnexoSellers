-- ============================================================================
--  Siembra del catálogo de inventario en Supabase.
--
--  Estos 16 productos existían SOLO en el fallback de localStorage de
--  dataService.getInventory: se creaban en el navegador de cada persona y
--  nunca llegaban a la base. Resultado: el almacén no era compartido — cada
--  dispositivo veía su propia copia, y los pedidos de stock apuntaban a
--  productos que el Super Admin no tenía.
--
--  Idempotente: inserta solo lo que falte, comparando por (name, sede_id).
--  No toca ni borra nada de lo que ya haya cargado a mano.
-- ============================================================================

insert into public.inventory
  (name, description, category, stock_quantity, unit_type, detail_packaging, price, sede_id)
select v.name, v.description, v.category, v.stock_quantity, v.unit_type,
       v.detail_packaging, v.price, v.sede_id
from (values
  ('Licencia de Plan Connexo (EC)', 'Licencia para activación del ecosistema de plan inteligente Connexo.', 'PLAN', 5000, 'LICENCIA', 'Distribución Digital', 5.26, 'sede-ec-1'),
  ('Tarjeta NFC Negra (EC)', 'Tarjeta inteligente de presentación premium negra con tecnología NFC.', 'NFC', 500, 'UNIDAD', 'Empaque individual', 0.45, 'sede-ec-1'),
  ('Tarjeta NFC Blanca (EC)', 'Tarjeta inteligente de presentación estándar blanca con tecnología NFC.', 'NFC', 500, 'UNIDAD', 'Empaque individual', 0.45, 'sede-ec-1'),
  ('Pulsera NFC (EC)', 'Pulsera ergonómica y ajustable con chip NFC integrado.', 'NFC', 300, 'UNIDAD', 'Bolsas protectoras', 5.5, 'sede-ec-1'),
  ('Lector NFC (EC)', 'Lector/Grabador de mesa NFC para sincronización masiva.', 'NFC', 50, 'UNIDAD', 'Caja sellada con cable USB', 80, 'sede-ec-1'),
  ('Chips NFC (Paquete 100u) (EC)', 'Paquete de microchips NFC autoadhesivos pequeños.', 'NFC', 1000, 'UNIDAD', 'Rollo sellado de 100 chips', 40, 'sede-ec-1'),
  ('Caja / Empaque (EC)', 'Caja de presentación Kraft Premium para productos Connexo.', 'PACKAGING', 200, 'UNIDAD', 'Caja rígida premium', 3, 'sede-ec-1'),
  ('Servicio de Impresión (EC)', 'Personalización y grabado de imagen corporativa sobre tarjeta NFC.', 'MERCH', 400, 'UNIDAD', 'Acabado mate/brillante', 4, 'sede-ec-1'),
  ('Licencia de Plan Connexo (VE)', 'Licencia para activación del ecosistema de plan inteligente Connexo.', 'PLAN', 2000, 'LICENCIA', 'Distribución Digital', 5.26, 'sede-ve-1'),
  ('Tarjeta NFC Negra (VE)', 'Tarjeta inteligente de presentación premium negra con tecnología NFC.', 'NFC', 150, 'UNIDAD', 'Empaque individual', 0.45, 'sede-ve-1'),
  ('Tarjeta NFC Blanca (VE)', 'Tarjeta inteligente de presentación estándar blanca con tecnología NFC.', 'NFC', 150, 'UNIDAD', 'Empaque individual', 0.45, 'sede-ve-1'),
  ('Pulsera NFC (VE)', 'Pulsera ergonómica y ajustable con chip NFC integrado.', 'NFC', 80, 'UNIDAD', 'Bolsas protectoras', 5.5, 'sede-ve-1'),
  ('Lector NFC (VE)', 'Lector/Grabador de mesa NFC para sincronización masiva.', 'NFC', 20, 'UNIDAD', 'Caja sellada con cable USB', 80, 'sede-ve-1'),
  ('Chips NFC (Paquete 100u) (VE)', 'Paquete de microchips NFC autoadhesivos pequeños.', 'NFC', 250, 'UNIDAD', 'Rollo sellado de 100 chips', 40, 'sede-ve-1'),
  ('Caja / Empaque (VE)', 'Caja de presentación Kraft Premium para productos Connexo.', 'PACKAGING', 50, 'UNIDAD', 'Caja rígida premium', 3, 'sede-ve-1'),
  ('Servicio de Impresión (VE)', 'Personalización y grabado de imagen corporativa sobre tarjeta NFC.', 'MERCH', 100, 'UNIDAD', 'Acabado mate/brillante', 4, 'sede-ve-1')
) as v(name, description, category, stock_quantity, unit_type, detail_packaging, price, sede_id)
where not exists (
  select 1 from public.inventory i
   where i.name = v.name and i.sede_id = v.sede_id
);

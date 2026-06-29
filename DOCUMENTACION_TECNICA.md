# Connexo Sellers — Documentación Técnica

Documento técnico de referencia en tiempo real sobre el funcionamiento de la
aplicación: qué hace, quiénes la usan, cómo se calculan las comisiones, cómo se
crean los usuarios y cómo opera el sistema a profundidad.

Versión del documento: 2026-06-29 · App: Connexo v2.x

---

## 1. ¿Qué es Connexo Sellers?

Connexo Sellers es una aplicación web (SPA) para gestionar la **fuerza de ventas**
del ecosistema Connexo: tarjetas y hardware NFC para networking inteligente, más
planes de software por suscripción (SaaS) PRO y ULTRA.

La app permite:

- Registrar ventas de planes y calcular comisiones automáticamente.
- Construir y administrar una red jerárquica de distribuidores y vendedores.
- Certificar vendedores mediante una academia con examen.
- Gestionar inventario y pedidos de stock por sede/país.
- Otorgar insignias de logro (gamificación).
- Generar reportes en PDF.

## 2. Tecnología

- Frontend: React 19 + Vite 8 (Single Page Application).
- Animaciones: Framer Motion. Iconos: lucide-react. Reportes: jsPDF.
- Backend: Supabase (PostgreSQL + API REST). No usa Supabase Auth.
- Persistencia secundaria: LocalStorage del navegador (modo de respaldo offline).
- Hosting: Vercel (deploy automático al hacer push a la rama main).
- Gestor de paquetes: pnpm. Node 24.x.

### Modelo de datos en la nube (Supabase)

La app usa 6 tablas:

| Tabla | Contenido |
|-------|-----------|
| profiles | Usuarios: admins, distribuidores y vendedores. |
| sales | Ventas registradas y sus comisiones. |
| inventory | Productos y stock por sede. |
| inventory_requests | Pedidos de stock hechos por distribuidores. |
| academy_courses | Cursos y examen de certificación. |
| sedes | Sucursales / países (ej. Ecuador, Venezuela). |

Importante: la app guarda en LocalStorage una copia de respaldo. Si Supabase no
responde, sigue funcionando con datos locales, pero esos datos no se sincronizan
en la nube hasta que la conexión se restablece.

## 3. Roles de usuario

La app define tres roles, cada uno con permisos y vistas distintas.

### 3.1 Super Admin (SUPER_ADMIN)

Control total del ecosistema. No vende ni gana comisiones.

- Ve a todos los usuarios, ventas e inventario de todas las sedes.
- Crea cualquier tipo de usuario (vendedor, distribuidor u otro super admin).
- Certifica vendedores manualmente.
- Asigna o cambia el rango (tier) de cualquier usuario, o lo deja en AUTO.
- Gestiona sedes (crear/editar; solo el Master Admin puede eliminarlas).
- Otorga insignias.
- Siembra datos de prueba y purga toda la base.

Super Admins predefinidos (acceso garantizado, se crean solos al primer login):

| Email | Clave | Notas |
|-------|-------|-------|
| thony.karter@gmail.com | ConnexoApp666 | Master Admin (puede borrar sedes). |
| emapmvisual@gmail.com | ConnexoApp666 | Super Admin. |

### 3.2 Distribuidor (DISTRIBUTOR)

Líder de red. Recluta vendedores y gana comisiones por su volumen.

- Crea y gestiona sus propios vendedores (su "red").
- Gana comisión por sus ventas directas y un "override" sobre las ventas de su red.
- Administra inventario y solicita stock.
- Ve el volumen y las comisiones de su red, pero no de otras redes.

### 3.3 Vendedor (SELLER)

Agente de ventas individual.

- Registra ventas de planes a clientes.
- Gana comisión solo si está certificado (de lo contrario, comisión = 0).
- Ve su propio historial de movimientos y su billetera.

### Navegación según rol

| Pestaña | Super Admin | Distribuidor | Vendedor |
|---------|-------------|--------------|----------|
| Inicio (Dashboard) | Sí | Sí | Sí |
| Nueva Venta | No | Sí | Sí |
| Movimientos (Historial) | Sí | No | Sí |
| Academia | Sí | Sí | Sí |
| Almacén (Inventario) | Sí | Sí | No |
| Admin / Red | Sí (Admin) | Sí (Red) | No |
| Perfil | Sí | Sí | Sí |

## 4. Planes y precios

| Plan | Precio Anual | Precio Mensual | Comisiona |
|------|--------------|----------------|-----------|
| PRO | 97.00 USD | 9.00 USD | Sí |
| ULTRA | 197.00 USD | 17.00 USD | Sí |
| CONNECTA | Gratis (prueba 7 días) | — | No (0 comisión) |

Al registrar una venta se elige el plan y la frecuencia (anual o mensual). El plan
CONNECTA es una prueba gratuita de 7 días y no genera comisión.

## 5. Niveles de comisión

El nivel determina la tasa de comisión. Puede calcularse automáticamente según el
número de ventas, o el Super Admin puede fijarlo manualmente.

### 5.1 Vendedores

La tasa se aplica sobre el precio del plan vendido.

| Nivel | Tasa | Se alcanza con |
|-------|------|----------------|
| VENDEDOR PRO | 7% | Nivel base (y a partir de 20 ventas). |
| VENDEDOR ULTRA | 9% | A partir de 31 ventas acumuladas. |

Un vendedor no certificado tiene tasa 0% (nivel BLOQUEADO) hasta aprobar la academia.

### 5.2 Distribuidores

La tasa se aplica sobre el volumen de su red (sus ventas + las de sus vendedores).

| Nivel | Tasa | Se alcanza con |
|-------|------|----------------|
| DISTRIBUIDOR 1 | 12% | Nivel base. |
| DISTRIBUIDOR 2 | 15% | A partir de 101 ventas de red. |
| DISTRIBUIDOR 3 | 18% | A partir de 201 ventas de red. |

### 5.3 Cómo se calcula la comisión de una venta

1. Se toma el precio base del plan (según plan y frecuencia).
2. Comisión del vendedor = precio x tasa del vendedor (solo si está certificado).
3. Si el vendedor tiene un distribuidor padre certificado, ese distribuidor recibe
   además un override = precio x tasa del distribuidor.
4. Las comisiones se suman al saldo de la billetera (wallet_balance) de cada uno.

Ejemplo: un vendedor PRO certificado vende un plan ULTRA anual (197 USD).

- Comisión del vendedor: 197 x 7% = 13.79 USD.
- Si su distribuidor es DISTRIBUIDOR 1 (12%): override de 197 x 12% = 23.64 USD.

### 5.4 Meta mensual de ventas anuales

Cada nivel tiene una meta de ventas de planes ANUALES dentro del mes calendario en
curso. Cumplir la meta desbloquea el "base" del nivel.

| Nivel | Meta mensual (ventas anuales) |
|-------|-------------------------------|
| VENDEDOR PRO | 7 |
| VENDEDOR ULTRA | 10 |
| DISTRIBUIDOR 1 | 25 |
| DISTRIBUIDOR 2 | 50 |
| DISTRIBUIDOR 3 | 100 |

## 6. Cómo crear usuarios

### 6.1 Crear el Super Admin (primera vez)

No requiere registro manual. Ingresar en la pantalla de login con uno de los emails
predefinidos (ver sección 3.1) y la clave ConnexoApp666. El perfil se crea solo en
la base de datos en ese primer acceso.

### 6.2 Crear distribuidores, vendedores u otros admins

1. Iniciar sesión como Super Admin (o como Distribuidor para crear vendedores).
2. Ir a la pestaña Admin (super admin) o Red (distribuidor).
3. Pulsar "Crear Nuevo".
4. Completar nombre y correo. El Super Admin puede además elegir el rol, el rango
   (tier) y la sede. Un distribuidor solo crea vendedores dentro de su red.
5. Confirmar. El usuario nuevo entra con su correo y la clave temporal: connexo123.

### 6.3 Asignar o cambiar el rango (tier)

En la lista de la red, el Super Admin puede cambiar el rango de cada usuario con el
selector: CÁLCULO AUTO (se calcula por ventas) o un rango fijo (PRO, ULTRA, D1, D2, D3).

### 6.4 Certificar un vendedor

Un vendedor gana comisiones solo si está certificado. La certificación se obtiene al
aprobar el examen de la Academia, o el Super Admin puede certificarlo manualmente.

## 7. Flujos principales

### 7.1 Registrar una venta

Disponible para vendedores y distribuidores. Botón "Nueva Venta" → elegir plan
(PRO/ULTRA/CONNECTA) y frecuencia → ingresar datos del cliente (nombre y teléfono
obligatorios; empresa, email y notas opcionales) → confirmar. La app calcula la
comisión, la suma a la billetera y, si aplica, paga el override al distribuidor padre.

### 7.2 Academia y certificación

Cursos en video/documento y un examen final tipo quiz. Al aprobarlo, el vendedor
queda certificado y comienza a comisionar.

### 7.3 Inventario y pedidos de stock

El inventario se organiza por sede (ej. Ecuador, Venezuela) con productos como
licencias de plan, tarjetas NFC, pulseras, lectores, chips, empaques e impresión.
Los distribuidores solicitan stock; al aprobar el pedido, el stock se descuenta
automáticamente.

### 7.4 Sedes (sucursales / países)

El Super Admin trabaja con un contexto de sede (GLOBAL, Ecuador o Venezuela) que
filtra usuarios, ventas e inventario. Solo el Master Admin (thony.karter@gmail.com)
puede eliminar una sede.

### 7.5 Insignias (gamificación)

Catálogo de 12 insignias (6 básicas y 6 de élite) que el Super Admin y los
distribuidores pueden activar manualmente para reconocer logros de sus agentes.

| Tipo | Insignias |
|------|-----------|
| Básicas | Primer Impacto, SaaS Starter, Operador Iniciado, Martillo de Oro, Mente Brillante, Cazador de Leads. |
| Élite | Pionero Fundador, Señor del Recurrente, Distribuidor Verificado, Cerrador Corporativo, Titán SaaS, Maestro Certificado. |

### 7.6 Responsabilidad social

La app reserva el 10% del total de cada venta de plan PRO o ULTRA para la Fundación
Arupo (desarrollo tecnológico comunitario). Esto se muestra en el desglose de fondos
de la red.

## 8. Herramientas de administración (Super Admin)

- Sembrar datos de prueba: genera un escenario completo de distribuidores,
  vendedores y ventas para pruebas/demostración.
- Purga total: borra todas las ventas, pedidos y usuarios (excepto los dos super
  admins principales). Preserva inventario, sedes y sesión.

## 9. Seguridad (estado actual y advertencias)

- La app NO usa Supabase Auth: se conecta con la clave anónima (anon key) y consulta
  las tablas directamente.
- Las contraseñas se guardan en texto plano en la tabla profiles.
- El RLS (Row Level Security) está desactivado para que la app funcione.

Implicación: cualquiera con la anon key puede leer y escribir en la base. Es
funcional, pero se recomienda endurecerlo a futuro (hashear contraseñas y activar
RLS o migrar a Supabase Auth). Las credenciales viven en variables de entorno
(VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY), nunca en el repositorio.

## 10. Glosario

- Tier (rango): nivel comercial del usuario que define su tasa de comisión.
- Override: comisión que gana el distribuidor por las ventas de su red.
- Wallet balance: saldo acumulado de comisiones de un usuario.
- Certificación: estado que habilita a un vendedor a ganar comisiones.
- Sede: sucursal o país que agrupa usuarios, ventas e inventario.
- RLS: Row Level Security, el control de acceso por filas de Supabase.

// Textos y reglas de cumplimiento para vendedores y distribuidores.
//
// ⚠️ Los textos de TERMS_POINTS son un borrador de trabajo: la redacción final
// la define el contrato firmado y la revisión del abogado. Si se cambia el
// contenido de fondo, SUBIR `TERMS_VERSION` para que todos vuelvan a aceptar.

export const TERMS_VERSION = '2026-11-v1';

export const INCOME_DISCLAIMER =
  'Las comisiones y bonos dependen de las ventas realizadas; no se garantizan ingresos.';

const COMUNES = [
  {
    icon: '🧭',
    title: 'Actividad independiente',
    text: 'Vendes por tu propia cuenta. No tienes horario, jefe ni relación de dependencia con Connexo, y decides cuándo, cómo y a quién ofrecer los planes.'
  },
  {
    icon: '🔓',
    title: 'Sin exclusividad',
    text: 'Puedes vender otros productos o servicios y rechazar a los clientes que no quieras atender. Esta colaboración no te obliga a trabajar solo con Connexo.'
  },
  {
    icon: '💵',
    title: 'Pago por resultados',
    text: `Recibes una comisión por cada plan vendido y, si cumples la meta mensual de tu nivel, un bono por meta. Connexo paga contra la factura que tú emites con tu RUC. ${INCOME_DISCLAIMER}`
  },
  {
    icon: '🎓',
    title: 'Certificación de producto',
    text: 'Para vender el producto debes aprobar el examen de la Academia. Sin certificación no se calculan comisiones.'
  },
  {
    icon: '🔒',
    title: 'Confidencialidad',
    text: 'La información de clientes, los precios de distribuidor y el funcionamiento de la plataforma que conozcas por este canal es confidencial: úsala solo para vender y atender a tus clientes y no la compartas ni la uses para otros fines. Esto no te impide vender otros productos.'
  },
  {
    icon: '🗂️',
    title: 'Datos de clientes',
    text: 'Las listas de clientes se usan solo para la venta y su atención, y se borran cuando el cliente lo pida o cuando ya no hagan falta.'
  }
];

const SOLO_DISTRIBUIDOR = [
  {
    icon: '🏢',
    title: 'Tu red de vendedores',
    text: 'Refieres y acompañas vendedores; Connexo los incorpora y les paga. No prometes ingresos a tus vendedores ni cobras por reclutar o por entrar a la red.'
  },
  {
    icon: '📈',
    title: 'Rango y paquete de licencias',
    text: 'El rango se gana con ventas y el porcentaje no se compra. El paquete de licencias es lo que te permite activar planes para tus clientes.'
  }
];

export const getTermsPoints = (role) =>
  role === 'DISTRIBUTOR' ? [...COMUNES, ...SOLO_DISTRIBUIDOR] : COMUNES;

/** ¿Este usuario ya aceptó la versión vigente de los términos? */
export function hasAcceptedTerms(user) {
  if (!user) return false;
  if (user.terms_accepted_at && user.terms_version === TERMS_VERSION) return true;
  // Marca local: se usa solo si la base aún no tiene las columnas de términos
  // (ver `dataService.acceptTerms`), para no bloquear a nadie en bucle.
  try {
    const raw = localStorage.getItem(`connexo_terms_${user.id || user.uid}`);
    if (raw) return JSON.parse(raw).version === TERMS_VERSION;
  } catch {
    /* sin acceso a localStorage: vale lo que diga la base */
  }
  return false;
}

// ── RUC ──────────────────────────────────────────────────────────────────────
export const normalizeRuc = (v) => String(v || '').replace(/\D/g, '');

/** Devuelve '' si es válido (o está vacío, para poder borrarlo) o el mensaje de error. */
export function validateRuc(valor) {
  const ruc = normalizeRuc(valor);
  if (!ruc) return '';
  if (ruc.length !== 13) return 'El RUC debe tener 13 dígitos (solo números).';
  return '';
}

export const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// ─── Insignias que se otorgan SOLAS ─────────────────────────────────────────
// Antes solo dos se intentaban desbloquear, y encima dentro de
// `handleRegisterSale`: solo se evaluaban en el instante exacto de vender, en
// esa pestaña. Si la venta entraba por otra vía (o la app se recargaba), nunca
// se otorgaban — por eso no había ni una insignia en toda la base.
//
// Ahora el criterio vive aquí y se evalúa contra los datos reales en cada
// carga, así que se reparan solas para quien ya cumplió el requisito.
// Las demás siguen siendo manuales (el Super Admin las asigna en Admin/Red).
const esPlanDePago = (s) => {
  const p = (s?.plan_type || '').toUpperCase();
  return p.includes('PRO') || p.includes('ULTRA');
};

export const CRITERIOS_AUTO = {
  FIRST_BLOOD: {
    texto: 'Se otorga sola al registrar tu primera venta.',
    cumple: ({ ventas }) => ventas.length >= 1
  },
  SAAS_STARTER: {
    texto: 'Se otorga sola al cerrar tu primera venta de un plan de pago (PRO o ULTRA).',
    cumple: ({ ventas }) => ventas.some(esPlanDePago)
  },
  ACADEMY_LV1: {
    texto: 'Se otorga sola al aprobar el examen de certificación de la Academia.',
    cumple: ({ usuario }) => !!usuario?.is_certified
  },
  MONTHLY_CHAMP: {
    texto: 'Se otorga sola al llegar a 30 planes de pago en un mismo mes.',
    cumple: ({ ventasMes }) => ventasMes.filter(esPlanDePago).length >= 30
  },
  BASE_SALARY_UNLOCKED: {
    texto: 'Se otorga sola al cumplir tu meta de ventas anuales del mes.',
    cumple: ({ metricas }) => !!metricas?.baseUnlocked
  }
};

/**
 * Devuelve las insignias automáticas que la persona YA se ganó según los datos.
 * Solo suma: nunca quita una insignia otorgada a mano.
 */
export function evaluarInsigniasAutomaticas({ ventas = [], ventasMes = [], usuario, metricas }) {
  const ctx = { ventas, ventasMes, usuario, metricas };
  return Object.keys(CRITERIOS_AUTO).filter((k) => {
    try { return CRITERIOS_AUTO[k].cumple(ctx); } catch { return false; }
  });
}

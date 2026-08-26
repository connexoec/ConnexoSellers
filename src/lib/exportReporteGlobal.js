// Reporte Global Consolidado (Super Admin) en Excel (.xlsx) con el logo de
// Connexo. Reemplaza al PDF mínimo anterior (que solo listaba 3 filas por sede)
// por un libro de varias hojas con KPIs, desglose por sede, por plan, ranking de
// equipo, tendencia mensual y perfiles de cliente.
import ExcelJS from 'exceljs';
import logoUrl from '../assets/CONNEXO LOGO.png?url';
import { getProfileLabel } from '../constants/customerProfiles';

const NARANJA = 'FFF97316';
const NARANJA_OSCURO = 'FFB4470E';
const OSCURO = 'FF111318';
const GRIS_FILA = 'FFF7F2ED';
const GRIS_BORDE = 'FFE2D9CF';
const TEXTO = 'FF1B1B1B';
const VERDE = 'FF0E7C4E';
const MONEDA = '"$"#,##0.00';

async function cargarLogo() {
  const resp = await fetch(logoUrl);
  const buf = await (await resp.blob()).arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const monthKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (key) => {
  const [y, m] = key.split('-');
  const nombre = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es', { month: 'long' });
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${y}`;
};

function etiquetaSede(sedeId, sedes = []) {
  if (!sedeId) return 'Sin sede';
  const s = sedes.find((x) => x.id === sedeId);
  if (s) return s.nombre_sede || s.pais || sedeId;
  if (sedeId === 'sede-ec-1') return 'Ecuador';
  if (sedeId === 'sede-ve-1') return 'Venezuela';
  return sedeId;
}

function desglosarPlan(planType = '') {
  const p = planType.toUpperCase();
  if (p.includes('CONNECTA') || p.includes('7 DIAS')) return { plan: 'CONNECTA', frecuencia: 'Prueba 7 días', pago: false };
  const plan = p.replace(/\s*(MENSUAL|ANUAL)\s*/g, '').trim() || '—';
  const frecuencia = p.includes('MENSUAL') ? 'Mensual' : p.includes('ANUAL') ? 'Anual' : '—';
  return { plan, frecuencia, pago: true };
}

const rolLabel = (role) =>
  role === 'SELLER' ? 'Vendedor' : role === 'DISTRIBUTOR' ? 'Distribuidor' : role === 'SUPER_ADMIN' ? 'Super Admin' : (role || '—');

// ── Helpers de estilo ───────────────────────────────────────────────────────
function pintarBanner(ws, wb, base64, totalCols, titulo, subtitulo) {
  const ultima = ws.getColumn(totalCols).letter;
  for (let r = 1; r <= 4; r++) {
    for (let c = 1; c <= totalCols; c++) {
      ws.getRow(r).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: OSCURO } };
    }
  }
  ws.getRow(1).height = 24; ws.getRow(2).height = 24; ws.getRow(3).height = 18; ws.getRow(4).height = 12;
  if (base64) {
    try {
      const imgId = wb.addImage({ base64, extension: 'png' });
      ws.addImage(imgId, { tl: { col: 0.2, row: 0.3 }, ext: { width: 140, height: 78 } });
    } catch (e) { /* sin logo */ }
  }
  const finTitulo = Math.min(totalCols, 9);
  const colLetter = ws.getColumn(finTitulo).letter;
  ws.mergeCells(`C1:${colLetter}2`);
  const t = ws.getCell('C1');
  t.value = titulo;
  t.font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  t.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.mergeCells(`C3:${colLetter}3`);
  const s = ws.getCell('C3');
  s.value = subtitulo;
  s.font = { name: 'Arial', size: 10, color: { argb: 'FFB9BEC7' } };
  s.alignment = { vertical: 'middle', horizontal: 'left' };
}

function cabecera(ws, fila, headers) {
  const row = ws.getRow(fila);
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NARANJA } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: NARANJA_OSCURO } },
      bottom: { style: 'thin', color: { argb: NARANJA_OSCURO } },
      left: { style: 'thin', color: { argb: NARANJA_OSCURO } },
      right: { style: 'thin', color: { argb: NARANJA_OSCURO } },
    };
  });
  row.height = 26;
}

function estiloFila(fila, idx, totalCols) {
  const par = idx % 2 === 0;
  fila.eachCell({ includeEmpty: true }, (cell, col) => {
    if (!cell.font || !cell.font.bold) cell.font = { name: 'Arial', size: 9, color: { argb: TEXTO } };
    cell.alignment = cell.alignment || { vertical: 'middle' };
    if (par) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS_FILA } };
    cell.border = {
      bottom: { style: 'hair', color: { argb: GRIS_BORDE } },
      right: { style: 'hair', color: { argb: GRIS_BORDE } },
    };
  });
  fila.height = 17;
}

function filaTotales(ws, valores) {
  const row = ws.addRow(valores);
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NARANJA_OSCURO } };
  });
  row.height = 22;
  return row;
}

const sum = (arr, f) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);

/**
 * Genera y descarga el Reporte Global Consolidado en Excel.
 * @param {Object} opts
 * @param {Array}  opts.sales   TODAS las ventas (el Super Admin las recibe todas).
 * @param {Array}  opts.team    todos los perfiles.
 * @param {Array}  opts.sedes   sedes registradas.
 * @param {string} opts.generadoPor  email/nombre del admin que exporta.
 */
export async function exportReporteGlobalXLSX({ sales = [], team = [], sedes = [], generadoPor = '' }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Connexo Sellers';
  wb.created = new Date();
  const base64 = await cargarLogo().catch(() => null);

  const mesActual = monthKey(new Date());
  const ventasMes = sales.filter((s) => s.created_at && monthKey(s.created_at) === mesActual);
  const esPago = (s) => desglosarPlan(s.plan_type).pago;
  const esAnual = (s) => (s.plan_type || '').toUpperCase().includes('ANUAL');
  const esMensual = (s) => (s.plan_type || '').toUpperCase().includes('MENSUAL');

  const fechaGen = new Date().toLocaleString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const subtitulo = `Consolidado multisede  ·  ${generadoPor ? 'Generado por ' + generadoPor + '  ·  ' : ''}${fechaGen}`;

  // Mapa de hijos por distribuidor (para la facturación de red).
  const hijosPorPadre = new Map();
  team.forEach((m) => {
    if (m.parent_id) {
      if (!hijosPorPadre.has(m.parent_id)) hijosPorPadre.set(m.parent_id, []);
      hijosPorPadre.get(m.parent_id).push(m.id);
    }
  });

  // ════════ HOJA 1 · RESUMEN EJECUTIVO ════════
  {
    const ws = wb.addWorksheet('Resumen Ejecutivo', { views: [{ state: 'frozen', ySplit: 6 }] });
    const anchos = [34, 20, 20, 20];
    anchos.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    pintarBanner(ws, wb, base64, 4, 'CONNEXO · Reporte Global', subtitulo);

    const vendedores = team.filter((m) => m.role === 'SELLER');
    const distribuidores = team.filter((m) => m.role === 'DISTRIBUTOR');
    const certificados = team.filter((m) => (m.role === 'SELLER' || m.role === 'DISTRIBUTOR') && m.is_certified);
    const clientesUnicos = new Set(
      sales.map((s) => (s.customer_email || s.customer_phone || s.customer_name || '').trim().toLowerCase()).filter(Boolean)
    );
    const sedesActivas = new Set(sales.map((s) => s.sede_id).filter(Boolean));

    const kpi = (label, mes, hist, fmt) => ({ label, mes, hist, fmt });
    const filas = [
      kpi('Transacciones', ventasMes.length, sales.length, 'int'),
      kpi('Planes de pago (excl. prueba)', ventasMes.filter(esPago).length, sales.filter(esPago).length, 'int'),
      kpi('Pruebas CONNECTA', ventasMes.filter((s) => !esPago(s)).length, sales.filter((s) => !esPago(s)).length, 'int'),
      kpi('Suscripciones anuales', ventasMes.filter(esAnual).length, sales.filter(esAnual).length, 'int'),
      kpi('Suscripciones mensuales', ventasMes.filter(esMensual).length, sales.filter(esMensual).length, 'int'),
      kpi('Facturación', sum(ventasMes, (s) => s.amount), sum(sales, (s) => s.amount), 'money'),
      kpi('Comisiones pagadas', sum(ventasMes, (s) => s.commission_earned), sum(sales, (s) => s.commission_earned), 'money'),
      kpi('Margen neto (fact. − comis.)', sum(ventasMes, (s) => s.amount) - sum(ventasMes, (s) => s.commission_earned), sum(sales, (s) => s.amount) - sum(sales, (s) => s.commission_earned), 'money'),
      kpi('Ticket promedio', ventasMes.length ? sum(ventasMes, (s) => s.amount) / ventasMes.length : 0, sales.length ? sum(sales, (s) => s.amount) / sales.length : 0, 'money'),
    ];

    cabecera(ws, 6, ['Indicador', 'Mes en curso', 'Histórico', '']);
    let idx = 0;
    filas.forEach((k) => {
      const row = ws.addRow([k.label, k.mes, k.hist, '']);
      row.getCell(1).font = { name: 'Arial', size: 9, bold: true, color: { argb: TEXTO } };
      [2, 3].forEach((c) => {
        row.getCell(c).alignment = { horizontal: 'right', vertical: 'middle' };
        if (k.fmt === 'money') row.getCell(c).numFmt = MONEDA;
      });
      estiloFila(row, idx++, 4);
    });

    // Bloque de conteos del ecosistema.
    ws.addRow([]);
    const th = ws.addRow(['Ecosistema', '', '', '']);
    th.getCell(1).font = { name: 'Arial', size: 11, bold: true, color: { argb: NARANJA } };
    ws.addRow([]);
    const conteos = [
      ['Sedes activas (con ventas)', sedesActivas.size],
      ['Sedes registradas', sedes.length],
      ['Vendedores', vendedores.length],
      ['Distribuidores', distribuidores.length],
      ['Certificados (equipo)', certificados.length],
      ['Clientes únicos', clientesUnicos.size],
    ];
    idx = 0;
    conteos.forEach(([l, v]) => {
      const row = ws.addRow([l, v, '', '']);
      row.getCell(1).font = { name: 'Arial', size: 9, bold: true, color: { argb: TEXTO } };
      row.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
      estiloFila(row, idx++, 4);
    });
  }

  // ════════ HOJA 2 · POR SEDE ════════
  {
    const ws = wb.addWorksheet('Por Sede', { views: [{ state: 'frozen', ySplit: 6 }] });
    const cols = [22, 14, 12, 14, 14, 16, 16, 16, 14];
    cols.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    pintarBanner(ws, wb, base64, cols.length, 'CONNEXO · Reporte Global', 'Desglose por sede');
    cabecera(ws, 6, ['Sede', 'País', 'Vendedores', 'Distribuidores', 'Transac. (mes)', 'Transac. (hist)', 'Facturación (hist)', 'Comisiones (hist)', 'Ticket prom.']);

    const listaSedes = sedes.length ? sedes.map((s) => ({ id: s.id, nombre: s.nombre_sede || etiquetaSede(s.id, sedes), pais: s.pais || '—' }))
      : [...new Set(sales.map((s) => s.sede_id))].map((id) => ({ id, nombre: etiquetaSede(id, sedes), pais: '—' }));

    let idx = 0;
    listaSedes.forEach((sede) => {
      const vSede = sales.filter((s) => s.sede_id === sede.id);
      const vSedeMes = ventasMes.filter((s) => s.sede_id === sede.id);
      const fact = sum(vSede, (s) => s.amount);
      const vends = team.filter((m) => m.role === 'SELLER' && m.sede_asignada === sede.id).length;
      const dists = team.filter((m) => m.role === 'DISTRIBUTOR' && m.sede_asignada === sede.id).length;
      const row = ws.addRow([sede.nombre, sede.pais, vends, dists, vSedeMes.length, vSede.length, fact, sum(vSede, (s) => s.commission_earned), vSede.length ? fact / vSede.length : 0]);
      [7, 8, 9].forEach((c) => (row.getCell(c).numFmt = MONEDA));
      [3, 4, 5, 6].forEach((c) => (row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' }));
      estiloFila(row, idx++, cols.length);
    });
    const factTot = sum(sales, (s) => s.amount);
    filaTotales(ws, ['TOTAL', 'Global', team.filter((m) => m.role === 'SELLER').length, team.filter((m) => m.role === 'DISTRIBUTOR').length, ventasMes.length, sales.length, factTot, sum(sales, (s) => s.commission_earned), sales.length ? factTot / sales.length : 0])
      .eachCell((c, n) => { if (n >= 7) c.numFmt = MONEDA; });
    ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: cols.length } };
  }

  // ════════ HOJA 3 · POR PLAN Y FRECUENCIA ════════
  {
    const ws = wb.addWorksheet('Por Plan', { views: [{ state: 'frozen', ySplit: 6 }] });
    const cols = [16, 16, 16, 18, 18, 14];
    cols.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    pintarBanner(ws, wb, base64, cols.length, 'CONNEXO · Reporte Global', 'Desglose por plan y frecuencia');
    cabecera(ws, 6, ['Plan', 'Frecuencia', 'Transacciones', 'Facturación', 'Comisiones', '% Facturación']);

    const grupos = new Map();
    sales.forEach((s) => {
      const { plan, frecuencia } = desglosarPlan(s.plan_type);
      const key = `${plan}||${frecuencia}`;
      if (!grupos.has(key)) grupos.set(key, { plan, frecuencia, n: 0, fact: 0, com: 0 });
      const g = grupos.get(key);
      g.n++; g.fact += Number(s.amount || 0); g.com += Number(s.commission_earned || 0);
    });
    const factTot = sum(sales, (s) => s.amount) || 1;
    const orden = [...grupos.values()].sort((a, b) => b.fact - a.fact);
    let idx = 0;
    orden.forEach((g) => {
      const row = ws.addRow([g.plan, g.frecuencia, g.n, g.fact, g.com, g.fact / factTot]);
      row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(4).numFmt = MONEDA; row.getCell(5).numFmt = MONEDA;
      row.getCell(6).numFmt = '0.0%';
      estiloFila(row, idx++, cols.length);
    });
    filaTotales(ws, ['TOTAL', '', sales.length, sum(sales, (s) => s.amount), sum(sales, (s) => s.commission_earned), 1])
      .eachCell((c, n) => { if (n === 4 || n === 5) c.numFmt = MONEDA; if (n === 6) c.numFmt = '0.0%'; });
    ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: cols.length } };
  }

  // ════════ HOJA 4 · RANKING DE EQUIPO ════════
  {
    const ws = wb.addWorksheet('Ranking Equipo', { views: [{ state: 'frozen', ySplit: 6 }] });
    const cols = [5, 24, 14, 16, 14, 10, 13, 13, 18, 18, 18, 16];
    cols.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    pintarBanner(ws, wb, base64, cols.length, 'CONNEXO · Reporte Global', 'Ranking de equipo (por facturación directa)');
    cabecera(ws, 6, ['#', 'Vendedor', 'Rol', 'Rango', 'Sede', 'Cert.', 'Planes (mes)', 'Planes (hist)', 'Facturación directa', 'Comisiones ganadas', 'Facturación red', 'Billetera']);

    const ventasPorVendedor = new Map();
    sales.forEach((s) => {
      if (!ventasPorVendedor.has(s.seller_id)) ventasPorVendedor.set(s.seller_id, []);
      ventasPorVendedor.get(s.seller_id).push(s);
    });

    const miembros = team
      .filter((m) => m.role === 'SELLER' || m.role === 'DISTRIBUTOR')
      .map((m) => {
        const propias = ventasPorVendedor.get(m.id) || [];
        const propiasMes = propias.filter((s) => s.created_at && monthKey(s.created_at) === mesActual);
        // Facturación de red: él + sus hijos (para distribuidores).
        const idsRed = [m.id, ...(hijosPorPadre.get(m.id) || [])];
        const factRed = idsRed.reduce((a, id) => a + sum(ventasPorVendedor.get(id) || [], (s) => s.amount), 0);
        return {
          nombre: m.full_name || m.email || '—',
          rol: rolLabel(m.role),
          rango: m.tier || 'AUTO',
          sede: etiquetaSede(m.sede_asignada, sedes),
          cert: m.is_certified ? 'Sí' : 'No',
          planesMes: propiasMes.length,
          planesHist: propias.length,
          factDirecta: sum(propias, (s) => s.amount),
          comision: sum(propias, (s) => s.commission_earned),
          factRed,
          wallet: Number(m.wallet_balance || 0),
        };
      })
      .sort((a, b) => b.factDirecta - a.factDirecta);

    let idx = 0;
    miembros.forEach((m, i) => {
      const row = ws.addRow([i + 1, m.nombre, m.rol, m.rango, m.sede, m.cert, m.planesMes, m.planesHist, m.factDirecta, m.comision, m.factRed, m.wallet]);
      [1, 6, 7, 8].forEach((c) => (row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' }));
      [9, 10, 11, 12].forEach((c) => (row.getCell(c).numFmt = MONEDA));
      if (m.cert === 'No') row.getCell(6).font = { name: 'Arial', size: 9, color: { argb: NARANJA_OSCURO }, bold: true };
      estiloFila(row, idx++, cols.length);
    });
    filaTotales(ws, ['', 'TOTAL', '', '', '', '', sum(miembros, (m) => m.planesMes), sum(miembros, (m) => m.planesHist), sum(miembros, (m) => m.factDirecta), sum(miembros, (m) => m.comision), '', sum(miembros, (m) => m.wallet)])
      .eachCell((c, n) => { if ([9, 10, 12].includes(n)) c.numFmt = MONEDA; });
    ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: cols.length } };
  }

  // ════════ HOJA 5 · TENDENCIA MENSUAL ════════
  {
    const ws = wb.addWorksheet('Tendencia Mensual', { views: [{ state: 'frozen', ySplit: 6 }] });
    const cols = [20, 16, 16, 18, 18, 14];
    cols.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    pintarBanner(ws, wb, base64, cols.length, 'CONNEXO · Reporte Global', 'Tendencia mensual');
    cabecera(ws, 6, ['Mes', 'Transacciones', 'Planes de pago', 'Facturación', 'Comisiones', 'Ticket prom.']);

    const meses = [...new Set(sales.map((s) => s.created_at && monthKey(s.created_at)).filter(Boolean))].sort();
    let idx = 0;
    meses.forEach((mk) => {
      const v = sales.filter((s) => s.created_at && monthKey(s.created_at) === mk);
      const fact = sum(v, (s) => s.amount);
      const row = ws.addRow([monthLabel(mk) + (mk === mesActual ? ' (en curso)' : ''), v.length, v.filter(esPago).length, fact, sum(v, (s) => s.commission_earned), v.length ? fact / v.length : 0]);
      [2, 3].forEach((c) => (row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' }));
      [4, 5, 6].forEach((c) => (row.getCell(c).numFmt = MONEDA));
      estiloFila(row, idx++, cols.length);
    });
    const factTot = sum(sales, (s) => s.amount);
    filaTotales(ws, ['TOTAL', sales.length, sales.filter(esPago).length, factTot, sum(sales, (s) => s.commission_earned), sales.length ? factTot / sales.length : 0])
      .eachCell((c, n) => { if (n >= 4) c.numFmt = MONEDA; });
  }

  // ════════ HOJA 6 · PERFILES DE CLIENTE ════════
  {
    const ws = wb.addWorksheet('Perfiles Cliente', { views: [{ state: 'frozen', ySplit: 6 }] });
    const cols = [24, 16, 18, 14];
    cols.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    pintarBanner(ws, wb, base64, cols.length, 'CONNEXO · Reporte Global', 'Distribución por tipo de perfil de cliente');
    cabecera(ws, 6, ['Tipo de Perfil', 'Transacciones', 'Facturación', '% Transac.']);

    const grupos = new Map();
    sales.forEach((s) => {
      const label = getProfileLabel(s.profile_type) || 'Estándar';
      if (!grupos.has(label)) grupos.set(label, { n: 0, fact: 0 });
      const g = grupos.get(label);
      g.n++; g.fact += Number(s.amount || 0);
    });
    const total = sales.length || 1;
    let idx = 0;
    [...grupos.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([label, g]) => {
      const row = ws.addRow([label, g.n, g.fact, g.n / total]);
      row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(3).numFmt = MONEDA;
      row.getCell(4).numFmt = '0.0%';
      estiloFila(row, idx++, cols.length);
    });
    filaTotales(ws, ['TOTAL', sales.length, sum(sales, (s) => s.amount), 1])
      .eachCell((c, n) => { if (n === 3) c.numFmt = MONEDA; if (n === 4) c.numFmt = '0.0%'; });
  }

  // ── Descargar ──────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reporte_global_connexo_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

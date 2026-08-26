// Exportador de la "Base de Clientes" a Excel (.xlsx) con el logo de Connexo.
//
// Reemplaza al PDF anterior: un solo libro, una hoja bien organizada con
// banner + logo, cabecera con la identidad de la marca (naranja Connexo),
// autofiltro, panel congelado y TODOS los datos que se capturan al activar un
// plan (no solo cliente/teléfono/email/vendedor/fecha).
import ExcelJS from 'exceljs';
import logoUrl from '../assets/CONNEXO LOGO.png?url';
import { getProfileLabel } from '../constants/customerProfiles';

const NARANJA = 'FFF97316';      // var(--accent)
const NARANJA_OSCURO = 'FFB4470E';
const GRIS_FILA = 'FFF7F2ED';    // franja alterna cálida
const GRIS_BORDE = 'FFE2D9CF';
const TEXTO = 'FF1B1B1B';

// Descarga el logo una sola vez y lo devuelve como base64 para incrustarlo.
async function cargarLogo() {
  const resp = await fetch(logoUrl);
  const blob = await resp.blob();
  const buf = await blob.arrayBuffer();
  let binario = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
  return btoa(binario);
}

// sede-ec-1 → "Ecuador", etc. Usa las sedes reales si están cargadas.
function etiquetaSede(sedeId, sedes = []) {
  if (!sedeId) return '—';
  const s = sedes.find((x) => x.id === sedeId);
  if (s) return s.nombre_sede || s.pais || sedeId;
  if (sedeId === 'sede-ec-1') return 'Ecuador';
  if (sedeId === 'sede-ve-1') return 'Venezuela';
  return sedeId;
}

// De "PRO ANUAL" / "CONNECTA 7 DIAS" saca el plan limpio y la frecuencia.
function desglosarPlan(planType = '') {
  const p = planType.toUpperCase();
  if (p.includes('CONNECTA') || p.includes('7 DIAS')) {
    return { plan: 'CONNECTA', frecuencia: 'Prueba 7 días' };
  }
  const plan = p.replace(/\s*(MENSUAL|ANUAL)\s*/g, '').trim() || '—';
  const frecuencia = p.includes('MENSUAL') ? 'Mensual' : p.includes('ANUAL') ? 'Anual' : '—';
  return { plan, frecuencia };
}

const COLUMNAS = [
  { header: 'Fecha', key: 'fecha', width: 12 },
  { header: 'Cliente', key: 'cliente', width: 26 },
  { header: 'Empresa / Negocio', key: 'empresa', width: 24 },
  { header: 'Tipo de Perfil', key: 'perfil', width: 20 },
  { header: 'Teléfono / WhatsApp', key: 'telefono', width: 20 },
  { header: 'Email', key: 'email', width: 28 },
  { header: 'Plan', key: 'plan', width: 12 },
  { header: 'Frecuencia', key: 'frecuencia', width: 14 },
  { header: 'Precio', key: 'precio', width: 12 },
  { header: 'Comisión', key: 'comision', width: 12 },
  { header: 'Estado', key: 'estado', width: 13 },
  { header: 'Vendedor', key: 'vendedor', width: 22 },
  { header: 'Sede', key: 'sede', width: 14 },
  { header: 'Notas', key: 'notas', width: 40 },
];

/**
 * Genera y descarga la base de clientes en Excel.
 * @param {Object} opts
 * @param {Array}  opts.sales  ventas a exportar (ya filtradas por el contexto).
 * @param {Array}  opts.team   perfiles para resolver el nombre del vendedor.
 * @param {Array}  opts.sedes  sedes para resolver el nombre de la sede.
 * @param {string} opts.scope  texto del alcance (p. ej. "Red Completa").
 */
export async function exportClientesXLSX({ sales = [], team = [], sedes = [], scope = '' }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Connexo Sellers';
  wb.created = new Date();

  const ws = wb.addWorksheet('Base de Clientes', {
    views: [{ state: 'frozen', ySplit: 6, xSplit: 0 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = COLUMNAS.map((c) => ({ key: c.key, width: c.width }));
  const totalCols = COLUMNAS.length;
  const ultimaCol = ws.getColumn(totalCols).letter;

  // --- Banner de marca (filas 1-4) --------------------------------------
  // No se puede fusionar A1:N4 y luego fusionar C1:J2 dentro (ExcelJS rechaza
  // fusionar celdas ya fusionadas). Se pinta el fondo oscuro celda por celda y
  // solo se fusionan las sub-regiones del título y el subtítulo.
  for (let r = 1; r <= 4; r++) {
    for (let c = 1; c <= totalCols; c++) {
      ws.getRow(r).getCell(c).fill = {
        type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111318' },
      };
    }
  }
  ws.getRow(1).height = 26;
  ws.getRow(2).height = 26;
  ws.getRow(3).height = 20;
  ws.getRow(4).height = 14;

  // Logo incrustado, arriba a la izquierda sobre el banner oscuro.
  try {
    const base64 = await cargarLogo();
    const imgId = wb.addImage({ base64, extension: 'png' });
    // 543x301 → ~150x83 px
    ws.addImage(imgId, { tl: { col: 0.25, row: 0.35 }, ext: { width: 150, height: 83 } });
  } catch (e) {
    console.warn('No se pudo incrustar el logo en el Excel:', e);
  }

  // Título y subtítulo (desplazados a la derecha del logo).
  ws.mergeCells('C1:J2');
  const titulo = ws.getCell('C1');
  titulo.value = 'CONNEXO · Base de Clientes';
  titulo.font = { name: 'Arial', size: 20, bold: true, color: { argb: 'FFFFFFFF' } };
  titulo.alignment = { vertical: 'middle', horizontal: 'left' };

  ws.mergeCells('C3:J3');
  const sub = ws.getCell('C3');
  const fechaGen = new Date().toLocaleString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  sub.value = `${scope ? scope + '  ·  ' : ''}Generado el ${fechaGen}  ·  ${sales.length} registro${sales.length === 1 ? '' : 's'}`;
  sub.font = { name: 'Arial', size: 10, color: { argb: 'FFB9BEC7' } };
  sub.alignment = { vertical: 'middle', horizontal: 'left' };

  // Fila 5 vacía como respiro. Fila 6 = cabecera de la tabla.
  ws.getRow(5).height = 6;

  const headerRow = ws.getRow(6);
  COLUMNAS.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
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
  headerRow.height = 26;

  // --- Filas de datos ----------------------------------------------------
  // Orden: por plan (agrupa visualmente) y dentro de cada plan por fecha desc.
  const ordenadas = [...sales].sort((a, b) => {
    const pa = (a.plan_type || '').localeCompare(b.plan_type || '');
    if (pa !== 0) return pa;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  ordenadas.forEach((s, idx) => {
    const vendedor = team.find((m) => m.id === s.seller_id)?.full_name || 'Desconocido';
    const { plan, frecuencia } = desglosarPlan(s.plan_type);
    const fila = ws.addRow({
      fecha: s.created_at ? new Date(s.created_at) : null,
      cliente: s.customer_name || '—',
      empresa: s.customer_company || '—',
      perfil: getProfileLabel(s.profile_type) || 'Estándar',
      telefono: s.customer_phone || '—',
      email: s.customer_email || '—',
      plan,
      frecuencia,
      precio: Number(s.amount || 0),
      comision: Number(s.commission_earned || 0),
      estado: s.status || 'COMPLETED',
      vendedor,
      sede: etiquetaSede(s.sede_id, sedes),
      notas: s.customer_notes || '',
    });

    const parImpar = idx % 2 === 0;
    fila.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { name: 'Arial', size: 9, color: { argb: TEXTO } };
      cell.alignment = { vertical: 'middle', wrapText: colNumber === totalCols };
      if (parImpar) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS_FILA } };
      }
      cell.border = {
        bottom: { style: 'hair', color: { argb: GRIS_BORDE } },
        right: { style: 'hair', color: { argb: GRIS_BORDE } },
      };
    });

    fila.getCell('fecha').numFmt = 'dd/mm/yyyy';
    fila.getCell('fecha').alignment = { vertical: 'middle', horizontal: 'center' };
    fila.getCell('precio').numFmt = '"$"#,##0.00';
    fila.getCell('comision').numFmt = '"$"#,##0.00';
    fila.getCell('plan').alignment = { vertical: 'middle', horizontal: 'center' };
    fila.getCell('frecuencia').alignment = { vertical: 'middle', horizontal: 'center' };
    fila.height = 18;
  });

  // --- Fila de totales ---------------------------------------------------
  if (ordenadas.length > 0) {
    const totalPrecio = ordenadas.reduce((a, s) => a + Number(s.amount || 0), 0);
    const totalComision = ordenadas.reduce((a, s) => a + Number(s.commission_earned || 0), 0);
    const totalRow = ws.addRow({
      email: 'TOTALES',
      precio: totalPrecio,
      comision: totalComision,
    });
    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NARANJA_OSCURO } };
    });
    totalRow.getCell('email').alignment = { horizontal: 'right', vertical: 'middle' };
    totalRow.getCell('precio').numFmt = '"$"#,##0.00';
    totalRow.getCell('comision').numFmt = '"$"#,##0.00';
    totalRow.getCell('precio').alignment = { horizontal: 'right', vertical: 'middle' };
    totalRow.getCell('comision').alignment = { horizontal: 'right', vertical: 'middle' };
    totalRow.height = 22;
  }

  // Autofiltro sobre la cabecera + toda la tabla.
  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: totalCols } };

  // --- Descargar ---------------------------------------------------------
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const hoy = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `base_clientes_connexo_${hoy}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Genera DOCUMENTACION_TECNICA.pdf a partir de DOCUMENTACION_TECNICA.md
// Uso:  node scripts/generate-doc-pdf.mjs
// Requiere: pdfkit (ya está en dependencies)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MD_PATH = path.join(ROOT, 'DOCUMENTACION_TECNICA.md');
const PDF_PATH = path.join(ROOT, 'DOCUMENTACION_TECNICA.pdf');

// Paleta de marca Connexo
const ACCENT = '#FF6600';
const DARK = '#1a1a1a';
const GRAY = '#555555';
const LINE = '#dddddd';
const HEADER_BG = '#FFF0E6';

const md = fs.readFileSync(MD_PATH, 'utf8');
const lines = md.split(/\r?\n/);

const doc = new PDFDocument({ size: 'A4', margins: { top: 60, bottom: 60, left: 60, right: 60 } });
doc.pipe(fs.createWriteStream(PDF_PATH));

const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

// ---- helpers ----------------------------------------------------------------
function ensureSpace(h) {
  if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

// Renderiza texto con **negritas** dentro de un Paragraph simple
function richText(text, opts = {}) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  parts.forEach((part, i) => {
    const bold = part.startsWith('**') && part.endsWith('**');
    const clean = bold ? part.slice(2, -2) : part;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
       .fillColor(opts.color || DARK)
       .fontSize(opts.size || 10.5)
       .text(clean, { continued: i < parts.length - 1, lineGap: 3, align: opts.align || 'left' });
  });
}

function drawTable(headers, rows) {
  const colCount = headers.length;
  const colW = pageWidth / colCount;
  const padX = 6, padY = 5;
  const fs1 = 9;

  const rowHeight = (cells, font) => {
    doc.font(font).fontSize(fs1);
    let max = 0;
    cells.forEach(c => {
      const h = doc.heightOfString(String(c), { width: colW - padX * 2 });
      if (h > max) max = h;
    });
    return max + padY * 2;
  };

  // header
  let hH = rowHeight(headers, 'Helvetica-Bold');
  ensureSpace(hH + 4);
  let x = doc.page.margins.left;
  let y = doc.y;
  doc.rect(x, y, pageWidth, hH).fill(HEADER_BG);
  headers.forEach((h, i) => {
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(fs1)
       .text(String(h), x + i * colW + padX, y + padY, { width: colW - padX * 2 });
  });
  y += hH;

  // body
  rows.forEach(row => {
    const rH = rowHeight(row, 'Helvetica');
    if (y + rH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.y;
    }
    doc.rect(x, y, pageWidth, rH).strokeColor(LINE).lineWidth(0.5).stroke();
    row.forEach((c, i) => {
      doc.fillColor(DARK).font('Helvetica').fontSize(fs1)
         .text(String(c), x + i * colW + padX, y + padY, { width: colW - padX * 2 });
    });
    y += rH;
  });
  doc.y = y + 10;
  doc.x = doc.page.margins.left;
}

// ---- portada ----------------------------------------------------------------
doc.rect(0, 0, doc.page.width, 160).fill(DARK);
doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(30)
   .text('CONNEXO SELLERS', 60, 55);
doc.fillColor('#ffffff').font('Helvetica').fontSize(14)
   .text('Documentación Técnica', 60, 95);
doc.fillColor('#aaaaaa').fontSize(9)
   .text('Generado automáticamente desde DOCUMENTACION_TECNICA.md', 60, 120);
doc.y = 200;
doc.x = doc.page.margins.left;

// ---- parser de markdown -----------------------------------------------------
let i = 0;
let pendingBullets = [];

function flushBullets() {
  if (pendingBullets.length === 0) return;
  pendingBullets.forEach(b => {
    ensureSpace(20);
    const startX = doc.page.margins.left;
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(10.5)
       .text('•', startX, doc.y, { continued: false });
    doc.moveUp();
    doc.x = startX + 14;
    richText(b);
    doc.x = startX;
    doc.moveDown(0.2);
  });
  pendingBullets = [];
  doc.moveDown(0.3);
}

while (i < lines.length) {
  let line = lines[i];
  const trimmed = line.trim();

  // tablas
  if (trimmed.startsWith('|') && i + 1 < lines.length && /^\s*\|[-:\s|]+\|\s*$/.test(lines[i + 1])) {
    flushBullets();
    const parseRow = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const headers = parseRow(trimmed);
    i += 2; // saltar separador
    const rows = [];
    while (i < lines.length && lines[i].trim().startsWith('|')) {
      rows.push(parseRow(lines[i]));
      i++;
    }
    drawTable(headers, rows);
    continue;
  }

  if (trimmed === '---' || trimmed === '') {
    flushBullets();
    if (trimmed === '') doc.moveDown(0.35);
    i++;
    continue;
  }

  if (trimmed.startsWith('### ')) {
    flushBullets();
    ensureSpace(30);
    doc.moveDown(0.4);
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(12).text(trimmed.slice(4));
    doc.moveDown(0.2);
  } else if (trimmed.startsWith('## ')) {
    flushBullets();
    ensureSpace(40);
    doc.moveDown(0.6);
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(15).text(trimmed.slice(3));
    const ly = doc.y + 2;
    doc.moveTo(doc.page.margins.left, ly).lineTo(doc.page.margins.left + pageWidth, ly)
       .strokeColor(ACCENT).lineWidth(1).stroke();
    doc.moveDown(0.5);
  } else if (trimmed.startsWith('# ')) {
    flushBullets();
    ensureSpace(40);
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(20).text(trimmed.slice(2));
    doc.moveDown(0.4);
  } else if (trimmed.startsWith('- ')) {
    pendingBullets.push(trimmed.slice(2));
  } else {
    flushBullets();
    ensureSpace(20);
    richText(trimmed, { color: GRAY });
    doc.moveDown(0.25);
  }
  i++;
}
flushBullets();

// ---- pie de página numerado -------------------------------------------------
const range = doc.bufferedPageRange ? null : null; // pdfkit numera al final si se habilita buffering
doc.end();
console.log('PDF generado en:', PDF_PATH);

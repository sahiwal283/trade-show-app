/**
 * Report Export Service — business-grade exports of the Trade Show
 * Investment picture: a charted PDF (pie, bars, YoY table) via pdfkit
 * vector drawing, and a formatted multi-sheet Excel workbook via exceljs.
 */

import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

export interface SummaryRow {
  show_name: string;
  show_key: string;
  year: number;
  company: string;
  category: string;
  amount: number;
  source: string;
}

const COMPANY_COLORS: Record<string, string> = {
  'Nirvana Kulture': '#2a78d6',
  'Boomin Brands': '#eb6834',
  'Haute Brands': '#1baf7a',
  'Summitt Labs': '#eda100',
  Unassigned: '#898781',
};
const FALLBACK_COLORS = ['#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const INK = '#1c1917';
const MUTED = '#78716c';
const HAIR = '#e7e5e4';

const fmt = (n: number) =>
  '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmt2 = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function companyColor(name: string, i: number): string {
  return COMPANY_COLORS[name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
}

function sumBy<T>(rows: T[], key: (r: T) => string, val: (r: T) => number): Array<[string, number]> {
  const m: Record<string, number> = {};
  rows.forEach((r) => (m[key(r)] = (m[key(r)] || 0) + val(r)));
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

function pieSlicePath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}

export function generateInvestmentReportPDF(rows: SummaryRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 48, bottom: 48, left: 48, right: 48 } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 96;
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const years = Array.from(new Set(rows.map((r) => r.year))).sort();
    const appearances = new Set(rows.map((r) => `${r.show_key}:${r.year}`)).size;
    const byCompany = sumBy(rows, (r) => r.company, (r) => r.amount);
    const byCategory = sumBy(rows, (r) => r.category, (r) => r.amount);

    // ===== Masthead =====
    doc.rect(0, 0, doc.page.width, 96).fill('#1d4ed8');
    doc.rect(0, 92, doc.page.width, 4).fill('#0d9488');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text('Trade Show Investment Report', 48, 30);
    doc.font('Helvetica').fontSize(9).fillOpacity(0.85)
      .text(`Years ${years.join(' · ')}   |   Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}   |   ExpenseApp 2.0`, 48, 60)
      .fillOpacity(1);

    // ===== KPI band =====
    let y = 116;
    const kpis: Array<[string, string]> = [
      ['TOTAL INVESTED', fmt(total)],
      ['SHOW APPEARANCES', String(appearances)],
      ['AVERAGE PER SHOW', fmt(appearances ? total / appearances : 0)],
      ['TOP COST CENTER', `${(byCategory[0]?.[0] || '—').split(' - ')[0].split(' / ')[0]} ${fmt(byCategory[0]?.[1] || 0)}`],
    ];
    const kw = (W - 3 * 10) / 4;
    kpis.forEach(([label, value], i) => {
      const x = 48 + i * (kw + 10);
      doc.roundedRect(x, y, kw, 52, 6).lineWidth(0.8).stroke(HAIR);
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(6.5).text(label, x + 10, y + 10, { width: kw - 20 });
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(value, x + 10, y + 24, { width: kw - 20 });
    });

    // ===== Pie: spend by company =====
    y += 78;
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('SPEND BY COMPANY', 48, y);
    const cx = 128, cy = y + 92, r = 62;
    let angle = -Math.PI / 2;
    byCompany.forEach(([name, amt], i) => {
      const a1 = angle + (amt / total) * Math.PI * 2;
      doc.path(pieSlicePath(cx, cy, r, angle, Math.min(a1, angle + Math.PI * 2 - 0.0001)))
        .fill(companyColor(name, i));
      angle = a1;
    });
    doc.circle(cx, cy, 30).fill('#ffffff');
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(fmt(total), cx - 30, cy - 6, { width: 60, align: 'center' });
    // Legend
    let ly = y + 28;
    byCompany.forEach(([name, amt], i) => {
      doc.rect(238, ly, 8, 8).fill(companyColor(name, i));
      doc.fillColor(INK).font('Helvetica').fontSize(9).text(name, 252, ly - 1, { width: 130 });
      doc.font('Helvetica-Bold').text(fmt2(amt), 384, ly - 1, { width: 90, align: 'right' });
      doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(`${((amt / total) * 100).toFixed(1)}%`, 480, ly, { width: 40, align: 'right' });
      ly += 17;
    });

    // ===== Bars: top categories =====
    y = Math.max(cy + r + 24, ly + 16);
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('SPEND BY CATEGORY', 48, y);
    y += 16;
    const maxCat = byCategory[0]?.[1] || 1;
    byCategory.slice(0, 7).forEach(([name, amt]) => {
      doc.fillColor(INK).font('Helvetica').fontSize(8.5).text(name, 48, y, { width: 190 });
      const bw = (W - 260) * (amt / maxCat);
      doc.roundedRect(244, y - 1, Math.max(bw, 3), 9, 2).fill('#2a78d6');
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(8.5).text(fmt(amt), 244 + Math.max(bw, 3) + 6, y - 0.5);
      y += 17;
    });

    // ===== YoY table =====
    doc.addPage();
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text('Show-by-Show Comparison', 48, 48);
    let ty = 78;
    const cols = [48, 250, 340, 430, 505];
    const [y1, y2] = years.length >= 2 ? [years[years.length - 2], years[years.length - 1]] : [years[0], years[0]];
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7.5);
    ['SHOW', String(y1), years.length >= 2 ? String(y2) : '', years.length >= 2 ? 'CHANGE $' : '', years.length >= 2 ? 'CHANGE %' : ''].forEach((h, i) =>
      doc.text(h, cols[i], ty, { width: (cols[i + 1] || 564) - cols[i] - 8, align: i === 0 ? 'left' : 'right' })
    );
    ty += 14;
    doc.moveTo(48, ty).lineTo(564, ty).lineWidth(0.8).stroke(HAIR);
    ty += 6;

    const byShow: Record<string, { name: string; perYear: Record<number, number> }> = {};
    rows.forEach((r) => {
      byShow[r.show_key] = byShow[r.show_key] || { name: '', perYear: {} };
      byShow[r.show_key].perYear[r.year] = (byShow[r.show_key].perYear[r.year] || 0) + r.amount;
      if (r.year === Math.max(...Object.keys(byShow[r.show_key].perYear).map(Number)))
        byShow[r.show_key].name = r.show_name.replace(/[-\s]*20\d\d([-\s]*20\d\d)?/g, '').trim();
    });
    const keys = Object.keys(byShow).sort((a, b) => Math.max(...Object.values(byShow[b].perYear)) - Math.max(...Object.values(byShow[a].perYear)));
    keys.forEach((k) => {
      const s = byShow[k];
      const a = s.perYear[y1] || 0;
      const b = s.perYear[y2] || 0;
      const d = b - a;
      const pct = a > 0 && b > 0 ? (d / a) * 100 : null;
      doc.fillColor(INK).font('Helvetica').fontSize(9).text(s.name, cols[0], ty, { width: 195 });
      doc.font('Helvetica').text(a ? fmt2(a) : '—', cols[1], ty, { width: 82, align: 'right' });
      if (years.length >= 2) {
        doc.text(b ? fmt2(b) : '—', cols[2], ty, { width: 82, align: 'right' });
        doc.fillColor(d > 0 && a > 0 && b > 0 ? '#b91c1c' : d < 0 ? '#047857' : MUTED)
          .text(a > 0 && b > 0 ? fmt2(d) : '—', cols[3], ty, { width: 67, align: 'right' });
        doc.fillColor(MUTED).text(pct !== null ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : '—', cols[4], ty, { width: 55, align: 'right' });
      }
      ty += 16;
      if (ty > doc.page.height - 72) { doc.addPage(); ty = 48; }
    });
    ty += 4;
    doc.moveTo(48, ty).lineTo(564, ty).lineWidth(1).stroke(INK);
    ty += 6;
    const t1 = keys.reduce((s, k) => s + (byShow[k].perYear[y1] || 0), 0);
    const t2 = keys.reduce((s, k) => s + (byShow[k].perYear[y2] || 0), 0);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text('Total', cols[0], ty);
    doc.text(fmt2(t1), cols[1], ty, { width: 82, align: 'right' });
    if (years.length >= 2) doc.text(fmt2(t2), cols[2], ty, { width: 82, align: 'right' });

    doc.fillColor(MUTED).font('Helvetica').fontSize(7)
      .text('Imported 2025 totals reconciled to the accounting workbook. Live-year figures computed from submitted expenses (rejected excluded).', 48, doc.page.height - 60, { width: W });

    doc.end();
  });
}

export async function generateInvestmentWorkbook(rows: SummaryRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const money = '"$"#,##0.00;[Red]("$"#,##0.00);"-"';
  const head = (ws: ExcelJS.Worksheet, cells: string[]) => {
    const r = ws.addRow(cells);
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }; });
  };

  const years = Array.from(new Set(rows.map((r) => r.year))).sort();
  const total = rows.reduce((s, r) => s + r.amount, 0);

  // Sheet 1 — Summary
  const s1 = wb.addWorksheet('Summary');
  s1.columns = [{ width: 34 }, { width: 20 }];
  s1.addRow(['Trade Show Investment Report']).font = { bold: true, size: 16 };
  s1.addRow([`Years: ${years.join(', ')} — generated ${new Date().toLocaleDateString('en-US')}`]).font = { color: { argb: 'FF78716C' } };
  s1.addRow([]);
  const kpi = (l: string, v: number | string, isMoney = true) => {
    const r = s1.addRow([l, v]);
    r.getCell(1).font = { bold: true };
    if (isMoney) r.getCell(2).numFmt = money;
  };
  kpi('Total invested', total);
  kpi('Show appearances', new Set(rows.map((r) => `${r.show_key}:${r.year}`)).size, false);
  s1.addRow([]);
  head(s1, ['Company', 'Total']);
  sumBy(rows, (r) => r.company, (r) => r.amount).forEach(([c, a]) => {
    const r = s1.addRow([c, a]);
    r.getCell(2).numFmt = money;
  });

  // Sheet 2 — By Show (YoY)
  const s2 = wb.addWorksheet('By Show');
  s2.columns = [{ width: 34 }, ...years.map(() => ({ width: 16 })), { width: 14 }];
  head(s2, ['Show', ...years.map(String), 'Change %']);
  const byShow: Record<string, Record<number, number>> = {};
  const names: Record<string, string> = {};
  rows.forEach((r) => {
    byShow[r.show_key] = byShow[r.show_key] || {};
    byShow[r.show_key][r.year] = (byShow[r.show_key][r.year] || 0) + r.amount;
    names[r.show_key] = r.show_name.replace(/[-\s]*20\d\d([-\s]*20\d\d)?/g, '').trim();
  });
  Object.keys(byShow)
    .sort((a, b) => Math.max(...Object.values(byShow[b])) - Math.max(...Object.values(byShow[a])))
    .forEach((k) => {
      const vals = years.map((y) => byShow[k][y] || 0);
      const [a, b] = [vals[vals.length - 2] ?? 0, vals[vals.length - 1] ?? 0];
      const r = s2.addRow([names[k], ...vals, years.length >= 2 && a > 0 && b > 0 ? (b - a) / a : '']);
      vals.forEach((_, i) => (r.getCell(i + 2).numFmt = money));
      r.getCell(years.length + 2).numFmt = '+0.0%;[Red]-0.0%';
    });
  const totRow = s2.addRow(['Total', ...years.map((y) => rows.filter((r) => r.year === y).reduce((s, r) => s + r.amount, 0)), '']);
  totRow.font = { bold: true };
  years.forEach((_, i) => (totRow.getCell(i + 2).numFmt = money));

  // Sheet 3 — Category × Company
  const companies = sumBy(rows, (r) => r.company, (r) => r.amount).map(([c]) => c);
  const s3 = wb.addWorksheet('Category x Company');
  s3.columns = [{ width: 34 }, ...companies.map(() => ({ width: 16 })), { width: 16 }];
  head(s3, ['Category', ...companies, 'Total']);
  sumBy(rows, (r) => r.category, (r) => r.amount).forEach(([cat]) => {
    const vals = companies.map((c) => rows.filter((r) => r.category === cat && r.company === c).reduce((s, r) => s + r.amount, 0));
    const r = s3.addRow([cat, ...vals, vals.reduce((s, v) => s + v, 0)]);
    r.eachCell((cell, col) => { if (col > 1) cell.numFmt = money; });
  });
  const t3 = s3.addRow(['Total', ...companies.map((c) => rows.filter((r) => r.company === c).reduce((s, r) => s + r.amount, 0)), total]);
  t3.font = { bold: true };
  t3.eachCell((cell, col) => { if (col > 1) cell.numFmt = money; });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * Badge Scan Export
 *
 * The offline half of the feature's value: even with no CRM configured, a
 * show's leads come out as a file someone can work. Column order is chosen
 * for a human reading it in Excel, not for the database.
 */

import ExcelJS from 'exceljs';
import { BadgeScan } from '../../database/repositories/BadgeScanRepository';

const COLUMNS: Array<{ header: string; pick: (s: BadgeScan) => string }> = [
  { header: 'Scanned At', pick: (s) => s.scanned_at ?? '' },
  { header: 'Company Represented', pick: (s) => s.entity ?? '' },
  { header: 'First Name', pick: (s) => s.first_name ?? '' },
  { header: 'Last Name', pick: (s) => s.last_name ?? '' },
  { header: 'Title', pick: (s) => s.title ?? '' },
  { header: 'Organization', pick: (s) => s.company ?? '' },
  { header: 'Email', pick: (s) => s.email ?? '' },
  { header: 'Phone', pick: (s) => s.phone ?? '' },
  { header: 'City', pick: (s) => s.city ?? '' },
  { header: 'State', pick: (s) => s.state ?? '' },
  { header: 'ZIP', pick: (s) => s.postal_code ?? '' },
  { header: 'Country', pick: (s) => s.country ?? '' },
  { header: 'Badge ID', pick: (s) => s.badge_id ?? '' },
  { header: 'Attendee Type', pick: (s) => s.attendee_type ?? '' },
  { header: 'Notes', pick: (s) => s.notes ?? '' },
  { header: 'CRM Status', pick: (s) => s.crm_status ?? '' },
  { header: 'CRM Note', pick: (s) => s.crm_error ?? '' },
];

/**
 * RFC 4180 escaping. A company like `Smith, Jones & Co "The Firm"` shifts
 * every later column in its row if this is skipped, and the corruption is
 * invisible until someone reads the spreadsheet.
 */
function escapeCsv(value: string): string {
  const flattened = value.replace(/\r?\n/g, ' ');
  if (/[",]/.test(flattened)) {
    return `"${flattened.replace(/"/g, '""')}"`;
  }
  return flattened;
}

export class BadgeExportService {
  toCsv(scans: BadgeScan[]): string {
    const header = COLUMNS.map((c) => escapeCsv(c.header)).join(',');
    const rows = scans.map((s) => COLUMNS.map((c) => escapeCsv(c.pick(s))).join(','));
    return [header, ...rows].join('\n');
  }

  async toXlsx(scans: BadgeScan[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Leads');
    sheet.addRow(COLUMNS.map((c) => c.header));
    sheet.getRow(1).font = { bold: true };
    for (const scan of scans) {
      sheet.addRow(COLUMNS.map((c) => c.pick(scan)));
    }
    sheet.columns.forEach((col) => { col.width = 22; });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}

export const badgeExportService = new BadgeExportService();

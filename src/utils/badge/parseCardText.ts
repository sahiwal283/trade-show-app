/**
 * Business card text parser.
 *
 * Fills the gap a lead-retrieval badge leaves: the QR gives a name and a
 * company, the card gives the email, phone and title. Input is the raw OCR
 * text of a card photo; output is whatever contact fields could be read with
 * confidence. Like the badge parser it runs on the client and never throws —
 * an unreadable card yields no fields, and the rep types instead.
 *
 * The caller only ever uses these values to fill fields that are still
 * empty, so a field left out here costs a little typing while a wrong one
 * costs a lead. When in doubt, leave it out.
 */

import type { BadgeField } from './parseBadgePayload';
import { isCompany, isState } from './tokenClassifiers';

export type CardFields = Partial<Record<BadgeField, string>>;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;

/** An international number written with '+', or a ten-digit North American one. */
const PHONE = /(?<!\d)(?:\+\d[\d ().-]{8,16}\d|\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4})(?!\d)/g;

const MOBILE_LABEL = /\b(mobile|cell|cellular|m|c)\b/i;
const FAX_LABEL = /\b(fax|f)\b/i;

const CITY_STATE_ZIP = /([A-Za-z][A-Za-z .'-]*?),\s*([A-Za-z]{2})\.?\s+(\d{5}(?:-\d{4})?)\b/;

/**
 * Matched on whole words. The badge classifier's substring test would read
 * "Cooper" as a COO, and on a card the name sits right next to the title.
 */
const TITLE_WORDS = new Set([
  'president', 'ceo', 'cfo', 'coo', 'cto', 'cmo', 'owner', 'founder', 'partner',
  'principal', 'director', 'manager', 'supervisor', 'vp', 'svp', 'evp',
  'executive', 'chief', 'buyer', 'purchasing', 'sales', 'marketing',
  'operations', 'engineer', 'specialist', 'coordinator', 'representative',
  'consultant', 'analyst', 'associate', 'officer', 'head', 'merchandiser',
  'account', 'category', 'procurement',
]);

const wordsOf = (line: string): string[] =>
  line.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);

const isTitleLine = (line: string): boolean =>
  line.length <= 60 && !/[@\d]/.test(line) && !isCompany(line)
  && wordsOf(line).some((w) => TITLE_WORDS.has(w));

const NAME_WORD = /^[A-Za-z][A-Za-z'.-]*$/;

/** "Jordan Rivera, MBA" -> "Jordan Rivera". */
const stripCredentials = (line: string): string => line.replace(/,\s*[A-Za-z.]{2,6}$/, '');

function isNameLine(line: string): boolean {
  const parts = line.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return false;
  if (!parts.every((p) => NAME_WORD.test(p))) return false;
  return !isCompany(line) && !isTitleLine(line);
}

/** JORDAN -> Jordan, O'NEIL -> O'Neil. Mixed-case input is left as printed. */
function tidyNamePart(part: string): string {
  if (part !== part.toUpperCase() || part.length < 2) return part;
  return part.toLowerCase().replace(/(^|['-])([a-z])/g, (_, lead, ch) => lead + ch.toUpperCase());
}

function pickPhone(lines: string[]): string | undefined {
  let best: { value: string; rank: number } | undefined;
  for (const line of lines) {
    let previousEnd = 0;
    for (const match of line.matchAll(PHONE)) {
      const label = line.slice(previousEnd, match.index);
      previousEnd = (match.index ?? 0) + match[0].length;
      if (FAX_LABEL.test(label)) continue;
      const rank = MOBILE_LABEL.test(label) ? 2 : 1;
      if (!best || rank > best.rank) best = { value: match[0].trim(), rank };
    }
  }
  return best?.value;
}

function pickName(lines: string[], email: string | undefined): string | undefined {
  const candidates = lines.map(stripCredentials).filter(isNameLine);
  if (candidates.length === 0) return undefined;
  const local = (email ?? '').split('@')[0].toLowerCase().replace(/[^a-z]/g, '');
  const matched = local
    ? candidates.find((c) => wordsOf(c).some((w) => w.length >= 3 && local.includes(w)))
    : undefined;
  return matched ?? candidates[0];
}

export function parseCardText(text: string): CardFields {
  const fields: CardFields = {};
  try {
    const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return fields;

    const email = lines.map((l) => l.match(EMAIL)?.[0]).find(Boolean);
    if (email) fields.email = email;

    const phone = pickPhone(lines);
    if (phone) fields.phone = phone;

    const title = lines.find(isTitleLine);
    if (title) fields.title = title;

    const company = lines.find((l) => !EMAIL.test(l) && !/\d/.test(l) && isCompany(l));
    if (company) fields.company = company;

    const name = pickName(lines, email);
    if (name) {
      const parts = name.split(/\s+/).map(tidyNamePart);
      fields.last_name = parts[parts.length - 1];
      fields.first_name = parts.slice(0, -1).join(' ');
    }

    for (const line of lines) {
      const place = line.match(CITY_STATE_ZIP);
      if (!place || !isState(place[2])) continue;
      fields.city = place[1].trim();
      fields.state = place[2].toUpperCase();
      fields.postal_code = place[3];
      break;
    }
  } catch {
    // An unreadable card must never cost the lead the rep is already holding.
    return {};
  }
  return fields;
}

/**
 * ReservationParser — pulls booking details out of raw OCR text.
 *
 * Receipts uploaded from the checklist are usually confirmation documents
 * (hotel folios, airline itineraries, rental agreements), not point-of-sale
 * receipts. The generic field inference only knows merchant/amount/date, so
 * this parser adds the reservation layer: confirmation number, property or
 * carrier name, and stay dates. Heuristic by design — anything not found is
 * null and the UI leaves that field for the human.
 */

export interface ParsedReservation {
  confirmationNumber: string | null;
  propertyName: string | null;
  carrier: string | null;
  checkInDate: string | null;  // ISO yyyy-mm-dd
  checkOutDate: string | null; // ISO yyyy-mm-dd
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Parse a loosely formatted date fragment to ISO, or null. */
export function parseLooseDate(fragment: string): string | null {
  const text = fragment.trim();

  // 06/24/2026, 6-24-26
  const numeric = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (numeric) {
    const [, m, d, yRaw] = numeric;
    const y = yRaw.length === 2 ? 2000 + parseInt(yRaw, 10) : parseInt(yRaw, 10);
    return toIso(y, parseInt(m, 10), parseInt(d, 10));
  }

  // June 24, 2026 / Jun 24 2026 / 24 June 2026
  const monthName = text.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (monthName) {
    const m = MONTHS[monthName[1].slice(0, 3).toLowerCase()];
    if (m) return toIso(parseInt(monthName[3], 10), m, parseInt(monthName[2], 10));
  }
  const dayFirst = text.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/);
  if (dayFirst) {
    const m = MONTHS[dayFirst[2].slice(0, 3).toLowerCase()];
    if (m) return toIso(parseInt(dayFirst[3], 10), m, parseInt(dayFirst[1], 10));
  }

  return null;
}

function toIso(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Find a labeled date ("Check-in: June 24, 2026") near any of the keywords. */
function findLabeledDate(text: string, labels: RegExp): string | null {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!labels.test(lines[i])) continue;
    // Date may sit on the same line or the next one (tabular layouts).
    const candidate = parseLooseDate(lines[i].replace(labels, ' '));
    if (candidate) return candidate;
    if (i + 1 < lines.length) {
      const next = parseLooseDate(lines[i + 1]);
      if (next) return next;
    }
  }
  return null;
}

const CONFIRMATION_LABEL =
  /(?:confirmation|confirm|booking|reservation|itinerary|record\s*locator|folio)\s*(?:#|number|no\.?|code|id)?\s*[:#-]?\s*/i;

const HOTEL_HINT = /\b(hotel|inn|resort|suites?|lodge|casino|motel|marriott|hilton|hyatt|wyndham|sheraton|westin|sahara|caesars|mgm|venetian|bellagio|flamingo|luxor|excalibur)\b/i;

const AIRLINE_HINT = /\b(airlines?|airways|air\s?lines|southwest|delta|united|american\s+air|jetblue|frontier|spirit|alaska|allegiant|breeze)\b/i;

/** Extract reservation details from OCR text. Every field is best-effort. */
export function parseReservation(rawText: string | null | undefined): ParsedReservation {
  const result: ParsedReservation = {
    confirmationNumber: null,
    propertyName: null,
    carrier: null,
    checkInDate: null,
    checkOutDate: null,
  };
  if (!rawText || !rawText.trim()) return result;

  const text = rawText.slice(0, 20000);
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Confirmation number: labeled alphanumeric code, not a pure small number
  // and not another label word ("Reservation Confirmation" headings).
  const CODE_STOPWORDS = /^(confirmation|confirmed|reservation|booking|itinerary|number|record|locator|folio|details?|guest|hotel|email)$/i;
  for (const line of lines) {
    const m = line.match(CONFIRMATION_LABEL);
    if (!m) continue;
    const rest = line.slice((m.index || 0) + m[0].length);
    const code = rest.match(/([A-Z0-9][A-Z0-9-]{4,14})/i);
    if (code && !/^\d{1,4}$/.test(code[1]) && !CODE_STOPWORDS.test(code[1])) {
      result.confirmationNumber = code[1].toUpperCase();
      break;
    }
  }

  // Property: first line that reads like a hotel name (skip pure-keyword lines
  // like "Hotel information"). Prefer shorter, name-like lines.
  for (const line of lines) {
    if (!HOTEL_HINT.test(line)) continue;
    if (/information|policy|address|phone|email|check/i.test(line)) continue;
    if (line.length > 60) continue;
    result.propertyName = line.replace(/\s{2,}/g, ' ').trim();
    break;
  }

  // Carrier: airline names read the same way.
  for (const line of lines) {
    const m = line.match(AIRLINE_HINT);
    if (!m) continue;
    if (line.length <= 40) {
      result.carrier = line.replace(/\s{2,}/g, ' ').trim();
    } else {
      result.carrier = m[0];
    }
    break;
  }

  result.checkInDate = findLabeledDate(text, /check[\s-]?in|arrival|arrive/i);
  result.checkOutDate = findLabeledDate(text, /check[\s-]?out|departure(?!\s+gate)|depart(?!ure gate)/i);

  return result;
}

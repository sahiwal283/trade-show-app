/**
 * Badge payload parser.
 *
 * Single source of truth for turning a PDF417 payload into contact fields.
 * It runs on the client so a scan shows real data instantly and offline; the
 * backend stores what it produces but never re-derives it.
 *
 * Two rules the implementation must keep:
 *   1. Never throw. A badge that fails to parse still becomes a lead, with
 *      its raw payload intact and every token preserved.
 *   2. Never overwrite a confident assignment with a speculative one.
 */

import {
  isEmail, isPostalCode, isBadgeId, isPhone, isState, isCountry,
  isSalutation, isTitle, isCompany, isNameLike, isShortCode, isMultiWord,
} from './tokenClassifiers';

export const PARSER_VERSION = 'v1';

export type BadgeField =
  | 'badge_id' | 'salutation' | 'first_name' | 'last_name' | 'title'
  | 'company' | 'email' | 'phone' | 'city' | 'state' | 'postal_code'
  | 'country' | 'attendee_type';

export interface ParsedToken {
  index: number;
  value: string;
  mappedTo: BadgeField | null;
}

export interface ParsedBadge {
  fields: Partial<Record<BadgeField, string>>;
  tokens: ParsedToken[];
  confidence: number;
  parserVersion: string;
}

/**
 * Weights sum to 1.00. Email, company and name carry nearly all of it: a lead
 * missing those cannot be followed up at all, while a missing ZIP is a
 * cosmetic gap.
 */
const FIELD_WEIGHTS: Record<BadgeField, number> = {
  email: 0.30, company: 0.20, first_name: 0.15, last_name: 0.15,
  postal_code: 0.05, state: 0.05, city: 0.05, title: 0.03, badge_id: 0.02,
  phone: 0, country: 0, salutation: 0, attendee_type: 0,
};

const DELIMITERS = ['|', '^', '\t', '~', ';'];

const KEYED_PAIR = /^([A-Za-z_ ]{2,30})\s*[:=]\s*(.+)$/;

const KEY_ALIASES: Record<string, BadgeField> = {
  first: 'first_name', firstname: 'first_name', fname: 'first_name', given: 'first_name',
  last: 'last_name', lastname: 'last_name', lname: 'last_name', surname: 'last_name',
  email: 'email', mail: 'email', phone: 'phone', tel: 'phone', telephone: 'phone',
  company: 'company', org: 'company', organization: 'company', employer: 'company',
  title: 'title', jobtitle: 'title', city: 'city', state: 'state',
  zip: 'postal_code', postal: 'postal_code', postalcode: 'postal_code',
  country: 'country', badge: 'badge_id', badgeid: 'badge_id',
  registration: 'badge_id', regid: 'badge_id', salutation: 'salutation',
  prefix: 'salutation', type: 'attendee_type',
};

/**
 * Strip control bytes and the Unicode replacement character, but keep tab —
 * it is a candidate delimiter.
 */
function normalize(raw: string): string {
  return (raw ?? '')
    // eslint-disable-next-line no-control-regex -- deliberately stripping control bytes from scanner input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/g, '')
    .trim();
}

function splitTokens(text: string): string[] {
  let best = '';
  let bestCount = 0;
  for (const d of DELIMITERS) {
    const count = text.split(d).length - 1;
    if (count > bestCount) { best = d; bestCount = count; }
  }
  const parts = bestCount > 0 ? text.split(best) : text.split(/\r?\n/);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

function aliasFor(token: string): BadgeField | null {
  const match = token.match(KEYED_PAIR);
  if (!match) return null;
  return KEY_ALIASES[match[1].toLowerCase().replace(/[^a-z]/g, '')] ?? null;
}

function tryKeyed(tokens: string[]): Partial<Record<BadgeField, string>> | null {
  const pairs = tokens.map((t) => t.match(KEYED_PAIR)).filter(Boolean) as RegExpMatchArray[];
  if (pairs.length < 2) return null;

  const fields: Partial<Record<BadgeField, string>> = {};
  for (const [, rawKey, rawValue] of pairs) {
    const field = KEY_ALIASES[rawKey.toLowerCase().replace(/[^a-z]/g, '')];
    const value = rawValue.trim();
    if (field && value && !fields[field]) fields[field] = value;
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

/**
 * Order matters. Each rule runs only while its field is still unset, so an
 * early confident match is never displaced by a later speculative one, and
 * the keyword passes run before the shape-of-the-token passes.
 */
function classifyPositional(tokens: string[]): {
  fields: Partial<Record<BadgeField, string>>;
  mapped: Array<BadgeField | null>;
} {
  const fields: Partial<Record<BadgeField, string>> = {};
  const mapped: Array<BadgeField | null> = tokens.map(() => null);

  const claim = (i: number, field: BadgeField, value: string) => {
    fields[field] = value;
    mapped[i] = field;
  };

  // Pass 1 — unambiguous shapes.
  tokens.forEach((t, i) => {
    if (mapped[i]) return;
    if (!fields.email && isEmail(t)) return claim(i, 'email', t);
    if (!fields.postal_code && isPostalCode(t)) return claim(i, 'postal_code', t);
    if (!fields.badge_id && isBadgeId(t)) return claim(i, 'badge_id', t);
    if (!fields.phone && isPhone(t)) return claim(i, 'phone', t);
    if (!fields.state && isState(t)) return claim(i, 'state', t);
    if (!fields.country && isCountry(t)) return claim(i, 'country', t);
    if (!fields.salutation && isSalutation(t)) return claim(i, 'salutation', t);
  });

  // Pass 2 — keyword signals. Runs before the multi-word fallback so
  // "Virginia Trade Association" claims company ahead of "Glen Allen".
  tokens.forEach((t, i) => {
    if (mapped[i]) return;
    if (!fields.company && isCompany(t)) return claim(i, 'company', t);
    if (!fields.title && isTitle(t)) return claim(i, 'title', t);
  });

  // Pass 3 — multi-word leftovers are places or organizations, not people.
  tokens.forEach((t, i) => {
    if (mapped[i] || !isMultiWord(t)) return;
    if (!fields.company) return claim(i, 'company', t);
    if (!fields.city) return claim(i, 'city', t);
  });

  // Pass 4 — a leftover short uppercase code is the attendee classification.
  // Runs before the name-like fallback: an all-caps 1-4 char token such as
  // "DP" would otherwise be swallowed as a first/last name whenever those
  // slots happen to still be empty (e.g. a short payload with no other
  // names ahead of it). Real names are never all-uppercase in our samples,
  // so this never steals a genuine name token.
  tokens.forEach((t, i) => {
    if (mapped[i] || fields.attendee_type) return;
    if (isShortCode(t)) claim(i, 'attendee_type', t);
  });

  // Pass 5 — single-word name-like tokens, in order.
  tokens.forEach((t, i) => {
    if (mapped[i] || !isNameLike(t)) return;
    if (!fields.first_name) return claim(i, 'first_name', t);
    if (!fields.last_name) return claim(i, 'last_name', t);
    if (!fields.city) return claim(i, 'city', t);
  });

  return { fields, mapped };
}

function scoreConfidence(fields: Partial<Record<BadgeField, string>>): number {
  let score = 0;
  for (const [field, weight] of Object.entries(FIELD_WEIGHTS) as Array<[BadgeField, number]>) {
    if (fields[field]) score += weight;
  }
  return Math.min(1, Math.round(score * 100) / 100);
}

export function parseBadgePayload(raw: string): ParsedBadge {
  const empty: ParsedBadge = { fields: {}, tokens: [], confidence: 0, parserVersion: PARSER_VERSION };
  try {
    const text = normalize(raw);
    if (!text) return empty;

    const rawTokens = splitTokens(text);
    if (rawTokens.length === 0) return empty;

    const keyed = tryKeyed(rawTokens);
    if (keyed) {
      return {
        fields: keyed,
        tokens: rawTokens.map((value, index) => ({ index, value, mappedTo: aliasFor(value) })),
        confidence: scoreConfidence(keyed),
        parserVersion: PARSER_VERSION,
      };
    }

    const { fields, mapped } = classifyPositional(rawTokens);
    return {
      fields,
      tokens: rawTokens.map((value, index) => ({ index, value, mappedTo: mapped[index] })),
      confidence: scoreConfidence(fields),
      parserVersion: PARSER_VERSION,
    };
  } catch {
    // A parser bug must never cost a lead. The caller still holds raw_payload.
    return empty;
  }
}

/**
 * Below this, the review sheet presents fields as corrections to make rather
 * than facts to accept.
 */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.6;

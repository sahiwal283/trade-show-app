/**
 * Content-based token classifiers for badge payloads.
 *
 * Badge formats are vendor-specific and we have no samples, so position tells
 * us nothing reliable. Each token is judged on its own content instead.
 * The order these are applied in lives in parseBadgePayload.
 */

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP',
]);

const COUNTRIES = new Set([
  'united states','usa','us','u.s.a.','canada','mexico','united kingdom','uk',
]);

const SALUTATIONS = new Set(['mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'dr', 'dr.', 'prof', 'prof.']);

const TITLE_KEYWORDS = [
  'president','ceo','cfo','coo','cto','owner','founder','partner','principal',
  'director','manager','supervisor','vp','vice president','executive','chief',
  'buyer','purchasing','sales','marketing','operations','general manager',
];

const COMPANY_KEYWORDS = [
  'inc','inc.','llc','l.l.c.','ltd','corp','corp.','corporation','co','co.',
  'company','association','group','holdings','partners','distributors',
  'distributing','brands','enterprises','industries','foods','labs',
];

export const isEmail = (t: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t);

/** ZIP or ZIP+4. Checked before badge ids, which share the digits-dash shape. */
export const isPostalCode = (t: string): boolean => /^\d{5}(-\d{4})?$/.test(t);

/**
 * Registration ids look like 124649-907. Deliberately checked after ZIP and
 * before phone: 124649-907 carries nine digits and would otherwise read as a
 * phone number.
 */
export const isBadgeId = (t: string): boolean => /^\d{4,}-\d{2,4}$/.test(t);

/** Requires ten digits, which is what separates a phone from a badge id. */
export const isPhone = (t: string): boolean =>
  /^\+?[\d\s().-]{10,20}$/.test(t) && (t.match(/\d/g) || []).length >= 10;

export const isState = (t: string): boolean => t.length === 2 && US_STATES.has(t.toUpperCase());

export const isCountry = (t: string): boolean => COUNTRIES.has(t.toLowerCase());

export const isSalutation = (t: string): boolean => SALUTATIONS.has(t.toLowerCase());

export const isTitle = (t: string): boolean => {
  const lower = t.toLowerCase();
  return TITLE_KEYWORDS.some((k) => lower === k || lower.includes(k));
};

export const isCompany = (t: string): boolean => {
  const words = t.toLowerCase().replace(/[^a-z0-9. ]/g, '').split(/\s+/);
  return words.some((w) => COMPANY_KEYWORDS.includes(w));
};

/** A plausible person-name token: letters, hyphens, apostrophes only. */
export const isNameLike = (t: string): boolean => /^[A-Za-z][A-Za-z'-]{1,29}$/.test(t);

/**
 * A short uppercase code such as the "DP" classification on the confirmed
 * sample. Only consulted after state, so real states are never swallowed.
 */
export const isShortCode = (t: string): boolean => /^[A-Z0-9]{1,4}$/.test(t);

/** Anything with a space and no other signal is more likely a place or org. */
export const isMultiWord = (t: string): boolean => /\s/.test(t.trim());

/**
 * Show-name normalization shared by the show_summaries reports and the CRM
 * lead sync (was defined in routes/showSummaries.ts; extracted so services
 * do not import from route modules).
 *
 * NOTE ON normalizeCompany: this file's normalizeCompany canonicalizes OUR
 * OWN entity names for display/grouping ("boomin..." → "Boomin Brands",
 * blank → "Unassigned"). It is intentionally DIFFERENT from
 * LeadConversionService.normalizeCompany, which builds a fuzzy matching KEY
 * for EXTERNAL customer company names (lowercase, punctuation stripped,
 * llc/inc/co/corp/dba/ltd removed). Do not merge them.
 */

/** Mirror of the import script's show_key normalization (keep in sync). */
export function showKey(title: string): string {
  return aliasKey(
    title
      .toLowerCase()
      .replace(/20\d\d/g, '')
      .replace(/[^a-z ]/g, ' ')
      .replace(/\b(show|account|accou|the)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Same show, different spellings across the workbook and live events —
 * fold known variants onto one canonical key so YoY pairing works.
 */
const KEY_ALIASES: Array<[RegExp, string]> = [
  // "Champs Winter 2025" (CRM tag) is the workbook's "Champs Winter/Spring LV";
  // ^champs winter$ is anchored so "winter faire" (distinct show) is untouched.
  [/champs (winter ?\/? ?)?spring (lv|las vegas)|champs (lv|las vegas) spring|^champs winter$/, 'champs spring lv'],
  [/champs (las vegas|lv) summer|champs summer (lv|las vegas)/, 'champs summer lv'],
  [/champs f(or)?t\.? lauderd?ale?(dale)?/, 'champs fort lauderdale'],
  [/^tpe\b.*|total products expo/, 'tpe'],
  [/americasmart|atlanta market|america s mart/, 'americasmart'],
  [/sweets? ?(&|n|and)? ?snacks?/, 'sweet and snack'],
  [/^nacs?\b.*/, 'nacs'],
  [/asd market\s*(week)?/, 'asd market week'],
  [/fancy food/, 'fancy food'],
  [/champs (tradeshow:? )?austin( tx| texas)?/, 'champs austin'],
];

export function aliasKey(key: string): string {
  for (const [pattern, canonical] of KEY_ALIASES) {
    if (pattern.test(key)) return canonical;
  }
  return key;
}

/** Company name hygiene: singular/plural variants, undefined, blanks. */
export function normalizeCompany(raw: string | null | undefined): string {
  const c = (raw || '').trim();
  const k = c.toLowerCase();
  if (!k || k === 'undefined' || k === 'null' || k === 'n/a') return 'Unassigned';
  if (k.startsWith('boomin')) return 'Boomin Brands';
  if (k.startsWith('haute')) return 'Haute Brands';
  if (k.startsWith('summit')) return 'Summitt Labs';
  if (k.startsWith('nirvana')) return 'Nirvana Kulture';
  return c;
}

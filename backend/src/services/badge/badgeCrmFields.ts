/**
 * Zoho CRM field API names, discovered per brand.
 *
 * The Tradeshows module is a custom module, so its field API names are
 * org-specific. ZohoCrmLeadsService has long carried a note that its field
 * names are "best-effort candidates until real field API names are known";
 * this is that lookup. The result is cached in memory and mirrored into
 * app_settings so the read-side sync can use the same mapping.
 */

import axios from 'axios';
import { query } from '../../config/database';
import { getBrandCrmConfig } from './badgeCrmConfig';

const ZOHO_API_DOMAIN = 'https://www.zohoapis.com';

export type FieldMap = Record<string, string>;

/** Standard names, used when discovery fails or the module has no match. */
const DEFAULTS: FieldMap = {
  last_name: 'Last_Name', first_name: 'First_Name', email: 'Email',
  phone: 'Phone', company: 'Company', title: 'Title', city: 'City',
  state: 'State', postal_code: 'Zip_Code', country: 'Country',
  notes: 'Description', lead_source: 'Lead_Source',
};

/** Acceptable API names per field, best first. */
const CANDIDATES: Record<string, string[]> = {
  last_name: ['Last_Name', 'LastName', 'Name'],
  first_name: ['First_Name', 'FirstName'],
  email: ['Email', 'Email_Address', 'Primary_Email'],
  phone: ['Phone', 'Mobile', 'Phone_Number'],
  company: ['Company', 'Account_Name', 'Organization', 'Organisation'],
  title: ['Title', 'Designation', 'Job_Title'],
  city: ['City', 'Mailing_City'],
  state: ['State', 'Mailing_State'],
  postal_code: ['Zip_Code', 'Zip', 'Mailing_Zip', 'Postal_Code'],
  country: ['Country', 'Mailing_Country'],
  notes: ['Description', 'Notes'],
  lead_source: ['Lead_Source', 'Source'],
};

const cache = new Map<string, FieldMap>();

export function clearFieldMapCache(): void {
  cache.clear();
}

export async function getFieldMap(brand: string, accessToken: string): Promise<FieldMap> {
  const cached = cache.get(brand);
  if (cached) return cached;

  const config = getBrandCrmConfig(brand);
  if (!config) return DEFAULTS;

  let available: Set<string>;
  try {
    const response = await axios.get(`${ZOHO_API_DOMAIN}/crm/v2/settings/fields`, {
      params: { module: config.module },
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });
    available = new Set((response.data?.fields ?? []).map((f: any) => f.api_name));
  } catch (error) {
    // Discovery failing must not stop the push. The standard names are a fair
    // guess, and any rejection surfaces per record in the UI.
    console.warn(`[BadgeCrmFields] Discovery failed for ${brand}: ${(error as Error).message}`);
    return DEFAULTS;
  }

  const map: FieldMap = {};
  for (const [field, candidates] of Object.entries(CANDIDATES)) {
    map[field] = candidates.find((name) => available.has(name)) ?? DEFAULTS[field];
  }

  cache.set(brand, map);

  try {
    await query(
      `INSERT INTO app_settings (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [`crmFieldMap.${brand}`, JSON.stringify(map)]
    );
  } catch (error) {
    console.warn(`[BadgeCrmFields] Could not persist field map for ${brand}`);
  }

  return map;
}

/**
 * Per-brand Zoho CRM credentials.
 *
 * Each brand pushes leads into its own CRM org, so credentials are per brand:
 * HAUTE_BRANDS_ZOHO_CRM_REFRESH_TOKEN and friends, matching the existing
 * <BRAND>_ZOHO_COMPANY_ID convention.
 *
 * The refresh token deliberately has NO global fallback. A refresh token
 * names a destination org, and the shared ZOHO_CRM_REFRESH_TOKEN already
 * exists in production to gate the read-only lead sync
 * (ZohoCrmLeadsService). Falling back to it would report every brand as
 * configured and push all three brands' leads through one org's token:
 * either read-only, stranding every lead as 'failed' after five attempts, or
 * write-scoped for one org, silently filing Boomin Brands' and Nirvana
 * Kulture's leads into Haute Brands' CRM. Until a brand's own token exists,
 * that brand's scans stay 'pending' and the feature remains a local lead list
 * with CSV/Excel export.
 *
 * Client id and secret DO still fall back to the shared values: they identify
 * the OAuth application, not the destination org, so sharing them is correct.
 */

const KNOWN_BRANDS = ['haute_brands', 'boomin_brands', 'nirvana_kulture'] as const;

export interface BrandCrmConfig {
  brand: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  module: string;
}

const envPrefix = (brand: string): string => brand.toUpperCase();

export function getBrandCrmConfig(brand: string): BrandCrmConfig | null {
  if (!(KNOWN_BRANDS as readonly string[]).includes(brand)) return null;

  const prefix = envPrefix(brand);
  // No global fallback: the token IS the destination org. See file header.
  const refreshToken = process.env[`${prefix}_ZOHO_CRM_REFRESH_TOKEN`];
  const clientId =
    process.env[`${prefix}_ZOHO_CRM_CLIENT_ID`] ||
    process.env.ZOHO_CRM_CLIENT_ID ||
    process.env.ZOHO_CLIENT_ID;
  const clientSecret =
    process.env[`${prefix}_ZOHO_CRM_CLIENT_SECRET`] ||
    process.env.ZOHO_CRM_CLIENT_SECRET ||
    process.env.ZOHO_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) return null;

  return {
    brand,
    refreshToken,
    clientId,
    clientSecret,
    module:
      process.env[`${prefix}_ZOHO_CRM_MODULE`] ||
      process.env.ZOHO_CRM_TRADESHOWS_MODULE ||
      'CustomModule1',
  };
}

export function isBrandCrmConfigured(brand: string): boolean {
  return getBrandCrmConfig(brand) !== null;
}

export function configuredBrands(): string[] {
  return KNOWN_BRANDS.filter(isBrandCrmConfigured);
}

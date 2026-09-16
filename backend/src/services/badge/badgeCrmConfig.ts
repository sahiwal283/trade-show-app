/**
 * Per-brand Zoho CRM credentials.
 *
 * Each brand pushes leads into its own CRM org, so credentials are per brand:
 * HAUTE_BRANDS_ZOHO_CRM_REFRESH_TOKEN and friends, matching the existing
 * <BRAND>_ZOHO_COMPANY_ID convention. The single ZOHO_CRM_REFRESH_TOKEN is
 * kept as a fallback so the existing read-only lead sync keeps working
 * unchanged while brands are onboarded one at a time.
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
  const refreshToken =
    process.env[`${prefix}_ZOHO_CRM_REFRESH_TOKEN`] || process.env.ZOHO_CRM_REFRESH_TOKEN;
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

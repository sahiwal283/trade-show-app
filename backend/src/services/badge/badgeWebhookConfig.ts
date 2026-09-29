/**
 * Per-brand scan webhooks.
 *
 * A sister company can ask to receive every badge scanned on its behalf as a
 * raw POST, independent of the Zoho CRM upsert in BadgeCrmPushService. The
 * URL — which carries that company's API key in its query string — lives
 * only in the environment as <BRAND>_SCAN_WEBHOOK_URL, following the
 * <BRAND>_ZOHO_CRM_* convention, and is never committed.
 *
 * Which brands are webhook targets is fixed here, not derived from which
 * URLs happen to be set: a target brand's scans are stored 'pending' even
 * while its URL is missing, so nothing is lost if the variable is added
 * after a show. A non-target brand's scans are 'skipped' at capture and
 * never leave the building — Haute Brands' and Boomin Brands' attendee data
 * is not Nirvana Kulture's to receive.
 */

const WEBHOOK_BRANDS = ['nirvana_kulture'] as const;

const envKey = (brand: string): string => `${brand.toUpperCase()}_SCAN_WEBHOOK_URL`;

export function isScanWebhookBrand(brand: string | null | undefined): boolean {
  return !!brand && (WEBHOOK_BRANDS as readonly string[]).includes(brand);
}

export function getScanWebhookUrl(brand: string | null | undefined): string | null {
  if (!isScanWebhookBrand(brand)) return null;
  const url = (process.env[envKey(brand as string)] ?? '').trim();
  return url || null;
}

export function configuredWebhookBrands(): string[] {
  return WEBHOOK_BRANDS.filter((brand) => getScanWebhookUrl(brand) !== null);
}

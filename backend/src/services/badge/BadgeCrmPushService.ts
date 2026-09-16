/**
 * Badge Scan -> Zoho CRM push worker.
 *
 * Scanning never blocks on Zoho, so the push is a background pass: claim
 * eligible scans, group them by brand, and upsert each brand's batch with
 * that brand's own credentials. Failures are recorded on the row with their
 * reason and retried with backoff; they never crash the server.
 *
 * Pushed records are later pulled back by the existing nightly
 * ZohoCrmLeadsService sync into crm_leads, where LeadConversionService
 * attributes invoice revenue — so a scanned lead ends up in the same
 * reporting pipeline as any other.
 */

import axios from 'axios';
import { badgeScanRepository, BadgeScan } from '../../database/repositories/BadgeScanRepository';
import { getBrandCrmConfig, configuredBrands, BrandCrmConfig } from './badgeCrmConfig';

const ZOHO_ACCOUNTS_TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token';
const ZOHO_API_DOMAIN = 'https://www.zohoapis.com';

const PUSH_INTERVAL_MS = 5 * 60 * 1000;
const STARTUP_DELAY_MS = 45 * 1000; // after migrations settle
const CLAIM_LIMIT = 500;
const ZOHO_MAX_RECORDS_PER_CALL = 100;

export interface PushSummary {
  attempted: number;
  synced: number;
  failed: number;
  skippedBrands: string[];
}

export class BadgeCrmPushService {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    if (configuredBrands().length === 0) {
      console.log('[BadgeCrmPush] No brand has a CRM refresh token — lead push idle');
      return;
    }
    setTimeout(() => this.pushOnce().catch(() => undefined), STARTUP_DELAY_MS);
    this.timer = setInterval(() => this.pushOnce().catch(() => undefined), PUSH_INTERVAL_MS);
    console.log(`[BadgeCrmPush] Started for brands: ${configuredBrands().join(', ')}`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async pushOnce(): Promise<PushSummary> {
    const summary: PushSummary = { attempted: 0, synced: 0, failed: 0, skippedBrands: [] };

    if (configuredBrands().length === 0) return summary;

    const scans = await badgeScanRepository.claimPendingByBrand(CLAIM_LIMIT);
    if (scans.length === 0) return summary;

    const byBrand = new Map<string, BadgeScan[]>();
    for (const scan of scans) {
      if (!scan.brand) continue; // defensive: the query already excludes these
      const list = byBrand.get(scan.brand) ?? [];
      list.push(scan);
      byBrand.set(scan.brand, list);
    }

    for (const [brand, brandScans] of byBrand) {
      const config = getBrandCrmConfig(brand);
      if (!config) {
        // Leave them pending. Consuming retry attempts against a CRM that does
        // not exist would strand these leads as permanently failed once the
        // brand is finally onboarded.
        summary.skippedBrands.push(brand);
        console.warn(
          `[BadgeCrmPush] ${brandScans.length} scan(s) waiting for ${brand} — no CRM refresh token configured`
        );
        continue;
      }

      for (let i = 0; i < brandScans.length; i += ZOHO_MAX_RECORDS_PER_CALL) {
        const batch = brandScans.slice(i, i + ZOHO_MAX_RECORDS_PER_CALL);
        await this.pushBatch(brand, config, batch, summary);
      }
    }

    return summary;
  }

  private async pushBatch(
    brand: string,
    config: BrandCrmConfig,
    batch: BadgeScan[],
    summary: PushSummary
  ): Promise<void> {
    let accessToken: string;
    try {
      accessToken = await this.getAccessToken(config);
    } catch (error) {
      // A failed token refresh is an infrastructure hiccup, not a rejected
      // lead: it never reached Zoho's per-record validation. Treating it like
      // a rejection would consume a retry attempt, and a transient outage
      // spanning ~5 push intervals would permanently strand the whole batch
      // as 'failed', indistinguishable from a genuine rejection. Leave the
      // scans untouched in 'pending' — same precedent as the unconfigured-
      // brand path — so the next pass reclaims them, and don't count them as
      // attempted since no API call was ever made.
      console.warn(
        `[BadgeCrmPush] Zoho token refresh failed for ${brand}: ${(error as Error).message} — ${batch.length} scan(s) left pending`
      );
      if (!summary.skippedBrands.includes(brand)) summary.skippedBrands.push(brand);
      return;
    }

    summary.attempted += batch.length;

    try {
      const response = await axios.post(
        `${ZOHO_API_DOMAIN}/crm/v2/${config.module}/upsert`,
        {
          data: batch.map((scan) => this.toCrmRecord(scan)),
          // Email is the only field reliably unique per attendee. Without
          // this, every retry would create a new CRM record.
          duplicate_check_fields: ['Email'],
        },
        { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } }
      );

      const results: any[] = response.data?.data ?? [];
      for (let i = 0; i < batch.length; i++) {
        const scan = batch[i];
        const result = results[i];
        // Zoho answers 200 with per-record codes; a rejected record inside a
        // successful response is still a failure and must retry.
        if (result?.code === 'SUCCESS') {
          await badgeScanRepository.markPushResult(scan.id, {
            status: 'synced',
            crmRecordId: result.details?.id,
          });
          summary.synced += 1;
        } else {
          await badgeScanRepository.markPushResult(scan.id, {
            status: 'failed',
            error: `${result?.code ?? 'NO_RESULT'}: ${result?.message ?? 'Zoho returned no result for this record'}`,
          });
          summary.failed += 1;
        }
      }
    } catch (error) {
      await this.failBatch(batch, (error as Error).message, summary);
    }
  }

  private async failBatch(batch: BadgeScan[], message: string, summary: PushSummary): Promise<void> {
    for (const scan of batch) {
      await badgeScanRepository.markPushResult(scan.id, { status: 'failed', error: message });
      summary.failed += 1;
    }
  }

  private async getAccessToken(config: BrandCrmConfig): Promise<string> {
    const params = new URLSearchParams({
      refresh_token: config.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    });
    const response = await axios.post(ZOHO_ACCOUNTS_TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const token = response.data?.access_token;
    if (!token) throw new Error('Zoho returned no access_token');
    return token;
  }

  /**
   * Field API names are the known weak point: the Tradeshows module is a
   * custom module and its field names are org-specific. These are the
   * standard names; a brand whose module differs will surface
   * MANDATORY_NOT_FOUND or INVALID_DATA on the row, visible in the UI, rather
   * than failing silently.
   */
  private toCrmRecord(scan: BadgeScan): Record<string, unknown> {
    return {
      Last_Name: scan.last_name || scan.company || 'Unknown',
      First_Name: scan.first_name ?? undefined,
      Email: scan.email ?? undefined,
      Phone: scan.phone ?? undefined,
      Company: scan.company ?? undefined,
      Title: scan.title ?? undefined,
      City: scan.city ?? undefined,
      State: scan.state ?? undefined,
      Zip_Code: scan.postal_code ?? undefined,
      Country: scan.country ?? undefined,
      Description: scan.notes ?? undefined,
      Lead_Source: 'Trade Show Badge Scan',
    };
  }
}

export const badgeCrmPushService = new BadgeCrmPushService();

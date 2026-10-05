/**
 * Badge Scan -> partner webhook.
 *
 * Nirvana Kulture runs its own CRM automation and asked to receive every
 * scan taken on its behalf via a POST to a Zoho CRM function URL. For the
 * 13-field pipe-delimited badge format, data is "<raw badge string>|<scanner email>".
 * The original badge fields stay intact; other payload formats pass through unchanged.
 * A missing scanner email produces an empty final field. The rep's note rides
 * alongside as "notes" (empty string when there is none), for every format,
 * as it stood when the scan was delivered — later edits are not re-sent. This is
 * independent of the per-brand Zoho upsert in BadgeCrmPushService, which
 * keeps filing parsed leads exactly as before.
 *
 * Two delivery paths share one row-level status so a scan is sent once:
 *   - deliver(scan): attempted immediately after a scan is stored, off the
 *     request path (the 201 never waits on the partner)
 *   - sweepOnce(): a background pass that picks up rows the immediate attempt
 *     could not settle — the server was restarting, the URL was not yet
 *     configured, the partner was down — and retries with backoff
 *
 * The webhook URL carries the partner's API key in its query string, so it
 * is never logged; only the row id and the failure reason are.
 */

import axios from 'axios';
import { badgeScanRepository, BadgeScan } from '../../database/repositories/BadgeScanRepository';
import { userRepository } from '../../database/repositories/UserRepository';
import { getScanWebhookUrl, configuredWebhookBrands } from './badgeWebhookConfig';

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const STARTUP_DELAY_MS = 45 * 1000; // after migrations settle
const CLAIM_LIMIT = 200;
const REQUEST_TIMEOUT_MS = 15 * 1000;

export interface WebhookSummary {
  attempted: number;
  delivered: number;
  failed: number;
}

const emptySummary = (): WebhookSummary => ({ attempted: 0, delivered: 0, failed: 0 });

/** What went wrong, for the row and the log — never the URL. */
function describeFailure(error: unknown): string {
  const err = error as { message?: string; response?: { status?: number; data?: any } };
  const status = err.response?.status;
  const remote = err.response?.data;
  const remoteMessage =
    remote && typeof remote === 'object'
      ? [remote.code, remote.message].filter(Boolean).join(': ')
      : typeof remote === 'string' ? remote.slice(0, 200) : '';
  const parts = [
    status ? `HTTP ${status}` : null,
    remoteMessage || null,
    !status && err.message ? stripUrls(err.message) : null,
  ].filter(Boolean);
  return parts.join(' — ') || 'Unknown webhook error';
}

/** Axios and Node put the full request URL — key included — into some messages. */
function stripUrls(message: string): string {
  return message.replace(/https?:\/\/\S+/g, '<url>');
}

export class BadgeWebhookService {
  private timer: NodeJS.Timeout | null = null;
  /** A slow partner must not let two sweeps claim — and send — the same rows. */
  private inFlight = false;

  start(): void {
    const brands = configuredWebhookBrands();
    if (brands.length === 0) {
      console.log('[BadgeWebhook] No brand has a scan webhook URL — delivery idle');
      return;
    }
    setTimeout(() => this.sweepOnce().catch(() => undefined), STARTUP_DELAY_MS);
    this.timer = setInterval(() => this.sweepOnce().catch(() => undefined), SWEEP_INTERVAL_MS);
    console.log(`[BadgeWebhook] Started for brands: ${brands.join(', ')}`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * One attempt for one scan. Safe to call on any scan: it no-ops unless the
   * row is still pending for a brand whose webhook is configured, which is
   * what makes the create route's fire-and-forget call idempotent across
   * offline replays. Never throws — a partner outage is the partner's
   * problem, not the rep's.
   */
  async deliver(scan: BadgeScan): Promise<void> {
    await this.attempt(scan, emptySummary());
  }

  async sweepOnce(): Promise<WebhookSummary> {
    const summary = emptySummary();
    if (configuredWebhookBrands().length === 0) return summary;
    if (this.inFlight) {
      console.warn('[BadgeWebhook] Previous sweep still running — skipping this tick');
      return summary;
    }
    this.inFlight = true;
    try {
      const scans = await badgeScanRepository.claimPendingWebhook(CLAIM_LIMIT);
      for (const scan of scans) {
        await this.attempt(scan, summary);
      }
      if (summary.attempted > 0) {
        console.log(
          `[BadgeWebhook] Sweep: ${summary.delivered} delivered, ${summary.failed} failed of ${summary.attempted}`
        );
      }
      return summary;
    } finally {
      this.inFlight = false;
    }
  }

  private async attempt(scan: BadgeScan, summary: WebhookSummary): Promise<void> {
    if (scan.webhook_status !== 'pending' && scan.webhook_status !== 'failed') return;
    const url = getScanWebhookUrl(scan.brand);
    if (!url) return;

    summary.attempted += 1;
    try {
      let data = scan.raw_payload;
      if (data.split('|').length === 13) {
        // Resolve the authenticated scanner from the saved row for both
        // immediate delivery and retries. Never change the stored raw badge.
        const scanner = scan.scanned_by
          ? await userRepository.findById(scan.scanned_by)
          : null;
        const email = (scanner?.email ?? '').trim().toLowerCase();
        // Do not let an invalid profile value add extra fields or line breaks.
        const scannerEmail = email.includes('@') && !/[|\s]/.test(email) ? email : '';
        data = `${data}|${scannerEmail}`;
      }
      // The rep's note travels beside the badge string, never inside it, so
      // free text cannot shift the partner's field positions.
      const response = await axios.post(
        url,
        { data, notes: scan.notes ?? '' },
        { headers: { 'Content-Type': 'application/json' }, timeout: REQUEST_TIMEOUT_MS }
      );
      // Zoho functions answer 200 with a body code; anything but "success"
      // there means the function did not run, so the scan must retry.
      const code = response.data?.code;
      if (typeof code === 'string' && code.toLowerCase() !== 'success') {
        throw Object.assign(new Error(`Webhook reported ${code}`), { response });
      }
      await this.record(scan, { status: 'delivered' });
      summary.delivered += 1;
    } catch (error) {
      const reason = describeFailure(error);
      console.warn(`[BadgeWebhook] Delivery failed for scan ${scan.id} (${scan.brand}): ${reason}`);
      await this.record(scan, { status: 'failed', error: reason });
      summary.failed += 1;
    }
  }

  private async record(
    scan: BadgeScan,
    result: { status: 'delivered' } | { status: 'failed'; error: string }
  ): Promise<void> {
    try {
      await badgeScanRepository.markWebhookResult(scan.id, result);
    } catch (error) {
      // The POST outcome is already decided; losing the bookkeeping means at
      // worst one extra delivery on the next sweep, never a crashed request.
      console.error(
        `[BadgeWebhook] Could not record ${result.status} for scan ${scan.id}: ${(error as Error).message}`
      );
    }
  }
}

export const badgeWebhookService = new BadgeWebhookService();

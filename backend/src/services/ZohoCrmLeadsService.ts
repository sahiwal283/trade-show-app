/**
 * Zoho CRM Tradeshow Leads Service
 *
 * Syncs the org's Zoho CRM "Tradeshows" custom module (leads collected at
 * trade shows) into the local crm_leads table so the Reports investment view
 * can pair lead counts with show costs by (show_key, year).
 *
 * Connection model: a CRM-scoped refresh token (ZOHO_CRM_REFRESH_TOKEN,
 * with ZOHO_CRM_CLIENT_ID/SECRET, falling back to ZOHO_CLIENT_ID/SECRET) mints short-lived access
 * tokens on demand, cached until just before expiry. While the refresh token
 * env var is absent, EVERYTHING here no-ops with a clear "CRM not connected"
 * state — the scheduler idles and routes report connected: false.
 *
 * Scheduler: same pattern as TravelReminderService — started from server.ts,
 * one sync shortly after startup, then every 24h. Failures never crash the
 * server; they log and wait for the next pass.
 */

import axios from 'axios';
import { query } from '../config/database';
import { showKey, aliasKey } from '../routes/showSummaries';

const ZOHO_ACCOUNTS_TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token';
const ZOHO_API_DOMAIN = 'https://www.zohoapis.com';
const TRADESHOWS_MODULE = () => process.env.ZOHO_CRM_TRADESHOWS_MODULE || 'CustomModule1';

const PAGE_SIZE = 200;
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const STARTUP_DELAY_MS = 30 * 1000; // let DB/migrations settle
const TOKEN_EXPIRY_MARGIN_MS = 2 * 60 * 1000; // refresh 2 min early

/** A raw Zoho CRM record — field API names vary per org, so keep it loose. */
export type CrmRecord = Record<string, unknown>;

export interface LeadRow {
  crmRecordId: string;
  showTag: string | null;
  showKey: string | null;
  year: number | null;
  company: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  owner: string | null;
  emailOpened: boolean;
  emailBounced: boolean;
  converted: boolean;
  createdTime: string | null;
}

export interface SyncSummary {
  fetched: number;
  upserted: number;
}

// ---------- pure record mapping (exported for unit tests) ----------

const asTrimmedString = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/** First non-empty string among candidate field API names. */
function firstString(record: CrmRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = asTrimmedString(record[key]);
    if (value) return value;
  }
  return null;
}

/** Truthy boolean among candidate field API names ('true'/true both count). */
function firstBoolean(record: CrmRecord, keys: string[]): boolean {
  for (const key of keys) {
    const value = record[key];
    if (value === true || value === 'true') return true;
  }
  return false;
}

/** Owner-ish fields come back as lookup objects ({ name, id, email }). */
function ownerName(record: CrmRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object') {
      const name = asTrimmedString((value as CrmRecord).name);
      if (name) return name;
    }
  }
  return null;
}

/** The Tag field is an array of { name } — the first tag names the show. */
export function extractTagName(record: CrmRecord): string | null {
  const tags = record.Tag;
  if (!Array.isArray(tags) || tags.length === 0) return null;
  const first = tags[0] as CrmRecord | string;
  if (typeof first === 'string') return asTrimmedString(first);
  return asTrimmedString(first?.name);
}

/**
 * CONVERSION MAPPING — best effort until real field metadata is visible.
 * We scan for field names like Converted / Lead_Status / Deal and treat
 * explicit booleans or "converted/won/customer"-style values as converted.
 * Once the module's actual field API names are known (via
 * GET /crm/v2/settings/fields?module=<module>), replace this heuristic with
 * an exact field mapping.
 */
export function detectConverted(record: CrmRecord): boolean {
  for (const [key, value] of Object.entries(record)) {
    if (!/converted|lead_status|deal/i.test(key)) continue;
    if (value === true) return true;
    if (typeof value === 'string' && /converted|closed[ _-]?won|\bwon\b|customer/i.test(value)) {
      return true;
    }
  }
  return false;
}

/** Map a raw CRM record onto the crm_leads row shape. Pure — unit tested. */
export function mapLeadRecord(record: CrmRecord): LeadRow {
  const tag = extractTagName(record);
  const normalizedKey = tag ? aliasKey(showKey(tag)) : null;
  const createdTime = asTrimmedString(record.Created_Time);
  const createdDate = createdTime ? new Date(createdTime) : null;
  const year =
    createdDate && !Number.isNaN(createdDate.getTime()) ? createdDate.getFullYear() : null;

  return {
    crmRecordId: String(record.id),
    showTag: tag,
    showKey: normalizedKey || null,
    year,
    // Custom-module field API names are best-effort candidates until real
    // metadata is visible; the full record is kept in payload for remapping.
    company: firstString(record, ['Company_Name', 'Company', 'Account_Name', 'Name']),
    email: firstString(record, ['Email']),
    firstName: firstString(record, ['First_Name']),
    lastName: firstString(record, ['Last_Name']),
    owner: ownerName(record, ['Tradeshow_Owner', 'Owner']),
    emailOpened: firstBoolean(record, ['Email_Opened']),
    emailBounced: firstBoolean(record, ['Email_Bounced']),
    converted: detectConverted(record),
    createdTime: createdDate && !Number.isNaN(createdDate.getTime()) ? createdTime : null,
  };
}

export const UPSERT_LEAD_SQL = `
  INSERT INTO crm_leads (
    crm_record_id, show_tag, show_key, year, company, email,
    first_name, last_name, owner, email_opened, email_bounced,
    converted, created_time, payload, synced_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
  ON CONFLICT (crm_record_id) DO UPDATE SET
    show_tag = EXCLUDED.show_tag,
    show_key = EXCLUDED.show_key,
    year = EXCLUDED.year,
    company = EXCLUDED.company,
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    owner = EXCLUDED.owner,
    email_opened = EXCLUDED.email_opened,
    email_bounced = EXCLUDED.email_bounced,
    converted = EXCLUDED.converted,
    created_time = EXCLUDED.created_time,
    payload = EXCLUDED.payload,
    synced_at = now()
`;

/** Upsert one CRM record (full record json stored in payload). */
export async function upsertLead(record: CrmRecord): Promise<void> {
  const lead = mapLeadRecord(record);
  await query(UPSERT_LEAD_SQL, [
    lead.crmRecordId,
    lead.showTag,
    lead.showKey,
    lead.year,
    lead.company,
    lead.email,
    lead.firstName,
    lead.lastName,
    lead.owner,
    lead.emailOpened,
    lead.emailBounced,
    lead.converted,
    lead.createdTime,
    JSON.stringify(record),
  ]);
}

// ---------- service ----------

interface CachedToken {
  token: string;
  expiresAt: number;
}

class ZohoCrmLeadsService {
  private cachedToken: CachedToken | null = null;
  private timer: NodeJS.Timeout | null = null;
  private syncing = false;

  /** Connected = CRM refresh token + client credentials are configured. */
  isConnected(): boolean {
    return Boolean(
      process.env.ZOHO_CRM_REFRESH_TOKEN &&
        (process.env.ZOHO_CRM_CLIENT_ID || process.env.ZOHO_CLIENT_ID) &&
        (process.env.ZOHO_CRM_CLIENT_SECRET || process.env.ZOHO_CLIENT_SECRET)
    );
  }

  /** Mint (or reuse) a CRM access token from the refresh token. */
  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.token;
    }

    const params = new URLSearchParams({
      refresh_token: process.env.ZOHO_CRM_REFRESH_TOKEN || '',
      client_id: process.env.ZOHO_CRM_CLIENT_ID || process.env.ZOHO_CLIENT_ID || '',
      client_secret: process.env.ZOHO_CRM_CLIENT_SECRET || process.env.ZOHO_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
    });

    const response = await axios.post(ZOHO_ACCOUNTS_TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });

    const accessToken = response.data?.access_token as string | undefined;
    if (!accessToken) {
      // Zoho returns 200 with { error: '...' } on bad refresh tokens.
      throw new Error(
        `Zoho token refresh failed: ${response.data?.error || 'no access_token in response'}`
      );
    }

    const expiresInMs = (Number(response.data?.expires_in) || 3600) * 1000;
    this.cachedToken = {
      token: accessToken,
      expiresAt: Date.now() + expiresInMs - TOKEN_EXPIRY_MARGIN_MS,
    };
    return accessToken;
  }

  /**
   * Pull every record from the Tradeshows module and upsert into crm_leads.
   * Paginates 200 at a time via info.more_records; a 204 means empty module.
   */
  async syncLeads(): Promise<SyncSummary> {
    if (!this.isConnected()) {
      throw new Error('CRM not connected — ZOHO_CRM_REFRESH_TOKEN is not set');
    }
    if (this.syncing) {
      throw new Error('CRM lead sync already in progress');
    }

    this.syncing = true;
    try {
      const token = await this.getAccessToken();
      const module = TRADESHOWS_MODULE();
      let fetched = 0;
      let upserted = 0;

      for (let page = 1; ; page++) {
        const response = await axios.get(`${ZOHO_API_DOMAIN}/crm/v2/${module}`, {
          params: { page, per_page: PAGE_SIZE },
          headers: { Authorization: `Zoho-oauthtoken ${token}` },
          timeout: 30000,
          validateStatus: (status) => status === 200 || status === 204,
        });

        // 204 No Content — empty module (or paged past the end)
        if (response.status === 204 || !Array.isArray(response.data?.data)) break;

        const records = response.data.data as CrmRecord[];
        fetched += records.length;
        for (const record of records) {
          try {
            await upsertLead(record);
            upserted++;
          } catch (error) {
            console.error(`[CrmLeads] Upsert failed for record ${String(record.id)}:`, error);
          }
        }

        if (!response.data.info?.more_records) break;
      }

      console.log(`[CrmLeads] Sync complete: fetched ${fetched}, upserted ${upserted}`);
      return { fetched, upserted };
    } finally {
      this.syncing = false;
    }
  }

  /** Lead count + last sync time for the /status endpoint. */
  async status(): Promise<{ connected: boolean; leadCount: number; lastSyncedAt: string | null }> {
    const result = await query(
      `SELECT COUNT(*)::int AS lead_count, MAX(synced_at) AS last_synced_at FROM crm_leads`
    );
    return {
      connected: this.isConnected(),
      leadCount: result.rows[0]?.lead_count ?? 0,
      lastSyncedAt: result.rows[0]?.last_synced_at ?? null,
    };
  }

  /**
   * Per-show lead counts, keyed the same way as the show_summaries tiles.
   * sample_tag = most common raw CRM tag in the group, for display when a
   * lead group has no matching cost tile.
   */
  async byShow(): Promise<
    Array<{
      show_key: string;
      year: number;
      leads: number;
      converted: number;
      opened: number;
      sample_tag: string | null;
    }>
  > {
    const result = await query(
      `SELECT show_key, year,
              COUNT(*)::int AS leads,
              COUNT(*) FILTER (WHERE converted)::int AS converted,
              COUNT(*) FILTER (WHERE email_opened)::int AS opened,
              MODE() WITHIN GROUP (ORDER BY show_tag) AS sample_tag
       FROM crm_leads
       WHERE show_key IS NOT NULL AND show_key <> '' AND year IS NOT NULL
       GROUP BY show_key, year
       ORDER BY year, show_key`
    );
    return result.rows;
  }

  /** Daily auto-sync — sync once shortly after startup, then every 24h. */
  startScheduler(): void {
    if (this.timer) return;
    if (!this.isConnected()) {
      console.log('[CrmLeads] ZOHO_CRM_REFRESH_TOKEN not set — CRM lead sync idle');
      return;
    }
    setTimeout(() => this.safeSync(), STARTUP_DELAY_MS);
    this.timer = setInterval(() => this.safeSync(), SYNC_INTERVAL_MS);
    console.log('[CrmLeads] Scheduler started (sync at startup, then every 24h)');
  }

  stopScheduler(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Scheduler entry point — never throws. */
  private async safeSync(): Promise<void> {
    try {
      await this.syncLeads();
    } catch (error) {
      console.error('[CrmLeads] Scheduled sync failed (will retry next pass):', error);
    }
  }
}

export const zohoCrmLeadsService = new ZohoCrmLeadsService();

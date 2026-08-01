/**
 * Lead Conversion Service
 *
 * Proves which CRM tradeshow leads became ACTUAL customers by matching
 * crm_leads rows against Zoho Books customers/invoices for the leads' brand
 * (nirvana_kulture). Books data comes through the shared Zoho Integration
 * Service — same base URL / auth headers as zohoIntegrationClient — via its
 * generic GET '/zoho/{service}/{action}' proxy routes:
 *
 *   GET {ZOHO_SERVICE_URL}/zoho/contacts/list_books   (ZOHO_CRM_CONTACTS_ACTION)
 *   GET {ZOHO_SERVICE_URL}/zoho/invoices/list_books   (ZOHO_CRM_INVOICES_ACTION)
 *
 * Matching (pure functions, unit tested):
 *   1. email — exact, lowercased
 *   2. company — normalized (lowercase, punctuation stripped, corporate
 *      suffixes llc/inc/co/corp/dba/ltd removed)
 *
 * A matched lead gets converted=true, the Books customer id/name, how it
 * matched, revenue = sum of that customer's invoice totals (draft/void
 * excluded), converted_at=now() and converted_source='auto'. Rows a human
 * marked converted_source='manual' are NEVER touched. Auto rows that no
 * longer match are reset to unconverted/0 so the numbers stay honest.
 *
 * Failure model:
 *   - 404/403 from the proxy → the conversion actions are not enabled on the
 *     integration service yet; log "conversion route not enabled" and no-op.
 *   - network failure (no HTTP response) → ZohoServiceUnreachableError, which
 *     the reconcile route turns into a friendly 503.
 *
 * Scheduler: same pattern as ZohoCrmLeadsService — started from server.ts,
 * first pass a few minutes after startup (after the lead sync's startup
 * pass), then every 24h. Failures log and wait for the next night.
 */

import axios, { AxiosError, AxiosInstance } from 'axios';
import { query } from '../config/database';

const PAGE_SIZE = 200;
const MAX_PAGES = 50; // safety cap — 10k records per list is plenty
const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000; // nightly
const STARTUP_DELAY_MS = 5 * 60 * 1000; // after ZohoCrmLeadsService's startup sync (30s)

// Read env at call time so dotenv load order does not matter (same convention
// as zohoIntegrationClient's custom-field lookup).
const serviceUrl = () => process.env.ZOHO_SERVICE_URL || 'http://192.168.1.205:8000';
const serviceToken = () => process.env.ZOHO_SERVICE_TOKEN || '';
const leadsBrand = () => process.env.ZOHO_CRM_LEADS_BRAND || 'nirvana_kulture';
const contactsAction = () => process.env.ZOHO_CRM_CONTACTS_ACTION || 'contacts/list_books';
const invoicesAction = () => process.env.ZOHO_CRM_INVOICES_ACTION || 'invoices/list_books';

/** Raised when the integration service itself cannot be reached (no HTTP
 *  response at all) — the reconcile route maps this to a friendly 503. */
export class ZohoServiceUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZohoServiceUnreachableError';
  }
}

// ---------- pure matching helpers (exported for unit tests) ----------

export interface BooksContact {
  customerId: string;
  customerName: string;
  email: string | null;
  companyName: string | null;
}

export interface BooksInvoice {
  customerId: string;
  status: string;
  total: number;
}

export interface ContactIndex {
  byEmail: Map<string, BooksContact>;
  byCompany: Map<string, BooksContact>;
}

export interface LeadMatch {
  contact: BooksContact;
  matchedBy: 'email' | 'company';
}

/** Exact-match email key: trimmed + lowercased; null when empty/absent. */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  return normalized || null;
}

const COMPANY_SUFFIXES = new Set(['llc', 'inc', 'co', 'corp', 'dba', 'ltd']);

/**
 * Fuzzy-but-deterministic company key: lowercase, punctuation → spaces,
 * corporate suffix tokens (llc/inc/co/corp/dba/ltd) removed. If stripping
 * suffixes would erase the whole name ("CO LLC"), keep the unstripped tokens
 * rather than returning an over-broad empty key.
 *
 * NOT the same as utils/showNormalization.normalizeCompany, which
 * canonicalizes OUR OWN entity names for display ("boomin…" → "Boomin
 * Brands"). This one builds matching keys for EXTERNAL Books customer
 * companies. Intentionally separate — do not consolidate.
 */
export function normalizeCompany(name: string | null | undefined): string | null {
  if (typeof name !== 'string') return null;
  const tokens = name
    .toLowerCase()
    // periods/apostrophes vanish (so "L.L.C." → "llc", "Bob's" → "bobs")…
    .replace(/[.'’]/g, '')
    // …every other punctuation mark separates tokens
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return null;
  const stripped = tokens.filter((t) => !COMPANY_SUFFIXES.has(t));
  return (stripped.length > 0 ? stripped : tokens).join(' ');
}

/**
 * Index Books contacts for O(1) lead matching. First contact wins on key
 * collisions so a re-run is deterministic. Company keys come from the Books
 * company_name first, falling back to the customer display name (retail
 * customers usually ARE the company).
 */
export function buildContactIndex(contacts: BooksContact[]): ContactIndex {
  const byEmail = new Map<string, BooksContact>();
  const byCompany = new Map<string, BooksContact>();
  for (const contact of contacts) {
    const email = normalizeEmail(contact.email);
    if (email && !byEmail.has(email)) byEmail.set(email, contact);
    const company = normalizeCompany(contact.companyName) || normalizeCompany(contact.customerName);
    if (company && !byCompany.has(company)) byCompany.set(company, contact);
  }
  return { byEmail, byCompany };
}

/** Email exact match first; normalized company only as the fallback. */
export function matchLead(
  lead: { email: string | null; company: string | null },
  index: ContactIndex
): LeadMatch | null {
  const email = normalizeEmail(lead.email);
  if (email) {
    const contact = index.byEmail.get(email);
    if (contact) return { contact, matchedBy: 'email' };
  }
  const company = normalizeCompany(lead.company);
  if (company) {
    const contact = index.byCompany.get(company);
    if (contact) return { contact, matchedBy: 'company' };
  }
  return null;
}

const EXCLUDED_INVOICE_STATUSES = new Set(['draft', 'void']);

/** Revenue per Books customer_id — invoice totals, draft/void excluded. */
export function sumRevenueByCustomer(invoices: BooksInvoice[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const invoice of invoices) {
    if (EXCLUDED_INVOICE_STATUSES.has((invoice.status || '').toLowerCase())) continue;
    const total = Number(invoice.total);
    if (!invoice.customerId || !Number.isFinite(total)) continue;
    totals.set(invoice.customerId, (totals.get(invoice.customerId) || 0) + total);
  }
  return totals;
}

// ---------- proxy response mapping ----------

type RawRecord = Record<string, unknown>;

const asString = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null;

/** Map a raw Books contact record onto the fields matching cares about. */
export function mapContactRecord(raw: RawRecord): BooksContact {
  return {
    customerId: asString(raw.contact_id) || asString(raw.customer_id) || '',
    customerName:
      asString(raw.contact_name) || asString(raw.customer_name) || asString(raw.company_name) || '',
    email: asString(raw.email),
    companyName: asString(raw.company_name),
  };
}

/** Map a raw Books invoice record onto the fields aggregation cares about. */
export function mapInvoiceRecord(raw: RawRecord): BooksInvoice {
  return {
    customerId: asString(raw.customer_id) || '',
    status: asString(raw.status) || '',
    total: Number(raw.total ?? 0),
  };
}

/**
 * Pull the record array out of a proxy response page. The shared service
 * wraps Zoho payloads as { data: { contacts: [...], page_context } } (see
 * zohoIntegrationClient's chartofaccounts usage), but a plain Zoho-shaped
 * body is tolerated too.
 */
function extractPage(body: unknown, listKeys: string[]): { records: RawRecord[]; hasMore: boolean | null } {
  const layers: unknown[] = [];
  if (body && typeof body === 'object') {
    layers.push(body);
    const inner = (body as RawRecord).data;
    if (inner && typeof inner === 'object') layers.push(inner);
  }
  for (const layer of layers) {
    for (const key of listKeys) {
      const list = (layer as RawRecord)[key];
      if (Array.isArray(list)) {
        const pageContext = (layer as RawRecord).page_context as RawRecord | undefined;
        const hasMore =
          pageContext && typeof pageContext.has_more_page === 'boolean'
            ? pageContext.has_more_page
            : null;
        return { records: list as RawRecord[], hasMore };
      }
    }
  }
  return { records: [], hasMore: false };
}

/**
 * Batched write for the reconcile match phase — one UPDATE ... FROM unnest
 * for every matched lead instead of one UPDATE per lead (was N+1 for ~1k
 * leads nightly). The converted_source guard re-checks manual ownership at
 * write time in case a row was hand-flagged between the SELECT and here.
 */
export const APPLY_MATCHES_SQL = `
  UPDATE crm_leads AS l
  SET converted = true,
      converted_customer_id = m.customer_id,
      converted_customer_name = m.customer_name,
      revenue = m.revenue,
      converted_matched_by = m.matched_by,
      converted_source = 'auto',
      converted_at = now()
  FROM unnest(
         $1::int[], $2::text[], $3::text[], $4::numeric[], $5::text[]
       ) AS m(id, customer_id, customer_name, revenue, matched_by)
  WHERE l.id = m.id
    AND l.converted_source IS DISTINCT FROM 'manual'
`;

export interface ReconcileSummary {
  enabled: boolean;
  brand: string;
  contacts: number;
  invoices: number;
  leadsChecked: number;
  matched: number;
  matchedRevenue: number;
  reset: number;
}

// ---------- service ----------

class LeadConversionService {
  private timer: NodeJS.Timeout | null = null;
  private reconciling = false;

  private httpClient(): AxiosInstance {
    return axios.create({ baseURL: serviceUrl(), timeout: 60000 });
  }

  private headers(): Record<string, string> {
    return {
      'X-Brand': leadsBrand(),
      'X-Internal-Token': serviceToken(),
    };
  }

  /**
   * Fetch every page of a Books list action via the generic proxy.
   * Returns null when the action is not enabled (404/403) — callers no-op.
   * Throws ZohoServiceUnreachableError when the service gives no response.
   */
  private async fetchAllPages(action: string, listKeys: string[]): Promise<RawRecord[] | null> {
    const client = this.httpClient();
    // Multi-org tokens (nirvana_kulture) need the org selector on Books reads,
    // mirroring zohoIntegrationClient's create_books behavior.
    const organizationId = process.env.NIRVANA_KULTURE_ZOHO_COMPANY_ID || undefined;
    const records: RawRecord[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      let body: unknown;
      try {
        const response = await client.get(`/zoho/${action}`, {
          params: {
            page,
            per_page: PAGE_SIZE,
            ...(organizationId ? { organization_id: organizationId } : {}),
          },
          headers: this.headers(),
        });
        body = response.data;
      } catch (error) {
        const axiosError = error as AxiosError;
        const status = axiosError.response?.status;
        if (status === 404 || status === 403) {
          console.log(
            `[LeadConversion] conversion route not enabled — GET /zoho/${action} returned ${status}; ` +
              `enable the '${action}' action for brand "${leadsBrand()}" on the integration service.`
          );
          return null;
        }
        if (!axiosError.response) {
          throw new ZohoServiceUnreachableError(
            `Zoho integration service unreachable at ${serviceUrl()}: ${axiosError.message}`
          );
        }
        throw error;
      }

      const { records: pageRecords, hasMore } = extractPage(body, listKeys);
      records.push(...pageRecords);
      // Stop on an explicit "no more pages", or — when the proxy strips
      // page_context — on the first short page.
      if (hasMore === false || (hasMore === null && pageRecords.length < PAGE_SIZE)) break;
      if (pageRecords.length === 0) break;
    }

    return records;
  }

  /**
   * One full reconcile pass: fetch Books contacts + invoices, match every
   * non-manual lead, write conversion state, reset stale auto matches.
   */
  async reconcile(): Promise<ReconcileSummary> {
    if (this.reconciling) {
      throw new Error('Lead conversion reconcile already in progress');
    }
    this.reconciling = true;
    try {
      const brand = leadsBrand();
      const disabled: ReconcileSummary = {
        enabled: false,
        brand,
        contacts: 0,
        invoices: 0,
        leadsChecked: 0,
        matched: 0,
        matchedRevenue: 0,
        reset: 0,
      };

      const rawContacts = await this.fetchAllPages(contactsAction(), ['contacts', 'customers']);
      if (rawContacts === null) return disabled;
      const rawInvoices = await this.fetchAllPages(invoicesAction(), ['invoices']);
      if (rawInvoices === null) return disabled;

      const contacts = rawContacts.map(mapContactRecord).filter((c) => c.customerId);
      const invoices = rawInvoices.map(mapInvoiceRecord);
      const index = buildContactIndex(contacts);
      const revenueByCustomer = sumRevenueByCustomer(invoices);

      // Only auto-owned rows — manual overrides are never rewritten.
      const leads = await query(
        `SELECT id, email, company FROM crm_leads
         WHERE converted_source IS DISTINCT FROM 'manual'`
      );

      const matchedIds: number[] = [];
      const matchedCustomerIds: string[] = [];
      const matchedCustomerNames: string[] = [];
      const matchedRevenues: number[] = [];
      const matchedBys: string[] = [];
      let matchedRevenue = 0;
      for (const row of leads.rows as Array<{ id: number; email: string | null; company: string | null }>) {
        const match = matchLead({ email: row.email, company: row.company }, index);
        if (!match) continue;
        const revenue = revenueByCustomer.get(match.contact.customerId) || 0;
        matchedIds.push(row.id);
        matchedCustomerIds.push(match.contact.customerId);
        matchedCustomerNames.push(match.contact.customerName);
        matchedRevenues.push(revenue);
        matchedBys.push(match.matchedBy);
        matchedRevenue += revenue;
      }

      // Single batched write for all matches (previously one UPDATE per lead).
      if (matchedIds.length > 0) {
        await query(APPLY_MATCHES_SQL, [
          matchedIds,
          matchedCustomerIds,
          matchedCustomerNames,
          matchedRevenues,
          matchedBys,
        ]);
      }

      // Auto rows that no longer match go back to unconverted/0 — keeps the
      // converted counts honest when a Books customer or invoice disappears.
      const reset = await query(
        `UPDATE crm_leads
         SET converted = false,
             revenue = 0,
             converted_customer_id = NULL,
             converted_customer_name = NULL,
             converted_matched_by = NULL,
             converted_at = NULL
         WHERE converted_source IS DISTINCT FROM 'manual'
           AND NOT (id = ANY($1::int[]))
           AND (converted OR revenue <> 0 OR converted_customer_id IS NOT NULL)`,
        [matchedIds]
      );

      const summary: ReconcileSummary = {
        enabled: true,
        brand,
        contacts: contacts.length,
        invoices: invoices.length,
        leadsChecked: leads.rows.length,
        matched: matchedIds.length,
        matchedRevenue,
        reset: reset.rowCount ?? 0,
      };
      console.log(
        `[LeadConversion] Reconcile complete: ${summary.matched}/${summary.leadsChecked} leads matched ` +
          `(${summary.contacts} contacts, ${summary.invoices} invoices, ` +
          `$${summary.matchedRevenue.toFixed(2)} revenue, ${summary.reset} reset)`
      );
      return summary;
    } finally {
      this.reconciling = false;
    }
  }

  /** Nightly auto-reconcile — first pass after the CRM lead sync's startup
   *  pass, then every 24h (both schedulers tick daily, sync first). */
  startScheduler(): void {
    if (this.timer) return;
    setTimeout(() => this.safeReconcile(), STARTUP_DELAY_MS);
    this.timer = setInterval(() => this.safeReconcile(), RUN_INTERVAL_MS);
    console.log(
      '[LeadConversion] Scheduler started (reconcile after startup lead sync, then every 24h)'
    );
  }

  stopScheduler(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Scheduler entry point — never throws. */
  private async safeReconcile(): Promise<void> {
    try {
      await this.reconcile();
    } catch (error) {
      console.error('[LeadConversion] Scheduled reconcile failed (will retry next pass):', error);
    }
  }
}

export const leadConversionService = new LeadConversionService();

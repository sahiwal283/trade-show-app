/**
 * Single source for the three option lists the expense UI needs:
 * categories, payment methods (cards), and companies (formerly "entities").
 *
 * PICKLIST_SOURCE decides where they come from. Its default, `auto`, means
 * Midas iff EXPENSE_BACKEND=midas; `midas` and `settings` force the choice.
 * The override exists because production wants Midas's real lists while its
 * expenses are still stored locally — a state `auto` cannot express.
 *
 * The Midas API key never leaves the server — the browser talks to this service,
 * never to Midas directly.
 */

import { query } from '../../config/database';
import { getExpenseBackend, getMidasClient, getPicklistSource, paymentMethodCompany } from '../midas';
import type { MidasCompany, MidasPaymentMethod } from '../midas';

/** Matches the TTL paymentMethodMap already uses for its own catalog cache. */
const CACHE_TTL_MS = 60_000;

export type PicklistCategory = {
  id: string | null;
  name: string;
  description: string | null;
};

export type PicklistPaymentMethod = {
  id: string | null;
  label: string;
  lastFour: string;
  company: string | null;
  requiresReimbursement: boolean;
  zohoPaymentAccountId: string | null;
};

export type PicklistCompany = {
  name: string;
  zohoEnabled: boolean;
  sortOrder: number;
};

export type Picklists = {
  categories: PicklistCategory[];
  paymentMethods: PicklistPaymentMethod[];
  companies: PicklistCompany[];
  source: 'midas' | 'settings';
  /**
   * Who posts these expenses to Zoho Books. Under EXPENSE_BACKEND=midas that
   * is Midas, and Trade Show's app_settings category→account table is dead
   * weight; the admin UI uses this to avoid warning about a table nothing
   * reads.
   */
  zohoPostingOwner: 'trade-show' | 'midas';
  stale: boolean;
  fetchedAt: string;
};

/** Thrown when Midas is unreachable and nothing has ever been cached. */
export class PicklistsUnavailableError extends Error {
  readonly code = 'PICKLISTS_UNAVAILABLE';
  constructor(readonly cause: unknown) {
    super('Picklists are unavailable — Midas could not be reached and no cached copy exists');
    this.name = 'PicklistsUnavailableError';
  }
}

let cache: Picklists | null = null;
let cachedAtMs = 0;

/** Test helper. */
export function clearPicklistCache(): void {
  cache = null;
  cachedAtMs = 0;
}

function nowIso(): string {
  return new Date().toISOString();
}

function mapPaymentMethod(pm: MidasPaymentMethod): PicklistPaymentMethod {
  return {
    id: pm.id,
    label: pm.label,
    lastFour: pm.lastFour,
    company: paymentMethodCompany(pm),
    requiresReimbursement: pm.requiresReimbursement ?? false,
    zohoPaymentAccountId: pm.zohoPaymentAccountId ?? pm.zohoAccountName ?? null,
  };
}

function mapCompany(c: MidasCompany): PicklistCompany {
  return { name: c.name, zohoEnabled: c.zohoEnabled, sortOrder: c.sortOrder };
}

async function fetchFromMidas(): Promise<Picklists> {
  const client = getMidasClient();
  const [categories, paymentMethods, companies] = await Promise.all([
    client.listCategories(),
    client.listPaymentMethods(),
    client.listCompanies(),
  ]);

  return {
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description ?? null,
    })),
    paymentMethods: paymentMethods.map(mapPaymentMethod),
    companies: companies.map(mapCompany).sort((a, b) => a.sortOrder - b.sortOrder),
    source: 'midas',
    zohoPostingOwner: zohoPostingOwner(),
    stale: false,
    fetchedAt: nowIso(),
  };
}

/**
 * Legacy path: assemble the same shape from app_settings.
 *
 * Settings rows predate the Midas schema, so several fields have no equivalent:
 * categories and cards have no stable id, and entityOptions is a bare string[]
 * with no Zoho flag. Companies are reported zohoEnabled:true because on this
 * path Trade Show itself posts to Zoho for every entity it knows about.
 */
async function fetchFromSettings(): Promise<Picklists> {
  const result = await query(
    "SELECT key, value FROM app_settings WHERE key IN ('categoryOptions', 'cardOptions', 'entityOptions')"
  );

  const byKey: Record<string, unknown> = {};
  for (const row of result.rows as Array<{ key: string; value: unknown }>) {
    byKey[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
  }

  const rawCategories = Array.isArray(byKey.categoryOptions) ? byKey.categoryOptions : [];
  const rawCards = Array.isArray(byKey.cardOptions) ? byKey.cardOptions : [];
  const rawEntities = Array.isArray(byKey.entityOptions) ? byKey.entityOptions : [];

  return {
    // Historically a category was either a bare string or { name, ... }.
    categories: rawCategories.map((c: any) => ({
      id: null,
      name: typeof c === 'string' ? c : c?.name,
      description: null,
    })).filter((c: PicklistCategory) => Boolean(c.name)),

    paymentMethods: rawCards.map((c: any) => ({
      id: null,
      label: typeof c === 'string' ? c : c?.name,
      lastFour: typeof c === 'string' ? '' : c?.lastFour ?? '',
      company: typeof c === 'string' ? null : c?.entity ?? null,
      requiresReimbursement: false,
      zohoPaymentAccountId: typeof c === 'string' ? null : c?.zohoPaymentAccountId ?? null,
    })).filter((c: PicklistPaymentMethod) => Boolean(c.label)),

    companies: rawEntities
      .filter((name: unknown): name is string => typeof name === 'string' && name.length > 0)
      .map((name: string, i: number) => ({ name, zohoEnabled: true, sortOrder: i + 1 })),

    source: 'settings',
    zohoPostingOwner: zohoPostingOwner(),
    stale: false,
    fetchedAt: nowIso(),
  };
}

function zohoPostingOwner(): 'trade-show' | 'midas' {
  return getExpenseBackend() === 'midas' ? 'midas' : 'trade-show';
}

function sourceIsMidas(): boolean {
  const source = getPicklistSource();
  if (source === 'midas') return true;
  if (source === 'settings') return false;
  return getExpenseBackend() === 'midas';
}

/**
 * Current picklists.
 *
 * Deliberately has no hardcoded fallback. Serving a stale-but-real list is
 * safe; serving a guessed one silently mis-maps expense categories, which is
 * the exact failure this service exists to remove. When there is nothing real
 * to serve it throws, and the caller blocks submission.
 */
export async function getPicklists(): Promise<Picklists> {
  if (!sourceIsMidas()) {
    return fetchFromSettings();
  }

  const fresh = cache !== null && Date.now() - cachedAtMs < CACHE_TTL_MS;
  if (fresh) return cache!;

  try {
    const picklists = await fetchFromMidas();
    cache = picklists;
    cachedAtMs = Date.now();
    return picklists;
  } catch (err) {
    if (cache) {
      console.warn('[Picklists] Midas unreachable, serving cached copy:', err);
      return { ...cache, stale: true };
    }
    console.error('[Picklists] Midas unreachable and no cached copy exists:', err);
    throw new PicklistsUnavailableError(err);
  }
}

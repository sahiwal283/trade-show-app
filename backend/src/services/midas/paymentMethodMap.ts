/**
 * Resolve Trade Show `cardUsed` strings → Midas Ext paymentMethodId.
 * Midas is SoR for payment methods; catalog is read via Ext with short TTL cache.
 */

import type { MidasPaymentMethod } from './MidasTypes';

const DEFAULT_TTL_MS = 60_000;

export type ParsedCardUsed = {
  label: string | null;
  lastFour: string | null;
  raw: string;
};

export type ResolvedPaymentMethod = {
  id: string;
  label: string;
  lastFour: string;
  defaultZohoEntity: string | null;
  match: 'id' | 'lastFour' | 'label+lastFour' | 'label';
};

export type PaymentMethodLister = () => Promise<MidasPaymentMethod[]>;

type CacheEntry = {
  methods: MidasPaymentMethod[];
  fetchedAt: number;
};

let cache: CacheEntry | null = null;
let ttlMs = DEFAULT_TTL_MS;
let defaultLister: PaymentMethodLister | null = null;

/** Wire once from midas factory so helpers can fetch without circular imports. */
export function setPaymentMethodLister(lister: PaymentMethodLister | null): void {
  defaultLister = lister;
}

/** Test / ops helper */
export function setPaymentMethodCacheTtl(ms: number): void {
  ttlMs = ms;
}

/** Test helper */
export function clearPaymentMethodCache(): void {
  cache = null;
}

/**
 * Parse UI / legacy cardUsed forms:
 * - "Haute PNC (...3490)"
 * - "Personal (Need reimbursement) (...0000)"
 * - "Nirvana PNC •4171"
 * - "Amex *1234"
 * - plain label
 */
export function parseCardUsed(cardUsed: string | null | undefined): ParsedCardUsed {
  if (!cardUsed || !cardUsed.trim()) {
    return { label: null, lastFour: null, raw: '' };
  }
  const raw = cardUsed.trim();

  const paren = raw.match(/^(.*?)\s*\(\.\.\.(\d{4})\)\s*$/);
  if (paren) {
    return { label: paren[1].trim() || null, lastFour: paren[2], raw };
  }

  const bullet = raw.match(/^(.*?)\s+[•*](\d{4})\s*$/);
  if (bullet) {
    return { label: bullet[1].trim() || null, lastFour: bullet[2], raw };
  }

  const trailingDigits = raw.match(/(\d{4})\s*$/);
  if (trailingDigits && /[•*(]/.test(raw)) {
    const label = raw.slice(0, trailingDigits.index).replace(/[•*(.\s]+$/, '').trim();
    return { label: label || null, lastFour: trailingDigits[1], raw };
  }

  return { label: raw, lastFour: null, raw };
}

export function matchPaymentMethod(
  methods: MidasPaymentMethod[],
  cardUsed: string | null | undefined,
  paymentMethodId?: string | null
): ResolvedPaymentMethod | null {
  if (paymentMethodId) {
    const byId = methods.find((m) => m.id === paymentMethodId);
    if (byId) {
      return {
        id: byId.id,
        label: byId.label,
        lastFour: byId.lastFour,
        defaultZohoEntity: byId.defaultZohoEntity ?? null,
        match: 'id',
      };
    }
  }

  const parsed = parseCardUsed(cardUsed);
  if (!parsed.label && !parsed.lastFour) return null;

  if (parsed.lastFour) {
    const byLast = methods.filter((m) => m.lastFour === parsed.lastFour);
    if (byLast.length === 1) {
      const m = byLast[0];
      return {
        id: m.id,
        label: m.label,
        lastFour: m.lastFour,
        defaultZohoEntity: m.defaultZohoEntity ?? null,
        match: 'lastFour',
      };
    }
    if (byLast.length > 1 && parsed.label) {
      const both = byLast.find((m) => m.label.toLowerCase() === parsed.label!.toLowerCase());
      if (both) {
        return {
          id: both.id,
          label: both.label,
          lastFour: both.lastFour,
          defaultZohoEntity: both.defaultZohoEntity ?? null,
          match: 'label+lastFour',
        };
      }
    }
  }

  if (parsed.label) {
    const byLabel = methods.filter((m) => m.label.toLowerCase() === parsed.label!.toLowerCase());
    if (byLabel.length === 1) {
      const m = byLabel[0];
      return {
        id: m.id,
        label: m.label,
        lastFour: m.lastFour,
        defaultZohoEntity: m.defaultZohoEntity ?? null,
        match: 'label',
      };
    }
    if (byLabel.length > 1 && parsed.lastFour) {
      const both = byLabel.find((m) => m.lastFour === parsed.lastFour);
      if (both) {
        return {
          id: both.id,
          label: both.label,
          lastFour: both.lastFour,
          defaultZohoEntity: both.defaultZohoEntity ?? null,
          match: 'label+lastFour',
        };
      }
    }
  }

  return null;
}

export async function listPaymentMethodsCached(opts?: {
  forceRefresh?: boolean;
  lister?: PaymentMethodLister;
}): Promise<MidasPaymentMethod[]> {
  const now = Date.now();
  if (!opts?.forceRefresh && cache && now - cache.fetchedAt < ttlMs) {
    return cache.methods;
  }
  const lister = opts?.lister || defaultLister;
  if (!lister) {
    throw new Error('Payment method lister not configured — call setPaymentMethodLister or pass lister');
  }
  const methods = await lister();
  cache = { methods, fetchedAt: now };
  return methods;
}

/**
 * Resolve cardUsed / paymentMethodId against Ext catalog (cached).
 * Returns null when no match — caller still sends human-readable cardUsed.
 */
export async function resolvePaymentMethod(opts: {
  cardUsed?: string | null;
  paymentMethodId?: string | null;
  forceRefresh?: boolean;
  lister?: PaymentMethodLister;
}): Promise<ResolvedPaymentMethod | null> {
  if (!opts.cardUsed && !opts.paymentMethodId) return null;
  const listOpts = { forceRefresh: opts.forceRefresh, lister: opts.lister };
  const methods = await listPaymentMethodsCached(listOpts);
  let resolved = matchPaymentMethod(methods, opts.cardUsed, opts.paymentMethodId);
  if (!resolved && !opts.forceRefresh) {
    // One refresh if miss — catalog may have changed
    const fresh = await listPaymentMethodsCached({ forceRefresh: true, lister: opts.lister });
    resolved = matchPaymentMethod(fresh, opts.cardUsed, opts.paymentMethodId);
  }
  return resolved;
}

/**
 * Companies snapshot used by MockMidasClient + unit tests.
 * Mirrors Midas Ext GET /companies. `Summitt Labs` is intentionally
 * zohoEnabled:false — a real, chargeable company that does not sync to Zoho.
 */
export const TRADE_SHOW_COMPANY_SEED: Array<{
  name: string;
  zohoEnabled: boolean;
  sortOrder: number;
}> = [
  { name: 'Haute Brands', zohoEnabled: true, sortOrder: 1 },
  { name: 'Nirvana Kulture', zohoEnabled: true, sortOrder: 2 },
  { name: 'Boomin Brands', zohoEnabled: true, sortOrder: 3 },
  { name: 'Summitt Labs', zohoEnabled: false, sortOrder: 4 },
];

/** Catalog snapshot used by MockMidasClient + unit tests (labels/lastFour from Midas sync). */
export const TRADE_SHOW_PAYMENT_METHOD_SEED: Array<{
  id: string;
  label: string;
  lastFour: string;
  defaultZohoEntity: string | null;
  zohoPaymentAccountId: string | null;
}> = [
  {
    id: '11111111-0000-4000-8000-000000000001',
    label: 'Personal (Need reimbursement)',
    lastFour: '0000',
    defaultZohoEntity: null,
    zohoPaymentAccountId: null,
  },
  {
    id: '11111111-0000-4000-8000-000000000002',
    label: 'Haute PNC',
    lastFour: '3490',
    defaultZohoEntity: 'Haute Brands',
    zohoPaymentAccountId: '5254962000000129043',
  },
  {
    id: '11111111-0000-4000-8000-000000000003',
    label: 'Boomin PNC',
    lastFour: '7458',
    defaultZohoEntity: 'Boomin Brands',
    zohoPaymentAccountId: '4849689000000430009',
  },
  {
    id: '11111111-0000-4000-8000-000000000004',
    label: 'Boomin Capital One',
    lastFour: '9330',
    defaultZohoEntity: 'Boomin Brands',
    zohoPaymentAccountId: '4849689000010206091',
  },
  {
    id: '11111111-0000-4000-8000-000000000005',
    label: 'Nirvana PNC',
    lastFour: '7210',
    defaultZohoEntity: 'Nirvana Kulture',
    zohoPaymentAccountId: null,
  },
  {
    id: '11111111-0000-4000-8000-000000000007',
    label: 'Nirvana PNC',
    lastFour: '4171',
    defaultZohoEntity: 'Nirvana Kulture',
    zohoPaymentAccountId: null,
  },
  {
    id: '11111111-0000-4000-8000-000000000008',
    label: 'Brett Summitt Card',
    lastFour: '1039',
    defaultZohoEntity: 'Summitt Labs',
    zohoPaymentAccountId: null,
  },
  {
    id: '11111111-0000-4000-8000-000000000009',
    label: 'Nirvana ACH',
    lastFour: '8689',
    defaultZohoEntity: 'Nirvana Kulture',
    zohoPaymentAccountId: null,
  },
  {
    id: '11111111-0000-4000-8000-00000000000a',
    label: 'Sameer Summitt card',
    lastFour: '1096',
    defaultZohoEntity: 'Summitt Labs',
    zohoPaymentAccountId: null,
  },
  {
    id: '11111111-0000-4000-8000-00000000000b',
    label: 'Nirvana PNC',
    lastFour: '7466',
    defaultZohoEntity: 'Nirvana Kulture',
    zohoPaymentAccountId: null,
  },
  {
    id: '11111111-0000-4000-8000-00000000000c',
    label: 'Haute Amex',
    lastFour: '1002',
    defaultZohoEntity: 'Haute Brands',
    zohoPaymentAccountId: '5254962000007040062',
  },
];

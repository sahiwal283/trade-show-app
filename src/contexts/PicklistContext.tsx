/**
 * Categories, payment methods, and companies for expense entry.
 *
 * Served by GET /api/picklists, which reads from Midas once the backend is cut
 * over and from app_settings before that. Seven components need these lists, so
 * they are fetched once here and shared rather than refetched per component.
 *
 * Failure policy, deliberately strict: the last known good copy is cached in
 * IndexedDB and served when the network is unavailable. There is no hardcoded
 * fallback anywhere. If nothing has ever been cached, `isUnavailable` goes true
 * and expense submission is blocked — writing an expense against a guessed
 * category or card produces silently wrong accounting data, which is worse than
 * a hard stop the user can retry.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../utils/api';
import { offlineDb } from '../utils/offlineDb';

export interface PicklistCategory {
  id: string | null;
  name: string;
  description: string | null;
}

export interface PicklistPaymentMethod {
  id: string | null;
  label: string;
  lastFour: string;
  /** Company this card bills to; null for the personal reimbursement card. */
  company: string | null;
  requiresReimbursement: boolean;
  zohoPaymentAccountId: string | null;
}

export interface PicklistCompany {
  name: string;
  /**
   * False means the company is chargeable but does not sync to Zoho Books
   * (Summitt Labs today). Still offered for assignment — cards default to it,
   * so it has to be selectable — but expenses on it will not reach Zoho.
   */
  zohoEnabled: boolean;
  sortOrder: number;
}

export interface PicklistState {
  categories: PicklistCategory[];
  paymentMethods: PicklistPaymentMethod[];
  companies: PicklistCompany[];
  source: 'midas' | 'settings' | null;
  /** Serving data that may be behind — from the local cache or a degraded server. */
  isStale: boolean;
  /** No usable data at all. Expense submission must be blocked. */
  isUnavailable: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const EMPTY: Omit<PicklistState, 'refresh'> = {
  categories: [],
  paymentMethods: [],
  companies: [],
  source: null,
  isStale: false,
  isUnavailable: false,
  isLoading: true,
};

const PicklistContext = createContext<PicklistState | null>(null);

/**
 * The canonical `cardUsed` string: `Label (...1234)`.
 *
 * Both backend parsers key off this shape — `parseCardUsed` matches it first and
 * `zohoIntegrationClient.findPaymentAccountId` splits on `' (...'`. Producers
 * previously disagreed (one wrote `Label | 1234`), so every write path now goes
 * through this function.
 */
export function formatCardUsed(pm: Pick<PicklistPaymentMethod, 'label' | 'lastFour'>): string {
  return pm.lastFour ? `${pm.label} (...${pm.lastFour})` : pm.label;
}

export const PicklistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<Omit<PicklistState, 'refresh'>>(EMPTY);

  const applyPayload = useCallback((data: any, stale: boolean) => {
    setState({
      categories: Array.isArray(data?.categories) ? data.categories : [],
      paymentMethods: Array.isArray(data?.paymentMethods) ? data.paymentMethods : [],
      companies: Array.isArray(data?.companies) ? data.companies : [],
      source: data?.source ?? null,
      // A server that fell back to its own cache reports stale itself.
      isStale: stale || Boolean(data?.stale),
      isUnavailable: false,
      isLoading: false,
    });
  }, []);

  const load = useCallback(async () => {
    // Show the cached copy first so entry forms are usable immediately and
    // still work with no network at all.
    const cached = await offlineDb.getCachedPicklists();
    if (cached?.data) applyPayload(cached.data, true);

    try {
      const data = await api.getPicklists();
      applyPayload(data, false);
      await offlineDb.setCachedPicklists(data);
    } catch (error) {
      console.error('[Picklists] Fetch failed:', error);
      if (!cached?.data) {
        setState({ ...EMPTY, isLoading: false, isUnavailable: true });
      }
      // With a cached copy we keep serving it, already marked stale above.
    }
  }, [applyPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  // Revalidate when the connection returns, so a stale list does not persist
  // for the rest of the session after a reconnect.
  useEffect(() => {
    const onOnline = () => void load();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [load]);

  return (
    <PicklistContext.Provider value={{ ...state, refresh: load }}>
      {children}
    </PicklistContext.Provider>
  );
};

export function usePicklists(): PicklistState {
  const ctx = useContext(PicklistContext);
  if (!ctx) {
    throw new Error('usePicklists must be used within a PicklistProvider');
  }
  return ctx;
}

/** Category names only — the common case for a dropdown. */
export function useCategoryNames(): string[] {
  return usePicklists().categories.map((c) => c.name);
}

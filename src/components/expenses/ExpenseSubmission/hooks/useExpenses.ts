/**
 * useExpenses Hook
 *
 * Handles expense and event data fetching for ExpenseSubmission
 * Enhanced to support approval workflows when hasApprovalPermission is true
 */

import { useState, useEffect, useMemo } from 'react';
import { api } from '../../../../utils/api';
import { Expense, TradeShow, User } from '../../../../App';
import { usePicklists } from '../../../../contexts/PicklistContext';

export interface ExpenseEngineMeta {
  backend: 'local' | 'dual' | 'midas';
  midasMode: string;
  reviewInMidas: boolean;
  poweredByMidas: boolean;
}

interface UseExpensesOptions {
  hasApprovalPermission?: boolean;
}

const DEFAULT_ENGINE: ExpenseEngineMeta = {
  backend: 'local',
  midasMode: 'disabled',
  reviewInMidas: false,
  poweredByMidas: false,
};

export function useExpenses(options: UseExpensesOptions = {}) {
  const { hasApprovalPermission = false } = options;

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [events, setEvents] = useState<TradeShow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  // Companies (still labelled "Entity" in the UI) come from the shared picklist
  // context now, not from app_settings — Midas is SoR after cutover. Every role
  // gets the list; the approval-permission gate that used to hide it lived on
  // the settings fetch, not on the data itself.
  const { companies } = usePicklists();
  const entityOptions = useMemo(() => companies.map((c) => c.name), [companies]);
  const [engine, setEngine] = useState<ExpenseEngineMeta>(DEFAULT_ENGINE);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    console.log('[useExpenses] Loading data... hasApprovalPermission:', hasApprovalPermission);
    setLoading(true);

    if (api.USE_SERVER) {
      // All fetches are independent — run in parallel (1 round trip, not 2-4).
      // Failures stay isolated per endpoint, matching the old per-call try/catch.
      const [expensesResult, eventsResult, usersResult, engineResult] =
        await Promise.allSettled([
          api.getExpenses(),
          api.getEvents(),
          hasApprovalPermission ? api.getUsers() : Promise.resolve([]),
          api.getExpenseEngine(),
        ]);

      if (expensesResult.status === 'fulfilled') {
        setExpenses(expensesResult.value || []);
      } else {
        console.error('[useExpenses] Failed to load expenses:', expensesResult.reason);
        setExpenses([]);
      }

      if (eventsResult.status === 'fulfilled') {
        setEvents(eventsResult.value || []);
      } else {
        console.error('[useExpenses] Failed to load events:', eventsResult.reason);
        setEvents([]);
      }

      if (engineResult.status === 'fulfilled' && engineResult.value) {
        setEngine(engineResult.value);
      } else {
        setEngine(DEFAULT_ENGINE);
      }

      if (hasApprovalPermission) {
        if (usersResult.status === 'fulfilled') {
          setUsers(usersResult.value || []);
        } else {
          console.error('[useExpenses] Failed to load users (non-critical):', usersResult.reason);
          setUsers([]);
        }
      }
    } else {
      // Local storage fallback
      const storedExpenses = localStorage.getItem('tradeshow_expenses');
      const storedEvents = localStorage.getItem('tradeshow_events');
      if (storedExpenses) setExpenses(JSON.parse(storedExpenses));
      if (storedEvents) setEvents(JSON.parse(storedEvents));
      setEngine(DEFAULT_ENGINE);
    }

    setLoading(false);
    console.log('[useExpenses] Data loading complete');
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasApprovalPermission]);

  return {
    expenses,
    setExpenses,
    events,
    users,
    entityOptions,
    engine,
    loading,
    reload: loadData,
  };
}

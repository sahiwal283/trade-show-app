/**
 * useExpenses Hook
 * 
 * Handles expense and event data fetching for ExpenseSubmission
 * Enhanced to support approval workflows when hasApprovalPermission is true
 */

import { useState, useEffect } from 'react';
import { api } from '../../../../utils/api';
import { Expense, TradeShow, User } from '../../../../App';

interface UseExpensesOptions {
  hasApprovalPermission?: boolean;
}

export function useExpenses(options: UseExpensesOptions = {}) {
  const { hasApprovalPermission = false } = options;
  
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [events, setEvents] = useState<TradeShow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [entityOptions, setEntityOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    console.log('[useExpenses] Loading data... hasApprovalPermission:', hasApprovalPermission);
    setLoading(true);
    
    if (api.USE_SERVER) {
      // All fetches are independent — run in parallel (1 round trip, not 2-4).
      // Failures stay isolated per endpoint, matching the old per-call try/catch.
      const [expensesResult, eventsResult, usersResult, settingsResult] = await Promise.allSettled([
        api.getExpenses(),
        api.getEvents(),
        hasApprovalPermission ? api.getUsers() : Promise.resolve([]),
        hasApprovalPermission ? api.getSettings() : Promise.resolve(null),
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

      if (hasApprovalPermission) {
        if (usersResult.status === 'fulfilled') {
          setUsers(usersResult.value || []);
        } else {
          console.error('[useExpenses] Failed to load users (non-critical):', usersResult.reason);
          setUsers([]);
        }

        if (settingsResult.status === 'fulfilled') {
          setEntityOptions(settingsResult.value?.entityOptions || []);
        } else {
          console.error('[useExpenses] Failed to load settings (non-critical):', settingsResult.reason);
          setEntityOptions([]);
        }
      }
    } else {
      // Local storage fallback
      const storedExpenses = localStorage.getItem('tradeshow_expenses');
      const storedEvents = localStorage.getItem('tradeshow_events');
      if (storedExpenses) setExpenses(JSON.parse(storedExpenses));
      if (storedEvents) setEvents(JSON.parse(storedEvents));
    }
    
    setLoading(false);
    console.log('[useExpenses] Data loading complete');
  };

  useEffect(() => {
    loadData();
  }, [hasApprovalPermission]);

  return {
    expenses,
    events,
    users,
    entityOptions,
    loading,
    reload: loadData
  };
}


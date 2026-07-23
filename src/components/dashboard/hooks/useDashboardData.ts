/**
 * useDashboardData Hook
 * 
 * Handles data fetching for Dashboard component
 */

import { useState, useEffect } from 'react';
import { api } from '../../../utils/api';
import { Expense, TradeShow, User } from '../../../App';
import { AppError } from '../../../types/types';

export function useDashboardData() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [events, setEvents] = useState<TradeShow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      if (!api.USE_SERVER) {
        // Local/demo mode: same storage keys the rest of the app writes.
        try {
          setExpenses(JSON.parse(localStorage.getItem('tradeshow_expenses') || '[]'));
          setEvents(JSON.parse(localStorage.getItem('tradeshow_events') || '[]'));
          setUsers(JSON.parse(localStorage.getItem('tradeshow_users') || '[]'));
        } catch (error) {
          console.error('[Dashboard] Failed to read local data:', error);
        }
        setLoading(false);
        return;
      }

      // All three fetches are independent — run them in parallel so the
      // dashboard costs one round trip instead of three serial ones.
      const [exResult, evResult, usResult] = await Promise.allSettled([
        api.getExpenses(),
        api.getEvents(),
        api.getUsers(),
      ]);

      if (!mounted) return;

      const isAuthFailure = (r: PromiseSettledResult<unknown>) => {
        if (r.status !== 'rejected') return false;
        const appError = r.reason as AppError;
        return appError?.statusCode === 401 || appError?.statusCode === 403;
      };

      setExpenses(exResult.status === 'fulfilled' ? exResult.value || [] : []);
      setEvents(evResult.status === 'fulfilled' ? evResult.value || [] : []);
      setUsers(usResult.status === 'fulfilled' ? usResult.value || [] : []);

      for (const r of [exResult, evResult, usResult]) {
        if (r.status === 'rejected') {
          console.error('[Dashboard] Error loading data:', r.reason);
        }
      }
      if ([exResult, evResult, usResult].some(isAuthFailure)) {
        // apiClient's unauthorized callback handles logout; just stop here.
        console.error('[Dashboard] Authentication failed during data load');
      }

      setLoading(false);
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, []);

  return {
    expenses,
    events,
    users,
    loading
  };
}


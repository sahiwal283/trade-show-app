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
      // Fetch expenses (critical) - isolated try-catch so other failures don't block expenses
      try {
        const expensesData = await api.getExpenses();
        console.log('[useExpenses] Loaded expenses:', expensesData?.length || 0);
        setExpenses(expensesData || []);
      } catch (error) {
        console.error('[useExpenses] Failed to load expenses:', error);
        setExpenses([]);
      }
      
      // Fetch events (important but not critical)
      try {
        const eventsData = await api.getEvents();
        console.log('[useExpenses] Loaded events:', eventsData?.length || 0);
        setEvents(eventsData || []);
      } catch (error) {
        console.error('[useExpenses] Failed to load events:', error);
        setEvents([]);
      }
      
      // Additional data for approval users (non-critical)
      if (hasApprovalPermission) {
        try {
          const usersData = await api.getUsers();
          console.log('[useExpenses] Loaded users:', usersData?.length || 0);
          setUsers(usersData || []);
        } catch (error) {
          console.error('[useExpenses] Failed to load users (non-critical):', error);
          setUsers([]);
        }
        
        try {
          const settings = await api.getSettings();
          console.log('[useExpenses] Loaded settings');
          setEntityOptions(settings?.entityOptions || []);
        } catch (error) {
          console.error('[useExpenses] Failed to load settings (non-critical):', error);
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


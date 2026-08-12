/**
 * useReportsData Hook
 * 
 * Handles data fetching for Reports component
 */

import { useState, useEffect, useMemo } from 'react';
import { api } from '../../../utils/api';
import { Expense, TradeShow } from '../../../App';
import { usePicklists } from '../../../contexts/PicklistContext';

export function useReportsData() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [events, setEvents] = useState<TradeShow[]>([]);
  // Companies (labelled "Entity" in the UI) come from the shared picklist
  // context — Midas is SoR after cutover.
  const { companies } = usePicklists();
  const entityOptions = useMemo(() => companies.map((c) => c.name), [companies]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);

    if (api.USE_SERVER) {
      try {
        const [ev, ex] = await Promise.all([
          api.getEvents(),
          api.getExpenses()
        ]);
        setEvents(ev || []);
        setExpenses(ex || []);
      } catch (error) {
        console.error('[Reports] Error loading data:', error);
        setEvents([]);
        setExpenses([]);
      }
    } else {
      // Local storage fallback
      const storedEvents = localStorage.getItem('tradeshow_events');
      const storedExpenses = localStorage.getItem('tradeshow_expenses');

      if (storedEvents) setEvents(JSON.parse(storedEvents));
      if (storedExpenses) setExpenses(JSON.parse(storedExpenses));
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  return {
    expenses,
    events,
    entityOptions,
    loading,
    reload: loadData,
    setExpenses // Expose for updates from child components
  };
}


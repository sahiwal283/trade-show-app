/**
 * useExpenseFilters Hook
 * 
 * Manages filter state for ExpenseSubmission
 */

import { useState, useMemo } from 'react';
import { Expense } from '../../../../App';

export function useExpenseFilters(expenses: Expense[]) {
  const [dateFilter, setDateFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [merchantFilter, setMerchantFilter] = useState('');
  const [cardFilter, setCardFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [reimbursementFilter, setReimbursementFilter] = useState('all');
  const [sortBy, setSortBy] = useState('default');

  // Filtered and sorted expenses
  const filteredExpenses = useMemo(() => {
    // First, filter expenses
    const filtered = expenses.filter(expense => {
      // Support both full date (YYYY-MM-DD) and month (YYYY-MM) filtering
      const matchesDate = !dateFilter || expense.date.startsWith(dateFilter);
      const matchesEvent = eventFilter === 'all' || expense.tradeShowId === eventFilter;
      const matchesCategory = categoryFilter === 'all' || expense.category === categoryFilter;
      // Free-text search spans merchant, category, description, location, and
      // submitter so the toolbar search box behaves like a global row search.
      const query = merchantFilter.trim().toLowerCase();
      const matchesMerchant =
        !query ||
        [expense.merchant, expense.category, expense.description, expense.location, expense.user_name]
          .filter(Boolean)
          .some(field => (field as string).toLowerCase().includes(query));
      const matchesCard = cardFilter === 'all' || expense.cardUsed === cardFilter;
      const matchesStatus = statusFilter === 'all' || expense.status === statusFilter;
      const matchesReimbursement = reimbursementFilter === 'all' || 
        (reimbursementFilter === 'required' && expense.reimbursementRequired) ||
        (reimbursementFilter === 'not-required' && !expense.reimbursementRequired);

      return matchesDate && matchesEvent && matchesCategory && matchesMerchant && 
             matchesCard && matchesStatus && matchesReimbursement;
    });

    // Then, sort the filtered results
    const sorted = [...filtered];
    switch (sortBy) {
      case 'default':
        // Default: pending expenses at the top, then by date (newest first)
        sorted.sort((a, b) => {
          if (a.status === 'pending' && b.status !== 'pending') return -1;
          if (a.status !== 'pending' && b.status === 'pending') return 1;
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
        break;
      case 'date-newest':
        sorted.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        break;
      case 'date-oldest':
        sorted.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        break;
      case 'amount-highest':
        sorted.sort((a, b) => (b.amount || 0) - (a.amount || 0));
        break;
      case 'amount-lowest':
        sorted.sort((a, b) => (a.amount || 0) - (b.amount || 0));
        break;
      case 'merchant-az':
        sorted.sort((a, b) => a.merchant.localeCompare(b.merchant));
        break;
      case 'merchant-za':
        sorted.sort((a, b) => b.merchant.localeCompare(a.merchant));
        break;
      case 'category-az':
        sorted.sort((a, b) => a.category.localeCompare(b.category));
        break;
      case 'category-za':
        sorted.sort((a, b) => b.category.localeCompare(a.category));
        break;
      case 'user-az':
        sorted.sort((a, b) => (a.user_name || '').localeCompare(b.user_name || ''));
        break;
      case 'user-za':
        sorted.sort((a, b) => (b.user_name || '').localeCompare(a.user_name || ''));
        break;
      default:
        // Fallback to default sort
        sorted.sort((a, b) => {
          if (a.status === 'pending' && b.status !== 'pending') return -1;
          if (a.status !== 'pending' && b.status === 'pending') return 1;
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
    }

    return sorted;
  }, [expenses, dateFilter, eventFilter, categoryFilter, merchantFilter, cardFilter, statusFilter, reimbursementFilter, sortBy]);

  // Check if filters are active
  const hasActiveFilters = dateFilter !== '' || eventFilter !== 'all' || categoryFilter !== 'all' ||
    merchantFilter !== '' || cardFilter !== 'all' || statusFilter !== 'all' || reimbursementFilter !== 'all';

  // Clear all filters
  const clearAllFilters = () => {
    setDateFilter('');
    setEventFilter('all');
    setCategoryFilter('all');
    setMerchantFilter('');
    setCardFilter('all');
    setStatusFilter('all');
    setReimbursementFilter('all');
    setSortBy('default');
  };

  // Get unique values for filter options
  const uniqueCategories = useMemo(() => [...new Set(expenses.map(e => e.category))], [expenses]);
  const uniqueCards = useMemo(() => [...new Set(expenses.map(e => e.cardUsed))], [expenses]);

  return {
    // State
    dateFilter, setDateFilter,
    eventFilter, setEventFilter,
    categoryFilter, setCategoryFilter,
    merchantFilter, setMerchantFilter,
    cardFilter, setCardFilter,
    statusFilter, setStatusFilter,
    reimbursementFilter, setReimbursementFilter,
    sortBy, setSortBy,
    
    // Computed
    filteredExpenses,
    hasActiveFilters,
    uniqueCategories,
    uniqueCards,
    clearAllFilters
  };
}


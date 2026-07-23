/**
 * useReportsStats Hook
 *
 * Calculates statistics for Reports component
 */

import { useMemo } from 'react';
import { Expense } from '../../../App';
import { parseLocalDate } from '../../../utils/dateUtils';

interface UseReportsStatsProps {
  expenses: Expense[];
  selectedEvent: string;
  selectedPeriod: string;
  selectedEntity: string;
  selectedCategories: string[];
  entityOptions: string[];
}

export function useReportsStats({
  expenses,
  selectedEvent,
  selectedPeriod,
  selectedEntity,
  selectedCategories,
  entityOptions,
}: UseReportsStatsProps) {
  // Filter expenses by event/entity/period. Category selection is applied
  // separately below so the category picker can keep showing every category.
  const baseExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      const eventMatch = selectedEvent === 'all' || expense.tradeShowId === selectedEvent;
      const entityMatch = selectedEntity === 'all' || expense.zohoEntity === selectedEntity;

      let periodMatch = true;
      if (selectedPeriod !== 'all') {
        const expenseDate = parseLocalDate(expense.date);
        expenseDate.setHours(0, 0, 0, 0); // Normalize to start of day

        const now = new Date();
        now.setHours(0, 0, 0, 0); // Normalize to start of today

        const daysDifference = Math.floor(
          (now.getTime() - expenseDate.getTime()) / (24 * 60 * 60 * 1000)
        );

        switch (selectedPeriod) {
          case 'week':
            periodMatch = daysDifference >= 0 && daysDifference <= 7;
            break;
          case 'month':
            periodMatch = daysDifference >= 0 && daysDifference <= 30;
            break;
          case 'quarter':
            periodMatch = daysDifference >= 0 && daysDifference <= 90;
            break;
        }
      }

      return eventMatch && entityMatch && periodMatch;
    });
  }, [expenses, selectedEvent, selectedEntity, selectedPeriod]);

  // Everything downstream (stats, entity totals, transaction register, CSV)
  // respects the category selection.
  const filteredExpenses = useMemo(() => {
    if (selectedCategories.length === 0) return baseExpenses;
    return baseExpenses.filter((expense) => selectedCategories.includes(expense.category));
  }, [baseExpenses, selectedCategories]);

  // Calculate report statistics
  const reportStats = useMemo(() => {
    const totalAmount = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const approvedAmount = filteredExpenses
      .filter((exp) => exp.status === 'approved')
      .reduce((sum, exp) => sum + exp.amount, 0);
    const pendingAmount = filteredExpenses
      .filter((exp) => exp.status === 'pending')
      .reduce((sum, exp) => sum + exp.amount, 0);

    const categoryBreakdown = filteredExpenses.reduce(
      (acc, exp) => {
        acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      totalAmount,
      approvedAmount,
      pendingAmount,
      expenseCount: filteredExpenses.length,
      categoryBreakdown,
    };
  }, [filteredExpenses]);

  // Calculate entity totals (filtered, only active entities)
  const entityTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredExpenses.forEach((expense) => {
      // Only include expenses with entities that are in the active entity options
      if (expense.zohoEntity && entityOptions.includes(expense.zohoEntity)) {
        totals[expense.zohoEntity] = (totals[expense.zohoEntity] || 0) + expense.amount;
      }
    });
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1]) // Sort by amount descending
      .map(([entity, amount]) => ({ entity, amount }));
  }, [filteredExpenses, entityOptions]);

  return {
    baseExpenses,
    filteredExpenses,
    reportStats,
    entityTotals,
  };
}

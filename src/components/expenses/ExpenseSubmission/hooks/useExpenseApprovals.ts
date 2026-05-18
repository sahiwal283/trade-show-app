/**
 * useExpenseApprovals Hook
 * 
 * Manages Zoho Books integration and expense approval workflow.
 * Tracks which expenses have been pushed to Zoho and handles the push operation.
 */

import { useState, useEffect } from 'react';
import { Expense } from '../../../../App';
import { api } from '../../../../utils/api';
import { AppError } from '../../../../types/types';
import { buildEntityChangeConfirmation } from '../../../../utils/expenseUtils';

interface UseExpenseApprovalsProps {
  expenses: Expense[];
  hasPermission: boolean;
  reloadData: () => Promise<void>;
  addToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export function useExpenseApprovals({
  expenses,
  hasPermission,
  reloadData,
  addToast,
}: UseExpenseApprovalsProps) {
  const [pushingExpenseId, setPushingExpenseId] = useState<string | null>(null);
  const [pushedExpenses, setPushedExpenses] = useState<Set<string>>(new Set());

  // Update pushedExpenses set when expenses data changes
  useEffect(() => {
    if (hasPermission) {
      const pushed = new Set(expenses.filter((e) => e.zohoExpenseId).map((e) => e.id));
      setPushedExpenses(pushed);
    }
  }, [expenses, hasPermission]);

  const handlePushToZoho = async (expense: Expense) => {
    if (!expense.zohoEntity) {
      addToast('⚠️ No entity assigned to this expense. Please assign an entity first.', 'warning');
      return;
    }

    if (expense.zohoExpenseId || pushedExpenses.has(expense.id)) {
      return; // Already pushed
    }

    setPushingExpenseId(expense.id);
    try {
      await api.pushToZoho(expense.id);
      setPushedExpenses((prev) => new Set(prev).add(expense.id));
      addToast(`✅ Expense successfully pushed to ${expense.zohoEntity} Zoho Books!`, 'success');
      await reloadData();
    } catch (error) {
      const appError = error as AppError;
      console.error('Failed to push to Zoho:', appError);

      const errorMsg = appError.message || 'Unknown error';

      if (errorMsg.includes('does not have Zoho Books integration configured')) {
        addToast(
          `🕐 Zoho Books integration for "${expense.zohoEntity}" is coming soon. Please try again later or add manually.`,
          'info'
        );
      } else if (appError.code === 'NETWORK_ERROR' || appError.code === 'TIMEOUT') {
        addToast(
          `❌ Push to Zoho failed: Server is unreachable. Please try again or contact your administrator.`,
          'error'
        );
      } else {
        addToast(`❌ Failed to push to Zoho Books: ${errorMsg}`, 'error');
      }
    } finally {
      setPushingExpenseId(null);
    }
  };

  const handleEntityChange = async (expense: Expense, entity: string) => {
    // Warn if changing entity on an already-pushed expense
    const wasPushed = expense.zohoExpenseId || pushedExpenses.has(expense.id);
    const isChangingEntity = expense.zohoEntity && expense.zohoEntity !== entity;

    if (wasPushed && isChangingEntity) {
      const confirmed = window.confirm(
        buildEntityChangeConfirmation(expense.zohoEntity, entity)
      );
      if (!confirmed) {
        return;
      }
    }

    try {
      await api.updateExpense(expense.id, {
        zoho_entity: entity,
      });

      // Remove from pushedExpenses set to allow re-push
      if (expense.zohoEntity !== entity) {
        setPushedExpenses((prev) => {
          const newSet = new Set(prev);
          newSet.delete(expense.id);
          return newSet;
        });
      }

      addToast(`✅ Entity changed to ${entity}`, 'success');
      await reloadData();
    } catch (error) {
      console.error('Failed to change entity:', error);
      addToast('❌ Failed to change entity. Please try again.', 'error');
    }
  };

  const isExpensePushed = (expense: Expense) => {
    return !!(expense.zohoExpenseId || pushedExpenses.has(expense.id));
  };

  const isExpensePushing = (expenseId: string) => {
    return pushingExpenseId === expenseId;
  };

  return {
    pushingExpenseId,
    pushedExpenses,
    handlePushToZoho,
    handleEntityChange,
    isExpensePushed,
    isExpensePushing,
  };
}


import React, { useState, useEffect } from 'react';
import { User, Expense } from '../../App';
import { ExpenseForm } from './ExpenseForm';
import { ReceiptUpload } from './ReceiptUpload';
import { ApprovalCards } from './ApprovalCards';
import { api } from '../../utils/api';
import { getTodayLocalDateString, formatForDateInput } from '../../utils/dateUtils';
import { useExpenses } from './ExpenseSubmission/hooks/useExpenses';
import { useExpenseFilters } from './ExpenseSubmission/hooks/useExpenseFilters';
import { usePendingSync } from './ExpenseSubmission/hooks/usePendingSync';
import { ReceiptData, AuditTrailEntry, ExpenseEditFormData, OcrV2Data, AppError } from '../../types/types';
import { useToast, ToastContainer } from '../common/Toast';
import { sendOCRCorrection } from '../../utils/ocrCorrections';
import {
  buildExpenseDeleteConfirmation,
  buildReimbursementConfirmation,
  buildMarkAsPaidConfirmation,
  buildEntityChangeConfirmation,
  expenseToApiPayload,
} from '../../utils/expenseUtils';
import {
  prepareOcrCorrectionData,
  trackOcrCorrections,
} from '../../utils/ocrUtils';

// ✅ REFACTORED: Imported extracted components
import {
  ExpenseModalHeader,
  ExpenseModalFooter,
  ExpenseModalReceipt,
  ExpenseModalAuditTrail,
  ExpenseModalDuplicateWarning,
  ExpenseModalDetailsView,
  ExpenseModalDetailsEdit,
  ExpenseModalStatusManagement,
} from './ExpenseModal';
import {
  ExpenseSubmissionHeader,
  ExpenseSubmissionEmptyState,
  ExpenseSubmissionTable,
  PendingSyncModal,
} from './ExpenseSubmission/index';

interface ExpenseSubmissionProps {
  user: User;
}

export const ExpenseSubmission: React.FC<ExpenseSubmissionProps> = ({ user }) => {
  // Check if user has approval permissions
  const hasApprovalPermission = ['admin', 'accountant', 'developer'].includes(user.role);
  
  // Use custom hooks (enhanced with approval data when needed)
  const { expenses, events, users, entityOptions, reload: reloadData } = useExpenses({ 
    hasApprovalPermission 
  });
  const { pendingCount } = usePendingSync();
  const {
    dateFilter, setDateFilter,
    eventFilter, setEventFilter,
    categoryFilter, setCategoryFilter,
    merchantFilter, setMerchantFilter,
    cardFilter, setCardFilter,
    statusFilter, setStatusFilter,
    reimbursementFilter, setReimbursementFilter,
    sortBy, setSortBy,
    filteredExpenses,
    hasActiveFilters,
    uniqueCategories,
    uniqueCards,
    clearAllFilters
  } = useExpenseFilters(expenses);

  // UI state
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showReceiptUpload, setShowReceiptUpload] = useState(false);
  const [pendingReceiptFile, setPendingReceiptFile] = useState<File | null>(null);
  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null);
  const [showPendingSync, setShowPendingSync] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Approval-specific state (only used when hasApprovalPermission is true)
  const [pushingExpenseId, setPushingExpenseId] = useState<string | null>(null);
  const [pushedExpenses, setPushedExpenses] = useState<Set<string>>(new Set());

  // OCR correction tracking
  const [ocrV2Data, setOcrV2Data] = useState<OcrV2Data | null>(null);

  // Audit trail
  const [auditTrail, setAuditTrail] = useState<AuditTrailEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Inline editing in modal
  const [isEditingExpense, setIsEditingExpense] = useState(false);
  const [editFormData, setEditFormData] = useState<ExpenseEditFormData | null>(null);

  // Toast notifications
  const { toasts, addToast, removeToast } = useToast();

  // Update pushedExpenses set when expenses data changes
  useEffect(() => {
    if (hasApprovalPermission) {
      const pushed = new Set(expenses.filter(e => e.zohoExpenseId).map(e => e.id));
      setPushedExpenses(pushed);
    }
  }, [expenses, hasApprovalPermission]);

  // Fetch audit trail when viewing expense (accountant/admin/developer only)
  const fetchAuditTrail = async (expenseId: string) => {
    if (!hasApprovalPermission) return;
    
    setLoadingAudit(true);
    try {
      const response = await fetch(`/api/expenses/${expenseId}/audit`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const trail = data.auditTrail || [];
        setAuditTrail(trail);
        // Audit trail loaded
      } else {
        console.error('[Audit] Failed to fetch audit trail');
        setAuditTrail([]);
      }
    } catch (error) {
      console.error('[Audit] Error fetching audit trail:', error);
      setAuditTrail([]);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleSaveExpense = async (expenseData: Omit<Expense, 'id'>, file?: File, ocrDataOverride?: OcrV2Data) => {
    // Prevent duplicate submissions
    if (isSaving) {
      console.log('[ExpenseSubmission] Already saving, ignoring duplicate submission');
      return;
    }

    setIsSaving(true);

    try {
      console.log('[ExpenseSubmission] Saving expense...', { isEdit: !!editingExpense, hasFile: !!file });
      
      if (api.USE_SERVER) {
        let expenseId: string | null = null;
        const apiPayload = expenseToApiPayload(expenseData);
        
        if (editingExpense) {
          console.log('[ExpenseSubmission] Updating expense:', editingExpense.id);
          await api.updateExpense(editingExpense.id, apiPayload, file || undefined);
          expenseId = editingExpense.id;
          console.log('[ExpenseSubmission] Expense updated successfully');
          addToast('✅ Expense updated successfully!', 'success');
        } else {
          console.log('[ExpenseSubmission] Creating new expense');
          const newExpense = await api.createExpense(
            { ...apiPayload, zoho_entity: expenseData.zohoEntity || undefined },
            file || pendingReceiptFile || undefined
          );
          expenseId = newExpense.id;
          console.log('[ExpenseSubmission] Expense created successfully with ID:', expenseId);
          addToast('✅ Expense saved successfully!', 'success');
        }

        // Track OCR corrections if OCR v2 data exists (use passed data or state)
        const ocrDataToUse: OcrV2Data | null = ocrDataOverride || ocrV2Data;
        if (ocrDataToUse) {
          await trackOcrCorrections(ocrDataToUse, expenseData, expenseId, sendOCRCorrection);
        }

        // Clear OCR data after processing if we used the override
        if (ocrDataOverride) {
          setOcrV2Data(null);
        }
        
        setPendingReceiptFile(null);
        
        console.log('[ExpenseSubmission] Refreshing expense list...');
        await reloadData();
        console.log('[ExpenseSubmission] Expense list refreshed');
      } else {
        const newExpense: Expense = {
          ...expenseData,
          id: editingExpense?.id || Date.now().toString(),
          userId: user.id
        };
        const updatedExpenses = editingExpense
          ? expenses.map(expense => expense.id === editingExpense.id ? newExpense : expense)
          : [...expenses, newExpense];
        localStorage.setItem('tradeshow_expenses', JSON.stringify(updatedExpenses));
        addToast(`✅ Expense ${editingExpense ? 'updated' : 'saved'} successfully!`, 'success');
      }
      
      // Close the form
      console.log('[ExpenseSubmission] Closing form');
      setShowForm(false);
      setEditingExpense(null);
    } catch (error) {
      console.error('[ExpenseSubmission] Error saving expense:', error);
      addToast('❌ Failed to save expense. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };


  // Start inline editing in the modal
  const startInlineEdit = (expense: Expense) => {
    setIsEditingExpense(true);
    setEditFormData({
      tradeShowId: expense.tradeShowId || '',
      amount: expense.amount || 0,
      category: expense.category || '',
      merchant: expense.merchant || '',
      date: expense.date ? formatForDateInput(expense.date) : getTodayLocalDateString(),
      description: expense.description || '',
      cardUsed: expense.cardUsed || '',
      location: expense.location || '',
      reimbursementRequired: expense.reimbursementRequired || false,
      zohoEntity: expense.zohoEntity || '',
    });
  };

  // Cancel inline editing
  const cancelInlineEdit = () => {
    setIsEditingExpense(false);
    setEditFormData(null);
  };

  // Save inline edits
  const saveInlineEdit = async () => {
    if (!viewingExpense || !editFormData) return;

    setIsSaving(true);
    try {
      // Convert camelCase to snake_case for backend
      const response = await fetch(`/api/expenses/${viewingExpense.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          event_id: editFormData.tradeShowId,
          amount: editFormData.amount,
          category: editFormData.category,
          merchant: editFormData.merchant,
          date: editFormData.date,
          description: editFormData.description,
          card_used: editFormData.cardUsed,
          location: editFormData.location,
          reimbursement_required: editFormData.reimbursementRequired,
          userId: user.id
        })
      });

      if (!response.ok) throw new Error('Failed to update expense');

          const updatedExpense = await response.json() as Expense;
      
      // Update the viewing expense
      setViewingExpense(updatedExpense);
      
      // Reload data to refresh the list
      await reloadData();
      
      // Refresh audit trail
      await fetchAuditTrail(viewingExpense.id);
      
      // Exit edit mode
      setIsEditingExpense(false);
      setEditFormData(null);
      
      addToast('✅ Expense updated successfully', 'success');
    } catch (error) {
      console.error('[ExpenseSubmission] Error updating expense:', error);
      addToast('❌ Failed to update expense. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle receipt upload in edit mode
  const handleReceiptUpload = async (file: File) => {
    if (!viewingExpense) return;

    try {
      // Use dedicated receipt update endpoint for better transaction safety
      const updatedExpense = await api.updateExpenseReceipt(viewingExpense.id, file) as Expense;
      
      // Update the viewing expense with the new receipt URL
      setViewingExpense(updatedExpense);
      
      // Reload data to refresh the list
      await reloadData();
      
      // Refresh audit trail
      await fetchAuditTrail(viewingExpense.id);
      
      addToast('✅ Receipt uploaded successfully!', 'success');
    } catch (error) {
      console.error('[ExpenseSubmission] Error uploading receipt:', error);
      throw error; // Re-throw to let component handle error display
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    const expense = expenses.find(e => e.id === expenseId);
    if (!expense) return;
    
    const userName = expense.user_name || users.find(u => u.id === expense.userId)?.name || 'Unknown User';
    const event = events.find(e => e.id === expense.tradeShowId);
    
    const confirmed = window.confirm(
      buildExpenseDeleteConfirmation(expense, userName, event?.name)
    );
    
    if (!confirmed) return;
    
    try {
      if (api.USE_SERVER) {
        await api.deleteExpense(expenseId);
        addToast('✅ Expense deleted successfully', 'success');
      } else {
        const updatedExpenses = expenses.filter(expense => expense.id !== expenseId);
        localStorage.setItem('tradeshow_expenses', JSON.stringify(updatedExpenses));
      }
      setPendingReceiptFile(null);
      await reloadData();
    } catch (error) {
      console.error('[ExpenseSubmission] Error deleting expense:', error);
      addToast('❌ Failed to delete expense', 'error');
    }
  };

  const handleReceiptProcessed = async (receiptData: ReceiptData, file: File) => {
    setIsSaving(true);
    
    // Prepare OCR v2 data for correction tracking (but don't rely on state)
    const ocrDataForCorrections = prepareOcrCorrectionData(receiptData);

    // Save expense directly with all fields from ReceiptUpload
    const expenseData: Omit<Expense, 'id'> = {
      userId: user.id,
      tradeShowId: receiptData.tradeShowId || '',
      amount: receiptData.total || 0,
      category: receiptData.category || 'Other',
      merchant: receiptData.merchant || '',
      date: receiptData.date || getTodayLocalDateString(),
      description: receiptData.description || '',
      cardUsed: receiptData.cardUsed || '',
      status: 'pending',
      location: receiptData.location || '',
      ocrText: receiptData.ocrText || '',
      reimbursementRequired: false,
      extractedData: {
        total: receiptData.total || 0,
        category: receiptData.category || 'Other',
        merchant: receiptData.merchant || '',
        date: receiptData.date || getTodayLocalDateString(),
        location: receiptData.location || ''
      },
      zohoEntity: receiptData.zohoEntity || undefined  // Auto-populated from card selection
    };

        // Save and wait for completion before closing - pass OCR data directly
        await handleSaveExpense(expenseData, file, ocrDataForCorrections || undefined);
    setIsSaving(false);
    setShowReceiptUpload(false);
  };

  // === REIMBURSEMENT HANDLERS (Only used when hasApprovalPermission is true) ===
  // NOTE: Manual expense approval removed - status now auto-updates based on:
  //       1. Reimbursement status changes (pending review → approved/rejected)
  //       2. Entity assignment

  const handleReimbursementApproval = async (expense: Expense, status: 'approved' | 'rejected') => {
    // Confirmation before changing reimbursement status
    const confirmed = window.confirm(buildReimbursementConfirmation(expense, status));
    
    if (!confirmed) return;
    
    try {
      if (api.USE_SERVER) {
        await api.setExpenseReimbursement(expense.id, { reimbursement_status: status });
        addToast(`✅ Reimbursement ${status}!`, 'success');
      }
      await reloadData();
    } catch (error) {
      console.error('Error updating reimbursement:', error);
      addToast('❌ Failed to update reimbursement status. Please try again.', 'error');
    }
  };

  const handleMarkAsPaid = async (expense: Expense) => {
    // Confirmation before marking as paid
    const userName = users.find(u => u.id === expense.userId)?.name || 'Unknown';
    const confirmed = window.confirm(buildMarkAsPaidConfirmation(expense, userName));
    
    if (!confirmed) return;
    
    try {
      if (api.USE_SERVER) {
        await api.setExpenseReimbursement(expense.id, { reimbursement_status: 'paid' });
        addToast(`✅ Reimbursement marked as paid!`, 'success');
      }
      await reloadData();
    } catch (error) {
      console.error('Error marking reimbursement as paid:', error);
      addToast('❌ Failed to mark reimbursement as paid. Please try again.', 'error');
    }
  };

  const handleAssignEntity = async (expense: Expense, entity: string) => {
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

    console.log(`[Entity Assignment] Starting: Expense ${expense.id} → "${entity}"`);

    try {
      if (api.USE_SERVER) {
        const updatedExpense = await api.assignEntity(expense.id, { zoho_entity: entity }) as Expense;
        console.log(`[Entity Assignment] Response:`, updatedExpense);
        
        // Verify entity was actually updated
        if (updatedExpense.zohoEntity !== entity) {
          console.error(`[Entity Assignment] MISMATCH: Expected "${entity}", got "${updatedExpense.zohoEntity}"`);
          addToast('⚠️ Entity may not have been updated. Please refresh and try again.', 'warning');
          return;
        }
        
        console.log(`[Entity Assignment] SUCCESS: Entity is now "${updatedExpense.zohoEntity}"`);
      }

      // Remove from pushedExpenses set to allow re-push
      if (expense.zohoEntity !== entity) {
        setPushedExpenses(prev => {
          const newSet = new Set(prev);
          newSet.delete(expense.id);
          return newSet;
        });
      }

      console.log(`[Entity Assignment] Reloading data...`);
      await reloadData();
      console.log(`[Entity Assignment] Data reloaded`);
      
      if (expense.zohoExpenseId) {
        addToast('✅ Entity changed. You can now push to the new entity.', 'success');
      } else {
        addToast('✅ Entity assigned!', 'success');
      }
    } catch (error) {
      console.error('[Entity Assignment] Failed:', error);
      addToast('❌ Failed to assign entity. Please try again.', 'error');
    }
  };

  const handlePushToZoho = async (expense: Expense) => {
    if (!expense.zohoEntity) {
      addToast('⚠️ No entity assigned to this expense. Please assign an entity first.', 'warning');
      return;
    }

    if (expense.zohoExpenseId || pushedExpenses.has(expense.id)) {
      return; // Already pushed
    }

    console.log(`[Push to Zoho] Starting push for expense ${expense.id} to entity "${expense.zohoEntity}"`);
    console.log(`[Push to Zoho] Current user:`, user);
    
    setPushingExpenseId(expense.id);
    try {
      await api.pushToZoho(expense.id);
      setPushedExpenses(prev => new Set(prev).add(expense.id));
      addToast(`✅ Expense successfully pushed to ${expense.zohoEntity} Zoho Books!`, 'success');
      await reloadData();
    } catch (error) {
      const appError = error as AppError & { response?: { status?: number; statusText?: string; data?: unknown } };
      console.error('[Push to Zoho] Failed:', appError);
      console.error('[Push to Zoho] Error details:', {
        status: appError.response?.status,
        statusText: appError.response?.statusText,
        data: appError.response?.data,
        message: appError.message
      });
      
      const errorMsg = (appError.response?.data as { error?: string })?.error || appError.message || 'Unknown error';
      
      if (errorMsg.includes('does not have Zoho Books integration configured')) {
        addToast(
          `🕐 Zoho Books integration for "${expense.zohoEntity}" is coming soon. Please try again later or add manually.`,
          'info'
        );
      } else {
        addToast(`❌ Failed to push to Zoho Books: ${errorMsg}`, 'error');
      }
    } finally {
      setPushingExpenseId(null);
    }
  };

  // Apply user permission filter to hook's filtered results (sorting already handled by hook)
  const finalFilteredExpenses = filteredExpenses
    .filter(expense => {
      // User permission filter:
      // - Users with approval permission see ALL expenses
      // - Regular users see only their own expenses
      return hasApprovalPermission || expense.userId === user.id;
    });

  if (showForm) {
    return (
      <>
        <ExpenseForm
          expense={editingExpense}
          events={events}
          user={user}
          onSave={handleSaveExpense}
          onCancel={() => {
            setShowForm(false);
            setEditingExpense(null);
          }}
          isSaving={isSaving}
        />
        <ToastContainer toasts={toasts} removeToast={removeToast} />
      </>
    );
  }

  if (showReceiptUpload) {
    return (
      <>
        <ReceiptUpload
          user={user}
          events={events}
          onReceiptProcessed={handleReceiptProcessed}
          onCancel={() => setShowReceiptUpload(false)}
          isSaving={isSaving}
        />
        <ToastContainer toasts={toasts} removeToast={removeToast} />
      </>
    );
  }

  return (
    <div className="space-y-3">
      <ExpenseSubmissionHeader
        hasApprovalPermission={hasApprovalPermission}
        hasActiveFilters={hasActiveFilters}
        pendingCount={pendingCount}
        onClearFilters={clearAllFilters}
        onShowPendingSync={() => setShowPendingSync(true)}
        onAddExpense={() => setShowReceiptUpload(true)}
      />

      {/* Approval Workflow Cards (Only visible to admin/accountant/developer) */}
      {hasApprovalPermission && <ApprovalCards expenses={expenses} />}

      {/* Expenses Table */}
      {finalFilteredExpenses.length === 0 ? (
        <ExpenseSubmissionEmptyState
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearAllFilters}
          onAddExpense={() => setShowReceiptUpload(true)}
        />
      ) : (
        <ExpenseSubmissionTable
          expenses={expenses}
          filteredExpenses={finalFilteredExpenses}
          events={events}
          users={users}
          hasApprovalPermission={hasApprovalPermission}
          entityOptions={entityOptions}
          pushingExpenseId={pushingExpenseId}
          pushedExpenses={pushedExpenses}
          showFilters={showFilters}
          setShowFilters={setShowFilters}
          dateFilter={dateFilter}
          setDateFilter={setDateFilter}
          eventFilter={eventFilter}
          setEventFilter={setEventFilter}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          merchantFilter={merchantFilter}
          setMerchantFilter={setMerchantFilter}
          cardFilter={cardFilter}
          setCardFilter={setCardFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          reimbursementFilter={reimbursementFilter}
          setReimbursementFilter={setReimbursementFilter}
          sortBy={sortBy}
          setSortBy={setSortBy}
          uniqueCategories={uniqueCategories}
          uniqueCards={uniqueCards}
          onReimbursementApproval={handleReimbursementApproval}
          onMarkAsPaid={handleMarkAsPaid}
          onAssignEntity={handleAssignEntity}
          onPushToZoho={handlePushToZoho}
          onViewExpense={(exp) => {
            setViewingExpense(exp);
            fetchAuditTrail(exp.id);
          }}
          onDeleteExpense={handleDeleteExpense}
          currentUserId={user.id}
        />
      )}

      {/* ✅ REFACTORED: Expense Details Modal with 8 sub-components */}
      {viewingExpense && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            
            <ExpenseModalHeader
              eventName={events.find(e => e.id === viewingExpense.tradeShowId)?.name}
              onClose={() => {
                setViewingExpense(null);
                setIsEditingExpense(false);
                setEditFormData(null);
              }}
            />

            {/* Content */}
            <div className="p-6 space-y-6">
              {viewingExpense.duplicateCheck && (
                <ExpenseModalDuplicateWarning duplicateCheck={viewingExpense.duplicateCheck} />
              )}

              {/* ✅ REFACTORED: Replaced 190 lines with 2 simplified components */}
              {!isEditingExpense ? (
                <ExpenseModalDetailsView expense={viewingExpense} />
              ) : (
                editFormData && (
                  <ExpenseModalDetailsEdit
                    formData={{
                      date: editFormData.date,
                      amount: editFormData.amount,
                      category: editFormData.category,
                      merchant: editFormData.merchant,
                      cardUsed: editFormData.cardUsed,
                      location: editFormData.location || '',
                      description: editFormData.description || '',
                      reimbursementRequired: editFormData.reimbursementRequired,
                    }}
                    onChange={(updates) => {
                      if (editFormData) {
                        setEditFormData({ ...editFormData, ...updates });
                      }
                    }}
                    uniqueCategories={uniqueCategories}
                    uniqueCards={uniqueCards}
                    onCancel={cancelInlineEdit}
                    onSave={saveInlineEdit}
                    receiptUrl={viewingExpense.receiptUrl}
                    onReceiptUpload={handleReceiptUpload}
                  />
                )
              )}

              {/* ✅ REFACTORED: Replaced 198 lines with ExpenseModalStatusManagement */}
              <ExpenseModalStatusManagement
                expense={viewingExpense}
                hasApprovalPermission={hasApprovalPermission}
                entityOptions={entityOptions}
                auditTrail={auditTrail}
                onReimbursementStatusChange={async (newStatus) => {
                  if (newStatus === 'paid') {
                    await handleMarkAsPaid(viewingExpense);
                  } else if (newStatus === 'approved' || newStatus === 'rejected') {
                    await handleReimbursementApproval(viewingExpense, newStatus);
                  }
                }}
                onEntityChange={async (newEntity) => {
                  await handleAssignEntity(viewingExpense, newEntity);
                }}
              />

              {/* ✅ REFACTORED: Replaced 27 lines with ExpenseModalReceipt */}
              <ExpenseModalReceipt
                receiptUrl={viewingExpense.receiptUrl || ''}
              />

              {/* ✅ REFACTORED: Replaced 110 lines with ExpenseModalAuditTrail */}
              <ExpenseModalAuditTrail
                hasApprovalPermission={hasApprovalPermission}
                loadingAudit={loadingAudit}
                auditTrail={auditTrail}
              />
            </div>

            {/* ✅ REFACTORED: Replaced 50 lines with ExpenseModalFooter */}
            <ExpenseModalFooter
              isEditingExpense={isEditingExpense}
              isSaving={isSaving}
              expenseId={viewingExpense.id}
              onClose={() => {
                setViewingExpense(null);
                setIsEditingExpense(false);
                setEditFormData(null);
              }}
              onEdit={() => startInlineEdit(viewingExpense)}
              onCancel={cancelInlineEdit}
              onSave={saveInlineEdit}
              onDownloadPDF={async (expenseId: string) => {
                try {
                  await api.downloadExpensePDF(expenseId);
                  addToast('✅ Expense PDF downloaded successfully!', 'success');
                } catch (error) {
                  console.error('[ExpenseSubmission] Error downloading PDF:', error);
                  const errorMessage = error instanceof Error ? error.message : 'Failed to download expense PDF';
                  addToast(`❌ ${errorMessage}`, 'error');
                }
              }}
            />
          </div>
        </div>
      )}

      <PendingSyncModal
        user={user}
        isOpen={showPendingSync}
        onClose={() => setShowPendingSync(false)}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
};

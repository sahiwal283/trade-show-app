import React, { useEffect, useMemo } from 'react';
import { Download, Filter, Calendar, DollarSign, TrendingUp, Building2, CheckCircle, X, ArrowLeft } from 'lucide-react';
import { User, Expense } from '../../App';
import { ExpenseChart } from './ExpenseChart';
import { EntityBreakdown } from './EntityBreakdown';
import { DetailedReport } from './DetailedReport';
import { AccountantDashboard } from '../accountant/AccountantDashboard';
import { api } from '../../utils/api';
import { useReportsData } from './hooks/useReportsData';
import { useReportsFilters } from './hooks/useReportsFilters';
import { getTodayLocalDateString } from '../../utils/dateUtils';
import { useReportsStats } from './hooks/useReportsStats';
import { calculateCategoryAverages, calculateTradeShowBreakdown } from '../../utils/reportUtils';

interface ReportsProps {
  user: User;
}

export const Reports: React.FC<ReportsProps> = ({ user }) => {
  // Access control: Only admin and accountant can access reports
  if (user.role === 'coordinator' || user.role === 'salesperson') {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
          <p className="text-red-700">
            Access denied. {user.role === 'coordinator' ? 'Coordinators' : 'Salespeople'} do not have access to reports.
          </p>
        </div>
      </div>
    );
  }

  // Check URL hash for initial event selection (e.g., #event=123)
  const getInitialEvent = () => {
    const hash = window.location.hash;
    if (hash.startsWith('#event=')) {
      return hash.replace('#event=', '');
    }
    return 'all';
  };

  // Use custom hooks
  const { expenses, events, entityOptions: activeEntityOptions, setExpenses } = useReportsData();
  const {
    selectedEvent,
    setSelectedEvent,
    selectedPeriod,
    setSelectedPeriod,
    selectedEntity,
    setSelectedEntity,
    reportType,
    setReportType,
    showFilterModal,
    setShowFilterModal
  } = useReportsFilters({
    initialEvent: getInitialEvent(),
    initialReportType: getInitialEvent() !== 'all' ? 'detailed' : 'overview'
  });
  const { filteredExpenses, reportStats, entityTotals } = useReportsStats({
    expenses,
    selectedEvent,
    selectedPeriod,
    selectedEntity,
    entityOptions: activeEntityOptions
  });

  const handleTradeShowClick = (eventId: string) => {
    setSelectedEvent(eventId);
    setReportType('detailed');
    // Scroll to detailed report
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const handleEntityClick = (entity: string) => {
    setSelectedEntity(entity);
    setReportType('detailed');
    // Scroll to detailed report
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  // Watch for hash changes to auto-select event
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#event=')) {
        const eventId = hash.replace('#event=', '');
        setSelectedEvent(eventId);
        setReportType('detailed');
      }
    };
    
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleUpdateExpense = async (updatedExpense: Expense) => {
    // Future: call API to update expense; for now refresh list from server
    if (api.USE_SERVER) {
      const refreshed = await api.getExpenses();
      setExpenses(Array.isArray(refreshed) ? refreshed : []);
    } else {
      const updatedExpenses = expenses.map(expense => expense.id === updatedExpense.id ? updatedExpense : expense);
      setExpenses(updatedExpenses);
      localStorage.setItem('tradeshow_expenses', JSON.stringify(updatedExpenses));
    }
  };

  const handleReimbursementApproval = (expense: Expense, status: 'approved' | 'rejected') => {
    const updatedExpense = { ...expense, reimbursementStatus: status };
    handleUpdateExpense(updatedExpense);
  };

  // Calculate trade show breakdown for a specific entity (component-specific logic)
  const tradeShowBreakdown = useMemo(() => {
    if (selectedEntity === 'all') return [];
    
    const totals: Record<string, { eventId: string; amount: number; name: string }> = {};
    filteredExpenses.forEach(expense => {
      if (expense.zohoEntity === selectedEntity && expense.tradeShowId) {
        const event = events.find(e => e.id === expense.tradeShowId);
        if (event) {
          if (!totals[expense.tradeShowId]) {
            totals[expense.tradeShowId] = { eventId: expense.tradeShowId, amount: 0, name: event.name };
          }
          totals[expense.tradeShowId].amount += expense.amount;
        }
      }
    });
    return Object.values(totals).sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses, selectedEntity, events]);

  const handleExportCSV = () => {
    const csvContent = [
      ['Date', 'Event', 'Merchant', 'Category', 'Amount', 'Status', 'Entity', 'Location'],
      ...filteredExpenses.map(expense => [
        expense.date,
        events.find(e => e.id === expense.tradeShowId)?.name || 'N/A',
        expense.merchant,
        expense.category,
        expense.amount.toString(),
        expense.status,
        expense.zohoEntity || 'N/A',
        expense.location || 'N/A'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expense-report-${getTodayLocalDateString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const entities = useMemo(
    () => Array.from(new Set(expenses.map(e => e.zohoEntity).filter(Boolean))),
    [expenses]
  );

  // Computed once per filter change instead of 3x inline in JSX below.
  const unassignedExpenses = useMemo(
    () => filteredExpenses.filter(e => !e.zohoEntity),
    [filteredExpenses]
  );
  const unassignedTotal = useMemo(
    () => unassignedExpenses.reduce((sum, e) => sum + e.amount, 0),
    [unassignedExpenses]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold tracking-tight text-gray-900">Reports & Analytics</h1>
          <p className="mt-1 text-sm text-gray-500">
            Analyze expenses and generate comprehensive reports
            <span className="ml-3 text-sm text-gray-500">
              • {filteredExpenses.length} expenses found
              <span className="ml-3 font-semibold text-gray-700">
                • Total: ${reportStats.totalAmount.toLocaleString()}
              </span>
            </span>
          </p>
        </div>
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <button
            onClick={() => setShowFilterModal(true)}
            className="btn-secondary min-h-[44px] flex-1 sm:flex-initial"
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="btn-primary min-h-[44px] flex-1 px-4 sm:flex-initial sm:px-5 md:px-6"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Trade Show Header Banner */}
      {selectedEvent !== 'all' && (
        <div className="rounded-card bg-gradient-to-r from-brand-600 to-accent-600 p-3 shadow-brand-lg sm:p-4 md:p-5 lg:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
            <div className="flex items-center space-x-2 sm:space-x-3 md:space-x-4">
              <button
                onClick={() => {
                  setSelectedEvent('all');
                  setReportType('overview');
                }}
                className="group flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 ring-1 ring-inset ring-white/30 transition-all duration-200 hover:bg-white/30 focus-visible:ring-2 focus-visible:ring-white/80"
                title="Back to Overview"
              >
                <ArrowLeft className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
              </button>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70 mb-1">Viewing Trade Show</p>
                <h2 className="font-display text-xl md:text-2xl font-bold tracking-tight text-white">
                  {events.find(e => e.id === selectedEvent)?.name || 'Unknown Event'}
                </h2>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70 mb-1">Total Expenses</p>
              <p className="font-display text-2xl sm:text-3xl font-bold tracking-tight tabular-nums text-white">
                ${filteredExpenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Entity Header Banner */}
      {selectedEntity !== 'all' && (
        <div className="rounded-card bg-gradient-to-r from-brand-700 to-brand-500 p-3 shadow-brand-lg sm:p-4 md:p-5 lg:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
            <div className="flex items-center space-x-2 sm:space-x-3 md:space-x-4">
              <button
                onClick={() => {
                  setSelectedEntity('all');
                  setReportType('overview');
                }}
                className="group flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 ring-1 ring-inset ring-white/30 transition-all duration-200 hover:bg-white/30 focus-visible:ring-2 focus-visible:ring-white/80"
                title="Back to Overview"
              >
                <ArrowLeft className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
              </button>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70 mb-1">Viewing Entity</p>
                <h2 className="font-display text-xl md:text-2xl font-bold tracking-tight text-white">
                  {selectedEntity}
                </h2>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70 mb-1">Total Expenses</p>
              <p className="font-display text-2xl sm:text-3xl font-bold tracking-tight tabular-nums text-white">
                ${filteredExpenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Trade Show Breakdown - Show when viewing specific entity */}
      {tradeShowBreakdown.length > 0 && selectedEntity !== 'all' && selectedEvent === 'all' && (
        <div className="card p-3 sm:p-4">
          <div className="flex items-center space-x-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="card-title">Trade Show Breakdown</h3>
              <p className="text-xs text-gray-500">Entity expenses by trade show • Click to view details</p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3">
            {tradeShowBreakdown.map(({ eventId, name, amount }) => (
              <div 
                key={eventId}
                onClick={() => handleTradeShowClick(eventId)}
                onKeyPress={(e) => e.key === 'Enter' && handleTradeShowClick(eventId)}
                role="button"
                tabIndex={0}
                className="group min-w-[200px] max-w-full flex-shrink-0 cursor-pointer rounded-lg border border-gray-200/80 bg-white p-3 shadow-elevation-1 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-elevation-2 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1 truncate" title={name}>
                      {name}
                    </p>
                    <p className="font-display text-lg font-bold tracking-tight tabular-nums text-gray-900">
                      ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div className="ml-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
                    <Calendar className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entity Totals Dashboard - Show when not filtering by entity */}
      {entityTotals.length > 0 && selectedEntity === 'all' && (
        <div className="card p-3 sm:p-4">
          <div className="flex items-center space-x-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600 ring-1 ring-inset ring-purple-100">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="card-title">Entity Running Totals</h3>
              <p className="text-xs text-gray-500">For selected filters • Click to view details</p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3">
            {entityTotals.map(({ entity, amount }) => (
              <div 
                key={entity}
                onClick={() => handleEntityClick(entity)}
                onKeyPress={(e) => e.key === 'Enter' && handleEntityClick(entity)}
                role="button"
                tabIndex={0}
                className="group min-w-[200px] max-w-full flex-shrink-0 cursor-pointer rounded-lg border border-gray-200/80 bg-white p-3 shadow-elevation-1 transition-all duration-200 hover:-translate-y-0.5 hover:border-purple-300 hover:shadow-elevation-2 focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1 truncate" title={entity}>
                      {entity}
                    </p>
                    <p className="font-display text-lg font-bold tracking-tight tabular-nums text-gray-900">
                      ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div className="ml-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600 ring-1 ring-inset ring-purple-100">
                    <DollarSign className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {unassignedExpenses.length > 0 && (
            <div className="mt-3 rounded-lg border-l-4 border-amber-400 bg-amber-50 p-2.5 ring-1 ring-inset ring-amber-200/60">
              <div className="flex items-center gap-2">
                <span className="chip-dot bg-amber-500" />
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">{unassignedExpenses.length} expenses</span> in current view have no entity assigned (
                  <span className="font-semibold tabular-nums">${unassignedTotal.toLocaleString()}</span>)
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Report Content */}
      {reportType === 'overview' && (
        <ExpenseChart 
          expenses={filteredExpenses} 
          events={events}
          categoryBreakdown={reportStats.categoryBreakdown}
          onTradeShowClick={handleTradeShowClick}
        />
      )}
      
      {reportType === 'entity' && (
        <EntityBreakdown 
          expenses={filteredExpenses}
          events={events}
        />
      )}
      
      {reportType === 'detailed' && (
        <DetailedReport 
          expenses={filteredExpenses}
          events={events}
          onReimbursementApproval={user.role === 'accountant' ? handleReimbursementApproval : undefined}
        />
      )}

      {/* Category Averages Across Trade Shows */}
      {selectedEvent === 'all' && events.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center space-x-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold tracking-tight text-gray-900">Category Averages Across Trade Shows</h3>
              <p className="text-sm text-gray-500">Average spending per category based on {events.length} trade show{events.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          {(() => {
            // Calculate category totals per trade show
            const tradeShowCategoryTotals: Record<string, Record<string, number>> = {};
            
            filteredExpenses.forEach(expense => {
              if (!expense.tradeShowId) return;
              
              if (!tradeShowCategoryTotals[expense.tradeShowId]) {
                tradeShowCategoryTotals[expense.tradeShowId] = {};
              }
              
              if (!tradeShowCategoryTotals[expense.tradeShowId][expense.category]) {
                tradeShowCategoryTotals[expense.tradeShowId][expense.category] = 0;
              }
              
              tradeShowCategoryTotals[expense.tradeShowId][expense.category] += expense.amount;
            });

            // Calculate averages per category
            const categoryAverages: Record<string, { total: number; count: number; average: number }> = {};
            
            Object.values(tradeShowCategoryTotals).forEach(tradeShowCategories => {
              Object.entries(tradeShowCategories).forEach(([category, amount]) => {
                if (!categoryAverages[category]) {
                  categoryAverages[category] = { total: 0, count: 0, average: 0 };
                }
                categoryAverages[category].total += amount;
                categoryAverages[category].count += 1;
              });
            });

            // Calculate final averages and sort by average amount (descending)
            const sortedAverages = Object.entries(categoryAverages)
              .map(([category, data]) => ({
                category,
                total: data.total,
                count: data.count,
                average: data.total / data.count
              }))
              .sort((a, b) => b.average - a.average);

            if (sortedAverages.length === 0) {
              return (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <TrendingUp className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500 text-sm">No category data available for the selected filters</p>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedAverages.map(({ category, total, count, average }) => (
                  <div 
                    key={category}
                    className="rounded-lg border border-gray-200/80 bg-white p-4 shadow-elevation-1 transition-shadow duration-200 hover:shadow-elevation-2"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-900 flex-1 pr-2">
                        {category}
                      </h4>
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100">
                        <TrendingUp className="w-4 h-4" />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Average per Trade Show</p>
                        <p className="font-display text-2xl font-bold tracking-tight tabular-nums text-amber-600">
                          ${average.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      
                      <div className="pt-2 border-t border-gray-200">
                        <div className="flex items-center justify-between text-xs text-gray-600">
                          <span>Total Spent:</span>
                          <span className="font-semibold">${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-600 mt-1">
                          <span>Trade Shows:</span>
                          <span className="font-semibold">{count} of {events.length}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Filter Modal */}
      {showFilterModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="modal-sheet-h w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-xl rounded-b-none bg-white shadow-elevation-3 sm:rounded-xl">
            {/* Modal Header */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex flex-row items-center justify-between gap-3 sticky top-0 z-10 bg-white rounded-t-xl">
              <div className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
                  <Filter className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold tracking-tight text-gray-900">Filter Reports</h3>
                  <p className="text-sm text-gray-500">Customize your report view</p>
                </div>
              </div>
              <button
                onClick={() => setShowFilterModal(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:h-8 sm:w-8"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-6">
              <div className="space-y-6">
                {/* Event Filter */}
                <div>
                  <label className="field-label">
                    Event / Trade Show
                  </label>
                  <select
                    value={selectedEvent}
                    onChange={(e) => setSelectedEvent(e.target.value)}
                    className="input-field px-4 py-3"
                  >
                    <option value="all">All Events</option>
                    {events.map(event => (
                      <option key={event.id} value={event.id}>{event.name}</option>
                    ))}
                  </select>
                </div>

                {/* Period Filter */}
                <div>
                  <label className="field-label">
                    Time Period
                  </label>
                  <select
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="input-field px-4 py-3"
                  >
                    <option value="all">All Time</option>
                    <option value="week">Last Week</option>
                    <option value="month">Last Month</option>
                    <option value="quarter">Last Quarter</option>
                  </select>
                </div>

                {/* Entity Filter */}
                <div>
                  <label className="field-label">
                    Zoho Entity
                  </label>
                  <select
                    value={selectedEntity}
                    onChange={(e) => setSelectedEntity(e.target.value)}
                    className="input-field px-4 py-3"
                  >
                    <option value="all">All Entities</option>
                    {entities.map(entity => (
                      <option key={entity} value={entity}>{entity}</option>
                    ))}
                  </select>
                </div>

                {/* Report Type */}
                <div>
                  <label className="field-label">
                    Report Type
                  </label>
                  <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value as any)}
                    className="input-field px-4 py-3"
                  >
                    <option value="overview">Overview</option>
                    <option value="detailed">Detailed</option>
                    <option value="entity">By Entity</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Modal Actions — pinned on phones so Apply stays above the home indicator */}
            <div className="sticky bottom-0 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:px-6 sm:py-4 sm:pb-4 bg-gray-50 rounded-b-none sm:rounded-b-xl flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 border-t border-gray-200">
              <button
                onClick={() => {
                  setSelectedEvent('all');
                  setSelectedPeriod('all');
                  setSelectedEntity('all');
                  setReportType('overview');
                }}
                className="btn-ghost min-h-[44px] w-full sm:w-auto"
              >
                Clear All
              </button>
              <button
                onClick={() => setShowFilterModal(false)}
                className="btn-primary w-full px-6 py-2 sm:w-auto"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
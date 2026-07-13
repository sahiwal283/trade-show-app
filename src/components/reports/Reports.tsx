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
          <h1 className="text-xl md:text-xl sm:text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-600 mt-1">
            Analyze expenses and generate comprehensive reports
            <span className="ml-3 text-sm text-gray-500">
              • {filteredExpenses.length} expenses found
              <span className="ml-3 font-semibold text-gray-700">
                • Total: ${reportStats.totalAmount.toLocaleString()}
              </span>
            </span>
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowFilterModal(true)}
            className="bg-white border border-gray-300 text-gray-700 px-3 sm:px-4 py-2 min-h-[44px] rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center space-x-2"
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="bg-gradient-to-r from-blue-500 to-emerald-500 text-white px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 min-h-[44px] rounded-lg font-medium hover:from-blue-600 hover:to-emerald-600 transition-all duration-200 flex items-center space-x-2"
          >
            <Download className="w-5 h-5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Trade Show Header Banner */}
      {selectedEvent !== 'all' && (
        <div className="bg-gradient-to-r from-blue-500 to-emerald-500 rounded-xl shadow-lg border border-blue-600 p-3 sm:p-4 md:p-5 lg:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
            <div className="flex items-center space-x-2 sm:space-x-3 md:space-x-4">
              <button
                onClick={() => {
                  setSelectedEvent('all');
                  setReportType('overview');
                }}
                className="w-10 h-10 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg flex items-center justify-center transition-all duration-200 group"
                title="Back to Overview"
              >
                <ArrowLeft className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
              </button>
              <div>
                <p className="text-white text-opacity-90 text-sm font-medium mb-1">Viewing Trade Show</p>
                <h2 className="text-xl md:text-xl sm:text-2xl font-bold text-white">
                  {events.find(e => e.id === selectedEvent)?.name || 'Unknown Event'}
                </h2>
              </div>
            </div>
            <div className="text-right">
              <p className="text-white text-opacity-90 text-sm font-medium mb-1">Total Expenses</p>
              <p className="text-2xl sm:text-3xl font-bold text-white">
                ${filteredExpenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Entity Header Banner */}
      {selectedEntity !== 'all' && (
        <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl shadow-lg border border-purple-700 p-3 sm:p-4 md:p-5 lg:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
            <div className="flex items-center space-x-2 sm:space-x-3 md:space-x-4">
              <button
                onClick={() => {
                  setSelectedEntity('all');
                  setReportType('overview');
                }}
                className="w-10 h-10 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg flex items-center justify-center transition-all duration-200 group"
                title="Back to Overview"
              >
                <ArrowLeft className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
              </button>
              <div>
                <p className="text-white text-opacity-90 text-sm font-medium mb-1">Viewing Entity</p>
                <h2 className="text-xl md:text-xl sm:text-2xl font-bold text-white">
                  {selectedEntity}
                </h2>
              </div>
            </div>
            <div className="text-right">
              <p className="text-white text-opacity-90 text-sm font-medium mb-1">Total Expenses</p>
              <p className="text-2xl sm:text-3xl font-bold text-white">
                ${filteredExpenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Trade Show Breakdown - Show when viewing specific entity */}
      {tradeShowBreakdown.length > 0 && selectedEntity !== 'all' && selectedEvent === 'all' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4">
          <div className="flex items-center space-x-2 mb-4">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-lg flex items-center justify-center">
              <Calendar className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Trade Show Breakdown</h3>
              <p className="text-xs text-gray-600">Entity expenses by trade show • Click to view details</p>
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
                className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3 border border-gray-200 hover:shadow-lg hover:scale-105 hover:border-blue-300 transition-all duration-200 min-w-[200px] flex-shrink-0 cursor-pointer"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-600 mb-1 truncate" title={name}>
                      {name}
                    </p>
                    <p className="text-lg font-bold text-gray-900">
                      ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center ml-2 flex-shrink-0">
                    <Calendar className="w-3 h-3 text-blue-600" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entity Totals Dashboard - Show when not filtering by entity */}
      {entityTotals.length > 0 && selectedEntity === 'all' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4">
          <div className="flex items-center space-x-2 mb-4">
            <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Entity Running Totals</h3>
              <p className="text-xs text-gray-600">For selected filters • Click to view details</p>
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
                className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3 border border-gray-200 hover:shadow-lg hover:scale-105 hover:border-purple-300 transition-all duration-200 min-w-[200px] flex-shrink-0 cursor-pointer"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-600 mb-1 truncate" title={entity}>
                      {entity}
                    </p>
                    <p className="text-lg font-bold text-gray-900">
                      ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center ml-2 flex-shrink-0">
                    <DollarSign className="w-3 h-3 text-purple-600" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {unassignedExpenses.length > 0 && (
            <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-bold">!</span>
                </div>
                <p className="text-xs text-yellow-800">
                  <span className="font-semibold">{unassignedExpenses.length} expenses</span> in current view have no entity assigned (${unassignedTotal.toLocaleString()})
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-r from-amber-500 to-orange-500 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Category Averages Across Trade Shows</h3>
              <p className="text-sm text-gray-600">Average spending per category based on {events.length} trade show{events.length !== 1 ? 's' : ''}</p>
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
                    className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200 hover:shadow-md transition-all duration-200"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-900 flex-1 pr-2">
                        {category}
                      </h4>
                      <div className="w-8 h-8 bg-gradient-to-br from-amber-100 to-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <TrendingUp className="w-4 h-4 text-amber-600" />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs text-gray-600 mb-0.5">Average per Trade Show</p>
                        <p className="text-2xl font-bold text-amber-600">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 sticky top-0 bg-white rounded-t-xl">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                  <Filter className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Filter Reports</h3>
                  <p className="text-sm text-gray-600">Customize your report view</p>
                </div>
              </div>
              <button
                onClick={() => setShowFilterModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <div className="space-y-6">
                {/* Event Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Event / Trade Show
                  </label>
                  <select
                    value={selectedEvent}
                    onChange={(e) => setSelectedEvent(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Events</option>
                    {events.map(event => (
                      <option key={event.id} value={event.id}>{event.name}</option>
                    ))}
                  </select>
                </div>

                {/* Period Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Time Period
                  </label>
                  <select
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Time</option>
                    <option value="week">Last Week</option>
                    <option value="month">Last Month</option>
                    <option value="quarter">Last Quarter</option>
                  </select>
                </div>

                {/* Entity Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Zoho Entity
                  </label>
                  <select
                    value={selectedEntity}
                    onChange={(e) => setSelectedEntity(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Entities</option>
                    {entities.map(entity => (
                      <option key={entity} value={entity}>{entity}</option>
                    ))}
                  </select>
                </div>

                {/* Report Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Report Type
                  </label>
                  <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value as any)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="overview">Overview</option>
                    <option value="detailed">Detailed</option>
                    <option value="entity">By Entity</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-4 bg-gray-50 rounded-b-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 border-t border-gray-200">
              <button
                onClick={() => {
                  setSelectedEvent('all');
                  setSelectedPeriod('all');
                  setSelectedEntity('all');
                  setReportType('overview');
                }}
                className="px-3 sm:px-4 py-2 min-h-[44px] text-gray-600 rounded-lg font-medium hover:bg-gray-100 transition-colors"
              >
                Clear All
              </button>
              <button
                onClick={() => setShowFilterModal(false)}
                className="px-6 py-2 bg-gradient-to-r from-blue-500 to-emerald-500 text-white rounded-lg font-medium hover:from-blue-600 hover:to-emerald-600 transition-all duration-200"
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
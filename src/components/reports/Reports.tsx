import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Filter,
  Calendar,
  TrendingUp,
  Building2,
  X,
  ArrowLeft,
  Users,
  BarChart3,
  ScatterChart,
  PieChart,
  Table2,
} from 'lucide-react';
import { User, Expense } from '../../App';
import { ExpenseChart } from './ExpenseChart';
import { EntityBreakdown } from './EntityBreakdown';
import { DetailedReport } from './DetailedReport';
import { WhoPaidBreakdown } from './WhoPaidBreakdown';
import { EntityCategoryMatrix } from './EntityCategoryMatrix';
import { CollapsibleCard } from './CollapsibleCard';
import { ShowComparison } from './ShowComparison';
import { useShowSummaries } from './hooks/useShowSummaries';
import { useCrmLeads, useCrmLeadOwners } from './hooks/useCrmLeads';
import { LeadPerformance } from './LeadPerformance';
import { RoiVerdictBand } from './RoiVerdictBand';
import { ShowLeagueTable } from './ShowLeagueTable';
import { RoiQuadrant } from './RoiQuadrant';
import { buildRoiModel } from './roiData';
import { buildInsights } from './insightNarrative';
import { api } from '../../utils/api';
import { useReportsData } from './hooks/useReportsData';
import { useReportsFilters } from './hooks/useReportsFilters';
import { getTodayLocalDateString } from '../../utils/dateUtils';
import { useReportsStats } from './hooks/useReportsStats';
import {
  calculateCategoryAverages,
  calculateTradeShowBreakdown,
  buildEntityColorMap,
} from '../../utils/reportUtils';
import { useEscapeKey } from '../../hooks/useEscapeKey';

interface ReportsProps {
  user: User;
}

type ReportsTab = 'roi' | 'analytics';

export const Reports: React.FC<ReportsProps> = ({ user }) => {
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
    selectedCategories,
    setSelectedCategories,
    toggleCategory,
    reportType,
    setReportType,
    showFilterModal,
    setShowFilterModal,
  } = useReportsFilters({
    initialEvent: getInitialEvent(),
    initialReportType: getInitialEvent() !== 'all' ? 'detailed' : 'overview',
  });
  const { baseExpenses, filteredExpenses, reportStats, entityTotals } = useReportsStats({
    expenses,
    selectedEvent,
    selectedPeriod,
    selectedEntity,
    selectedCategories,
    entityOptions: activeEntityOptions,
  });

  // The overview splits into two pages: "ROI" (decision layer) and
  // "Analytics" (lead performance + the books). Shareable via #analytics.
  const [activeTab, setActiveTab] = useState<ReportsTab>(() =>
    typeof window !== 'undefined' && window.location.hash === '#analytics' ? 'analytics' : 'roi'
  );
  const selectTab = (tab: ReportsTab) => {
    setActiveTab(tab);
    const base = window.location.pathname + window.location.search;
    window.history.replaceState(null, '', tab === 'analytics' ? `${base}#analytics` : base);
  };

  // Aggregate show totals: imported 2025 history + live data (investment view)
  const { rows: summaryRows } = useShowSummaries();
  const { rows: crmLeadRows } = useCrmLeads();
  const { rows: crmOwnerRows } = useCrmLeadOwners();

  // Joined ROI decision model: cost × CRM leads per (show_key, year).
  // Feeds the verdict band, league table, quadrant, and narrative.
  const roiModel = useMemo(
    () => buildRoiModel(summaryRows, crmLeadRows),
    [summaryRows, crmLeadRows]
  );
  const insights = useMemo(() => buildInsights(roiModel), [roiModel]);
  // The verdict band already narrates insights[0]; the aside continues from
  // there so no sentence appears twice on the page.
  const asideInsights = insights.slice(1);

  // Any drill-down (event, entity, or a non-overview report type) takes over
  // the page exactly as before — the ROI/Analytics tabs are an overview split.
  const isDrilldown =
    selectedEvent !== 'all' || selectedEntity !== 'all' || reportType !== 'overview';
  const hasRoiData = summaryRows.length > 0;
  const showTabs = !isDrilldown && hasRoiData;
  const effectiveTab: ReportsTab = showTabs ? activeTab : 'analytics';

  // Stable entity → color assignment shared by the donut, stacked bars, matrix,
  // and the investment comparison (historical companies included)
  const { colorMap: entityColorMap, entityOrder } = useMemo(() => {
    const base = buildEntityColorMap(activeEntityOptions, expenses);
    const extra = Array.from(new Set(summaryRows.map((r) => r.company))).filter(
      (c) => !(c in base.colorMap)
    );
    extra.forEach((c, i) => {
      base.colorMap[c] = ['#4a3aa7', '#e34948', '#eda100'][i % 3];
      base.entityOrder.splice(base.entityOrder.length - 1, 0, c);
    });
    return base;
  }, [activeEntityOptions, expenses, summaryRows]);

  const availableCategories = useMemo(
    () => Array.from(new Set(baseExpenses.map((e) => e.category))).sort(),
    [baseExpenses]
  );

  // Escape closes the filter sheet (standard dialog escape route)
  useEscapeKey(() => setShowFilterModal(false), showFilterModal);

  const handleTradeShowClick = (eventId: string) => {
    setSelectedEvent(eventId);
    setReportType('detailed');
    // Start at the top: banner, entity totals, and the Who Paid donut
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleEntityClick = (entity: string) => {
    setSelectedEntity(entity);
    setReportType('detailed');
    // Start at the top: banner, entity totals, and the Who Paid donut
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Watch for hash changes: #event=… deep links and the #analytics tab
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#event=')) {
        const eventId = hash.replace('#event=', '');
        setSelectedEvent(eventId);
        setReportType('detailed');
      } else if (hash === '#analytics') {
        setActiveTab('analytics');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [setSelectedEvent, setReportType]);

  const handleUpdateExpense = async (updatedExpense: Expense) => {
    // Future: call API to update expense; for now refresh list from server
    if (api.USE_SERVER) {
      const refreshed = await api.getExpenses();
      setExpenses(Array.isArray(refreshed) ? refreshed : []);
    } else {
      const updatedExpenses = expenses.map((expense) =>
        expense.id === updatedExpense.id ? updatedExpense : expense
      );
      setExpenses(updatedExpenses);
      localStorage.setItem('tradeshow_expenses', JSON.stringify(updatedExpenses));
    }
  };

  const handleReimbursementApproval = (expense: Expense, status: 'approved' | 'rejected') => {
    const updatedExpense = { ...expense, reimbursementStatus: status };
    handleUpdateExpense(updatedExpense);
  };

  // Calculate trade show breakdown for a specific entity
  const tradeShowBreakdown = useMemo(
    () => calculateTradeShowBreakdown(filteredExpenses, events, selectedEntity),
    [filteredExpenses, selectedEntity, events]
  );

  const handleExportCSV = () => {
    const csvContent = [
      ['Date', 'Event', 'Merchant', 'Category', 'Amount', 'Status', 'Entity', 'Location'],
      ...filteredExpenses.map((expense) => [
        expense.date,
        events.find((e) => e.id === expense.tradeShowId)?.name || 'N/A',
        expense.merchant,
        expense.category,
        expense.amount.toString(),
        expense.status,
        expense.zohoEntity || 'N/A',
        expense.location || 'N/A',
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expense-report-${getTodayLocalDateString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const entities = useMemo(
    () => Array.from(new Set(expenses.map((e) => e.zohoEntity).filter(Boolean))),
    [expenses]
  );

  // Computed once per filter change instead of 3x inline in JSX below.
  const unassignedExpenses = useMemo(
    () => filteredExpenses.filter((e) => !e.zohoEntity),
    [filteredExpenses]
  );
  const unassignedTotal = useMemo(
    () => unassignedExpenses.reduce((sum, e) => sum + e.amount, 0),
    [unassignedExpenses]
  );

  // Access control — ALLOWLIST, matching the nav gates exactly. The old
  // denylist only named coordinator/salesperson, so temporary (and any
  // future role) fell through to full report access.
  // (After the hooks so React's hook order stays stable across renders.)
  if (!['admin', 'accountant', 'developer'].includes(user.role)) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
          <p className="text-red-700">Access denied. Your role does not have access to reports.</p>
        </div>
      </div>
    );
  }

  /* ===== Shared blocks (used by the Analytics tab and drill-down views) ===== */

  // Entity Running Totals — a grid that fills the row (no dead right half)
  const entityTotalsBlock = entityTotals.length > 0 && selectedEntity === 'all' && (
    <div className="card p-3 sm:p-4">
      <div className="flex items-center space-x-2 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
          <Building2 className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
            Entity Running Totals
          </h3>
          <p className="text-xs text-stone-500">For selected filters • Click to view details</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {entityTotals.map(({ entity, amount }) => (
          <div
            key={entity}
            onClick={() => handleEntityClick(entity)}
            onKeyDown={(e) => e.key === 'Enter' && handleEntityClick(entity)}
            role="button"
            tabIndex={0}
            className="group w-full cursor-pointer rounded-lg border border-stone-200/80 bg-white p-4 shadow-elevation-1 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-elevation-2 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 truncate"
              title={entity}
            >
              {entity}
            </p>
            <p className="mt-1 font-display text-xl font-bold tracking-tight tabular-nums text-stone-900 sm:text-2xl md:text-3xl">
              $
              {amount.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </p>
          </div>
        ))}
      </div>

      {unassignedExpenses.length > 0 && (
        <div className="mt-3 rounded-lg border-l-4 border-amber-400 bg-amber-50 p-2.5 ring-1 ring-inset ring-amber-200/60">
          <div className="flex items-center gap-2">
            <span className="chip-dot bg-amber-500" />
            <p className="text-xs text-amber-800">
              <span className="font-semibold">{unassignedExpenses.length} expenses</span> in current
              view have no entity assigned (
              <span className="font-semibold tabular-nums">${unassignedTotal.toLocaleString()}</span>
              )
            </p>
          </div>
        </div>
      )}
    </div>
  );

  // Selecting categories pulls the matching transactions in below Who Paid
  const categoryTransactions = selectedCategories.length > 0 && (
    <DetailedReport
      expenses={filteredExpenses}
      events={events}
      showCategoryChart={false}
      onReimbursementApproval={
        user.role === 'accountant' ? handleReimbursementApproval : undefined
      }
    />
  );

  const categoryAveragesCard = selectedEvent === 'all' && events.length > 0 && (
    <CollapsibleCard
      title="Category Averages Across Trade Shows"
      subtitle={`Average spending per category based on ${events.length} trade show${events.length !== 1 ? 's' : ''}`}
      icon={TrendingUp}
      iconClassName="bg-amber-50 text-amber-600 ring-amber-100"
    >
      {(() => {
        const sortedAverages = calculateCategoryAverages(filteredExpenses, events);

        if (sortedAverages.length === 0) {
          return (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-8 h-8 text-stone-400" />
              </div>
              <p className="text-stone-500 text-sm">
                No category data available for the selected filters
              </p>
            </div>
          );
        }

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedAverages.map(({ category, total, count, average }) => (
              <div
                key={category}
                className="rounded-lg border border-stone-200/80 bg-white p-4 shadow-elevation-1 transition-shadow duration-200 hover:shadow-elevation-2"
              >
                <div className="flex items-start justify-between mb-3">
                  <h4 className="text-sm font-semibold text-stone-900 flex-1 pr-2">{category}</h4>
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 mb-0.5">
                      Average per Trade Show
                    </p>
                    <p className="font-display text-2xl font-bold tracking-tight tabular-nums text-amber-600">
                      $
                      {average.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-stone-200">
                    <div className="flex items-center justify-between text-xs text-stone-600">
                      <span>Total Spent:</span>
                      <span className="font-semibold">
                        $
                        {total.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-stone-600 mt-1">
                      <span>Trade Shows:</span>
                      <span className="font-semibold">
                        {count} of {events.length}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}
    </CollapsibleCard>
  );

  /* ===== Tab content ===== */

  // ROI — the decision view: verdict, ranking, then the supporting evidence
  const roiTabContent = hasRoiData && (
    <div>
      <RoiVerdictBand model={roiModel} topInsight={insights[0] ?? null} />

      <section aria-labelledby="zone-decide-title" className="mt-8 md:mt-10">
        <div className="mb-3">
          <p className="micro-label">Decide</p>
          <h2
            id="zone-decide-title"
            className="mt-0.5 font-display text-lg font-bold tracking-tight text-stone-900"
          >
            Which shows earn their spot
          </h2>
        </div>
        <div className="grid grid-cols-1 items-start gap-4 md:gap-5 xl:grid-cols-3">
          <div className={`min-w-0 ${asideInsights.length > 0 ? 'xl:col-span-2' : 'xl:col-span-3'}`}>
            <ShowLeagueTable
              ranked={roiModel.ranked}
              needsData={roiModel.needsData}
              hasLeadData={roiModel.hasLeadData}
              onOpenShow={handleTradeShowClick}
            />
          </div>
          {asideInsights.length > 0 && (
            <aside aria-label="What this means" className="card p-4 sm:p-5 xl:sticky xl:top-4">
              <h3 className="micro-label">What this means</h3>
              <ul className="mt-3 space-y-3">
                {asideInsights.map((sentence) => (
                  <li key={sentence} className="flex gap-2.5 text-sm leading-relaxed text-stone-600">
                    <span
                      aria-hidden="true"
                      className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400"
                    />
                    <span>{sentence}</span>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      </section>

      <section aria-labelledby="zone-explore-title" className="mt-8 md:mt-10">
        <div className="mb-3">
          <p className="micro-label">Explore</p>
          <h2
            id="zone-explore-title"
            className="mt-0.5 font-display text-lg font-bold tracking-tight text-stone-900"
          >
            Behind the ranking
          </h2>
        </div>
        <div className="space-y-4">
          {roiModel.ranked.length > 0 && (
            <CollapsibleCard
              title="Cost vs revenue"
              subtitle="Each bubble is a show-year — above the dashed line makes money"
              icon={ScatterChart}
              iconClassName="bg-accent-50 text-accent-700 ring-accent-100"
            >
              <RoiQuadrant rows={roiModel.ranked} />
            </CollapsibleCard>
          )}

          <CollapsibleCard
            title="Trade Show Investment"
            subtitle="What each show costs the business, with PDF / Excel exports"
            icon={BarChart3}
            iconClassName="bg-brand-50 text-brand-600 ring-brand-100"
          >
            <ShowComparison
              rows={summaryRows}
              entityColorMap={entityColorMap}
              entityOrder={entityOrder}
              leads={crmLeadRows}
              onOpenShow={handleTradeShowClick}
            />
          </CollapsibleCard>
        </div>
      </section>
    </div>
  );

  // Analytics — lead performance, then the quieter accounting views
  const analyticsTabContent = (
    <div>
      {crmLeadRows.length > 0 && (
        <section aria-labelledby="zone-pipeline-title">
          <div className="mb-3">
            <p className="micro-label">Pipeline</p>
            <h2
              id="zone-pipeline-title"
              className="mt-0.5 font-display text-lg font-bold tracking-tight text-stone-900"
            >
              What the shows produced
            </h2>
          </div>
          <CollapsibleCard
            title="Lead Performance"
            subtitle="Leads captured at each show, rep leaderboard, and email engagement"
            icon={Users}
            iconClassName="bg-brand-50 text-brand-600 ring-brand-100"
          >
            <LeadPerformance
              leadRows={crmLeadRows}
              ownerRows={crmOwnerRows}
              costRows={summaryRows}
            />
          </CollapsibleCard>
        </section>
      )}

      <section
        aria-labelledby="zone-books-title"
        className={crmLeadRows.length > 0 ? 'mt-8 md:mt-10' : undefined}
      >
        <div className="mb-3">
          <p className="micro-label">Books</p>
          <h2
            id="zone-books-title"
            className="mt-0.5 font-display text-lg font-bold tracking-tight text-stone-900"
          >
            Where the money went
          </h2>
        </div>
        <div className="space-y-4">
          {entityTotalsBlock}

          <CollapsibleCard
            title="Who Paid for What"
            subtitle="Each bar is split by paying company • Click categories to filter transactions"
            icon={PieChart}
            iconClassName="bg-brand-50 text-brand-600 ring-brand-100"
          >
            <WhoPaidBreakdown
              embedded
              baseExpenses={baseExpenses}
              filteredExpenses={filteredExpenses}
              entityColorMap={entityColorMap}
              entityOrder={entityOrder}
              selectedCategories={selectedCategories}
              onToggleCategory={toggleCategory}
              onClearCategories={() => setSelectedCategories([])}
            />
          </CollapsibleCard>

          {categoryTransactions}

          <CollapsibleCard
            title="Category × Company Summary"
            subtitle="Exact amounts per paying company • For selected filters"
            icon={Table2}
            iconClassName="bg-brand-50 text-brand-600 ring-brand-100"
          >
            <EntityCategoryMatrix
              embedded
              expenses={filteredExpenses}
              entityColorMap={entityColorMap}
              entityOrder={entityOrder}
            />
          </CollapsibleCard>

          <ExpenseChart expenses={filteredExpenses} />

          {categoryAveragesCard}
        </div>
      </section>
    </div>
  );

  /* ===== Drill-down (event / entity / detailed / by-entity) — unchanged flow ===== */

  const drilldownContent = (
    <>
      {/* Trade Show Header Banner */}
      {selectedEvent !== 'all' && (
        <div className="relative overflow-hidden rounded-card bg-gradient-to-r from-brand-600 to-accent-600 p-3 shadow-brand-lg sm:p-4 md:p-5 lg:p-6">
          <div aria-hidden="true" className="bg-grid-white pointer-events-none absolute inset-0" />
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
                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70 mb-1">
                  Viewing Trade Show
                </p>
                <h2 className="font-display text-xl md:text-2xl font-bold tracking-tight text-white">
                  {events.find((e) => e.id === selectedEvent)?.name || 'Unknown Event'}
                </h2>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70 mb-1">
                Total Expenses
              </p>
              <p className="font-display text-2xl sm:text-3xl font-bold tracking-tight tabular-nums text-white">
                ${filteredExpenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Entity Header Banner */}
      {selectedEntity !== 'all' && (
        <div className="relative overflow-hidden rounded-card bg-gradient-to-r from-brand-700 to-brand-500 p-3 shadow-brand-lg sm:p-4 md:p-5 lg:p-6">
          <div aria-hidden="true" className="bg-grid-white pointer-events-none absolute inset-0" />
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
                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70 mb-1">
                  Viewing Entity
                </p>
                <h2 className="font-display text-xl md:text-2xl font-bold tracking-tight text-white">
                  {selectedEntity}
                </h2>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70 mb-1">
                Total Expenses
              </p>
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
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                Trade Show Breakdown
              </h3>
              <p className="text-xs text-stone-500">
                Entity expenses by trade show • Click to view details
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tradeShowBreakdown.map(({ eventId, name, amount }) => (
              <div
                key={eventId}
                onClick={() => handleTradeShowClick(eventId)}
                onKeyDown={(e) => e.key === 'Enter' && handleTradeShowClick(eventId)}
                role="button"
                tabIndex={0}
                className="group w-full cursor-pointer rounded-lg border border-stone-200/80 bg-white p-4 shadow-elevation-1 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-elevation-2 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 mb-1 truncate"
                      title={name}
                    >
                      {name}
                    </p>
                    <p className="font-display text-2xl font-bold tracking-tight tabular-nums text-stone-900">
                      $
                      {amount.toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  </div>
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
                    <Calendar className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entity totals (event drill-down keeps the click-through tiles) */}
      {entityTotalsBlock}

      {/* Who paid for what — entity split per category, click rows to filter */}
      {reportType !== 'entity' && (
        <>
          <WhoPaidBreakdown
            baseExpenses={baseExpenses}
            filteredExpenses={filteredExpenses}
            entityColorMap={entityColorMap}
            entityOrder={entityOrder}
            selectedCategories={selectedCategories}
            onToggleCategory={toggleCategory}
            onClearCategories={() => setSelectedCategories([])}
          />

          {/* Accountant's pivot: exact amounts per category per company */}
          <EntityCategoryMatrix
            expenses={filteredExpenses}
            entityColorMap={entityColorMap}
            entityOrder={entityOrder}
          />
        </>
      )}

      {/* Report Content */}
      {reportType === 'overview' && (
        <>
          <ExpenseChart expenses={filteredExpenses} />
          {categoryTransactions}
        </>
      )}

      {reportType === 'entity' && <EntityBreakdown expenses={filteredExpenses} events={events} />}

      {reportType === 'detailed' && (
        <DetailedReport
          expenses={filteredExpenses}
          events={events}
          showCategoryChart={false}
          onReimbursementApproval={
            user.role === 'accountant' ? handleReimbursementApproval : undefined
          }
        />
      )}

      {/* Category Averages Across Trade Shows — collapsed by default on phones */}
      {categoryAveragesCard}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
            Trade show expenses
          </p>
          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-stone-900">
            Reports & Analytics
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Analyze expenses and generate comprehensive reports
            <span className="ml-3 text-sm text-stone-500">
              • {filteredExpenses.length} expenses found
              <span className="ml-3 font-semibold text-stone-700">
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

      {/* Active category filters — every number on the page respects these */}
      {selectedCategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.15em] text-stone-400">
            Showing only:
          </span>
          {selectedCategories.map((category) => (
            <button
              key={category}
              onClick={() => toggleCategory(category)}
              className="chip inline-flex items-center gap-1.5 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 ring-brand-200/70 transition-colors hover:bg-brand-100"
              title={`Remove ${category} filter`}
            >
              {category}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button
            onClick={() => setSelectedCategories([])}
            className="text-xs font-medium text-stone-500 underline-offset-2 hover:text-stone-700 hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      {isDrilldown ? (
        drilldownContent
      ) : (
        <>
          {/* ROI / Analytics split — the overview in two focused pages */}
          {showTabs && (
            <div className="seg-track">
              <button
                type="button"
                onClick={() => selectTab('roi')}
                className={`seg-tab ${effectiveTab === 'roi' ? 'seg-tab-active' : 'seg-tab-idle'}`}
              >
                ROI
              </button>
              <button
                type="button"
                onClick={() => selectTab('analytics')}
                className={`seg-tab ${effectiveTab === 'analytics' ? 'seg-tab-active' : 'seg-tab-idle'}`}
              >
                Analytics
              </button>
            </div>
          )}

          {effectiveTab === 'roi' ? roiTabContent : analyticsTabContent}
        </>
      )}

      {/* Filter Modal */}
      {showFilterModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="modal-sheet-h w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-xl rounded-b-none bg-white shadow-elevation-3 sm:rounded-xl">
            {/* Modal Header */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-stone-200 flex flex-row items-center justify-between gap-3 sticky top-0 z-10 bg-white rounded-t-xl">
              <div className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
                  <Filter className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold tracking-tight text-stone-900">
                    Filter Reports
                  </h3>
                  <p className="text-sm text-stone-500">Customize your report view</p>
                </div>
              </div>
              <button
                onClick={() => setShowFilterModal(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:h-8 sm:w-8"
              >
                <X className="w-5 h-5 text-stone-500" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-6">
              <div className="space-y-6">
                {/* Event Filter */}
                <div>
                  <label className="field-label">Event / Trade Show</label>
                  <select
                    value={selectedEvent}
                    onChange={(e) => setSelectedEvent(e.target.value)}
                    className="input-field px-4 py-3"
                  >
                    <option value="all">All Events</option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Period Filter */}
                <div>
                  <label className="field-label">Time Period</label>
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
                  <label className="field-label">Zoho Entity</label>
                  <select
                    value={selectedEntity}
                    onChange={(e) => setSelectedEntity(e.target.value)}
                    className="input-field px-4 py-3"
                  >
                    <option value="all">All Entities</option>
                    {entities.map((entity) => (
                      <option key={entity} value={entity}>
                        {entity}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category Filter (multi-select) */}
                {availableCategories.length > 0 && (
                  <div>
                    <label className="field-label">
                      Categories
                      <span className="ml-2 font-normal normal-case tracking-normal text-stone-400">
                        {selectedCategories.length === 0
                          ? 'All included'
                          : `${selectedCategories.length} selected`}
                      </span>
                    </label>
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-stone-200 p-2">
                      {availableCategories.map((category) => (
                        <label
                          key={category}
                          className="flex min-h-[36px] cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-stone-700 transition-colors hover:bg-stone-50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedCategories.includes(category)}
                            onChange={() => toggleCategory(category)}
                            className="h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
                          />
                          {category}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Report Type */}
                <div>
                  <label className="field-label">Report Type</label>
                  <select
                    value={reportType}
                    onChange={(e) =>
                      setReportType(e.target.value as 'overview' | 'detailed' | 'entity')
                    }
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
            <div className="sticky bottom-0 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:px-6 sm:py-4 sm:pb-4 bg-stone-50 rounded-b-none sm:rounded-b-xl flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 border-t border-stone-200">
              <button
                onClick={() => {
                  setSelectedEvent('all');
                  setSelectedPeriod('all');
                  setSelectedEntity('all');
                  setSelectedCategories([]);
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

/**
 * useShowDashboard Hook
 *
 * Derives the per-show dashboard story from raw expenses/events/users:
 * which show is the hero, its budget burn, spend-by-day series, category
 * mix, action queue counts, and reimbursement rollup. All data is scoped
 * by role using the same visibility rules as the rest of the app.
 */

import { useMemo } from 'react';
import { Expense, TradeShow, User } from '../../../App';
import { parseLocalDate, getTodayLocalDateString, isToday } from '../../../utils/dateUtils';

export interface SpendPoint {
  date: string;
  label: string;
  total: number;
}

export interface CategoryTotal {
  name: string;
  total: number;
}

export interface ReimbursementShare {
  name: string;
  amount: number;
}

export interface ShowDashboard {
  shows: TradeShow[];
  show: TradeShow | null;
  isLive: boolean;
  dayCurrent: number;
  dayTotal: number;
  spent: number;
  budget: number;
  budgetPct: number;
  dailyPace: number;
  spendByDay: SpendPoint[];
  categories: CategoryTotal[];
  teamCount: number;
  receiptsToday: number;
  ledger: Expense[];
  pendingCount: number;
  ocrReviewCount: number;
  zohoQueueCount: number;
  reimbursementTotal: number;
  reimbursementShares: ReimbursementShare[];
  upNext: TradeShow | null;
  canManage: boolean;
}

interface ShowDashboardInput {
  expenses: Expense[];
  events: TradeShow[];
  users: User[];
  currentUser: User;
  selectedShowId: string | null;
}

const LEDGER_SIZE = 6;
const CATEGORY_LIMIT = 4;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isLiveShow(show: TradeShow, today: Date): boolean {
  if (show.status === 'active') return true;
  const start = parseLocalDate(show.showStartDate || show.startDate);
  const end = parseLocalDate(show.showEndDate || show.endDate);
  return start <= today && today <= end;
}

function resolveUserName(expense: Expense, users: User[]): string {
  if (expense.user_name) return expense.user_name;
  const match = users.find(u => u.id === expense.userId);
  return match ? match.name : 'Unknown';
}

export function useShowDashboard({
  expenses,
  events,
  users,
  currentUser,
  selectedShowId,
}: ShowDashboardInput): ShowDashboard {
  return useMemo(() => {
    const canSeeAllExpenses =
      currentUser.role === 'admin' ||
      currentUser.role === 'developer' ||
      currentUser.role === 'accountant';

    const canSeeAllEvents = canSeeAllExpenses || currentUser.role === 'coordinator';

    const scopedExpenses = canSeeAllExpenses
      ? expenses
      : expenses.filter(e => e.userId === currentUser.id);

    const scopedEvents = canSeeAllEvents
      ? events
      : events.filter(event => event.participants.some(p => p.id === currentUser.id));

    const today = parseLocalDate(getTodayLocalDateString());

    // Order shows: live first, then upcoming (soonest first), then past
    // (most recent first) — this is also the switcher order.
    const shows = [...scopedEvents].sort((a, b) => {
      const aLive = isLiveShow(a, today);
      const bLive = isLiveShow(b, today);
      if (aLive !== bLive) return aLive ? -1 : 1;

      const aStart = parseLocalDate(a.showStartDate || a.startDate);
      const bStart = parseLocalDate(b.showStartDate || b.startDate);
      const aUpcoming = aStart > today;
      const bUpcoming = bStart > today;
      if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
      return aUpcoming
        ? aStart.getTime() - bStart.getTime()
        : bStart.getTime() - aStart.getTime();
    });

    const show = selectedShowId
      ? shows.find(s => s.id === selectedShowId) || shows[0] || null
      : shows[0] || null;

    const isLive = show ? isLiveShow(show, today) : false;

    let dayCurrent = 0;
    let dayTotal = 0;
    if (show) {
      const start = parseLocalDate(show.showStartDate || show.startDate);
      const end = parseLocalDate(show.showEndDate || show.endDate);
      dayTotal = Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1);
      const elapsed = Math.floor((today.getTime() - start.getTime()) / MS_PER_DAY) + 1;
      dayCurrent = Math.min(Math.max(elapsed, 1), dayTotal);
    }

    const showExpenses = show
      ? scopedExpenses.filter(e => e.tradeShowId === show.id)
      : [];

    const countedExpenses = showExpenses.filter(e => e.status !== 'rejected');
    const spent = countedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const budget = show?.budget || 0;
    const budgetPct = budget > 0 ? Math.min(Math.round((spent / budget) * 100), 999) : 0;
    const dailyPace = isLive && dayCurrent > 0 ? spent / dayCurrent : 0;

    // Spend by day: continuous series across the expense date range so quiet
    // days render as real gaps instead of disappearing.
    const byDate = new Map<string, number>();
    for (const e of countedExpenses) {
      const key = e.date.split('T')[0];
      byDate.set(key, (byDate.get(key) || 0) + (e.amount || 0));
    }
    const sortedDates = [...byDate.keys()].sort();
    const spendByDay: SpendPoint[] = [];
    if (sortedDates.length > 0) {
      const first = parseLocalDate(sortedDates[0]);
      const last = parseLocalDate(sortedDates[sortedDates.length - 1]);
      for (let t = first.getTime(); t <= last.getTime(); t += MS_PER_DAY) {
        const d = new Date(t);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        spendByDay.push({
          date: key,
          label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          total: byDate.get(key) || 0,
        });
      }
    }

    // Category mix: top categories, remainder folded into "Other".
    const byCategory = new Map<string, number>();
    for (const e of countedExpenses) {
      const name = e.category || 'Other';
      byCategory.set(name, (byCategory.get(name) || 0) + (e.amount || 0));
    }
    const rankedCategories = [...byCategory.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
    const categories = rankedCategories.slice(0, CATEGORY_LIMIT);
    const remainder = rankedCategories
      .slice(CATEGORY_LIMIT)
      .reduce((sum, c) => sum + c.total, 0);
    if (remainder > 0) {
      const other = categories.find(c => c.name === 'Other');
      if (other) {
        categories[categories.indexOf(other)] = { name: 'Other', total: other.total + remainder };
      } else {
        categories.push({ name: 'Other', total: remainder });
      }
    }

    const teamCount = show?.participants.length || 0;
    const receiptsToday = showExpenses.filter(e => isToday(e.date)).length;

    const ledger = [...showExpenses]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, LEDGER_SIZE);

    const pendingCount = showExpenses.filter(e => e.status === 'pending').length;
    const ocrReviewCount = showExpenses.filter(e => e.status === 'needs further review').length;
    const zohoQueueCount = showExpenses.filter(
      e => e.status === 'approved' && !e.zohoExpenseId
    ).length;

    // Reimbursements owed: required, not yet paid, not rejected.
    const owed = showExpenses.filter(
      e =>
        e.reimbursementRequired &&
        e.status !== 'rejected' &&
        e.reimbursementStatus !== 'paid' &&
        e.reimbursementStatus !== 'rejected'
    );
    const reimbursementTotal = owed.reduce((sum, e) => sum + (e.amount || 0), 0);
    const byPerson = new Map<string, number>();
    for (const e of owed) {
      const name = resolveUserName(e, users);
      byPerson.set(name, (byPerson.get(name) || 0) + (e.amount || 0));
    }
    const reimbursementShares = [...byPerson.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

    const upNext =
      shows.find(
        s =>
          s.id !== show?.id &&
          parseLocalDate(s.showStartDate || s.startDate) > today
      ) || null;

    return {
      shows,
      show,
      isLive,
      dayCurrent,
      dayTotal,
      spent,
      budget,
      budgetPct,
      dailyPace,
      spendByDay,
      categories,
      teamCount,
      receiptsToday,
      ledger,
      pendingCount,
      ocrReviewCount,
      zohoQueueCount,
      reimbursementTotal,
      reimbursementShares,
      upNext,
      canManage: canSeeAllExpenses,
    };
  }, [expenses, events, users, currentUser.id, currentUser.role, selectedShowId]);
}

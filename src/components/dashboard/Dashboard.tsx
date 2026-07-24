/**
 * Dashboard — Editorial Finance layout.
 *
 * Per-show narrative: the active (or next) show is the hero, followed by
 * the spend story, the action queue, and the receipt ledger. Mobile
 * stacks hero → spend → actions → reimbursements → ledger → up next;
 * desktop splits into a 2/1 editorial grid via the `contents` wrappers.
 */

import React, { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { User } from '../../App';
import { InstallPWA } from '../common/InstallPWA';
import { EmptyState } from '../common/EmptyState';
import { useDashboardData } from './hooks/useDashboardData';
import { useShowDashboard } from './hooks/useShowDashboard';
import { ShowHero } from './ShowHero';
import { SpendStoryCard } from './SpendStoryCard';
import { ReceiptLedger } from './ReceiptLedger';
import { ActionQueue } from './ActionQueue';
import { ReimbursementsCard } from './ReimbursementsCard';
import { UpNextCard } from './UpNextCard';
import { MyTravelCard } from './MyTravelCard';

interface DashboardProps {
  user: User;
  onPageChange: (page: string) => void;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onPageChange }) => {
  const { expenses, events, users, loading } = useDashboardData();
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const board = useShowDashboard({
    expenses,
    events,
    users,
    currentUser: user,
    selectedShowId,
  });

  const canCreateShows =
    user.role === 'admin' || user.role === 'developer' || user.role === 'coordinator';

  if (loading) {
    return (
      <div aria-busy="true" aria-label="Loading dashboard" className="animate-pulse space-y-4">
        <div className="h-8 w-2/3 max-w-sm rounded-lg bg-stone-200/70" />
        <div className="h-64 rounded-card bg-stone-200/50" />
        <div className="h-40 rounded-card bg-stone-200/50" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 md:space-y-5">
      {/* Byline: quiet greeting above the masthead */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone-500">
          {greeting()}, <span className="font-semibold text-stone-700">{user.name.split(' ')[0]}</span>
          <span className="text-stone-400">
            {' '}
            · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </p>
        <InstallPWA />
      </div>

      {!board.show ? (
        <div className="card">
          <EmptyState
            icon={CalendarPlus}
            title="No shows on the calendar"
            description={
              canCreateShows
                ? 'Set up your first trade show to start tracking budgets, receipts, and approvals.'
                : "You're not assigned to any trade shows yet. Your coordinator will add you to one."
            }
            action={
              canCreateShows
                ? { label: 'Set up a show', onClick: () => onPageChange('events') }
                : undefined
            }
          />
        </div>
      ) : (
        <>
          <ShowHero
            show={board.show}
            shows={board.shows}
            isLive={board.isLive}
            dayCurrent={board.dayCurrent}
            dayTotal={board.dayTotal}
            onSelectShow={setSelectedShowId}
          />

          <div className="stagger-children flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:items-start lg:gap-5">
            {/* Left column on desktop; `contents` lets mobile order via order-N */}
            <div className="contents lg:col-span-2 lg:block lg:space-y-5">
              <div className="order-2">
                <SpendStoryCard
                  spent={board.spent}
                  budget={board.budget}
                  budgetPct={board.budgetPct}
                  dailyPace={board.dailyPace}
                  isLive={board.isLive}
                  spendByDay={board.spendByDay}
                  categories={board.categories}
                  teamCount={board.teamCount}
                  receiptsToday={board.receiptsToday}
                  showBudget={board.canManage}
                />
              </div>
              <div className="order-5">
                <ReceiptLedger ledger={board.ledger} onPageChange={onPageChange} />
              </div>
            </div>

            {/* Right column on desktop */}
            <div className="contents lg:block lg:space-y-5">
              {/* Travel first on phones: flight/hotel/car is what field staff
                  open the app for at a show */}
              <div className="order-1">
                <MyTravelCard user={user} show={board.show} onPageChange={onPageChange} />
              </div>
              <div className="order-3">
                <ActionQueue
                  canManage={board.canManage}
                  pendingCount={board.pendingCount}
                  ocrReviewCount={board.ocrReviewCount}
                  zohoQueueCount={board.zohoQueueCount}
                  onPageChange={onPageChange}
                />
              </div>
              <div className="order-4">
                <ReimbursementsCard
                  total={board.reimbursementTotal}
                  shares={board.reimbursementShares}
                  canManage={board.canManage}
                />
              </div>
              {board.upNext && (
                <div className="order-6">
                  <UpNextCard show={board.upNext} onPageChange={onPageChange} />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

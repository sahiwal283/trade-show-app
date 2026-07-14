import React from 'react';
import { DollarSign, Calendar, Users, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { User } from '../../App';
import { StatsCard } from './StatsCard';
import { RecentExpenses } from './RecentExpenses';
import { UpcomingEvents } from './UpcomingEvents';
import { BudgetOverview } from './BudgetOverview';
import { QuickActions } from './QuickActions';
import { InstallPWA } from '../common/InstallPWA';
import { useDashboardData } from './hooks/useDashboardData';
import { useDashboardStats } from './hooks/useDashboardStats';

interface DashboardProps {
  user: User;
  onPageChange: (page: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onPageChange }) => {
  // Use custom hooks
  const { expenses, events, users } = useDashboardData();
  const stats = useDashboardStats({ expenses, events, users, currentUser: user });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Welcome Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-500 to-accent-500 text-white shadow-elevation-2 p-5 md:p-8">
        {/* Layered atmosphere: soft light blooms, no images */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -right-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-accent-300/20 blur-3xl" />
        </div>
        <div className="relative flex items-center justify-between gap-6 mb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/70 mb-2">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight mb-2">
              {getGreeting()}, {user.name.split(' ')[0]}!
            </h1>
            <p className="text-sm md:text-base text-blue-50/90 max-w-xl">
              {user.role === 'coordinator' && 'Manage your trade shows and track expenses'}
              {user.role === 'salesperson' && 'Submit your expenses and view your activity'}
              {user.role === 'accountant' && 'Review expenses and manage entity mappings'}
              {user.role === 'admin' && 'Oversee all operations and manage users'}
              {user.role === 'developer' && 'Full system access with dev tools'}
              {user.role === 'temporary' && 'View trade show information and dashboard'}
            </p>
          </div>
          <div className="hidden md:block shrink-0">
            <div className="w-28 h-28 rounded-2xl bg-white/10 ring-1 ring-inset ring-white/20 backdrop-blur-sm flex items-center justify-center rotate-3">
              <Calendar className="w-12 h-12 text-white/90" />
            </div>
          </div>
        </div>
        {/* PWA Install Button */}
        <div className="relative flex justify-start">
          <InstallPWA />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-6">
        <StatsCard
          title={user.role === 'admin' || user.role === 'developer' || user.role === 'accountant' ? 'Total Expenses' : 'My Expenses'}
          value={`$${stats.totalExpenses.toLocaleString()}`}
          icon={DollarSign}
          color="blue"
        />
        <StatsCard
          title={user.role === 'admin' || user.role === 'developer' || user.role === 'accountant' ? 'Pending Approvals' : 'My Pending Approvals'}
          value={stats.pendingExpenses.toString()}
          icon={AlertTriangle}
          color="orange"
        />
        <StatsCard
          title={user.role === 'admin' || user.role === 'developer' || user.role === 'accountant' || user.role === 'coordinator' ? 'Active Events' : 'My Active Events'}
          value={stats.activeEvents.toString()}
          icon={Calendar}
          color="emerald"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">
        <div className="xl:col-span-2 space-y-4 md:space-y-6">
          <RecentExpenses expenses={stats.userExpenses} onPageChange={onPageChange} />
          {(user.role === 'admin' || user.role === 'developer' || user.role === 'accountant') && (
            <BudgetOverview events={stats.userEvents} expenses={stats.userExpenses} />
          )}
        </div>
        <div className="space-y-4 md:space-y-6">
          <UpcomingEvents events={stats.userEvents} onPageChange={onPageChange} />
          
          {/* Pending Tasks / Quick Actions */}
          <QuickActions user={user} onNavigate={onPageChange} />
        </div>
      </div>
    </div>
  );
};
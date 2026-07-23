import React from 'react';
import { Bell, Search, LogOut, Menu } from 'lucide-react';
import { User, Expense } from '../../App';
import { api } from '../../utils/api';
import packageJson from '../../../package.json';

const APP_VERSION = packageJson.version;

interface HeaderProps {
  user: User;
  onLogout: () => void;
  onToggleSidebar: () => void;
  onToggleMobileMenu: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, onLogout, onToggleSidebar, onToggleMobileMenu }) => {
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [hasViewedNotifications, setHasViewedNotifications] = React.useState(false);
  
  // Check for unread notifications
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const [previousNotificationCount, setPreviousNotificationCount] = React.useState(0);
  
  React.useEffect(() => {
    (async () => {
      if (api.USE_SERVER) {
        try {
          const ex = await api.getExpenses();
          const pending = (ex || []).filter((e: Expense) => e.status === 'pending' && (user.role === 'admin' || user.role === 'developer' || user.role === 'accountant' || user.role === 'coordinator'));
          setNotifications(pending);
          
          // Reset viewed flag if new notifications arrive
          if (pending.length > previousNotificationCount) {
            setHasViewedNotifications(false);
          }
          setPreviousNotificationCount(pending.length);
        } catch {
          setNotifications([]);
        }
      } else {
        const expenses = JSON.parse(localStorage.getItem('tradeshow_expenses') || '[]');
        const pendingExpenses = expenses.filter((e: Expense) => e.status === 'pending' && (user.role === 'admin' || user.role === 'developer' || user.role === 'accountant' || user.role === 'coordinator'));
        setNotifications(pendingExpenses);
        
        // Reset viewed flag if new notifications arrive
        if (pendingExpenses.length > previousNotificationCount) {
          setHasViewedNotifications(false);
        }
        setPreviousNotificationCount(pendingExpenses.length);
      }
    })();
  }, [user.role, previousNotificationCount]);

  const hasUnreadNotifications = notifications.length > 0 && !hasViewedNotifications;
  
  const handleNotificationClick = () => {
    setShowNotifications(!showNotifications);
    if (!showNotifications) {
      // Mark as viewed when opening the panel
      setHasViewedNotifications(true);
    }
  };

  return (
    <header className="bg-white/95 backdrop-blur border-b border-stone-200/80 px-3 sm:px-4 md:px-6 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 md:gap-4 flex-1">
          {/* Mobile Menu Button */}
          <button
            onClick={onToggleMobileMenu}
            className="lg:hidden inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 -ml-2 rounded-lg text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors"
            title="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Search - Hidden on small mobile, visible on tablet+ */}
          <div className="relative hidden sm:block flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search expenses, events..."
              className="w-full rounded-lg border border-transparent bg-stone-100 pl-10 pr-4 py-2 text-sm text-stone-900 placeholder-stone-400 transition-all duration-150 hover:bg-stone-200/70 focus:outline-none focus:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
            />
          </div>

          {/* Visible on every size so anyone can read off the running version */}
          <div className="flex shrink-0 items-center px-2.5 py-1 rounded-full border border-stone-200 bg-stone-50">
            <span className="text-[11px] font-medium tracking-wide text-stone-500">v{APP_VERSION}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-3">
          <div className="relative">
            <button
              onClick={handleNotificationClick}
              className="tap-target relative p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
              title="Notifications"
            >
              <Bell className="w-5 h-5" />
              {hasUnreadNotifications && (
                <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60"></span>
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"></span>
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-card shadow-elevation-3 ring-1 ring-stone-900/5 z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                  <h3 className="font-display font-semibold tracking-tight text-stone-900">Notifications</h3>
                  {notifications.length > 0 && (
                    <span className="chip px-2 py-0.5 text-[11px] bg-amber-50 text-amber-800 ring-amber-200/70">
                      <span className="chip-dot bg-amber-500" />
                      {notifications.length} pending
                    </span>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length > 0 ? (
                    notifications.map((expense: Expense, index: number) => (
                      <div key={index} className="px-4 py-3 hover:bg-stone-50 border-b border-stone-50 cursor-pointer transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-stone-900 font-medium truncate">{expense.merchant}</p>
                          <p className="text-sm font-semibold text-stone-900 shrink-0">${expense.amount}</p>
                        </div>
                        <p className="text-xs text-stone-500 mt-0.5">Pending expense approval</p>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-10 text-center">
                      <p className="text-sm font-medium text-stone-600">You're all caught up!</p>
                      <p className="text-xs text-stone-400 mt-1">No new notifications</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User info - Simplified on mobile */}
          <div className="hidden md:flex items-center gap-3 pl-3 border-l border-stone-200">
            <div className="text-right leading-tight">
              <p className="text-sm font-semibold text-stone-900">{user.name}</p>
              <p className="text-xs text-stone-500 capitalize">{user.role}</p>
            </div>
            <div className="w-9 h-9 bg-gradient-to-br from-brand-500 to-accent-500 rounded-full shadow-brand flex items-center justify-center">
              <span className="text-white font-semibold text-sm">
                {user.name.charAt(0)}
              </span>
            </div>
          </div>

          {/* Mobile: Just avatar */}
          <div className="md:hidden w-8 h-8 bg-gradient-to-br from-brand-500 to-accent-500 rounded-full flex items-center justify-center">
            <span className="text-white font-semibold text-sm">
              {user.name.charAt(0)}
            </span>
          </div>

          <button
            onClick={() => {
              // The icon sits in the thumb zone next to the avatar — one
              // accidental tap used to nuke in-progress work with no warning.
              if (window.confirm('Log out of TradeShow?')) onLogout();
            }}
            className="tap-target p-2 text-stone-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Mobile search bar removed: it was never wired to anything and cost
          ~90px of prime screen space on every page. Each list screen has its
          own working search. */}
    </header>
  );
};

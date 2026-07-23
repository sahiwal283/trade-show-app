import React from 'react';
import { LayoutDashboard, Calendar, CheckSquare, BarChart3, Menu, Camera } from 'lucide-react';
import { User } from '../../App';

interface MobileNavProps {
  user: User;
  currentPage: string;
  onNavigate: (page: string) => void;
  /** Jump straight into the receipt-capture expense flow */
  onQuickAdd: () => void;
  /** Open the drawer for secondary destinations (Account, Settings, …) */
  onOpenMenu: () => void;
}

const EXPENSE_ROLES = ['admin', 'coordinator', 'salesperson', 'accountant', 'developer'];
const REPORT_ROLES = ['admin', 'accountant', 'developer'];

interface TabDef {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  user,
  currentPage,
  onNavigate,
  onQuickAdd,
  onOpenMenu,
}) => {
  const canAddExpense = EXPENSE_ROLES.includes(user.role);
  // Accountants/admins live in Reports; field staff live in the Checklist
  const fourthTab: TabDef = REPORT_ROLES.includes(user.role)
    ? { id: 'reports', label: 'Reports', icon: BarChart3 }
    : { id: 'checklist', label: 'Checklist', icon: CheckSquare };

  const leftTabs: TabDef[] = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'events', label: 'Events', icon: Calendar },
  ];
  const rightTabs: TabDef[] = [fourthTab];

  const renderTab = ({ id, label, icon: Icon }: TabDef) => {
    const isActive = currentPage === id;
    return (
      <button
        key={id}
        onClick={() => onNavigate(id)}
        aria-current={isActive ? 'page' : undefined}
        className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
          isActive ? 'text-brand-600' : 'text-stone-400 active:text-stone-600'
        }`}
      >
        <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} />
        <span className={`text-[10px] leading-none ${isActive ? 'font-semibold' : 'font-medium'}`}>
          {label}
        </span>
      </button>
    );
  };

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm lg:hidden"
    >
      <div className="mx-auto flex max-w-md items-stretch px-1">
        {leftTabs.map(renderTab)}

        {canAddExpense && (
          <div className="flex flex-1 items-center justify-center">
            <button
              onClick={onQuickAdd}
              aria-label="Add expense — snap a receipt"
              className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-accent-600 text-white shadow-brand-lg ring-4 ring-stone-50 transition-transform active:scale-95"
            >
              <Camera className="h-6 w-6" />
            </button>
          </div>
        )}

        {rightTabs.map(renderTab)}

        <button
          onClick={onOpenMenu}
          className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-stone-400 transition-colors active:text-stone-600"
        >
          <Menu className="h-5 w-5" strokeWidth={2} />
          <span className="text-[10px] font-medium leading-none">Menu</span>
        </button>
      </div>
    </nav>
  );
};

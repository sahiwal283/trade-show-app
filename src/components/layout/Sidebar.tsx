import React from 'react';
import {
  LayoutDashboard,
  Calendar,
  Receipt,
  UserCircle,
  BarChart3,
  ChevronLeft,
  Settings,
  X,
  CheckSquare,
  Code
} from 'lucide-react';
import { User, UserRole } from '../../App';

interface SidebarProps {
  user: User;
  currentPage: string;
  onPageChange: (page: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
}

const navigationItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'coordinator', 'salesperson', 'accountant', 'developer', 'temporary'] },
  { id: 'events', label: 'Events', icon: Calendar, roles: ['admin', 'coordinator', 'salesperson', 'accountant', 'developer', 'temporary'] },
  { id: 'checklist', label: 'Checklist', icon: CheckSquare, roles: ['admin', 'coordinator', 'salesperson', 'accountant', 'developer', 'temporary'] },
  { id: 'expenses', label: 'Expenses', icon: Receipt, roles: ['admin', 'coordinator', 'salesperson', 'accountant', 'developer'] },
  { id: 'account', label: 'Account', icon: UserCircle, roles: ['admin', 'coordinator', 'salesperson', 'accountant', 'developer', 'temporary'] },
  // NOTE: 'approvals' tab removed in v1.3.0 - approval workflows are now integrated into the Expenses page
  { id: 'reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'accountant', 'developer'] },
  { id: 'settings', label: 'Settings', icon: Settings, roles: ['admin', 'accountant', 'developer'] },
  { id: 'devdashboard', label: 'Dev Dashboard', icon: Code, roles: ['developer'] },
];

// Visual grouping only — does not change which items render or their order
const navSections: { label: string | null; ids: string[] }[] = [
  { label: null, ids: ['dashboard'] },
  { label: 'Workspace', ids: ['events', 'checklist', 'expenses'] },
  { label: 'Manage', ids: ['account', 'reports', 'settings', 'devdashboard'] },
];

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  currentPage,
  onPageChange,
  collapsed,
  onToggleCollapse,
  mobileMenuOpen,
  onCloseMobileMenu
}) => {
  const filteredItems = navigationItems.filter(item =>
    item.roles.includes(user.role as UserRole)
  );

  const sections = navSections
    .map(section => ({
      ...section,
      items: filteredItems.filter(item => section.ids.includes(item.id)),
    }))
    .filter(section => section.items.length > 0);

  const renderNavButton = (item: typeof navigationItems[number], isCollapsed: boolean) => {
    const Icon = item.icon;
    const isActive = currentPage === item.id;

    return (
      <button
        key={item.id}
        onClick={() => onPageChange(item.id)}
        className={`group relative w-full flex items-center gap-3 rounded-lg px-3 py-2.5 min-h-[44px] lg:min-h-0 text-sm font-medium transition-all duration-150 ${
          isCollapsed ? 'justify-center' : ''
        } ${
          isActive
            ? 'bg-brand-50 text-brand-700'
            : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
        }`}
        title={isCollapsed ? item.label : undefined}
        aria-current={isActive ? 'page' : undefined}
      >
        {isActive && (
          <span
            aria-hidden="true"
            className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-brand-500 to-accent-500"
          />
        )}
        <Icon className={`w-5 h-5 flex-shrink-0 transition-colors ${
          isActive ? 'text-brand-600' : 'text-stone-400 group-hover:text-stone-600'
        }`} />
        {!isCollapsed && (
          <span className={isActive ? 'font-semibold' : ''}>{item.label}</span>
        )}
      </button>
    );
  };

  const renderNav = (isCollapsed: boolean) => (
    <nav className="px-3 py-4 space-y-1">
      {sections.map((section, sectionIndex) => (
        <div key={section.label ?? 'main'}>
          {sectionIndex > 0 && (
            isCollapsed ? (
              <div className="my-3 mx-2 border-t border-stone-100" aria-hidden="true" />
            ) : (
              <p className="px-3 pt-5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                {section.label}
              </p>
            )
          )}
          <div className="space-y-1">
            {section.items.map(item => renderNavButton(item, isCollapsed))}
          </div>
        </div>
      ))}
    </nav>
  );

  const userChip = (
    <div className="rounded-card border border-stone-200/80 bg-gradient-to-br from-brand-50/70 to-accent-50/70 p-3 shadow-elevation-1">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-brand-500 to-accent-500 shadow-brand flex items-center justify-center">
          <span className="text-white font-semibold text-sm">
            {user.name.charAt(0)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-stone-900 truncate">{user.name}</p>
          <p className="text-xs text-stone-500 capitalize truncate">{user.role}</p>
        </div>
      </div>
    </div>
  );

  const brandMark = (
    <div className="flex items-center gap-2.5">
      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 shadow-brand flex items-center justify-center">
        <Receipt className="w-4 h-4 text-white" />
      </div>
      <span className="font-display font-bold tracking-tight text-stone-900">TradeShow</span>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className={`hidden lg:flex lg:flex-col fixed left-0 top-0 h-full bg-white border-r border-stone-200/80 transition-all duration-300 z-30 ${
        collapsed ? 'w-16' : 'w-64'
      }`}>
        <div className={`flex items-center border-b border-stone-100 p-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && brandMark}
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeft className={`w-5 h-5 transition-transform ${
              collapsed ? 'rotate-180' : ''
            }`} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {renderNav(collapsed)}
        </div>

        {!collapsed && (
          <div className="p-3 border-t border-stone-100">
            {userChip}
          </div>
        )}
      </div>

      {/* Mobile Sidebar (slide-out) */}
      <div className={`lg:hidden fixed left-0 top-0 h-full bg-white border-r border-stone-200/80 shadow-elevation-3 transition-transform duration-300 z-50 w-64 max-w-[85vw] flex flex-col pt-safe pb-safe ${
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex items-center justify-between p-4 border-b border-stone-100">
          {brandMark}
          <button
            onClick={onCloseMobileMenu}
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] -mr-2 p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors"
            title="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {renderNav(false)}
        </div>

        <div className="p-3 border-t border-stone-100">
          {userChip}
        </div>
      </div>
    </>
  );
};

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
  Code,
  Clock
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

  return (
    <>
      {/* Desktop Sidebar */}
      <div className={`hidden lg:block fixed left-0 top-0 h-full bg-white border-r border-gray-200 transition-all duration-300 z-30 ${
        collapsed ? 'w-16' : 'w-64'
      }`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          {!collapsed && (
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-lg flex items-center justify-center">
                <Receipt className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-gray-900">TradeShow</span>
            </div>
          )}
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className={`w-5 h-5 text-gray-500 transition-transform ${
              collapsed ? 'rotate-180' : ''
            }`} />
          </button>
        </div>

        <nav className="p-4 space-y-2">
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => onPageChange(item.id)}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                  isActive 
                    ? 'bg-gradient-to-r from-blue-500 to-emerald-500 text-white shadow-lg' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && (
                  <span className="font-medium">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="absolute bottom-4 left-4 right-4">
            <div className="bg-gradient-to-r from-blue-50 to-emerald-50 rounded-lg p-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-medium text-sm">
                    {user.name.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{user.name}</p>
                  <p className="text-sm text-gray-500 capitalize truncate">{user.role}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Sidebar (slide-out) */}
      <div className={`lg:hidden fixed left-0 top-0 h-full bg-white border-r border-gray-200 transition-transform duration-300 z-30 w-64 ${
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-lg flex items-center justify-center">
              <Receipt className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">TradeShow</span>
          </div>
          <button
            onClick={onCloseMobileMenu}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <nav className="p-4 space-y-2">
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => onPageChange(item.id)}
                className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg transition-all duration-200 ${
                  isActive 
                    ? 'bg-gradient-to-r from-blue-500 to-emerald-500 text-white shadow-lg' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-4 left-4 right-4">
          <div className="bg-gradient-to-r from-blue-50 to-emerald-50 rounded-lg p-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full flex items-center justify-center">
                <span className="text-white font-medium text-sm">
                  {user.name.charAt(0)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{user.name}</p>
                <p className="text-sm text-gray-500 capitalize truncate">{user.role}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

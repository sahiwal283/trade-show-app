/**
 * AdminSettingsTabs Component
 *
 * Tab navigation for Admin Settings.
 */

import React from 'react';
import { Settings, UserCircle, Users } from 'lucide-react';
import { User } from '../../../App';

export type SettingsTab = 'account' | 'system' | 'users';

interface AdminSettingsTabsProps {
  user: User;
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

export const AdminSettingsTabs: React.FC<AdminSettingsTabsProps> = ({
  user,
  activeTab,
  onTabChange
}) => {
  // System settings are limited to admins, accountants, and developers;
  // user management stays admin/developer only. Everyone gets Account.
  const canManageSystem = user.role === 'admin' || user.role === 'accountant' || user.role === 'developer';
  const canManageUsers = user.role === 'admin' || user.role === 'developer';

  return (
    <div className="overflow-x-auto">
      <nav className="seg-track" aria-label="Tabs">
        <button
          onClick={() => {
            onTabChange('account');
            window.location.hash = ''; // Clear hash when manually switching
          }}
          className={`seg-tab ${activeTab === 'account' ? 'seg-tab-active' : 'seg-tab-idle'}`}
        >
          <UserCircle className="w-5 h-5" />
          <span>Account</span>
        </button>
        {canManageSystem && (
          <button
            onClick={() => {
              onTabChange('system');
              window.location.hash = ''; // Clear hash when manually switching
            }}
            className={`seg-tab ${activeTab === 'system' ? 'seg-tab-active' : 'seg-tab-idle'}`}
          >
            <Settings className="w-5 h-5" />
            <span>System Settings</span>
          </button>
        )}
        {canManageUsers && (
          <button
            onClick={() => {
              onTabChange('users');
              window.location.hash = 'users'; // Set hash when manually switching to users
            }}
            className={`seg-tab ${activeTab === 'users' ? 'seg-tab-active' : 'seg-tab-idle'}`}
          >
            <Users className="w-5 h-5" />
            <span>User Management</span>
          </button>
        )}
      </nav>
    </div>
  );
};

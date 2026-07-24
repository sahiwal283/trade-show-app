/**
 * AdminSettingsTabs Component
 * 
 * Tab navigation for Admin Settings.
 */

import React from 'react';
import { Settings, Users } from 'lucide-react';
import { User } from '../../../App';

interface AdminSettingsTabsProps {
  user: User;
  activeTab: 'system' | 'users';
  onTabChange: (tab: 'system' | 'users') => void;
}

export const AdminSettingsTabs: React.FC<AdminSettingsTabsProps> = ({
  user,
  activeTab,
  onTabChange
}) => {
  return (
    <div className="overflow-x-auto">
      <nav className="seg-track" aria-label="Tabs">
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
        {(user.role === 'admin' || user.role === 'developer') && (
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


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
    <div className="bg-white rounded-xl shadow-sm border border-stone-200">
      <div className="border-b border-stone-200">
        <nav className="flex space-x-8 px-6" aria-label="Tabs">
          <button
            onClick={() => {
              onTabChange('system');
              window.location.hash = ''; // Clear hash when manually switching
            }}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'system'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Settings className="w-5 h-5" />
              <span>System Settings</span>
            </div>
          </button>
          {(user.role === 'admin' || user.role === 'developer') && (
            <button
              onClick={() => {
                onTabChange('users');
                window.location.hash = 'users'; // Set hash when manually switching to users
              }}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'users'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5" />
                <span>User Management</span>
              </div>
            </button>
          )}
        </nav>
      </div>
    </div>
  );
};


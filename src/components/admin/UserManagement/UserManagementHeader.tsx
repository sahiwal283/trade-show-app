/**
 * UserManagementHeader Component
 * 
 * Header section with title and Add User button.
 */

import React from 'react';
import { Plus } from 'lucide-react';

interface UserManagementHeaderProps {
  onAddUser: () => void;
}

export const UserManagementHeader: React.FC<UserManagementHeaderProps> = ({ onAddUser }) => {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Administration</p>
        <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-stone-900">User Management</h1>
        <p className="text-stone-600 mt-1">Manage team members and their access levels</p>
      </div>
      <button
        onClick={onAddUser}
        className="btn-primary px-6 py-3"
      >
        <Plus className="w-5 h-5" />
        <span>Add User</span>
      </button>
    </div>
  );
};


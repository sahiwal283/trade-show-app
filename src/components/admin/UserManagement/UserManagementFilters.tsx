/**
 * UserManagementFilters Component
 * 
 * Search and role filter controls.
 */

import React from 'react';
import { Search } from 'lucide-react';

interface Role {
  id: string;
  name: string;
  label: string;
}

interface UserManagementFiltersProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filterRole: string;
  setFilterRole: (role: string) => void;
  roles: Role[];
}

export const UserManagementFilters: React.FC<UserManagementFiltersProps> = ({
  searchTerm,
  setSearchTerm,
  filterRole,
  setFilterRole,
  roles
}) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-4 md:p-5 lg:p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-stone-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search users..."
            className="pl-10 pr-4 py-2 w-full border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>

        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        >
          <option value="all">All Roles</option>
          {roles.map(role => (
            <option key={role.id} value={role.name}>{role.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
};


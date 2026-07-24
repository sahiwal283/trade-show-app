/**
 * ActivationModal Component
 * 
 * Modal for activating pending users.
 */

import React from 'react';
import { UserCheck, X } from 'lucide-react';
import { User, UserRole } from '../../../App';

interface Role {
  id: string;
  name: string;
  label: string;
}

interface ActivationModalProps {
  isOpen: boolean;
  user: User | null;
  selectedRole: UserRole;
  roles: Role[];
  onClose: () => void;
  onRoleChange: (role: UserRole) => void;
  onActivate: () => Promise<void>;
}

export const ActivationModal: React.FC<ActivationModalProps> = ({
  isOpen,
  user,
  selectedRole,
  roles,
  onClose,
  onRoleChange,
  onActivate
}) => {
  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full flex items-center justify-center">
              <UserCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-stone-900">Activate User</h3>
              <p className="text-xs sm:text-sm text-stone-600">Assign a role to activate this account</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="mb-6 p-4 bg-stone-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full flex items-center justify-center">
              <span className="text-white font-medium text-sm">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <div className="font-medium text-stone-900">{user.name}</div>
              <div className="text-xs sm:text-sm text-stone-600">{user.username} • {user.email}</div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Assign Role
          </label>
          <select
            value={selectedRole}
            onChange={(e) => onRoleChange(e.target.value as UserRole)}
            className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          >
            {roles.map(role => (
              <option key={role.id} value={role.name}>{role.label}</option>
            ))}
          </select>
          <p className="mt-2 text-xs text-stone-500">
            This will activate the user and allow them to log in with their chosen credentials.
          </p>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            onClick={onActivate}
            className="btn-primary flex-1"
          >
            <UserCheck className="w-4 h-4" />
            <span>Activate</span>
          </button>
        </div>
      </div>
    </div>
  );
};


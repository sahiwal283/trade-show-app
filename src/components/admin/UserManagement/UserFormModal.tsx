/**
 * UserFormModal Component
 * 
 * Modal form for adding/editing users.
 */

import React from 'react';
import { User, UserRole } from '../../../App';

interface Role {
  id: string;
  name: string;
  label: string;
}

interface UserFormData {
  name: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
}

interface UserFormModalProps {
  isOpen: boolean;
  editingUser: User | null;
  formData: UserFormData;
  roles: Role[];
  onClose: () => void;
  onFormDataChange: (data: Partial<UserFormData>) => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
}

export const UserFormModal: React.FC<UserFormModalProps> = ({
  isOpen,
  editingUser,
  formData,
  roles,
  onClose,
  onFormDataChange,
  onSubmit
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-stone-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-4 md:p-5 lg:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-6">
          <h3 className="text-lg font-semibold text-stone-900">
            {editingUser ? 'Edit User' : 'Add New User'}
          </h3>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600"
          >
            ×
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => onFormDataChange({ name: e.target.value })}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Username *
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => onFormDataChange({ username: e.target.value })}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Email *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => onFormDataChange({ email: e.target.value })}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Password {editingUser ? '(Optional - Leave blank to keep current)' : '*'}
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => onFormDataChange({ password: e.target.value })}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              required={!editingUser}
              placeholder={editingUser ? 'Enter new password to reset' : 'Create password'}
            />
            {editingUser && (
              <p className="text-xs text-stone-500 mt-1">Leave blank to keep the current password</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Role *
            </label>
            <select
              value={formData.role}
              onChange={(e) => onFormDataChange({ role: e.target.value as UserRole })}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              required
            >
              {roles.map(role => (
                <option key={role.id} value={role.name}>{role.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-6"
            >
              {editingUser ? 'Update' : 'Add'} User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


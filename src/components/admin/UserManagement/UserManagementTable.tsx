/**
 * UserManagementTable Component
 * 
 * Users table with actions.
 */

import React from 'react';
import { CreditCard as Edit2, Trash2, Mail, UserCheck, UserX, AlertTriangle } from 'lucide-react';
import { User } from '../../../App';

interface Role {
  id: string;
  name: string;
  label: string;
  color?: string;
}

interface UserManagementTableProps {
  users: User[];
  roles: Role[];
  currentUserId: string;
  isPendingUser: (user: User) => boolean;
  getRoleColor: (roleName: string) => string;
  getRoleLabel: (roleName: string) => string;
  onEditUser: (user: User) => void;
  onDeleteUser: (userId: string) => Promise<void>;
  onInviteUser: (userId: string) => void;
  onActivateUser: (user: User) => void;
  onRejectUser: (user: User) => void;
}

export const UserManagementTable: React.FC<UserManagementTableProps> = ({
  users,
  currentUserId,
  isPendingUser,
  getRoleColor,
  getRoleLabel,
  onEditUser,
  onDeleteUser,
  onInviteUser,
  onActivateUser,
  onRejectUser
}) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-stone-300 scrollbar-track-stone-100">
        <table className="w-full">
          <thead className="bg-stone-50">
            <tr>
              <th className="px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 md:py-4 text-left text-xs sm:text-sm font-medium text-stone-900">User</th>
              <th className="px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 md:py-4 text-left text-xs sm:text-sm font-medium text-stone-900">Role</th>
              <th className="px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 md:py-4 text-left text-xs sm:text-sm font-medium text-stone-900">Status</th>
              <th className="px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 md:py-4 text-right text-xs sm:text-sm font-medium text-stone-900">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-stone-50">
                <td className="px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 md:py-4">
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
                </td>
                <td className="px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 md:py-4">
                  {isPendingUser(user) ? (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                      Pending Role
                    </span>
                  ) : (
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleColor(user.role)}`}>
                      {getRoleLabel(user.role)}
                    </span>
                  )}
                </td>
                <td className="px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 md:py-4">
                  {isPendingUser(user) ? (
                    <div className="flex items-center">
                      <AlertTriangle className="w-4 h-4 text-yellow-600 mr-2" />
                      <span className="text-sm text-yellow-600 font-medium">Awaiting Activation</span>
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <UserCheck className="w-4 h-4 text-emerald-600 mr-2" />
                      <span className="text-sm text-emerald-600 font-medium">Active</span>
                    </div>
                  )}
                </td>
                <td className="px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 md:py-4 text-right">
                  <div className="flex items-center justify-end space-x-2">
                    {isPendingUser(user) ? (
                      <>
                        <button
                          onClick={() => onActivateUser(user)}
                          className="btn-primary"
                          title="Activate User"
                        >
                          <UserCheck className="w-4 h-4" />
                          <span>Activate User</span>
                        </button>
                        <button
                          onClick={() => onRejectUser(user)}
                          className="btn-danger"
                          title="Reject User"
                        >
                          <UserX className="w-4 h-4" />
                          <span>Reject</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => onInviteUser(user.id)}
                          className="btn-ghost p-2"
                          title="Send Invitation"
                        >
                          <Mail className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onEditUser(user)}
                          className="btn-ghost p-2"
                          title="Edit User"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteUser(user.id)}
                          disabled={user.id === currentUserId || user.username === 'admin'}
                          className="btn-ghost p-2 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          title={user.username === 'admin' ? 'Cannot delete system admin' : user.id === currentUserId ? 'Cannot delete yourself' : 'Delete User'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};


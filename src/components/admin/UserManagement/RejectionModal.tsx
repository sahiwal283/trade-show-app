/**
 * RejectionModal Component
 * 
 * Modal for rejecting pending user registrations.
 */

import React from 'react';
import { UserX, AlertTriangle, X } from 'lucide-react';
import { User } from '../../../App';

interface RejectionModalProps {
  isOpen: boolean;
  user: User | null;
  onClose: () => void;
  onReject: () => Promise<void>;
}

export const RejectionModal: React.FC<RejectionModalProps> = ({
  isOpen,
  user,
  onClose,
  onReject
}) => {
  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-pink-500 rounded-full flex items-center justify-center">
              <UserX className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-stone-900">Reject User Registration</h3>
              <p className="text-xs sm:text-sm text-stone-600">This action cannot be undone</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-red-800 font-medium mb-1">
                Are you sure you want to reject this registration?
              </p>
              <p className="text-sm text-red-700">
                <strong>{user.name}</strong> ({user.email}) will be permanently removed and will need to register again if they want access.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-4 p-4 bg-stone-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-red-500 to-pink-500 rounded-full flex items-center justify-center">
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

        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            onClick={onReject}
            className="btn-danger flex-1"
          >
            <UserX className="w-4 h-4" />
            <span>Reject User</span>
          </button>
        </div>
      </div>
    </div>
  );
};


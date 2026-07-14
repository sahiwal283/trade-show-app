/**
 * PendingSyncModal Component
 * 
 * Modal displaying pending sync actions.
 */

import React from 'react';
import { X } from 'lucide-react';
import { User } from '../../../App';
import { PendingActions } from '../../common/PendingActions';

interface PendingSyncModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
}

export const PendingSyncModal: React.FC<PendingSyncModalProps> = ({
  user,
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end sm:items-center justify-center min-h-screen px-0 sm:px-4">
        <div
          className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
        <div className="modal-sheet-h relative z-50 w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-t-xl rounded-b-none sm:rounded-xl bg-white shadow-elevation-3">
          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-stone-200">
            <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-stone-900">Pending Sync</h2>
            <button
              onClick={onClose}
              className="tap-target rounded-lg p-2 transition-colors duration-150 hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <X className="w-5 h-5 text-stone-500" />
            </button>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(90vh - 80px)' }}>
            <PendingActions user={user} />
          </div>
        </div>
      </div>
    </div>
  );
};


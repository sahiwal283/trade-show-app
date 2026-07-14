/**
 * ConfirmModal Component
 * 
 * Reusable confirmation modal for destructive actions.
 */

import React from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'warning'
}) => {
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: 'text-red-600',
      button: 'bg-red-600 hover:bg-red-700 text-white',
      border: 'border-red-200',
      bg: 'bg-red-50'
    },
    warning: {
      icon: 'text-amber-600',
      button: 'bg-amber-600 hover:bg-amber-700 text-white',
      border: 'border-amber-200',
      bg: 'bg-amber-50'
    },
    info: {
      icon: 'text-blue-600',
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
      border: 'border-blue-200',
      bg: 'bg-blue-50'
    }
  };

  const styles = variantStyles[variant];

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start gap-4 mb-4">
            <div className={`flex-shrink-0 ${styles.icon}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-stone-900 mb-2">{title}</h3>
              <p className="text-sm text-stone-600">{message}</p>
            </div>
            <button
              onClick={onCancel}
              className="tap-target flex-shrink-0 p-1 -mt-1 -mr-1 hover:bg-stone-100 rounded-lg transition-colors lg:mt-0 lg:mr-0"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-stone-500" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 min-h-[44px] flex-1 sm:flex-initial lg:min-h-0 border border-stone-300 text-stone-700 rounded-lg hover:bg-stone-50 transition-colors"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 min-h-[44px] flex-1 sm:flex-initial lg:min-h-0 rounded-lg font-medium transition-colors ${styles.button}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


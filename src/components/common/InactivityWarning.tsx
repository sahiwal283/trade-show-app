import React, { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface InactivityWarningProps {
  isOpen: boolean;
  onClose: () => void;
  onStayLoggedIn: () => void;
  timeRemaining: number; // in seconds
}

export const InactivityWarning: React.FC<InactivityWarningProps> = ({
  isOpen,
  onClose,
  onStayLoggedIn,
  timeRemaining: initialTime
}) => {
  const [timeRemaining, setTimeRemaining] = useState(initialTime);

  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    setTimeRemaining(initialTime);
  }, [initialTime]);

  if (!isOpen) return null;

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full animate-slide-up">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-t-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Session Timeout Warning</h2>
                <p className="text-sm text-yellow-100">Your session is about to expire</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-yellow-50 rounded-full mb-4">
              <div className="text-4xl font-bold text-yellow-600">
                {minutes}:{seconds.toString().padStart(2, '0')}
              </div>
            </div>
            <p className="text-stone-700 text-lg mb-2">
              You will be automatically logged out due to inactivity
            </p>
            <p className="text-stone-500 text-sm">
              Any unsaved changes will be lost
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              <strong>Security Feature:</strong> For your protection, we automatically log you out after 15 minutes of inactivity.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onStayLoggedIn}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 text-white rounded-lg font-semibold hover:from-blue-600 hover:to-emerald-600 transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              Stay Logged In
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-stone-300 text-stone-700 rounded-lg font-semibold hover:bg-stone-50 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slide-up {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }

        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};


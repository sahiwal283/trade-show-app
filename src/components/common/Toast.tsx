import React, { useEffect } from 'react';
import { CheckCircle, AlertTriangle, X, Info, AlertCircle } from 'lucide-react';

export interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type, duration = 5000, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle className="w-5 h-5" />,
    error: <AlertCircle className="w-5 h-5" />,
    warning: <AlertTriangle className="w-5 h-5" />,
    info: <Info className="w-5 h-5" />,
  };

  const getColors = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-emerald-50 border-emerald-200',
          icon: 'text-emerald-600',
          text: 'text-emerald-900',
          border: 'border-l-4 border-emerald-500',
        };
      case 'error':
        return {
          bg: 'bg-red-50 border-red-200',
          icon: 'text-red-600',
          text: 'text-red-900',
          border: 'border-l-4 border-red-500',
        };
      case 'warning':
        return {
          bg: 'bg-amber-50 border-amber-200',
          icon: 'text-amber-600',
          text: 'text-amber-900',
          border: 'border-l-4 border-amber-500',
        };
      case 'info':
        return {
          bg: 'bg-blue-50 border-blue-200',
          icon: 'text-blue-600',
          text: 'text-blue-900',
          border: 'border-l-4 border-blue-500',
        };
      default:
        return {
          bg: 'bg-blue-50 border-blue-200',
          icon: 'text-blue-600',
          text: 'text-blue-900',
          border: 'border-l-4 border-blue-500',
        };
    }
  };

  const colors = getColors();

  return (
    <div className="fixed top-4 right-4 z-[9999] animate-slide-in">
      <div
        className={`
          ${colors.bg} ${colors.border} rounded-lg shadow-lg p-4
          flex items-start gap-3 min-w-[300px] max-w-md
          transition-all duration-200
        `}
        role="alert"
        aria-live="polite"
      >
        {/* Icon */}
        <div className={`${colors.icon} flex-shrink-0 mt-0.5`}>
          {icons[type]}
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className={`font-medium ${colors.text} text-sm leading-relaxed`}>
            {message}
          </p>
        </div>

        {/* Close Button - Only one, clickable, right side */}
        <button
          onClick={onClose}
          className={`
            ${colors.icon} hover:opacity-70 transition-opacity
            flex-shrink-0 p-1 rounded
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent
            ${type === 'error' ? 'focus:ring-red-500' : type === 'warning' ? 'focus:ring-amber-500' : type === 'success' ? 'focus:ring-emerald-500' : 'focus:ring-brand-500'}
          `}
          aria-label="Close notification"
          type="button"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

// Toast Container Component
interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }>;
  removeToast: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-2">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
};

// Custom hook for managing toasts
export const useToast = () => {
  const [toasts, setToasts] = React.useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }>>([]);

  const addToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return { toasts, addToast, removeToast };
};


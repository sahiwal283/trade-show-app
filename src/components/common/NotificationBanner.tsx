/**
 * Notification Banner Component
 * 
 * Displays toast-style notifications for sync status, errors, and user feedback.
 * Supports multiple notification types and persistence.
 */

import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Wifi, WifiOff, Loader } from 'lucide-react';
import { generateUUID } from '../../utils/uuid';

// ========== TYPE DEFINITIONS ==========

export type NotificationType = 'success' | 'error' | 'warning' | 'info' | 'offline' | 'syncing';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  persistent?: boolean;  // If true, user must manually dismiss
  duration?: number;      // Auto-dismiss after ms (default: 5000)
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationBannerProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

// ========== NOTIFICATION ITEM ==========

const NotificationItem: React.FC<{
  notification: Notification;
  onDismiss: (id: string) => void;
}> = ({ notification, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (!notification.persistent && notification.duration !== 0) {
      const duration = notification.duration || 5000;
      const timer = setTimeout(() => {
        handleDismiss();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(notification.id);
    }, 300); // Match animation duration
  };

  const getIcon = () => {
    switch (notification.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5" />;
      case 'error':
        return <AlertCircle className="w-5 h-5" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5" />;
      case 'offline':
        return <WifiOff className="w-5 h-5" />;
      case 'syncing':
        return <Loader className="w-5 h-5 animate-spin" />;
      default:
        return <Wifi className="w-5 h-5" />;
    }
  };

  const getColors = () => {
    switch (notification.type) {
      case 'success':
        return {
          bg: 'bg-emerald-50 border-emerald-200',
          icon: 'text-emerald-600',
          text: 'text-emerald-900',
          subtext: 'text-emerald-700'
        };
      case 'error':
        return {
          bg: 'bg-red-50 border-red-200',
          icon: 'text-red-600',
          text: 'text-red-900',
          subtext: 'text-red-700'
        };
      case 'warning':
        return {
          bg: 'bg-amber-50 border-amber-200',
          icon: 'text-amber-600',
          text: 'text-amber-900',
          subtext: 'text-amber-700'
        };
      case 'offline':
        return {
          bg: 'bg-stone-50 border-stone-300',
          icon: 'text-stone-600',
          text: 'text-stone-900',
          subtext: 'text-stone-700'
        };
      case 'syncing':
        return {
          bg: 'bg-blue-50 border-blue-200',
          icon: 'text-blue-600',
          text: 'text-blue-900',
          subtext: 'text-blue-700'
        };
      default:
        return {
          bg: 'bg-blue-50 border-blue-200',
          icon: 'text-blue-600',
          text: 'text-blue-900',
          subtext: 'text-blue-700'
        };
    }
  };

  const colors = getColors();

  return (
    <div
      className={`
        ${colors.bg} border-l-4 rounded-lg shadow-lg p-4 mb-3 flex items-start gap-3
        transition-all duration-300 ease-in-out
        ${isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'}
      `}
      role="alert"
    >
      {/* Icon */}
      <div className={`${colors.icon} flex-shrink-0 mt-0.5`}>
        {getIcon()}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h4 className={`font-semibold ${colors.text} text-sm`}>
          {notification.title}
        </h4>
        <p className={`${colors.subtext} text-sm mt-1`}>
          {notification.message}
        </p>

        {/* Action Button */}
        {notification.action && (
          <button
            onClick={notification.action.onClick}
            className={`
              mt-2 text-sm font-medium ${colors.icon} hover:underline
              focus:outline-none focus:ring-2 focus:ring-offset-2 rounded
            `}
          >
            {notification.action.label}
          </button>
        )}
      </div>

      {/* Dismiss Button */}
      <button
        onClick={handleDismiss}
        className={`${colors.icon} hover:opacity-70 transition-opacity flex-shrink-0`}
        aria-label="Dismiss notification"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
};

// ========== MAIN COMPONENT ==========

export const NotificationBanner: React.FC<NotificationBannerProps> = ({
  notifications,
  onDismiss
}) => {
  if (notifications.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed top-20 right-4 z-[60] w-full max-w-md space-y-2"
      role="region"
      aria-label="Notifications"
    >
      {notifications.map(notification => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
};

// ========== NOTIFICATION MANAGER HOOK ==========

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (notification: Omit<Notification, 'id'>) => {
    const id = generateUUID();
    const newNotification: Notification = {
      id,
      ...notification
    };

    console.log('[Notifications] Adding:', newNotification);
    setNotifications(prev => [...prev, newNotification]);
    return id;
  };

  const removeNotification = (id: string) => {
    console.log('[Notifications] Removing:', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAll = () => {
    console.log('[Notifications] Clearing all');
    setNotifications([]);
  };

  // Convenience methods
  const showSuccess = (title: string, message: string, duration?: number) => {
    return addNotification({ type: 'success', title, message, duration });
  };

  const showError = (title: string, message: string, persistent: boolean = true) => {
    return addNotification({ type: 'error', title, message, persistent });
  };

  const showWarning = (title: string, message: string, duration?: number) => {
    return addNotification({ type: 'warning', title, message, duration });
  };

  const showInfo = (title: string, message: string, duration?: number) => {
    return addNotification({ type: 'info', title, message, duration });
  };

  const showOffline = (message: string = 'No internet connection. Changes will be saved locally and synced when back online.') => {
    return addNotification({
      type: 'offline',
      title: 'Working Offline',
      message,
      persistent: true
    });
  };

  const showSyncing = (message: string = 'Syncing your changes...') => {
    return addNotification({
      type: 'syncing',
      title: 'Syncing',
      message,
      duration: 0  // Will be dismissed manually
    });
  };

  return {
    notifications,
    addNotification,
    removeNotification,
    clearAll,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showOffline,
    showSyncing
  };
};

export default NotificationBanner;


/**
 * Loading Spinner Component
 * Reusable loading indicator with customizable size
 * @version 0.8.0
 */

import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  text?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-12 h-12 border-3',
  xl: 'w-16 h-16 border-4',
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className = '',
  text,
}) => {
  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div
        className={`${sizeClasses[size]} border-blue-600 border-t-transparent rounded-full animate-spin`}
        role="status"
        aria-label="Loading"
      />
      {text && (
        <p className="mt-3 text-sm text-stone-600 animate-pulse">{text}</p>
      )}
    </div>
  );
};

/**
 * Full page loading overlay
 */
export const LoadingOverlay: React.FC<{ text?: string }> = ({ text = 'Loading...' }) => {
  return (
    <div className="fixed inset-0 bg-white bg-opacity-90 flex items-center justify-center z-50">
      <LoadingSpinner size="xl" text={text} />
    </div>
  );
};

/**
 * Inline loading state for tables and lists
 */
export const LoadingTable: React.FC = () => {
  return (
    <div className="flex items-center justify-center py-12">
      <LoadingSpinner size="lg" text="Loading data..." />
    </div>
  );
};

/**
 * Card loading skeleton
 */
export const LoadingSkeleton: React.FC<{ lines?: number }> = ({ lines = 3 }) => {
  return (
    <div className="animate-pulse space-y-4">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 bg-stone-200 rounded w-full" />
      ))}
    </div>
  );
};


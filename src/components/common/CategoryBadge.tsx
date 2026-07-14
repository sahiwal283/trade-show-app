/**
 * CategoryBadge Component
 * 
 * Reusable badge component for displaying expense categories with consistent
 * styling and color coding across the application.
 * 
 * Usage:
 *   <CategoryBadge category="Travel" />
 *   <CategoryBadge category="Meals & Entertainment" size="sm" />
 */

import React from 'react';

interface CategoryBadgeProps {
  category: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

// Categories are metadata, not status — keep them quiet and uniform in form
// (soft tint + inset ring) so status chips carry the semantic color weight.
const categoryColors: Record<string, string> = {
  'Travel': 'bg-blue-50 text-blue-700 ring-blue-200/60',
  'Meals & Entertainment': 'bg-purple-50 text-purple-700 ring-purple-200/60',
  'Accommodation': 'bg-indigo-50 text-indigo-700 ring-indigo-200/60',
  'Supplies': 'bg-green-50 text-green-700 ring-green-200/60',
  'Shipping': 'bg-orange-50 text-orange-700 ring-orange-200/60',
  'Technology': 'bg-cyan-50 text-cyan-700 ring-cyan-200/60',
  'Marketing': 'bg-pink-50 text-pink-700 ring-pink-200/60',
  'Professional Services': 'bg-teal-50 text-teal-700 ring-teal-200/60',
  'Other': 'bg-gray-50 text-gray-600 ring-gray-200'
};

const sizeClasses = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-base'
};

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({
  category,
  size = 'sm',
  className = ''
}) => {
  const colorClass = categoryColors[category] || categoryColors['Other'];

  return (
    <span
      className={`
        chip
        ${sizeClasses[size]}
        ${colorClass}
        ${className}
      `}
    >
      {category}
    </span>
  );
};


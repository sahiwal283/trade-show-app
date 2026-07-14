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
import { getCategoryColor } from '../../constants/appConstants';

interface CategoryBadgeProps {
  category: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

// Categories are metadata, not status — keep them quiet and uniform in form
// (soft tint + inset ring) so status chips carry the semantic color weight.
// Colors come from the shared CATEGORY_COLORS map in appConstants so every
// surface (table, reports, dashboard) renders the same tint per category.

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
  const colorClass = getCategoryColor(category);

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


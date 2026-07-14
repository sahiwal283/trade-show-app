/**
 * Badge Component
 * 
 * Generic, flexible badge component for any type of labeled data.
 * Use this for custom badges that don't fit StatusBadge or CategoryBadge.
 * 
 * Usage:
 *   <Badge color="blue">New</Badge>
 *   <Badge color="green" size="lg" icon={CheckCircle}>Verified</Badge>
 *   <Badge color="red" variant="solid">Error</Badge>
 */

import React from 'react';
import { LucideIcon } from 'lucide-react';

type BadgeColor = 'gray' | 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'pink' | 'orange' | 'teal' | 'cyan' | 'indigo' | 'emerald';
type BadgeVariant = 'light' | 'solid' | 'outline';
type BadgeSize = 'xs' | 'sm' | 'md' | 'lg';

interface BadgeProps {
  children: React.ReactNode;
  color?: BadgeColor;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: LucideIcon;
  className?: string;
  onClick?: () => void;
}

const colorClasses: Record<BadgeColor, Record<BadgeVariant, string>> = {
  gray: {
    light: 'bg-stone-100 text-stone-800',
    solid: 'bg-stone-600 text-white',
    outline: 'border border-stone-300 text-stone-700'
  },
  blue: {
    light: 'bg-blue-100 text-blue-800',
    solid: 'bg-blue-600 text-white',
    outline: 'border border-blue-300 text-blue-700'
  },
  green: {
    light: 'bg-green-100 text-green-800',
    solid: 'bg-green-600 text-white',
    outline: 'border border-green-300 text-green-700'
  },
  emerald: {
    light: 'bg-emerald-100 text-emerald-800',
    solid: 'bg-emerald-600 text-white',
    outline: 'border border-emerald-300 text-emerald-700'
  },
  red: {
    light: 'bg-red-100 text-red-800',
    solid: 'bg-red-600 text-white',
    outline: 'border border-red-300 text-red-700'
  },
  yellow: {
    light: 'bg-yellow-100 text-yellow-800',
    solid: 'bg-yellow-600 text-white',
    outline: 'border border-yellow-300 text-yellow-700'
  },
  orange: {
    light: 'bg-orange-100 text-orange-800',
    solid: 'bg-orange-600 text-white',
    outline: 'border border-orange-300 text-orange-700'
  },
  purple: {
    light: 'bg-purple-100 text-purple-800',
    solid: 'bg-purple-600 text-white',
    outline: 'border border-purple-300 text-purple-700'
  },
  pink: {
    light: 'bg-pink-100 text-pink-800',
    solid: 'bg-pink-600 text-white',
    outline: 'border border-pink-300 text-pink-700'
  },
  teal: {
    light: 'bg-teal-100 text-teal-800',
    solid: 'bg-teal-600 text-white',
    outline: 'border border-teal-300 text-teal-700'
  },
  cyan: {
    light: 'bg-cyan-100 text-cyan-800',
    solid: 'bg-cyan-600 text-white',
    outline: 'border border-cyan-300 text-cyan-700'
  },
  indigo: {
    light: 'bg-indigo-100 text-indigo-800',
    solid: 'bg-indigo-600 text-white',
    outline: 'border border-indigo-300 text-indigo-700'
  }
};

const sizeClasses: Record<BadgeSize, string> = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-base'
};

const iconSizes: Record<BadgeSize, string> = {
  xs: 'w-2.5 h-2.5',
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5'
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  color = 'gray',
  variant = 'light',
  size = 'sm',
  icon: Icon,
  className = '',
  onClick
}) => {
  const colorClass = colorClasses[color][variant];
  const sizeClass = sizeClasses[size];
  const iconSize = iconSizes[size];
  const isClickable = !!onClick;

  return (
    <span
      onClick={onClick}
      className={`
        ${sizeClass}
        ${colorClass}
        font-medium rounded-full whitespace-nowrap inline-flex items-center gap-1
        ${isClickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
        ${className}
      `}
    >
      {Icon && <Icon className={iconSize} />}
      {children}
    </span>
  );
};


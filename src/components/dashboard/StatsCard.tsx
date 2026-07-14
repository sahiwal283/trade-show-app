import React from 'react';
import { Video as LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  color: 'blue' | 'emerald' | 'orange' | 'purple';
  trend?: string;
  trendUp?: boolean;
}

// Soft tinted icon wells + a matching top hairline so each stat reads as
// its own object without resorting to heavy gradient blocks everywhere.
const colorClasses = {
  blue: {
    well: 'bg-brand-50 text-brand-600 ring-brand-100',
    hairline: 'from-brand-500/60',
  },
  emerald: {
    well: 'bg-accent-50 text-accent-600 ring-accent-100',
    hairline: 'from-accent-500/60',
  },
  orange: {
    well: 'bg-orange-50 text-orange-600 ring-orange-100',
    hairline: 'from-orange-500/60',
  },
  purple: {
    well: 'bg-purple-50 text-purple-600 ring-purple-100',
    hairline: 'from-purple-500/60',
  },
};

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  icon: Icon,
  color,
  trend,
  trendUp
}) => {
  const colors = colorClasses[color];

  return (
    <div className="card card-hover relative overflow-hidden p-5 md:p-6">
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${colors.hairline} to-transparent`}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{title}</p>
          <p className="mt-2 font-display text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 truncate">
            {value}
          </p>
          {trend && (
            <span
              className={`mt-3 chip px-2 py-0.5 text-xs ${
                trendUp
                  ? 'bg-accent-50 text-accent-800 ring-accent-200/70'
                  : 'bg-orange-50 text-orange-700 ring-orange-200/70'
              }`}
            >
              {trendUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {trend}
            </span>
          )}
        </div>
        <div className={`h-11 w-11 shrink-0 rounded-lg ring-1 ring-inset flex items-center justify-center ${colors.well}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};

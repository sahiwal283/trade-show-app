import React from 'react';
import { Users, Activity, AlertTriangle, Server } from 'lucide-react';

interface DashboardSummaryCardsProps {
  summary: {
    active_sessions?: number;
    recent_actions?: number;
    active_alerts?: number;
    critical_alerts?: number;
    total_users?: number;
  };
}

export const DashboardSummaryCards: React.FC<DashboardSummaryCardsProps> = ({ summary }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
      <div className="bg-white rounded-lg shadow-sm border border-stone-200 p-3 md:p-4">
        <div className="flex items-center justify-between mb-2">
          <Users className="w-5 h-5 text-blue-600" />
        </div>
        <p className="text-xl md:text-2xl font-bold text-stone-900">{summary.active_sessions || 0}</p>
        <p className="text-xs text-stone-600">Active Sessions</p>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm border border-stone-200 p-3 md:p-4">
        <div className="flex items-center justify-between mb-2">
          <Activity className="w-5 h-5 text-emerald-600" />
        </div>
        <p className="text-xl md:text-2xl font-bold text-stone-900">{summary.recent_actions || 0}</p>
        <p className="text-xs text-stone-600">Actions (24h)</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-stone-200 p-3 md:p-4">
        <div className="flex items-center justify-between mb-2">
          <AlertTriangle className={`w-5 h-5 ${summary.critical_alerts && summary.critical_alerts > 0 ? 'text-red-600' : 'text-stone-400'}`} />
        </div>
        <p className="text-xl md:text-2xl font-bold text-stone-900">{summary.active_alerts || 0}</p>
        <p className="text-xs text-stone-600">Active Alerts</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-stone-200 p-3 md:p-4">
        <div className="flex items-center justify-between mb-2">
          <Server className="w-5 h-5 text-purple-600" />
        </div>
        <p className="text-xl md:text-2xl font-bold text-stone-900">{summary.total_users || 0}</p>
        <p className="text-xs text-stone-600">Total Users</p>
      </div>
    </div>
  );
};


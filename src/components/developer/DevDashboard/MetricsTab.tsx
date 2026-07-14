import React from 'react';
import { Cpu, HardDrive, Clock, TrendingUp, Database } from 'lucide-react';

interface MetricsData {
  system?: {
    cpu_usage?: number;
    memory_usage?: number;
    disk_usage?: number;
    uptime?: number;
  };
  database?: {
    size?: string;
    connections?: number;
    queries_per_sec?: number;
  };
}

interface MetricsTabProps {
  metrics: MetricsData;
  formatUptime: (seconds: number) => string;
}

export const MetricsTab: React.FC<MetricsTabProps> = ({ metrics, formatUptime }) => {
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* CPU Usage */}
        <div className="bg-white rounded-lg border border-stone-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <Cpu className="w-6 h-6 text-blue-600" />
            <span className="text-2xl font-bold text-stone-900">
              {metrics.system?.cpu_usage?.toFixed(1) || 0}%
            </span>
          </div>
          <p className="text-sm text-stone-600">CPU Usage</p>
          <div className="mt-3 w-full bg-stone-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${metrics.system?.cpu_usage || 0}%` }}
            />
          </div>
        </div>

        {/* Memory Usage */}
        <div className="bg-white rounded-lg border border-stone-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <HardDrive className="w-6 h-6 text-emerald-600" />
            <span className="text-2xl font-bold text-stone-900">
              {metrics.system?.memory_usage?.toFixed(1) || 0}%
            </span>
          </div>
          <p className="text-sm text-stone-600">Memory Usage</p>
          <div className="mt-3 w-full bg-stone-200 rounded-full h-2">
            <div
              className="bg-emerald-600 h-2 rounded-full transition-all"
              style={{ width: `${metrics.system?.memory_usage || 0}%` }}
            />
          </div>
        </div>

        {/* Disk Usage */}
        <div className="bg-white rounded-lg border border-stone-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <Database className="w-6 h-6 text-purple-600" />
            <span className="text-2xl font-bold text-stone-900">
              {metrics.system?.disk_usage?.toFixed(1) || 0}%
            </span>
          </div>
          <p className="text-sm text-stone-600">Disk Usage</p>
          <div className="mt-3 w-full bg-stone-200 rounded-full h-2">
            <div
              className="bg-purple-600 h-2 rounded-full transition-all"
              style={{ width: `${metrics.system?.disk_usage || 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Database Metrics */}
      <div className="bg-white rounded-lg border border-stone-200 p-5">
        <h3 className="text-lg font-semibold text-stone-900 mb-4 flex items-center">
          <Database className="w-5 h-5 mr-2 text-blue-600" />
          Database Metrics
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-stone-600 mb-1">Database Size</p>
            <p className="text-xl font-bold text-stone-900">{metrics.database?.size || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-stone-600 mb-1">Active Connections</p>
            <p className="text-xl font-bold text-stone-900">{metrics.database?.connections || 0}</p>
          </div>
          <div>
            <p className="text-sm text-stone-600 mb-1">Queries/Second</p>
            <p className="text-xl font-bold text-stone-900">{metrics.database?.queries_per_sec || 0}</p>
          </div>
        </div>
      </div>

      {/* System Uptime */}
      {metrics.system?.uptime !== undefined && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-5 border border-blue-200">
          <div className="flex items-center space-x-3">
            <Clock className="w-6 h-6 text-blue-600" />
            <div>
              <p className="text-sm text-stone-600">System Uptime</p>
              <p className="text-xl font-bold text-stone-900">{formatUptime(metrics.system.uptime)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


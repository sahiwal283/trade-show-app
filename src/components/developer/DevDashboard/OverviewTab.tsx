import React from 'react';
import { Server, Activity, Database } from 'lucide-react';

interface VersionInfo {
  frontend?: { version: string };
  backend?: { version: string; nodeVersion: string };
  environment?: string;
  uptime?: number;
}

interface SystemMetrics {
  memory?: {
    usagePercent: number;
    usedGB: number;
    totalGB: number;
  };
  cpu?: {
    loadAverage: number[];
    cores: number;
  };
}

interface DatabaseMetrics {
  activeConnections?: number;
  totalConnections?: number;
  databaseSize?: number;
  tableSizes?: Array<{
    tablename: string;
    size: string;
  }>;
}

interface MetricsData {
  system?: SystemMetrics;
  database?: DatabaseMetrics;
}

interface OverviewTabProps {
  versionInfo: VersionInfo;
  metrics: MetricsData;
  formatUptime: (seconds: number) => string;
  formatBytes: (bytes: number) => string;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ versionInfo, metrics, formatUptime, formatBytes }) => {
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Version Info */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-5 border border-blue-200">
          <h3 className="text-lg font-semibold text-stone-900 mb-4 flex items-center">
            <Server className="w-5 h-5 mr-2 text-blue-600" />
            Version Information
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-stone-600">Frontend:</span>
              <span className="text-sm font-medium text-stone-900">{versionInfo.frontend?.version || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-stone-600">Backend:</span>
              <span className="text-sm font-medium text-stone-900">{versionInfo.backend?.version || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-stone-600">Node.js:</span>
              <span className="text-sm font-medium text-stone-900">{versionInfo.backend?.nodeVersion || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-stone-600">Environment:</span>
              <span className={`text-sm font-medium ${versionInfo.environment === 'production' ? 'text-green-600' : 'text-yellow-600'}`}>
                {versionInfo.environment || 'N/A'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-stone-600">Uptime:</span>
              <span className="text-sm font-medium text-stone-900">{formatUptime(versionInfo.uptime || 0)}</span>
            </div>
          </div>
        </div>

        {/* System Health */}
        <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-lg p-5 border border-emerald-200">
          <h3 className="text-lg font-semibold text-stone-900 mb-4 flex items-center">
            <Activity className="w-5 h-5 mr-2 text-emerald-600" />
            System Health
          </h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-stone-600">Memory Usage:</span>
                <span className="text-sm font-medium text-stone-900">
                  {metrics.system?.memory?.usagePercent.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-stone-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    (metrics.system?.memory?.usagePercent || 0) > 85
                      ? 'bg-red-500'
                      : (metrics.system?.memory?.usagePercent || 0) > 70
                      ? 'bg-yellow-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${metrics.system?.memory?.usagePercent || 0}%` }}
                />
              </div>
              <p className="text-xs text-stone-500 mt-1">
                {metrics.system?.memory?.usedGB} GB / {metrics.system?.memory?.totalGB} GB
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-stone-600">CPU Load Avg:</span>
                <span className="text-sm font-medium text-stone-900">
                  {metrics.system?.cpu?.loadAverage[0].toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-stone-500">{metrics.system?.cpu?.cores} CPU cores</p>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-emerald-200">
              <span className="text-sm text-stone-600">DB Connections:</span>
              <span className="text-sm font-medium text-stone-900">
                {metrics.database?.activeConnections} / {metrics.database?.totalConnections}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-stone-600">DB Size:</span>
              <span className="text-sm font-medium text-stone-900">
                {formatBytes(metrics.database?.databaseSize || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Tables */}
      {metrics.database?.tableSizes && metrics.database.tableSizes.length > 0 && (
        <div className="bg-white rounded-lg border border-stone-200 p-5">
          <h3 className="text-lg font-semibold text-stone-900 mb-4 flex items-center">
            <Database className="w-5 h-5 mr-2 text-stone-600" />
            Top Tables by Size
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className="text-left py-2 text-stone-600 font-medium">Table</th>
                  <th className="text-right py-2 text-stone-600 font-medium">Size</th>
                </tr>
              </thead>
              <tbody>
                {metrics.database.tableSizes.slice(0, 5).map((table, index) => (
                  <tr key={index} className="border-b border-stone-100">
                    <td className="py-2 text-stone-900">{table.tablename}</td>
                    <td className="py-2 text-right text-stone-700">{table.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};


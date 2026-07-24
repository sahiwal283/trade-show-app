import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Alert {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  metric_value?: string;
  threshold_value?: string;
  created_at: string;
}

interface AlertsTabProps {
  alerts: Alert[];
  alertStatus: string;
  onStatusChange: (status: string) => void;
}

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical':
      return 'border-red-300 bg-red-50';
    case 'warning':
      return 'border-yellow-300 bg-yellow-50';
    default:
      return 'border-blue-300 bg-blue-50';
  }
};

export const AlertsTab: React.FC<AlertsTabProps> = ({ alerts, alertStatus, onStatusChange }) => {
  return (
    <div className="space-y-4">
      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-blue-900 mb-1">Developer-Focused System Alerts</h4>
            <p className="text-sm text-blue-800">
              These alerts monitor technical health and performance issues in real-time:
            </p>
            <ul className="text-sm text-blue-800 mt-2 space-y-1 list-disc list-inside">
              <li><strong>Error Rates:</strong> Detects when API requests fail above 10% threshold</li>
              <li><strong>Performance:</strong> Alerts when endpoints exceed 2000ms average response time</li>
              <li><strong>Security:</strong> Monitors for authentication failures and potential attacks</li>
              <li><strong>Traffic Anomalies:</strong> Identifies unusual traffic spikes or patterns</li>
              <li><strong>System Health:</strong> Tracks stale sessions and repeated endpoint failures</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Alert Filter */}
      <div className="flex items-center space-x-3">
        <select
          value={alertStatus}
          onChange={(e) => onStatusChange(e.target.value)}
          className="px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500"
        >
          <option value="active">Active Alerts</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {/* Alerts List */}
      <div className="space-y-3">
        {alerts.length === 0 ? (
          <div className="bg-white rounded-lg border border-stone-200 p-8 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-3" />
            <p className="text-stone-600">No {alertStatus} alerts</p>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`bg-white rounded-lg border-2 p-4 ${getSeverityColor(alert.severity)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    {alert.severity === 'critical' && <AlertCircle className="w-5 h-5 text-red-600" />}
                    {alert.severity === 'warning' && <AlertTriangle className="w-5 h-5 text-yellow-600" />}
                    <h4 className="font-semibold text-stone-900">{alert.title}</h4>
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full capitalize">
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-sm text-stone-700 mb-2">{alert.description}</p>
                  {alert.metric_value && (
                    <p className="text-xs text-stone-600">
                      Value: {alert.metric_value} 
                      {alert.threshold_value && ` (Threshold: ${alert.threshold_value})`}
                    </p>
                  )}
                  <p className="text-xs text-stone-500 mt-2">
                    {new Date(alert.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};


import React from 'react';
import { Search, Filter, Activity } from 'lucide-react';

interface AuditLog {
  id: string;
  user_name?: string;
  user_role?: string;
  action: string;
  entity_type?: string;
  status: 'success' | 'failure' | 'pending';
  ip_address?: string;
  created_at: string;
}

interface AuditLogsTabProps {
  auditLogs: AuditLog[];
  auditSearchTerm: string;
  auditAction: string;
  onSearchChange: (term: string) => void;
  onActionChange: (action: string) => void;
  onApplyFilters: () => void;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'success': return 'bg-emerald-100 text-emerald-800';
    case 'failure': return 'bg-red-100 text-red-800';
    default: return 'bg-yellow-100 text-yellow-800';
  }
};

export const AuditLogsTab: React.FC<AuditLogsTabProps> = ({
  auditLogs,
  auditSearchTerm,
  auditAction,
  onSearchChange,
  onActionChange,
  onApplyFilters,
}) => {
  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="text"
              placeholder="Search logs..."
              value={auditSearchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 pr-4 py-2 w-full border border-stone-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <select
          value={auditAction}
          onChange={(e) => onActionChange(e.target.value)}
          className="px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Actions</option>
          <option value="login_success">Login Success</option>
          <option value="login_failed">Login Failed</option>
          <option value="expense_created">Expense Created</option>
          <option value="expense_approved">Expense Approved</option>
          <option value="expense_rejected">Expense Rejected</option>
          <option value="expense_updated">Expense Updated</option>
          <option value="entity_assigned">Entity Assigned</option>
        </select>
        <button
          onClick={onApplyFilters}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center space-x-2"
        >
          <Filter className="w-4 h-4" />
          <span>Apply</span>
        </button>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
        {auditLogs.length === 0 ? (
          <div className="p-12 text-center">
            <Activity className="w-12 h-12 mx-auto text-stone-400 mb-3" />
            <h3 className="text-lg font-semibold text-stone-900 mb-1">No Audit Logs Yet</h3>
            <p className="text-sm text-stone-600">
              Activity logs will appear here once users start performing actions.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-600 uppercase">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-600 uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-600 uppercase">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-600 uppercase">Entity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-600 uppercase">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3 text-stone-900 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-stone-900 font-medium">{log.user_name || 'N/A'}</p>
                        <p className="text-xs text-stone-500">{log.user_role || '-'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-stone-900 capitalize">{log.action.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-stone-600 capitalize">{log.entity_type || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(log.status)}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-600 text-xs">{log.ip_address || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};


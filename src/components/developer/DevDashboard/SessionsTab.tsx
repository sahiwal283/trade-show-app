import React from 'react';
import { Users, Calendar, Clock, CheckCircle2, X } from 'lucide-react';

interface Session {
  id: string;
  user_name: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
  last_activity: string;
  expires_at: string;
}

interface SessionsTabProps {
  sessions: Session[];
}

const getActivityStatus = (lastActivity: string) => {
  const lastActiveTime = new Date(lastActivity).getTime();
  const now = Date.now();
  const diffMinutes = (now - lastActiveTime) / 1000 / 60;
  
  if (diffMinutes < 5) return { label: 'Active', color: 'text-emerald-600', icon: CheckCircle2 };
  if (diffMinutes < 30) return { label: 'Idle', color: 'text-yellow-600', icon: Clock };
  return { label: 'Stale', color: 'text-stone-500', icon: X };
};

const formatTimeAgo = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

export const SessionsTab: React.FC<SessionsTabProps> = ({ sessions }) => {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Users className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-blue-900 mb-1">Active User Sessions</h4>
            <p className="text-sm text-blue-800">
              Real-time tracking of logged-in users. Sessions show activity status, IP addresses, and browser information.
              Sessions automatically expire after 30 days of inactivity.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-stone-600 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-stone-600 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-stone-600 uppercase">Last Active</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-stone-600 uppercase">IP Address</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-stone-600 uppercase">Browser</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-stone-600 uppercase">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-stone-500">
                    No active sessions found
                  </td>
                </tr>
              ) : (
                sessions.map((session) => {
                  const status = getActivityStatus(session.last_activity);
                  const StatusIcon = status.icon;
                  
                  return (
                    <tr key={session.id} className="hover:bg-stone-50">
                      <td className="px-4 py-3 font-medium text-stone-900">{session.user_name}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-1">
                          <StatusIcon className={`w-4 h-4 ${status.color}`} />
                          <span className={`${status.color} font-medium`}>{status.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-stone-700">
                        {formatTimeAgo(session.last_activity)}
                      </td>
                      <td className="px-4 py-3 text-stone-700 font-mono text-xs">
                        {session.ip_address}
                      </td>
                      <td className="px-4 py-3 text-stone-600 text-xs max-w-xs truncate" title={session.user_agent}>
                        {session.user_agent}
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {formatTimeAgo(session.created_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};


import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { SessionsPayload } from './types';
import { timeAgo } from './format';
import { describeUserAgent } from './userAgent';

type SessionUser = SessionsPayload['users'][number];

const STATUS: Record<SessionUser['status'], { label: string; dot: string }> = {
  active: { label: 'Active', dot: 'bg-emerald-500' },
  idle: { label: 'Idle', dot: 'bg-amber-500' },
  away: { label: 'Away', dot: 'bg-stone-400' },
};

const TH = 'px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-stone-500';
const TD = 'px-4 py-3 text-sm';

function summary(users: SessionUser[]): string {
  const count = (status: SessionUser['status']) => users.filter((u) => u.status === status).length;
  const people = users.length === 1 ? '1 person' : `${users.length} people`;
  return `${people} signed in: ${count('active')} active, ${count('idle')} idle, ${count('away')} away`;
}

export const SessionsTab: React.FC<{ data: SessionsPayload }> = ({ data }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (data.users.length === 0) {
    return <p className="py-8 text-center text-sm text-stone-500">Nobody is signed in.</p>;
  }

  const toggle = (userId: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(userId)) next.add(userId);
      return next;
    });

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600">{summary(data.users)}</p>
      <div className="overflow-x-auto rounded-lg border border-stone-200">
        <table className="w-full">
          <thead className="bg-stone-50">
            <tr>
              <th className={TH}>Person</th>
              <th className={TH}>Status</th>
              <th className={TH}>Last active</th>
              <th className={TH}>Device</th>
              <th className={TH}>Address</th>
              <th className={TH}>Sessions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data.users.map((user) => {
              const latest = user.sessions[0];
              const status = STATUS[user.status];
              const isOpen = expanded.has(user.userId);
              const countLabel = user.sessionCount === 1 ? '1 session' : `${user.sessionCount} sessions`;
              return (
                <React.Fragment key={user.userId}>
                  <tr aria-label={user.name}>
                    <td className={TD}>
                      <span className="font-medium text-stone-900">{user.name}</span>
                      <span className="ml-2 text-xs text-stone-500">{user.role}</span>
                    </td>
                    <td className={TD}>
                      <span className="inline-flex items-center gap-1.5 text-stone-800">
                        <span className={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden="true" />
                        {status.label}
                      </span>
                    </td>
                    <td className={`${TD} text-stone-700`}>{timeAgo(user.lastActivity)}</td>
                    <td className={`${TD} text-stone-700`}>{describeUserAgent(latest?.userAgent ?? null).label}</td>
                    <td className={`${TD} font-mono text-xs text-stone-700`}>{latest?.ipAddress ?? '—'}</td>
                    <td className={TD}>
                      {user.sessionCount > 1 ? (
                        <button
                          type="button"
                          onClick={() => toggle(user.userId)}
                          aria-expanded={isOpen}
                          aria-label={`Show sessions for ${user.name}`}
                          className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"
                        >
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          {countLabel}
                        </button>
                      ) : (
                        <span className="text-stone-700">{countLabel}</span>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} className="bg-stone-50 px-4 py-3">
                        <ul aria-label={`Sessions for ${user.name}`} className="space-y-1.5">
                          {user.sessions.map((session) => (
                            <li key={session.id} className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-stone-700">
                              <span className="font-medium">
                                {session.userAgent ? describeUserAgent(session.userAgent).label : 'Unknown browser'}
                              </span>
                              <span className="font-mono text-xs">{session.ipAddress ?? 'No address recorded'}</span>
                              <span>{`active ${timeAgo(session.lastActivity)}`}</span>
                              <span className="text-stone-500">{`signed in ${timeAgo(session.createdAt)}`}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { RefreshCw, Code, BarChart3, Zap, Monitor, Users, Activity, LucideIcon } from 'lucide-react';
import { api } from '../../utils/api';
import type { TimeRange } from './DevDashboard/types';
import { useDashboardResource, refreshOpenResources } from './DevDashboard/useDashboardResource';
import { TabState } from './DevDashboard/TabState';
import { OverviewTab } from './DevDashboard/OverviewTab';
import { ApiTab } from './DevDashboard/ApiTab';
import { UsageTab } from './DevDashboard/UsageTab';
import { SessionsTab } from './DevDashboard/SessionsTab';
import { AuditLogTab } from './DevDashboard/AuditLogTab';

type TabId = 'overview' | 'api' | 'usage' | 'sessions' | 'audit';

const TABS: Array<{ id: TabId; label: string; icon: LucideIcon; ranged: boolean }> = [
  { id: 'overview', label: 'Overview', icon: BarChart3, ranged: false },
  { id: 'api', label: 'API', icon: Zap, ranged: true },
  { id: 'usage', label: 'Usage', icon: Monitor, ranged: true },
  { id: 'sessions', label: 'Sessions', icon: Users, ranged: false },
  { id: 'audit', label: 'Audit Log', icon: Activity, ranged: true },
];

const RANGES: Array<{ value: TimeRange; label: string }> = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

const POLL_MS = 30_000;

// Each pane owns its data, so a tab that is not open loads nothing.
const OverviewPane: React.FC = () => {
  const resource = useDashboardResource('overview', api.devDashboard.getOverview, { pollMs: POLL_MS });
  return <TabState resource={resource}>{(data) => <OverviewTab data={data} />}</TabState>;
};

const ApiPane: React.FC<{ timeRange: TimeRange }> = ({ timeRange }) => {
  const resource = useDashboardResource(`api:${timeRange}`, () => api.devDashboard.getApiAnalytics(timeRange), { pollMs: POLL_MS });
  return <TabState resource={resource}>{(data) => <ApiTab data={data} timeRange={timeRange} />}</TabState>;
};

const UsagePane: React.FC<{ timeRange: TimeRange }> = ({ timeRange }) => {
  const resource = useDashboardResource(`usage:${timeRange}`, () => api.devDashboard.getUsage(timeRange), { pollMs: POLL_MS });
  return <TabState resource={resource}>{(data) => <UsageTab data={data} />}</TabState>;
};

const SessionsPane: React.FC = () => {
  const resource = useDashboardResource('sessions', api.devDashboard.getSessions, { pollMs: POLL_MS });
  return <TabState resource={resource}>{(data) => <SessionsTab data={data} />}</TabState>;
};

export const DevDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const ranged = TABS.find((tab) => tab.id === activeTab)!.ranged;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-hero-2 to-hero-3 rounded-lg flex items-center justify-center">
            <Code className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-stone-900">Developer Dashboard</h1>
            <p className="text-sm text-stone-600">Health, API traffic, usage, sessions and the audit trail</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {ranged && (
            <select
              aria-label="Time range"
              value={timeRange}
              onChange={(event) => setTimeRange(event.target.value as TimeRange)}
              className="px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 text-sm"
            >
              {RANGES.map((range) => (
                <option key={range.value} value={range.value}>{range.label}</option>
              ))}
            </select>
          )}
          <button type="button" onClick={refreshOpenResources} className="btn-primary">
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
        <div className="overflow-x-auto px-4 pt-4 md:px-6 md:pt-6">
          <div className="seg-track" role="tablist" aria-label="Dashboard sections">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`devdash-tab-${tab.id}`}
                  aria-selected={selected}
                  aria-controls="devdash-panel"
                  onClick={() => setActiveTab(tab.id)}
                  className={`seg-tab ${selected ? 'seg-tab-active' : 'seg-tab-idle'}`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div id="devdash-panel" role="tabpanel" aria-labelledby={`devdash-tab-${activeTab}`} className="p-4 md:p-6">
          {activeTab === 'overview' && <OverviewPane />}
          {activeTab === 'api' && <ApiPane timeRange={timeRange} />}
          {activeTab === 'usage' && <UsagePane timeRange={timeRange} />}
          {activeTab === 'sessions' && <SessionsPane />}
          {activeTab === 'audit' && <AuditLogTab timeRange={timeRange} />}
        </div>
      </div>
    </div>
  );
};

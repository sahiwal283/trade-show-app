import React, { useState, useEffect } from 'react';
import { RefreshCw, Code } from 'lucide-react';
import { User } from '../../App';
import { api } from '../../utils/api';
import { AppError } from '../../types/types';
import { DashboardSummaryCards } from './DevDashboard/DashboardSummaryCards';
import { DashboardTabNavigation } from './DevDashboard/DashboardTabNavigation';
import { OverviewTab } from './DevDashboard/OverviewTab';
import { MetricsTab } from './DevDashboard/MetricsTab';
import { OcrTab } from './DevDashboard/OcrTab';
import { ModelTrainingTab } from './DevDashboard/ModelTrainingTab';
import { AuditLogsTab } from './DevDashboard/AuditLogsTab';
import { SessionsTab } from './DevDashboard/SessionsTab';
import { ApiAnalyticsTab } from './DevDashboard/ApiAnalyticsTab';
import { AlertsTab } from './DevDashboard/AlertsTab';
import { PageAnalyticsTab } from './DevDashboard/PageAnalyticsTab';

interface DevDashboardProps {
  user: User;
}

export const DevDashboard: React.FC<DevDashboardProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState('24h');
  
  // Data states
  const [summary, setSummary] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [apiAnalytics, setApiAnalytics] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [pageAnalytics, setPageAnalytics] = useState<any>(null);
  const [versionInfo, setVersionInfo] = useState<any>(null);
  const [ocrMetrics, setOcrMetrics] = useState<any>(null);
  
  // Filters
  const [auditSearchTerm, setAuditSearchTerm] = useState('');
  const [auditAction, setAuditAction] = useState('all');
  const [alertStatus, setAlertStatus] = useState('active');

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(() => {
      if (activeTab === 'overview' || activeTab === 'metrics' || activeTab === 'sessions') {
        loadDashboardData(true);
      }
    }, 30000); // Refresh every 30s

    return () => clearInterval(interval);
  }, [activeTab, timeRange]);

  const loadDashboardData = async (silent = false, includeTabData = true) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      // Always load core dashboard data (summary, metrics, version, OCR)
      const [summaryData, metricsData, versionData, ocrData] = await Promise.all([
        api.devDashboard.getSummary(),
        api.devDashboard.getMetrics(timeRange),
        api.devDashboard.getVersion(),
        api.devDashboard.getOcrMetrics().catch(() => null), // Graceful fallback if OCR service unavailable
      ]);

      setSummary(summaryData);
      setMetrics(metricsData);
      setVersionInfo(versionData);
      setOcrMetrics(ocrData);

      // Only load tab-specific data on initial load or explicit refresh
      if (includeTabData) {
        await loadTabData(activeTab);
      }
    } catch (error) {
      const appError = error as AppError;
      console.error('Failed to load dashboard data:', appError);
      console.error('Error details:', {
        message: appError?.message,
        response: error?.response?.data,
        status: error?.response?.status
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    // Only load tab-specific data, not everything
    loadTabData(tabId);
  };

  const loadTabData = async (tabId: string) => {
    try {
      if (tabId === 'logs') {
        const logsData = await api.devDashboard.getAuditLogs({
          limit: 50,
          action: auditAction !== 'all' ? auditAction : undefined,
          search: auditSearchTerm || undefined,
        });
        setAuditLogs(logsData.logs || []);
      } else if (tabId === 'sessions') {
        const sessionsData = await api.devDashboard.getSessions();
        setSessions(sessionsData.sessions || []);
      } else if (tabId === 'api') {
        const analyticsData = await api.devDashboard.getApiAnalytics(timeRange);
        setApiAnalytics(analyticsData);
      } else if (tabId === 'alerts') {
        const alertsData = await api.devDashboard.getAlerts(alertStatus);
        setAlerts(alertsData.alerts || []);
      } else if (tabId === 'analytics') {
        const pageData = await api.devDashboard.getPageAnalytics(timeRange);
        setPageAnalytics(pageData);
      }
      // overview, metrics, ocr, training tabs use data already loaded
    } catch (error) {
      const appError = error as AppError;
      console.error('Failed to load tab data:', appError);
    }
  };

  const handleAlertStatusChange = async (status: string) => {
    setAlertStatus(status);
    // Only reload alerts, not entire dashboard
    try {
      const alertsData = await api.devDashboard.getAlerts(status);
      setAlerts(alertsData.alerts || []);
    } catch (error) {
      console.error('Failed to load alerts:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 animate-spin mx-auto text-blue-500" />
          <p className="mt-4 text-stone-600">Loading Developer Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
              <Code className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-stone-900">Developer Dashboard</h1>
              <p className="text-sm text-stone-600">System health, logs, and analytics</p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
          <button
            onClick={() => loadDashboardData()}
            disabled={refreshing}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center space-x-2 text-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && <DashboardSummaryCards summary={summary} />}

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
        <DashboardTabNavigation activeTab={activeTab} onTabChange={handleTabChange} />

        {/* Tab Content */}
        <div className="p-4 md:p-6">
          {activeTab === 'overview' && !versionInfo && !metrics && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-red-900">Failed to Load Dashboard Data</h3>
                  <p className="mt-1 text-sm text-red-700">
                    Unable to fetch dashboard metrics. Please check your permissions and try refreshing the page.
                  </p>
                  <button
                    onClick={() => loadDashboardData()}
                    className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                  >
                    Retry
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'overview' && versionInfo && metrics && (
            <OverviewTab
              versionInfo={versionInfo}
              metrics={metrics}
              formatUptime={formatUptime}
              formatBytes={formatBytes}
            />
          )}

          {activeTab === 'ocr' && (
            <div>
              <OcrTab ocrMetrics={ocrMetrics} />
            </div>
          )}

          {activeTab === 'training' && <ModelTrainingTab user={user} />}

          {activeTab === 'metrics' && metrics && (
            <MetricsTab metrics={metrics} formatUptime={formatUptime} />
          )}

          {activeTab === 'logs' && (
            <AuditLogsTab
              auditLogs={auditLogs}
              auditSearchTerm={auditSearchTerm}
              auditAction={auditAction}
              onSearchChange={setAuditSearchTerm}
              onActionChange={setAuditAction}
              onApplyFilters={() => loadTabData('logs')}
            />
          )}

          {activeTab === 'sessions' && <SessionsTab sessions={sessions} />}

          {activeTab === 'api' && apiAnalytics && (
            <ApiAnalyticsTab apiAnalytics={apiAnalytics} timeRange={timeRange} />
          )}

          {activeTab === 'alerts' && (
            <AlertsTab
              alerts={alerts}
              alertStatus={alertStatus}
              onStatusChange={handleAlertStatusChange}
            />
          )}

          {activeTab === 'analytics' && pageAnalytics && (
            <PageAnalyticsTab pageAnalytics={pageAnalytics} />
          )}
        </div>
      </div>
    </div>
  );
};

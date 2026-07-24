import React from 'react';
import { BarChart3, Cpu, Brain, Activity, Users, Zap, AlertTriangle, Scan, Monitor, LucideIcon } from 'lucide-react';

interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface DashboardTabNavigationProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

const tabs: Tab[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'metrics', label: 'Metrics', icon: Cpu },
  { id: 'ocr', label: 'OCR Service', icon: Scan },
  { id: 'training', label: 'Model Training', icon: Brain },
  { id: 'logs', label: 'Audit Logs', icon: Activity },
  { id: 'sessions', label: 'Sessions', icon: Users },
  { id: 'api', label: 'API Analytics', icon: Zap },
  { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
  { id: 'analytics', label: 'Page Views', icon: Monitor },
];

export const DashboardTabNavigation: React.FC<DashboardTabNavigationProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="overflow-x-auto px-4 pt-4 md:px-6 md:pt-6">
      <nav className="seg-track" aria-label="Tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`seg-tab ${activeTab === tab.id ? 'seg-tab-active' : 'seg-tab-idle'}`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};


import React from 'react';
import { BarChart3, Cpu, Brain, Activity, Users, Zap, AlertTriangle, Eye, Scan, Monitor, LucideIcon } from 'lucide-react';

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
    <div className="border-b border-stone-200 overflow-x-auto">
      <nav className="flex space-x-4 md:space-x-8 px-4 md:px-6 min-w-max" aria-label="Tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`py-3 md:py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </div>
            </button>
          );
        })}
      </nav>
    </div>
  );
};


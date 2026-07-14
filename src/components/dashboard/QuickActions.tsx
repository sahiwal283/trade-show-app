import React, { useEffect, useState } from 'react';
import { 
  UserPlus, FileText, Upload, AlertTriangle, Clock, DollarSign, 
  ArrowRight, RefreshCw 
} from 'lucide-react';
import { User } from '../../App';
import { api } from '../../utils/api';

interface Task {
  id: string;
  type: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  count: number;
  action: string;
  link: string;
  icon: string;
  eventIds?: string[];
  primaryEventId?: string;
}

interface QuickActionsProps {
  user: User;
  onNavigate: (page: string) => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({ user, onNavigate }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTasks = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const response = await api.quickActions.getTasks();
      setTasks(response.tasks || []);
    } catch (error) {
      console.error('Failed to load quick actions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTasks();
    // Refresh every 60 seconds
    const interval = setInterval(() => loadTasks(true), 60000);
    return () => clearInterval(interval);
  }, []);

  const getIcon = (iconName: string) => {
    const icons: { [key: string]: JSX.Element } = {
      UserPlus: <UserPlus className="w-5 h-5" />,
      FileText: <FileText className="w-5 h-5" />,
      Upload: <Upload className="w-5 h-5" />,
      AlertTriangle: <AlertTriangle className="w-5 h-5" />,
      Clock: <Clock className="w-5 h-5" />,
      DollarSign: <DollarSign className="w-5 h-5" />
    };
    return icons[iconName] || <FileText className="w-5 h-5" />;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'border-l-red-500 hover:border-red-200';
      case 'medium':
        return 'border-l-amber-500 hover:border-amber-200';
      default:
        return 'border-l-brand-500 hover:border-brand-200';
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-50 text-red-700 ring-red-200/70';
      case 'medium':
        return 'bg-amber-50 text-amber-800 ring-amber-200/70';
      default:
        return 'bg-brand-50 text-brand-700 ring-brand-200/70';
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center justify-between px-5 md:px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="card-title">Quick Actions</h2>
        </div>
        <div className="flex items-center justify-center py-10">
          <div className="w-8 h-8 border-[3px] border-brand-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between px-5 md:px-6 pt-5 pb-4 border-b border-gray-100">
        <h2 className="card-title">Pending Tasks</h2>
        <button
          onClick={() => loadTasks(true)}
          disabled={refreshing}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-12 px-6">
          <div className="w-14 h-14 bg-accent-50 ring-1 ring-inset ring-accent-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-600">All caught up!</p>
          <p className="text-sm text-gray-400 mt-1">No pending tasks at the moment</p>
        </div>
      ) : (
        <div className="space-y-3 p-4 md:p-5">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`rounded-lg border border-gray-200/80 border-l-4 bg-white p-4 transition-all duration-200 hover:shadow-elevation-2 ${getPriorityColor(task.priority)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  <div className={`mt-0.5 ${task.priority === 'high' ? 'text-red-500' : task.priority === 'medium' ? 'text-amber-500' : 'text-brand-500'}`}>
                    {getIcon(task.icon)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-gray-900">{task.title}</h3>
                      <span className={`chip px-2 py-0.5 text-[11px] capitalize ${getPriorityBadge(task.priority)}`}>
                        {task.priority}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">{task.description}</p>
                    <button
                      onClick={() => {
                        // Extract page name from link
                        const page = task.link.replace('/', '');
                        
                        // Use sessionStorage to pass tab information (more reliable than hash for navigation)
                        if (task.type === 'pending_users' && page === 'settings') {
                          // Signal to AdminSettings to open User Management tab
                          sessionStorage.setItem('openSettingsTab', 'users');
                        }
                        // Note: 'unpushed_zoho' tasks now direct to unified expenses page (v1.3.0+)
                        // Approvals page was removed and merged into expenses page
                        
                        // Navigate
                        onNavigate(page);
                      }}
                      className={`inline-flex items-center text-sm font-medium transition-colors ${
                        task.priority === 'high' 
                          ? 'text-red-600 hover:text-red-700' 
                          : task.priority === 'medium'
                          ? 'text-yellow-600 hover:text-yellow-700'
                          : 'text-blue-600 hover:text-blue-700'
                      }`}
                    >
                      {task.action}
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};


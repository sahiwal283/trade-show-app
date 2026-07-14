import React, { useState, useEffect } from 'react';
import { Brain, TrendingUp, Download, RefreshCw, AlertCircle, CheckCircle, Clock, Users, Database } from 'lucide-react';
import { api } from '../../utils/api';

interface TrainingStats {
  overall: {
    total_corrections: number;
    unique_users: number;
    unique_expenses: number;
    first_correction: string;
    last_correction: string;
  };
  byField: Array<{ field: string; correction_count: number }>;
  byProvider: Array<{ ocr_provider: string; correction_count: number }>;
  recentTrend: Array<{ date: string; corrections: number }>;
}

interface LearnedPattern {
  field: string;
  pattern: {
    original: string;
    corrected: string;
    originalConfidence: number;
  };
  frequency: number;
  lastSeen: string;
  userCount: number;
  learnedConfidence: number;
}

interface AccuracyData {
  field: string;
  totalExtractions: number;
  correctionCount: number;
  accuracyRate: number;
  commonIssues: string[];
}

export const ModelTrainingDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [patterns, setPatterns] = useState<LearnedPattern[]>([]);
  const [accuracy, setAccuracy] = useState<AccuracyData[]>([]);
  const [selectedField, setSelectedField] = useState<string>('all');
  const [minFrequency, setMinFrequency] = useState(3);
  const [activeTab, setActiveTab] = useState<'overview' | 'patterns' | 'accuracy'>('overview');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load all data in parallel
      const [statsRes, patternsRes, accuracyRes] = await Promise.all([
        fetch('/api/training/stats', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        }),
        fetch('/api/training/patterns', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        }),
        fetch('/api/ocr/v2/accuracy', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        })
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }

      if (patternsRes.ok) {
        const data = await patternsRes.json();
        setPatterns(data.patterns || []);
      }

      if (accuracyRes.ok) {
        const data = await accuracyRes.json();
        setAccuracy(data.fields || []);
      }
    } catch (error) {
      console.error('Error loading training data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleForceRefresh = async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/training/refresh', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      });

      if (response.ok) {
        alert('✅ Patterns will refresh on next OCR request');
        await loadData();
      } else {
        alert('❌ Failed to refresh patterns');
      }
    } catch (error) {
      console.error('Error refreshing:', error);
      alert('❌ Error refreshing patterns');
    } finally {
      setRefreshing(false);
    }
  };

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const response = await fetch(`/api/training/export?format=${format}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `training_data_${Date.now()}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert('❌ Failed to export data');
      }
    } catch (error) {
      console.error('Error exporting:', error);
      alert('❌ Error exporting data');
    }
  };

  const filteredPatterns = patterns.filter(p => 
    (selectedField === 'all' || p.field === selectedField) &&
    p.frequency >= minFrequency
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-3 text-stone-600">Loading training data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center">
            <Brain className="w-8 h-8 text-purple-600 mr-3" />
            AI Model Training
          </h2>
          <p className="text-stone-600 mt-1">
            Monitor and manage the adaptive learning system
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => handleExport('json')}
            className="flex items-center px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4 mr-2" />
            Export JSON
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
          <button
            onClick={handleForceRefresh}
            disabled={refreshing}
            className="flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Force Refresh'}
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm">Total Corrections</p>
                <p className="text-3xl font-bold mt-1">{stats.overall.total_corrections}</p>
              </div>
              <Database className="w-12 h-12 text-blue-200 opacity-50" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm">Learned Patterns</p>
                <p className="text-3xl font-bold mt-1">{patterns.length}</p>
              </div>
              <Brain className="w-12 h-12 text-purple-200 opacity-50" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm">Active Users</p>
                <p className="text-3xl font-bold mt-1">{stats.overall.unique_users}</p>
              </div>
              <Users className="w-12 h-12 text-green-200 opacity-50" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100 text-sm">Receipts Trained</p>
                <p className="text-3xl font-bold mt-1">{stats.overall.unique_expenses}</p>
              </div>
              <TrendingUp className="w-12 h-12 text-orange-200 opacity-50" />
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-stone-200">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'overview'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('patterns')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'patterns'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
            }`}
          >
            Learned Patterns ({patterns.length})
          </button>
          <button
            onClick={() => setActiveTab('accuracy')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'accuracy'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
            }`}
          >
            Accuracy Metrics
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && stats && (
        <div className="space-y-6">
          {/* Corrections by Field */}
          <div className="bg-white rounded-lg border border-stone-200 p-6">
            <h3 className="text-lg font-semibold text-stone-900 mb-4">Corrections by Field</h3>
            <div className="space-y-3">
              {stats.byField.map((item) => {
                const total = stats.overall.total_corrections;
                const percentage = (item.correction_count / total) * 100;
                return (
                  <div key={item.field}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-stone-700 capitalize">{item.field}</span>
                      <span className="text-sm text-stone-500">{item.correction_count} ({percentage.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-stone-200 rounded-full h-2">
                      <div 
                        className="bg-purple-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Trend */}
          <div className="bg-white rounded-lg border border-stone-200 p-6">
            <h3 className="text-lg font-semibold text-stone-900 mb-4">Correction Trend (Last 30 Days)</h3>
            <div className="space-y-2">
              {stats.recentTrend.slice(0, 10).map((item) => (
                <div key={item.date} className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0">
                  <span className="text-sm text-stone-600">{new Date(item.date).toLocaleDateString()}</span>
                  <span className="text-sm font-medium text-stone-900">{item.corrections} corrections</span>
                </div>
              ))}
            </div>
          </div>

          {/* System Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="text-sm font-medium text-blue-900 mb-1">Pattern Refresh Cycle</h4>
                <p className="text-sm text-blue-700">
                  Learned patterns are cached and refresh automatically every <strong>24 hours</strong>.
                  Last correction: {new Date(stats.overall.last_correction).toLocaleString()}
                </p>
                <p className="text-sm text-blue-700 mt-2">
                  Click "Force Refresh" above to reload patterns immediately (useful after bulk corrections).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'patterns' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-lg border border-stone-200 p-4">
            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-stone-700 mb-1">Filter by Field</label>
                <select
                  value={selectedField}
                  onChange={(e) => setSelectedField(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="all">All Fields</option>
                  <option value="merchant">Merchant</option>
                  <option value="category">Category</option>
                  <option value="amount">Amount</option>
                  <option value="date">Date</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-stone-700 mb-1">Min Frequency</label>
                <input
                  type="number"
                  value={minFrequency}
                  onChange={(e) => setMinFrequency(parseInt(e.target.value) || 1)}
                  min="1"
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
            </div>
          </div>

          {/* Patterns List */}
          <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-stone-200">
                <thead className="bg-stone-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">Field</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">Original (OCR)</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">Corrected To</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">Frequency</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">Confidence</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">Users</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-stone-200">
                  {filteredPatterns.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-stone-500">
                        No learned patterns yet. System needs at least 3 identical corrections to learn a pattern.
                      </td>
                    </tr>
                  ) : (
                    filteredPatterns.map((pattern, idx) => (
                      <tr key={idx} className="hover:bg-stone-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800 capitalize">
                            {pattern.field}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-stone-900 max-w-xs truncate" title={pattern.pattern.original}>
                            {pattern.pattern.original}
                          </div>
                          <div className="text-xs text-stone-500">
                            OCR confidence: {(pattern.pattern.originalConfidence * 100).toFixed(0)}%
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-stone-900">{pattern.pattern.corrected}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                            <span className="text-sm text-stone-900">{pattern.frequency}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-sm font-medium ${
                            pattern.learnedConfidence >= 0.9 ? 'text-green-600' :
                            pattern.learnedConfidence >= 0.8 ? 'text-yellow-600' :
                            'text-orange-600'
                          }`}>
                            {(pattern.learnedConfidence * 100).toFixed(0)}%
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Users className="w-4 h-4 text-stone-400 mr-1" />
                            <span className="text-sm text-stone-900">{pattern.userCount}</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'accuracy' && (
        <div className="space-y-4">
          {/* Accuracy Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {accuracy.map((field) => {
              const accuracyColor = 
                field.accuracyRate >= 90 ? 'green' :
                field.accuracyRate >= 75 ? 'yellow' :
                field.accuracyRate >= 60 ? 'orange' :
                'red';

              return (
                <div key={field.field} className="bg-white rounded-lg border border-stone-200 p-6">
                  <h4 className="text-sm font-medium text-stone-500 uppercase tracking-wider mb-2 capitalize">
                    {field.field}
                  </h4>
                  <div className="flex items-baseline">
                    <p className={`text-4xl font-bold text-${accuracyColor}-600`}>
                      {field.accuracyRate.toFixed(1)}%
                    </p>
                    {field.accuracyRate >= 85 && (
                      <CheckCircle className="w-6 h-6 text-green-500 ml-2" />
                    )}
                  </div>
                  <div className="mt-4 space-y-1 text-sm text-stone-600">
                    <div className="flex justify-between">
                      <span>Total extractions:</span>
                      <span className="font-medium">{field.totalExtractions}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Corrections:</span>
                      <span className="font-medium text-orange-600">{field.correctionCount}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Target Accuracy */}
          <div className="bg-white rounded-lg border border-stone-200 p-6">
            <h3 className="text-lg font-semibold text-stone-900 mb-4">Target Accuracy Goals</h3>
            <div className="space-y-4">
              {[
                { field: 'merchant', current: accuracy.find(a => a.field === 'merchant')?.accuracyRate || 0, target: 85 },
                { field: 'amount', current: accuracy.find(a => a.field === 'amount')?.accuracyRate || 0, target: 95 },
                { field: 'date', current: accuracy.find(a => a.field === 'date')?.accuracyRate || 0, target: 90 },
                { field: 'category', current: accuracy.find(a => a.field === 'category')?.accuracyRate || 0, target: 75 }
              ].map((item) => {
                const progress = (item.current / item.target) * 100;
                const isReached = item.current >= item.target;

                return (
                  <div key={item.field}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-stone-700 capitalize">{item.field}</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-stone-500">
                          {item.current.toFixed(1)}% / {item.target}%
                        </span>
                        {isReached && <CheckCircle className="w-4 h-4 text-green-500" />}
                      </div>
                    </div>
                    <div className="w-full bg-stone-200 rounded-full h-3">
                      <div 
                        className={`h-3 rounded-full transition-all duration-500 ${
                          isReached ? 'bg-green-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="text-sm font-medium text-green-900 mb-1">How to Improve Accuracy</h4>
                <ul className="text-sm text-green-700 space-y-1 list-disc list-inside">
                  <li>Correct all obvious mistakes when reviewing receipts</li>
                  <li>Use consistent merchant names (e.g., always "Uber", not "uber" or "UBER")</li>
                  <li>Select accurate categories from the dropdown</li>
                  <li>After 20-30 corrections per merchant, accuracy improves significantly</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


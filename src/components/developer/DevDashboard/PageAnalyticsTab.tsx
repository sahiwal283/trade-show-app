import React from 'react';
import { Eye, TrendingUp } from 'lucide-react';

interface PageAnalyticsData {
  page_views?: Array<{
    page: string;
    views: number;
    unique_visitors: number;
  }>;
  total_views?: number;
  unique_visitors?: number;
}

interface PageAnalyticsTabProps {
  pageAnalytics: PageAnalyticsData;
}

export const PageAnalyticsTab: React.FC<PageAnalyticsTabProps> = ({ pageAnalytics }) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-5 border border-purple-200">
          <div className="flex items-center justify-between mb-2">
            <Eye className="w-6 h-6 text-purple-600" />
            <TrendingUp className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-3xl font-bold text-stone-900 mb-1">
            {pageAnalytics.total_views?.toLocaleString() || 0}
          </p>
          <p className="text-sm text-stone-600">Total Page Views</p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-5 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <Eye className="w-6 h-6 text-blue-600" />
          </div>
          <p className="text-3xl font-bold text-stone-900 mb-1">
            {pageAnalytics.unique_visitors?.toLocaleString() || 0}
          </p>
          <p className="text-sm text-stone-600">Unique Visitors</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
        <div className="p-4 border-b border-stone-200">
          <h3 className="text-lg font-semibold text-stone-900">Page Views Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-stone-200">
            <thead className="bg-stone-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">Page</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">Views</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">Unique Visitors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {pageAnalytics.page_views && pageAnalytics.page_views.length > 0 ? (
                pageAnalytics.page_views.map((page, index) => (
                  <tr key={index} className="hover:bg-stone-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-stone-900">{page.page}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-600">{page.views.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-600">{page.unique_visitors.toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-sm text-stone-500">
                    No page analytics data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};


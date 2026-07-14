import React from 'react';

interface ApiEndpointStat {
  endpoint: string;
  method: string;
  call_count: number;
  avg_response_time: string;
  max_response_time: number;
  error_count: number;
}

interface ApiAnalyticsData {
  endpointStats?: ApiEndpointStat[];
  slowestEndpoints?: ApiEndpointStat[];
}

interface ApiAnalyticsTabProps {
  apiAnalytics: ApiAnalyticsData;
  timeRange: string;
}

const getMethodColor = (method: string) => {
  switch (method) {
    case 'GET': return 'bg-blue-100 text-blue-800';
    case 'POST': return 'bg-green-100 text-green-800';
    case 'PUT': return 'bg-yellow-100 text-yellow-800';
    case 'DELETE': return 'bg-red-100 text-red-800';
    default: return 'bg-stone-100 text-stone-800';
  }
};

const getResponseTimeColor = (time: number) => {
  if (time > 1000) return 'text-red-600';
  if (time > 500) return 'text-yellow-600';
  return 'text-stone-700';
};

export const ApiAnalyticsTab: React.FC<ApiAnalyticsTabProps> = ({ apiAnalytics, timeRange }) => {
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Endpoint Stats */}
      <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
        <div className="p-4 border-b border-stone-200">
          <h3 className="text-lg font-semibold text-stone-900">Top Endpoints ({timeRange})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-stone-600 uppercase">Endpoint</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-stone-600 uppercase">Method</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-stone-600 uppercase">Calls</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-stone-600 uppercase">Avg Time</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-stone-600 uppercase">Max Time</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-stone-600 uppercase">Errors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {apiAnalytics.endpointStats?.map((stat, index) => (
                <tr key={index} className="hover:bg-stone-50">
                  <td className="px-4 py-3 text-stone-900 font-mono text-xs">{stat.endpoint}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getMethodColor(stat.method)}`}>
                      {stat.method}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-stone-900">{stat.call_count}</td>
                  <td className="px-4 py-3 text-right text-stone-700">
                    {parseInt(stat.avg_response_time).toFixed(0)}ms
                  </td>
                  <td className="px-4 py-3 text-right text-stone-700">{stat.max_response_time}ms</td>
                  <td className="px-4 py-3 text-right">
                    <span className={stat.error_count > 0 ? 'text-red-600 font-medium' : 'text-stone-600'}>
                      {stat.error_count}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slowest Endpoints */}
      {apiAnalytics.slowestEndpoints && apiAnalytics.slowestEndpoints.length > 0 && (
        <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
          <div className="p-4 border-b border-stone-200">
            <h3 className="text-lg font-semibold text-stone-900">Slowest Endpoints</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-600 uppercase">Endpoint</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-600 uppercase">Method</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-stone-600 uppercase">Avg Time</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-stone-600 uppercase">Max Time</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-stone-600 uppercase">Calls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {apiAnalytics.slowestEndpoints.map((stat, index) => (
                  <tr key={index} className="hover:bg-stone-50">
                    <td className="px-4 py-3 text-stone-900 font-mono text-xs">{stat.endpoint}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-stone-100 text-stone-800">
                        {stat.method}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${getResponseTimeColor(parseFloat(stat.avg_response_time))}`}>
                        {parseFloat(stat.avg_response_time).toFixed(0)}ms
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-stone-700">{stat.max_response_time}ms</td>
                    <td className="px-4 py-3 text-right text-stone-600">{stat.call_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};


import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { DashboardResource } from './useDashboardResource';

interface TabStateProps<T> {
  resource: DashboardResource<T>;
  skeletonRows?: number;
  children: (data: T) => React.ReactNode;
}

/**
 * The three states every tab shares: nothing yet (skeleton), failed with
 * nothing to show (error + retry), or data — with a quiet notice above it if
 * the latest refresh failed and what is on screen is the previous result.
 */
export function TabState<T>({ resource, skeletonRows = 4, children }: TabStateProps<T>) {
  const { data, loading, error, refresh } = resource;

  if (loading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading">
        {Array.from({ length: skeletonRows }, (_, index) => (
          <div key={index} className="h-16 rounded-lg bg-stone-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (data === undefined) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5" role="alert">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-red-900">Couldn't load this tab</p>
            <p className="mt-1 text-sm text-red-700 break-words">{error}</p>
            <button onClick={refresh} className="btn-secondary mt-3">Try again</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {error && (
        <p className="mb-3 text-sm text-amber-700" role="status">
          Couldn't refresh ({error}). Showing the last result.
        </p>
      )}
      {children(data)}
    </>
  );
}

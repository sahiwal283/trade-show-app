/**
 * SpendMixDonut — where the invested dollars actually go: total show spend
 * by cost category (booth space, flights, hotels, …) across the current
 * scope. Top categories keep their own slice; the tail folds into "Other".
 */

import React, { useMemo } from 'react';
import { ShowSummaryRow } from './hooks/useShowSummaries';
import { DonutChart } from './DonutChart';
import { DonutSlice, foldSlices } from './donutData';

const MAX_SLICES = 7;

interface SpendMixDonutProps {
  rows: ShowSummaryRow[];
}

export const SpendMixDonut: React.FC<SpendMixDonutProps> = ({ rows }) => {
  const slices = useMemo<DonutSlice[]>(() => {
    const byCategory: Record<string, number> = {};
    for (const r of rows) byCategory[r.category] = (byCategory[r.category] || 0) + r.amount;
    const sorted = Object.entries(byCategory)
      .map(([label, value]) => ({ label, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
    return foldSlices(sorted, MAX_SLICES);
  }, [rows]);

  if (slices.length === 0) return null;

  return (
    <div className="card p-3 sm:p-5">
      <div className="mb-4">
        <h3 className="micro-label">Spend mix</h3>
        <p className="mt-0.5 text-xs text-stone-500">
          Each slice is a cost category's share of every dollar invested in shows
        </p>
      </div>
      <DonutChart
        slices={slices}
        centerLabel="Invested"
        ariaLabel={`Total show investment split across ${slices.length} cost categories. Exact amounts and percentages are listed beside the chart.`}
      />
    </div>
  );
};

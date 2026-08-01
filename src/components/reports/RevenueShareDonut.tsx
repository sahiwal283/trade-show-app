/**
 * RevenueShareDonut — where the attributed revenue came from: each slice is
 * one show's lifetime share of all attributed revenue (top shows named, the
 * tail folded into "Other"). Renders nothing until any revenue exists, so
 * the page never shows an empty ring.
 */

import React, { useMemo } from 'react';
import { RoiShowGroup } from './roiData';
import { DonutChart } from './DonutChart';
import { DonutSlice, foldSlices } from './donutData';

/** Top 5 named shows + "Other" */
const MAX_SLICES = 6;

interface RevenueShareDonutProps {
  /** Matched show groups (ranked) — lifetime revenue per show */
  shows: RoiShowGroup[];
}

export const RevenueShareDonut: React.FC<RevenueShareDonutProps> = ({ shows }) => {
  const slices = useMemo<DonutSlice[]>(() => {
    const sorted = shows
      .filter((g) => g.revenue > 0)
      .map((g) => ({ label: `${g.name} ${g.yearsLabel}`, value: g.revenue }))
      .sort((a, b) => b.value - a.value);
    return foldSlices(sorted, MAX_SLICES);
  }, [shows]);

  const total = slices.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return null;

  return (
    <div className="card p-3 sm:p-5">
      <div className="mb-4">
        <h3 className="micro-label">Where the revenue came from</h3>
        <p className="mt-0.5 text-xs text-stone-500">
          Each slice is one show's share of all revenue attributed to converted leads
        </p>
      </div>
      <DonutChart
        slices={slices}
        centerLabel="Attributed"
        ariaLabel={`Attributed revenue split across ${slices.length} shows. Exact amounts and percentages are listed beside the chart.`}
      />
    </div>
  );
};

/**
 * donutData — shared, non-visual pieces of the Reports donut grammar:
 * slice folding and the single brand-ramp color assignment. Kept apart from
 * DonutChart.tsx so the component file only exports a component.
 */

export interface DonutSlice {
  label: string;
  value: number;
}

/** Largest slice wears the accent; the rest step down one blue ramp.
 *  Monotonic lightness keeps adjacent slices separable for CVD readers. */
const RAMP = [
  '#059669', // accent-600 — the headline slice
  '#1e40af', // brand-800
  '#2563eb', // brand-600
  '#60a5fa', // brand-400
  '#93c5fd', // brand-300
  '#bfdbfe', // brand-200
];
/** "Other" is a bucket, not an entity — it reads neutral. */
const OTHER_COLOR = '#d6d3d1'; // stone-300
export const OTHER_LABEL = 'Other';

/** Fold a desc-sorted list into ≤ maxSlices slices, tail summed as "Other". */
export function foldSlices(sorted: DonutSlice[], maxSlices: number): DonutSlice[] {
  if (sorted.length <= maxSlices) return sorted;
  const head = sorted.slice(0, maxSlices - 1);
  const tail = sorted.slice(maxSlices - 1);
  return [...head, { label: OTHER_LABEL, value: tail.reduce((s, d) => s + d.value, 0) }];
}

export const sliceColor = (index: number, label: string): string =>
  label === OTHER_LABEL ? OTHER_COLOR : RAMP[Math.min(index, RAMP.length - 1)];

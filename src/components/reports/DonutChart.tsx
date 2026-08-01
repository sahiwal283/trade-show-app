/**
 * DonutChart — the one donut grammar every Reports donut uses: size-sorted
 * slices in a single brand ramp (accent for the largest), 2px white gaps
 * between fills, the headline total in the center, and a legend that doubles
 * as the exact-number readout (swatch · label · $ · %). Text is stone ink
 * only — color lives in the marks. Pure presentational; callers aggregate.
 */

import React from 'react';
import { fmtMoneyCompact, fmtMoneyFull } from './roiData';
import { DonutSlice, sliceColor } from './donutData';

const polarPoint = (cx: number, cy: number, r: number, angleDeg: number) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const donutSlicePath = (
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number
): string => {
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const o1 = polarPoint(cx, cy, rOuter, startAngle);
  const o2 = polarPoint(cx, cy, rOuter, endAngle);
  const i1 = polarPoint(cx, cy, rInner, endAngle);
  const i2 = polarPoint(cx, cy, rInner, startAngle);
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${o2.x} ${o2.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${i2.x} ${i2.y}`,
    'Z',
  ].join(' ');
};

interface DonutChartProps {
  /** Slices sorted desc ("Other" last is fine — it keeps its neutral color) */
  slices: DonutSlice[];
  /** Micro-label above the center total, e.g. "Invested" */
  centerLabel: string;
  ariaLabel: string;
}

export const DonutChart: React.FC<DonutChartProps> = ({ slices, centerLabel, ariaLabel }) => {
  const total = slices.reduce((s, d) => s + d.value, 0);
  if (total <= 0 || slices.length === 0) return null;

  let cursor = 0;
  const arcs = slices.map(({ label, value }, i) => {
    const start = (cursor / total) * 360;
    cursor += value;
    // Cap just under 360° so a single-slice donut still renders as an arc
    const end = Math.min((cursor / total) * 360, start + 359.98);
    return { label, value, start, end, color: sliceColor(i, label) };
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-5">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label={ariaLabel}>
          {arcs.map(({ label, value, start, end, color }) => (
            <path
              key={label}
              d={donutSlicePath(100, 100, 90, 58, start, end)}
              fill={color}
              stroke="#ffffff"
              strokeWidth={2}
            >
              <title>
                {`${label}: ${fmtMoneyFull(value)} (${((value / total) * 100).toFixed(1)}%)`}
              </title>
            </path>
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-stone-400">
            {centerLabel}
          </span>
          <span className="font-display text-lg font-bold tracking-tight tabular-nums text-stone-900">
            {fmtMoneyCompact(total)}
          </span>
        </div>
      </div>

      {/* Legend doubles as the exact-number readout */}
      <div className="w-full min-w-0 flex-1 space-y-1.5 self-center">
        {arcs.map(({ label, value, color }) => (
          <div key={label} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
              style={{ backgroundColor: color }}
            />
            <span className="min-w-0 flex-1 truncate text-stone-700" title={label}>
              {label}
            </span>
            <span className="font-semibold tabular-nums text-stone-900">{fmtMoneyFull(value)}</span>
            <span className="w-11 text-right text-xs tabular-nums text-stone-400">
              {((value / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

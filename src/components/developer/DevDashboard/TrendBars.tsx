import React from 'react';

interface TrendBarsProps {
  values: number[];
  /** One per value; shown on hover as "label: value". */
  labels: string[];
  ariaLabel: string;
  /** A second series drawn over the first on the same scale (e.g. errors). */
  highlights?: number[];
  height?: number;
}

const BAR_WIDTH = 10;
const GAP = 2;

/** A small bar strip. Inline SVG so the dashboard needs no chart library. */
export const TrendBars: React.FC<TrendBarsProps> = ({ values, labels, ariaLabel, highlights, height = 48 }) => {
  if (values.length === 0) return <p className="text-sm text-stone-500">No data</p>;

  const max = Math.max(...values, 0);
  const scale = (value: number) => (max > 0 ? Math.round((value / max) * height) : 0);
  const width = values.length * (BAR_WIDTH + GAP) - GAP;

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
    >
      {values.map((value, index) => {
        const barHeight = scale(value);
        const markHeight = highlights ? scale(highlights[index] ?? 0) : 0;
        const x = index * (BAR_WIDTH + GAP);
        return (
          <g key={index}>
            <title>{`${labels[index] ?? ''}: ${value}`}</title>
            {/* Full-height transparent target so short and empty bars still show their title on hover. */}
            <rect x={x} y={0} width={BAR_WIDTH} height={height} fill="transparent" />
            <rect data-bar x={x} y={height - barHeight} width={BAR_WIDTH} height={barHeight} rx={1} className="fill-blue-500" />
            {highlights && (
              <rect data-highlight x={x} y={height - markHeight} width={BAR_WIDTH} height={markHeight} rx={1} className="fill-red-500" />
            )}
          </g>
        );
      })}
    </svg>
  );
};

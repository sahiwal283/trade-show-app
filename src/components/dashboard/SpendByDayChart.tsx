/**
 * SpendByDayChart Component
 *
 * Dependency-free SVG area chart for daily spend. Hand-rolled instead of a
 * charting library on purpose: one chart shape doesn't justify ~100kb of
 * bundle in an offline-first PWA. Hover/touch shows a per-day tooltip.
 */

import { useRef, useState } from 'react';
import { SpendPoint } from './hooks/useShowDashboard';

interface SpendByDayChartProps {
  points: SpendPoint[];
  height?: number;
}

const WIDTH = 400;
const PAD_Y = 8;

function buildSmoothPath(coords: Array<{ x: number; y: number }>): string {
  if (coords.length === 0) return '';
  if (coords.length === 1) return `M${coords[0].x},${coords[0].y}`;
  let d = `M${coords[0].x},${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const midX = (prev.x + curr.x) / 2;
    d += ` C${midX},${prev.y} ${midX},${curr.y} ${curr.x},${curr.y}`;
  }
  return d;
}

export function SpendByDayChart({ points, height = 72 }: SpendByDayChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-stone-50 text-xs text-stone-400"
        style={{ height }}
      >
        No spend recorded yet
      </div>
    );
  }

  const max = Math.max(...points.map(p => p.total), 1);
  const stepX = points.length > 1 ? WIDTH / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    x: points.length > 1 ? i * stepX : WIDTH / 2,
    y: PAD_Y + (1 - p.total / max) * (height - PAD_Y * 2),
  }));

  const linePath = buildSmoothPath(coords);
  const areaPath =
    points.length > 1
      ? `${linePath} L${WIDTH},${height} L0,${height} Z`
      : '';

  const updateActiveFromClientX = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    setActiveIndex(Math.round(ratio * (points.length - 1)));
  };

  const active = activeIndex !== null ? points[activeIndex] : null;
  const activeCoord = activeIndex !== null ? coords[activeIndex] : null;

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseMove={e => updateActiveFromClientX(e.clientX)}
      onMouseLeave={() => setActiveIndex(null)}
      onTouchStart={e => updateActiveFromClientX(e.touches[0].clientX)}
      onTouchMove={e => updateActiveFromClientX(e.touches[0].clientX)}
      onTouchEnd={() => setActiveIndex(null)}
    >
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Spend by day"
      >
        {areaPath && <path d={areaPath} fill="rgba(37, 99, 235, 0.07)" />}
        <path
          d={linePath}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2.5}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
        />
        {activeCoord && (
          <>
            <line
              x1={activeCoord.x}
              y1={PAD_Y}
              x2={activeCoord.x}
              y2={height - 2}
              stroke="#d6d3d1"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              strokeDasharray="3 3"
            />
            <circle cx={activeCoord.x} cy={activeCoord.y} r={4} fill="#2563eb" />
          </>
        )}
      </svg>

      {active && activeCoord && (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-stone-900 px-2.5 py-1.5 text-white shadow-elevation-2"
          style={{ left: `${(activeCoord.x / WIDTH) * 100}%` }}
        >
          <div className="text-[10px] uppercase tracking-wider text-stone-400">{active.label}</div>
          <div className="text-xs font-semibold">
            ${active.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * RoiQuadrant — cost vs revenue scatter, one bubble per show-year with both
 * datasets. x = invested, y = attributed revenue, bubble area = leads.
 * A dashed y = x diagonal marks break-even: bubbles above it made money.
 *
 * Rendering: the SVG is sized to the measured container width (ResizeObserver)
 * instead of scaling a fixed viewBox, so axis text and labels stay at true
 * pixel size on phones. Ticks stop at the first step at/past the data max —
 * no dead plot space. Dataviz discipline: single brand hue with the accent
 * reserved for ≥ 2× ROI (the same state the verdict chips name, so identity
 * is never color alone), direct labels only on the top bubbles, text in stone
 * ink, one axis pair. The league table is the accessible table view.
 */

import React, { useLayoutEffect, useRef, useState } from 'react';
import { RoiShowRow, ROI_DOUBLE_DOWN, fmtMoneyCompact, fmtMult } from './roiData';

interface RoiQuadrantProps {
  /** Matched show-years (both cost and lead data) */
  rows: RoiShowRow[];
}

const MIN_RADIUS = 5;
const NARROW_BREAKPOINT = 560;

// Chart ink (stone family) + the two data hues (brand / accent ≥ 2×)
const INK = '#57534e'; // stone-600
const INK_MUTED = '#a8a29e'; // stone-400
const GRID = '#e7e5e4'; // stone-200
const BRAND = '#3b82f6'; // brand-500
const ACCENT = '#059669'; // accent-600

/**
 * 1-2-5 stepped "nice" ticks from 0 to the first step at/past max —
 * the top tick hugs the data so the plot has no dead band.
 */
function niceTicks(max: number, count: number): number[] {
  const raw = max / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step * 0.001; v += step) ticks.push(v);
  return ticks;
}

/* ===== Direct-label placement with greedy collision avoidance ===== */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PlacedLabel {
  x: number;
  y: number;
  anchor: 'start' | 'end' | 'middle';
  text: string;
}

const LABEL_H = 12;
const CHAR_W = 6.4; // ~11px semibold sans

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Try right / left / below / above of each bubble (most prominent first);
 * a label that fits nowhere is dropped — its bubble still explains itself
 * on hover and in the league table.
 */
function placeLabels(
  bubbles: { key: string; text: string; cx: number; cy: number; r: number }[],
  reserved: Rect[],
  bounds: { w: number; h: number }
): Map<string, PlacedLabel> {
  const placed = new Map<string, PlacedLabel>();
  const rects = [...reserved];
  for (const b of bubbles) {
    const w = b.text.length * CHAR_W;
    const candidates: { x: number; y: number; anchor: PlacedLabel['anchor']; rect: Rect }[] = [
      {
        x: b.cx + b.r + 6,
        y: b.cy + 3.5,
        anchor: 'start',
        rect: { x: b.cx + b.r + 6, y: b.cy - 6, w, h: LABEL_H },
      },
      {
        x: b.cx - b.r - 6,
        y: b.cy + 3.5,
        anchor: 'end',
        rect: { x: b.cx - b.r - 6 - w, y: b.cy - 6, w, h: LABEL_H },
      },
      {
        x: b.cx,
        y: b.cy + b.r + 13,
        anchor: 'middle',
        rect: { x: b.cx - w / 2, y: b.cy + b.r + 4, w, h: LABEL_H },
      },
      {
        x: b.cx,
        y: b.cy - b.r - 6,
        anchor: 'middle',
        rect: { x: b.cx - w / 2, y: b.cy - b.r - 15, w, h: LABEL_H },
      },
    ];
    const pick = candidates.find(
      (c) =>
        c.rect.x >= 2 &&
        c.rect.x + w <= bounds.w - 2 &&
        c.rect.y >= 2 &&
        c.rect.y + LABEL_H <= bounds.h - 2 &&
        !rects.some((p) => overlaps(c.rect, p))
    );
    if (pick) {
      placed.set(b.key, { x: pick.x, y: pick.y, anchor: pick.anchor, text: b.text });
      rects.push(pick.rect);
    }
  }
  return placed;
}

/** Container width, tracked live so the chart re-lays-out on resize. */
function useMeasuredWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export const RoiQuadrant: React.FC<RoiQuadrantProps> = ({ rows }) => {
  const [containerRef, width] = useMeasuredWidth();
  const data = rows.filter((r) => r.invested > 0);
  if (data.length === 0) return null;

  const isNarrow = width > 0 && width < NARROW_BREAKPOINT;

  // Geometry in real pixels — text never scales with the container
  const W = Math.max(width, 280);
  const H = isNarrow ? Math.max(260, Math.round(W * 0.85)) : Math.min(420, Math.round(W * 0.55));
  const MARGIN = {
    top: 20,
    right: isNarrow ? 14 : 20,
    bottom: 44,
    left: isNarrow ? 44 : 52,
  };
  const PLOT_W = W - MARGIN.left - MARGIN.right;
  const PLOT_H = H - MARGIN.top - MARGIN.bottom;
  const maxExtraRadius = isNarrow ? 11 : 16;
  const labeledBubbles = isNarrow ? 3 : 6;
  const tickCount = isNarrow ? 3 : 4;

  const xTicks = niceTicks(Math.max(...data.map((r) => r.invested)), tickCount);
  const yTicks = niceTicks(Math.max(...data.map((r) => r.revenue), 1), tickCount);
  const xMax = xTicks[xTicks.length - 1];
  const yMax = yTicks[yTicks.length - 1];
  const maxLeads = Math.max(...data.map((r) => r.leads), 1);

  const x = (v: number) => MARGIN.left + (v / xMax) * PLOT_W;
  const y = (v: number) => MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;
  const radius = (leads: number) => MIN_RADIUS + maxExtraRadius * Math.sqrt(leads / maxLeads);

  // Break-even diagonal (y = x), clipped to the plot; label rides the end
  const diag = Math.min(xMax, yMax);
  const breakEvenAnchor: 'start' | 'end' = x(diag) + 74 <= W - 2 ? 'start' : 'end';
  const breakEvenX = breakEvenAnchor === 'start' ? x(diag) + 6 : x(diag) - 8;
  const breakEvenY = Math.max(y(diag) + 3, MARGIN.top + 9);
  const breakEvenRect: Rect =
    breakEvenAnchor === 'start'
      ? { x: breakEvenX, y: breakEvenY - 9, w: 68, h: LABEL_H }
      : { x: breakEvenX - 68, y: breakEvenY - 9, w: 68, h: LABEL_H };

  // Direct labels on the most prominent bubbles; the rest hover via <title>
  const labels = placeLabels(
    [...data]
      .sort((a, b) => b.revenue + b.invested - (a.revenue + a.invested))
      .slice(0, labeledBubbles)
      .map((r) => ({
        key: r.key,
        text: `${r.name} '${String(r.year).slice(2)}`,
        cx: x(r.invested),
        cy: y(r.revenue),
        r: radius(r.leads),
      })),
    [breakEvenRect],
    { w: W, h: H }
  );
  // Big bubbles first so small ones stay hoverable on top
  const drawOrder = [...data].sort((a, b) => b.leads - a.leads);

  return (
    <div>
      {/* Legend — identity in ink text beside colored marks */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-stone-500">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: ACCENT }}
          />
          ROI ≥ {ROI_DOUBLE_DOWN}×
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: BRAND }}
          />
          Below {ROI_DOUBLE_DOWN}×
        </span>
        <span className="text-stone-400">Bubble size = leads captured</span>
      </div>

      <div ref={containerRef} className="w-full">
        {width > 0 && (
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Cost versus attributed revenue for ${data.length} show-years. Bubbles above the break-even line returned more than the show cost. Exact figures are in the show league table.`}
            className="block max-w-full"
          >
            {/* Horizontal grid + y tick labels */}
            {yTicks.map((t) => (
              <g key={`y${t}`}>
                <line
                  x1={MARGIN.left}
                  x2={W - MARGIN.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke={GRID}
                  strokeWidth={1}
                />
                <text
                  x={MARGIN.left - 8}
                  y={y(t) + 3.5}
                  textAnchor="end"
                  fontSize={11}
                  fill={INK_MUTED}
                >
                  {fmtMoneyCompact(t)}
                </text>
              </g>
            ))}
            {/* X ticks */}
            {xTicks.map((t) => (
              <text
                key={`x${t}`}
                x={x(t)}
                y={H - MARGIN.bottom + 18}
                textAnchor={t === 0 ? 'start' : 'middle'}
                fontSize={11}
                fill={INK_MUTED}
              >
                {fmtMoneyCompact(t)}
              </text>
            ))}
            {/* Axis titles */}
            <text
              x={W - MARGIN.right}
              y={H - MARGIN.bottom + 36}
              textAnchor="end"
              fontSize={11}
              fontWeight={600}
              fill={INK}
            >
              Invested →
            </text>
            <text x={4} y={MARGIN.top - 8} fontSize={11} fontWeight={600} fill={INK}>
              Revenue attributed ↑
            </text>

            {/* Break-even diagonal */}
            <line
              x1={x(0)}
              y1={y(0)}
              x2={x(diag)}
              y2={y(diag)}
              stroke={INK_MUTED}
              strokeWidth={1}
              strokeDasharray="5 4"
            />
            <text
              x={breakEvenX}
              y={breakEvenY}
              textAnchor={breakEvenAnchor}
              fontSize={10.5}
              fill={INK_MUTED}
            >
              Break even
            </text>

            {/* Bubbles */}
            {drawOrder.map((r) => {
              const cx = x(r.invested);
              const cy = y(r.revenue);
              const cr = radius(r.leads);
              const win = r.roi !== null && r.roi >= ROI_DOUBLE_DOWN;
              const label = labels.get(r.key);
              return (
                <g key={r.key}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={cr}
                    fill={win ? ACCENT : BRAND}
                    fillOpacity={0.75}
                    stroke="#fff"
                    strokeWidth={2}
                  >
                    <title>
                      {`${r.name} ${r.year} — ${fmtMoneyCompact(r.invested)} invested · ${fmtMoneyCompact(
                        r.revenue
                      )} revenue · ${r.leads} lead${r.leads === 1 ? '' : 's'} · ${
                        r.roi !== null ? fmtMult(r.roi) + ' ROI' : 'ROI n/a'
                      }`}
                    </title>
                  </circle>
                  {label && (
                    <text
                      x={label.x}
                      y={label.y}
                      textAnchor={label.anchor}
                      fontSize={11}
                      fontWeight={600}
                      fill={INK}
                    >
                      {label.text}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
        Bubbles above the dashed line returned more than the show cost. Hover a bubble for exact
        figures; the league table lists every value.
      </p>
    </div>
  );
};

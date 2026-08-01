/**
 * RoiQuadrant — cost vs revenue scatter, one bubble per show-year with both
 * datasets. x = invested, y = attributed revenue, bubble area = leads.
 * A dashed y = x diagonal marks break-even: bubbles above it made money.
 *
 * Dataviz discipline: single brand hue with the accent reserved for ≥ 2×
 * ROI (the same state the verdict chips name, so identity is never color
 * alone), direct labels only on the top bubbles, text in stone ink, one
 * axis pair, responsive via viewBox. The league table is the accessible
 * table view of the same data.
 */

import React from 'react';
import { RoiShowRow, ROI_DOUBLE_DOWN, fmtMoneyCompact, fmtMult } from './roiData';

interface RoiQuadrantProps {
  /** Matched show-years (both cost and lead data) */
  rows: RoiShowRow[];
}

const W = 720;
const H = 420;
const MARGIN = { top: 28, right: 116, bottom: 46, left: 64 };
const PLOT_W = W - MARGIN.left - MARGIN.right;
const PLOT_H = H - MARGIN.top - MARGIN.bottom;

const MIN_RADIUS = 5;
const MAX_EXTRA_RADIUS = 16;
const LABELED_BUBBLES = 6;

// Chart ink (stone family) + the two data hues (brand / accent ≥ 2×)
const INK = '#57534e'; // stone-600
const INK_MUTED = '#a8a29e'; // stone-400
const GRID = '#e7e5e4'; // stone-200
const BRAND = '#3b82f6'; // brand-500
const ACCENT = '#059669'; // accent-600

/** 1-2-5 stepped "nice" tick values from 0 up past max. */
function niceTicks(max: number, count = 4): number[] {
  const raw = max / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
  const ticks: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(v);
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
  reserved: Rect[]
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
        c.rect.x + w <= W - 2 &&
        c.rect.y >= 2 &&
        c.rect.y + LABEL_H <= H - 2 &&
        !rects.some((p) => overlaps(c.rect, p))
    );
    if (pick) {
      placed.set(b.key, { x: pick.x, y: pick.y, anchor: pick.anchor, text: b.text });
      rects.push(pick.rect);
    }
  }
  return placed;
}

export const RoiQuadrant: React.FC<RoiQuadrantProps> = ({ rows }) => {
  const data = rows.filter((r) => r.invested > 0);
  if (data.length === 0) return null;

  const xTicks = niceTicks(Math.max(...data.map((r) => r.invested)));
  const yTicks = niceTicks(Math.max(...data.map((r) => r.revenue), 1));
  const xMax = xTicks[xTicks.length - 1];
  const yMax = yTicks[yTicks.length - 1];
  const maxLeads = Math.max(...data.map((r) => r.leads), 1);

  const x = (v: number) => MARGIN.left + (v / xMax) * PLOT_W;
  const y = (v: number) => MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;
  const radius = (leads: number) => MIN_RADIUS + MAX_EXTRA_RADIUS * Math.sqrt(leads / maxLeads);

  // Break-even diagonal (y = x), clipped to the plot; label rides the end
  const diag = Math.min(xMax, yMax);
  const breakEvenAnchor: 'start' | 'end' = x(diag) + 74 <= W - 2 ? 'start' : 'end';
  const breakEvenX = breakEvenAnchor === 'start' ? x(diag) + 6 : x(diag) - 8;
  const breakEvenY = y(diag) + 3;
  const breakEvenRect: Rect =
    breakEvenAnchor === 'start'
      ? { x: breakEvenX, y: breakEvenY - 9, w: 68, h: LABEL_H }
      : { x: breakEvenX - 68, y: breakEvenY - 9, w: 68, h: LABEL_H };

  // Direct labels on the most prominent bubbles; the rest hover via <title>
  const labels = placeLabels(
    [...data]
      .sort((a, b) => b.revenue + b.invested - (a.revenue + a.invested))
      .slice(0, LABELED_BUBBLES)
      .map((r) => ({
        key: r.key,
        text: `${r.name} '${String(r.year).slice(2)}`,
        cx: x(r.invested),
        cy: y(r.revenue),
        r: radius(r.leads),
      })),
    [breakEvenRect]
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

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Cost versus attributed revenue for ${data.length} show-years. Bubbles above the break-even line returned more than the show cost. Exact figures are in the show league table.`}
        className="h-auto w-full"
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
            textAnchor="middle"
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
        <text x={MARGIN.left - 52} y={MARGIN.top - 12} fontSize={11} fontWeight={600} fill={INK}>
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

      <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
        Bubbles above the dashed line returned more than the show cost. Hover a bubble for exact
        figures; the league table above lists every value.
      </p>
    </div>
  );
};

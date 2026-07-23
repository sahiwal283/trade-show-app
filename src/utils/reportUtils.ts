/**
 * Report Utility Functions
 *
 * Extracted complex report calculation logic
 */

import { Expense, TradeShow } from '../App';

export const UNASSIGNED_ENTITY = 'Unassigned';

// Fixed categorical series colors (colorblind-safe order — do not re-order).
// Colors are assigned to entities by their position in the settings entity
// list, so an entity keeps its color no matter which filters are active.
export const ENTITY_SERIES_COLORS = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
] as const;

export const UNASSIGNED_ENTITY_COLOR = '#898781';

/**
 * Builds a stable entity → color map. Entities from settings come first (fixed
 * order), then any entities found only in expense data, then Unassigned (gray).
 */
export function buildEntityColorMap(
  entityOptions: string[],
  expenses: Expense[]
): { colorMap: Record<string, string>; entityOrder: string[] } {
  const fromData = Array.from(
    new Set(expenses.map((e) => e.zohoEntity).filter((e): e is string => Boolean(e)))
  ).sort();
  const ordered = [...entityOptions, ...fromData.filter((e) => !entityOptions.includes(e))];

  const colorMap: Record<string, string> = {};
  ordered.forEach((entity, index) => {
    colorMap[entity] = ENTITY_SERIES_COLORS[index % ENTITY_SERIES_COLORS.length];
  });
  colorMap[UNASSIGNED_ENTITY] = UNASSIGNED_ENTITY_COLOR;

  return { colorMap, entityOrder: [...ordered, UNASSIGNED_ENTITY] };
}

export interface CategoryEntityRow {
  category: string;
  total: number;
  /** Amount paid per entity (key = entity name or UNASSIGNED_ENTITY) */
  byEntity: Record<string, number>;
}

export interface EntityCategoryMatrix {
  rows: CategoryEntityRow[];
  /** Entities that actually appear in the data, in the given fixed order */
  entities: string[];
  columnTotals: Record<string, number>;
  grandTotal: number;
}

/**
 * Cross-tabs expenses: categories as rows, entities as columns. This is the
 * accountant's "who paid for what" pivot.
 */
export function calculateEntityCategoryMatrix(
  expenses: Expense[],
  entityOrder: string[]
): EntityCategoryMatrix {
  const rowMap: Record<string, CategoryEntityRow> = {};
  const columnTotals: Record<string, number> = {};
  let grandTotal = 0;

  expenses.forEach((expense) => {
    const entity = expense.zohoEntity || UNASSIGNED_ENTITY;
    if (!rowMap[expense.category]) {
      rowMap[expense.category] = { category: expense.category, total: 0, byEntity: {} };
    }
    const row = rowMap[expense.category];
    row.total += expense.amount;
    row.byEntity[entity] = (row.byEntity[entity] || 0) + expense.amount;
    columnTotals[entity] = (columnTotals[entity] || 0) + expense.amount;
    grandTotal += expense.amount;
  });

  const presentEntities = entityOrder.filter((entity) => columnTotals[entity]);
  const rows = Object.values(rowMap).sort((a, b) => b.total - a.total);

  return { rows, entities: presentEntities, columnTotals, grandTotal };
}

export interface CategoryAverage {
  category: string;
  total: number;
  count: number;
  average: number;
}

/**
 * Calculates category averages across trade shows
 */
export function calculateCategoryAverages(
  expenses: Expense[],
  _events: TradeShow[]
): CategoryAverage[] {
  // Calculate category totals per trade show
  const tradeShowCategoryTotals: Record<string, Record<string, number>> = {};

  expenses.forEach((expense) => {
    if (!expense.tradeShowId) return;

    if (!tradeShowCategoryTotals[expense.tradeShowId]) {
      tradeShowCategoryTotals[expense.tradeShowId] = {};
    }

    if (!tradeShowCategoryTotals[expense.tradeShowId][expense.category]) {
      tradeShowCategoryTotals[expense.tradeShowId][expense.category] = 0;
    }

    tradeShowCategoryTotals[expense.tradeShowId][expense.category] += expense.amount;
  });

  // Calculate averages per category
  const categoryAverages: Record<string, { total: number; count: number; average: number }> = {};

  Object.values(tradeShowCategoryTotals).forEach((tradeShowCategories) => {
    Object.entries(tradeShowCategories).forEach(([category, amount]) => {
      if (!categoryAverages[category]) {
        categoryAverages[category] = { total: 0, count: 0, average: 0 };
      }
      categoryAverages[category].total += amount;
      categoryAverages[category].count += 1;
    });
  });

  // Calculate final averages and sort by average amount (descending)
  return Object.entries(categoryAverages)
    .map(([category, data]) => ({
      category,
      total: data.total,
      count: data.count,
      average: data.total / data.count,
    }))
    .sort((a, b) => b.average - a.average);
}

/**
 * Calculates trade show breakdown for a specific entity
 */
export function calculateTradeShowBreakdown(
  expenses: Expense[],
  events: TradeShow[],
  selectedEntity: string
): Array<{ eventId: string; amount: number; name: string }> {
  if (selectedEntity === 'all') return [];

  const totals: Record<string, { eventId: string; amount: number; name: string }> = {};

  expenses.forEach((expense) => {
    if (expense.zohoEntity === selectedEntity && expense.tradeShowId) {
      const event = events.find((e) => e.id === expense.tradeShowId);
      if (event) {
        if (!totals[expense.tradeShowId]) {
          totals[expense.tradeShowId] = {
            eventId: expense.tradeShowId,
            amount: 0,
            name: event.name,
          };
        }
        totals[expense.tradeShowId].amount += expense.amount;
      }
    }
  });

  return Object.values(totals).sort((a, b) => b.amount - a.amount);
}

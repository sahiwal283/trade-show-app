import React from 'react';
import { SampleRequestItem } from '../../../utils/sampleRequestApi';
import type { ProductGroup } from './sampleGroups';
import { isRequested } from './sampleGroups';
import type { ItemField } from './useEventSampleRequest';
import { QtyInput } from './QtyInput';

interface Props {
  /** One brand's product lines. They share a single column grid, so quantities line up down the whole brand. */
  groups: ProductGroup[];
  items: Map<string, SampleRequestItem>;
  disabled: boolean;
  onChange: (productId: string, field: ItemField, value: number) => void;
}

const COLS: Array<{ field: ItemField; label: string; short: string }> = [
  { field: 'singles', label: 'Singles', short: 'Singles' },
  { field: 'displays', label: 'Displays', short: 'Displays' },
  { field: 'emptyDisplays', label: 'Empty displays', short: 'Empty' },
];

export const QTY_COL = 'w-[3.75rem] sm:w-[4.75rem]';
export const HEAD_CELL = 'pb-2 align-bottom text-[10px] leading-tight font-semibold uppercase tracking-wide text-stone-500 sm:text-[11px] sm:tracking-wider';

export const ProductTable: React.FC<Props> = ({ groups, items, disabled, onChange }) => (
  <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
    <colgroup>
      <col />
      {COLS.map((c) => <col key={c.field} className={QTY_COL} />)}
    </colgroup>
    <thead>
      <tr>
        <th scope="col" className={`${HEAD_CELL} text-left`}>Item</th>
        {COLS.map((c) => (
          <th key={c.field} scope="col" abbr={c.label} className={`${HEAD_CELL} px-1 text-center`}>
            <span className="sm:hidden">{c.short}</span>
            <span className="hidden sm:inline">{c.label}</span>
          </th>
        ))}
      </tr>
    </thead>
    {groups.map(({ line, products }) => (
      <tbody key={line.id} className="[&>tr:last-child>td]:pb-3">
        <tr>
          <th colSpan={COLS.length + 1} scope="rowgroup" className="border-t border-stone-200 pb-1 pt-4 text-left">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-stone-500">{line.name}</h5>
          </th>
        </tr>
        {products.map((p) => {
          const row = items.get(p.id);
          const retired = !p.is_active || !line.is_active;
          const requested = isRequested(row);
          return (
            <tr key={p.id} className="group">
              <td className={`rounded-l-lg py-1 pr-2 align-middle leading-snug transition-colors lg:group-hover:bg-stone-50 ${
                retired ? 'text-stone-500' : requested ? 'font-medium text-stone-900' : 'text-stone-600'}`}>
                {p.name}
                {retired && <span className="ml-2 whitespace-nowrap text-xs font-normal text-stone-500">no longer offered</span>}
              </td>
              {COLS.map((c, i) => (
                <td key={c.field} className={`px-1 py-1 align-middle transition-colors lg:group-hover:bg-stone-50 ${i === COLS.length - 1 ? 'rounded-r-lg' : ''}`}>
                  <QtyInput label={`${p.name} ${c.label.toLowerCase()}`} value={row?.[c.field] ?? 0} disabled={disabled}
                    onChange={(v) => onChange(p.id, c.field, v)} />
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    ))}
  </table>
);

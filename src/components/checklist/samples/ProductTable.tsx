import React from 'react';
import { SampleProduct, SampleRequestItem } from '../../../utils/sampleRequestApi';
import { ItemField } from './useSampleRequest';

interface Props {
  lineName: string;
  products: SampleProduct[];           // active ones, plus retired ones already on the request
  items: Map<string, SampleRequestItem>;
  disabled: boolean;
  onChange: (productId: string, field: ItemField, value: number) => void;
}

const COLS: Array<{ field: ItemField; label: string }> = [
  { field: 'singles', label: 'Singles' },
  { field: 'displays', label: 'Displays' },
  { field: 'emptyDisplays', label: 'Empty displays' },
];

export const ProductTable: React.FC<Props> = ({ lineName, products, items, disabled, onChange }) => (
  <div>
    <h4 className="micro-label mb-2">{lineName}</h4>
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[11px] uppercase tracking-wide text-stone-400">
          <th className="pb-1 text-left font-semibold">Item</th>
          {COLS.map((c) => <th key={c.field} className="pb-1 text-right font-semibold">{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {products.map((p) => {
          const row = items.get(p.id);
          return (
            <tr key={p.id} className={`border-t border-stone-100 ${p.is_active ? '' : 'text-stone-400'}`}>
              <td className="py-1.5 pr-2">
                {p.name}
                {!p.is_active && <span className="ml-2 text-[11px] italic">no longer offered</span>}
              </td>
              {COLS.map((c) => (
                <td key={c.field} className="py-1 text-right">
                  <input
                    type="number" inputMode="numeric" min={0} step={1}
                    aria-label={`${p.name} ${c.label.toLowerCase()}`}
                    value={row?.[c.field] ?? 0}
                    disabled={disabled}
                    onChange={(e) => onChange(p.id, c.field, parseInt(e.target.value, 10) || 0)}
                    className="w-16 rounded-lg border border-stone-200 px-2 py-1 text-right tabular-nums focus-visible:ring-2 focus-visible:ring-brand-500 disabled:bg-stone-50 disabled:text-stone-400"
                  />
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

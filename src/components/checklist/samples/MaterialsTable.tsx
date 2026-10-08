import React, { useEffect, useState } from 'react';
import { SampleMaterial, SampleRequestMaterial } from '../../../utils/sampleRequestApi';
import { QtyInput } from './QtyInput';
import { QTY_COL, HEAD_CELL } from './ProductTable';

interface Props {
  materials: SampleMaterial[];
  values: Map<string, SampleRequestMaterial>;
  disabled: boolean;
  onChange: (materialId: string, patch: { qty?: number; notes?: string | null }) => void;
}

/**
 * The notes field shows its own text while it is focused. The server trims notes, so without this an autosave
 * landing mid-sentence would delete the space just typed. Every keystroke is still reported; the saved value
 * shows again on blur, or as soon as the field is disabled.
 */
const NotesInput: React.FC<{ label: string; value: string; disabled: boolean; onChange: (notes: string) => void }> = ({ label, value, disabled, onChange }) => {
  const [draft, setDraft] = useState<string | null>(null);   // null when the field is not being edited
  useEffect(() => { if (disabled) setDraft(null); }, [disabled]);
  return (
    <input type="text" aria-label={label} maxLength={500}
      value={draft !== null && !disabled ? draft : value} disabled={disabled} placeholder={disabled ? '' : 'Add a note'}
      onFocus={() => setDraft(value)}
      onBlur={() => setDraft(null)}
      onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); }}
      className="block h-11 w-full rounded-lg border border-stone-200 bg-white px-2.5 text-base text-stone-900 placeholder-stone-400 transition-colors duration-150 hover:border-stone-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 focus:ring-offset-0 disabled:cursor-default disabled:border-transparent disabled:bg-transparent disabled:px-0 disabled:text-stone-700 sm:text-sm lg:h-9" />
  );
};

/** Each input reports only its own field ({ qty } or { notes }), so an edit never marks the other one changed. */
export const MaterialsTable: React.FC<Props> = ({ materials, values, disabled, onChange }) => (
  <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
    <colgroup>
      <col />
      <col className={QTY_COL} />
      <col className="w-[42%] sm:w-[46%]" />
    </colgroup>
    <thead>
      <tr>
        <th scope="col" className={`${HEAD_CELL} text-left`}>Item</th>
        <th scope="col" className={`${HEAD_CELL} px-1 text-center`}>Qty</th>
        <th scope="col" className={`${HEAD_CELL} pl-2 text-left`}>Notes</th>
      </tr>
    </thead>
    <tbody>
      {materials.map((m, i) => {
        const row = values.get(m.id);
        const requested = (row?.qty ?? 0) > 0;
        const top = i === 0 ? 'border-t border-stone-200 pt-2' : 'pt-1';
        return (
          <tr key={m.id} className="group">
            <td className={`${top} pb-1 pr-2 align-middle leading-snug ${
              !m.is_active ? 'text-stone-500' : requested ? 'font-medium text-stone-900' : 'text-stone-600'}`}>
              {m.name}{!m.is_active && <span className="ml-2 whitespace-nowrap text-xs font-normal text-stone-500">no longer offered</span>}
            </td>
            <td className={`${top} px-1 pb-1 align-middle`}>
              <QtyInput label={`${m.name} qty`} value={row?.qty ?? 0} disabled={disabled} onChange={(qty) => onChange(m.id, { qty })} />
            </td>
            <td className={`${top} pb-1 pl-2 align-middle`}>
              <NotesInput label={`${m.name} notes`} value={row?.notes ?? ''} disabled={disabled}
                onChange={(notes) => onChange(m.id, { notes })} />
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

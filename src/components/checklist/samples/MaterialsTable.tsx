import React, { useEffect, useState } from 'react';
import { SampleMaterial, SampleRequestMaterial, MAX_SAMPLE_QTY } from '../../../utils/sampleRequestApi';

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
      value={draft !== null && !disabled ? draft : value} disabled={disabled} placeholder="Optional"
      onFocus={() => setDraft(value)}
      onBlur={() => setDraft(null)}
      onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); }}
      className="w-full rounded-lg border border-stone-200 px-2 py-1 disabled:bg-stone-50 disabled:text-stone-400" />
  );
};

/** Each input reports only its own field ({ qty } or { notes }), so an edit never marks the other one changed. */
export const MaterialsTable: React.FC<Props> = ({ materials, values, disabled, onChange }) => (
  <table className="w-full text-sm">
    <thead>
      <tr className="text-[11px] uppercase tracking-wide text-stone-400">
        <th className="pb-1 text-left font-semibold">Item</th>
        <th className="pb-1 text-right font-semibold">Qty</th>
        <th className="pb-1 text-left font-semibold pl-3">Notes</th>
      </tr>
    </thead>
    <tbody>
      {materials.map((m) => {
        const row = values.get(m.id);
        return (
          <tr key={m.id} className={`border-t border-stone-100 ${m.is_active ? '' : 'text-stone-400'}`}>
            <td className="py-1.5 pr-2">{m.name}{!m.is_active && <span className="ml-2 text-[11px] italic">no longer offered</span>}</td>
            <td className="py-1 text-right">
              <input type="number" inputMode="numeric" min={0} max={MAX_SAMPLE_QTY} step={1} aria-label={`${m.name} qty`}
                value={row?.qty ?? 0} disabled={disabled}
                onChange={(e) => onChange(m.id, { qty: parseInt(e.target.value, 10) || 0 })}
                className="w-16 rounded-lg border border-stone-200 px-2 py-1 text-right tabular-nums disabled:bg-stone-50 disabled:text-stone-400" />
            </td>
            <td className="py-1 pl-3">
              <NotesInput label={`${m.name} notes`} value={row?.notes ?? ''} disabled={disabled}
                onChange={(notes) => onChange(m.id, { notes })} />
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

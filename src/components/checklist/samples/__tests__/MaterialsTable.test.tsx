// src/components/checklist/samples/__tests__/MaterialsTable.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MaterialsTable } from '../MaterialsTable';
import type { SampleRequestMaterial } from '../../../../utils/sampleRequestApi';

const materials = [{ id: 'm-1', name: 'Banner', position: 1, is_active: true }];
const values = (notes: string | null, qty = 2) => new Map<string, SampleRequestMaterial>([['m-1', { materialId: 'm-1', qty, notes }]]);

describe('MaterialsTable', () => {
  it('reports a qty edit and a notes edit as separate single-field changes', () => {
    const onChange = vi.fn();
    render(<MaterialsTable materials={materials} values={values('old')} disabled={false} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Banner qty'), { target: { value: '5' } });
    expect(onChange).toHaveBeenLastCalledWith('m-1', { qty: 5 });
    const notes = screen.getByLabelText('Banner notes');
    fireEvent.focus(notes);
    fireEvent.change(notes, { target: { value: 'new' } });
    expect(onChange).toHaveBeenLastCalledWith('m-1', { notes: 'new' });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('keeps the text being typed in a focused notes field when the saved value comes back trimmed', () => {
    const onChange = vi.fn();
    const { rerender } = render(<MaterialsTable materials={materials} values={values(null)} disabled={false} onChange={onChange} />);
    const notes = screen.getByLabelText('Banner notes') as HTMLInputElement;
    fireEvent.focus(notes);
    fireEvent.change(notes, { target: { value: 'big ' } });
    expect(onChange).toHaveBeenLastCalledWith('m-1', { notes: 'big ' });
    rerender(<MaterialsTable materials={materials} values={values('big')} disabled={false} onChange={onChange} />);
    expect(notes.value).toBe('big ');
    fireEvent.blur(notes);
    expect(notes.value).toBe('big');
  });

  it('shows the saved notes when the field is not focused, and follows them as they change', () => {
    const { rerender } = render(<MaterialsTable materials={materials} values={values('one')} disabled={false} onChange={vi.fn()} />);
    const notes = screen.getByLabelText('Banner notes') as HTMLInputElement;
    expect(notes.value).toBe('one');
    rerender(<MaterialsTable materials={materials} values={values('two')} disabled={false} onChange={vi.fn()} />);
    expect(notes.value).toBe('two');
    rerender(<MaterialsTable materials={materials} values={new Map()} disabled={false} onChange={vi.fn()} />);
    expect(notes.value).toBe('');
  });

  it('starts the draft from the saved value on focus', () => {
    const { rerender } = render(<MaterialsTable materials={materials} values={values('one')} disabled={false} onChange={vi.fn()} />);
    const notes = screen.getByLabelText('Banner notes') as HTMLInputElement;
    fireEvent.focus(notes);
    expect(notes.value).toBe('one');
    rerender(<MaterialsTable materials={materials} values={values('two')} disabled={false} onChange={vi.fn()} />);
    expect(notes.value).toBe('one');
  });

  it('disables both inputs, and a field disabled while focused shows the saved value, not the draft', () => {
    const { rerender } = render(<MaterialsTable materials={materials} values={values(null)} disabled={false} onChange={vi.fn()} />);
    const notes = screen.getByLabelText('Banner notes') as HTMLInputElement;
    fireEvent.focus(notes);
    fireEvent.change(notes, { target: { value: 'draft ' } });
    rerender(<MaterialsTable materials={materials} values={values('saved')} disabled onChange={vi.fn()} />);
    expect(notes).toBeDisabled();
    expect(screen.getByLabelText('Banner qty')).toBeDisabled();
    expect(notes.value).toBe('saved');
    rerender(<MaterialsTable materials={materials} values={values('saved')} disabled={false} onChange={vi.fn()} />);
    expect(notes.value).toBe('saved');
  });
});

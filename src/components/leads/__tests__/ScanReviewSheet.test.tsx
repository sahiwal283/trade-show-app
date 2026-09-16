import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScanReviewSheet } from '../ScanReviewSheet';
import { parseBadgePayload } from '../../../utils/badge/parseBadgePayload';

const FULL = '124649-907|Shamsher|Jessani|Virginia Trade Association|Glen Allen|VA|23059-8006|United States|President|Mr.|sjessani@aol.com';
const badge = (raw: string) => ({ rawPayload: raw, parsed: parseBadgePayload(raw) });

const setup = (props: any = {}) =>
  render(
    <ScanReviewSheet
      entity="Haute Brands"
      badge={props.badge ?? badge(FULL)}
      duplicateOf={props.duplicateOf ?? null}
      onSave={props.onSave ?? vi.fn()}
      onCancel={props.onCancel ?? vi.fn()}
    />
  );

describe('ScanReviewSheet', () => {
  it('pre-fills the decoded contact so the rep confirms rather than types', () => {
    setup();
    expect(screen.getByLabelText('First name')).toHaveValue('Shamsher');
    expect(screen.getByLabelText('Email')).toHaveValue('sjessani@aol.com');
  });

  it('warns on a low-confidence decode instead of presenting a guess as fact', () => {
    setup({ badge: badge('Shamsher|Jessani') });
    expect(screen.getByText(/check these fields/i)).toBeInTheDocument();
  });

  it('stays quiet on a confident decode', () => {
    setup();
    expect(screen.queryByText(/check these fields/i)).not.toBeInTheDocument();
  });

  it('surfaces an already-scanned badge rather than silently making a twin', () => {
    setup({
      duplicateOf: {
        id: 'old', first_name: 'Shamsher', last_name: 'Jessani',
        scanned_at: '2026-09-16T13:40:00Z',
      },
    });
    expect(screen.getByText(/already scanned/i)).toBeInTheDocument();
  });

  it('saves the rep edits, not the original decode', () => {
    const onSave = vi.fn();
    setup({ onSave });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'fixed@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'fixed@example.com' }), '', false
    );
  });

  it('offers save-and-scan-next, which is the whole speed story at a booth', () => {
    const onSave = vi.fn();
    setup({ onSave });
    fireEvent.click(screen.getByRole('button', { name: /save & scan next/i }));
    expect(onSave).toHaveBeenCalledWith(expect.any(Object), '', true);
  });

  it('still saves a badge that parsed to nothing, because raw_payload is kept', () => {
    const onSave = vi.fn();
    setup({ badge: badge('   '), onSave });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScanReviewSheet } from '../ScanReviewSheet';
import { parseBadgePayload } from '../../../utils/badge/parseBadgePayload';

const FULL = '124649-907|Shamsher|Jessani|Virginia Trade Association|Glen Allen|VA|23059-8006|United States|President|Mr.|sjessani@aol.com';
const OTHER = '556677-1|Alex|Rivera|Rivera Consulting|Austin|TX|73301|United States|Manager|Ms.|arivera@example.com';
const badge = (raw: string, format = 'PDF417') => ({ rawPayload: raw, format, parsed: parseBadgePayload(raw) });

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

  it('gives the duplicate banner an ARIA role so it is announced, not just colour-and-icon', () => {
    setup({
      duplicateOf: {
        id: 'old', first_name: 'Shamsher', last_name: 'Jessani',
        scanned_at: '2026-09-16T13:40:00Z',
      },
    });
    expect(screen.getByText(/already scanned/i).closest('[role]')).toHaveAttribute('role');
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

  it('resets the form to the new badge when the mounted sheet is reused for a different person, discarding the prior edits', () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <ScanReviewSheet
        entity="Haute Brands"
        badge={badge(FULL)}
        duplicateOf={null}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );

    // Rep edits badge A's email before the sheet is (hypothetically) reused
    // for badge B without unmounting.
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'edited-for-a@example.com' } });
    expect(screen.getByLabelText('Email')).toHaveValue('edited-for-a@example.com');

    rerender(
      <ScanReviewSheet
        entity="Haute Brands"
        badge={badge(OTHER)}
        duplicateOf={null}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );

    // The form must show badge B's decoded values, not badge A's edits.
    expect(screen.getByLabelText('First name')).toHaveValue('Alex');
    expect(screen.getByLabelText('Email')).toHaveValue('arivera@example.com');
  });

  it('does not clobber in-progress edits on a re-render with the same badge', () => {
    const onSave = vi.fn();
    const sameBadge = badge(FULL);
    const { rerender } = render(
      <ScanReviewSheet
        entity="Haute Brands"
        badge={sameBadge}
        duplicateOf={null}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'still-typing@example.com' } });

    // Re-render with an equivalent (but distinct) badge object for the same
    // rawPayload, e.g. because a parent re-rendered for an unrelated reason.
    rerender(
      <ScanReviewSheet
        entity="Haute Brands"
        badge={{ ...sameBadge }}
        duplicateOf={null}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Email')).toHaveValue('still-typing@example.com');
  });
});

describe('ScanReviewSheet — unrecognized payloads', () => {
  it('shows the raw scanned content when nothing could be mapped to a field', () => {
    // A QR that is just a vendor profile URL yields zero fields. The rep
    // needs to see what was scanned to know it worked and type the contact.
    setup({ badge: badge('https://reg.example.com/attendee/8827364', 'QRCode') });
    expect(screen.getByText('https://reg.example.com/attendee/8827364')).toBeInTheDocument();
    expect(screen.getByText(/QR code/i)).toBeInTheDocument();
  });

  it('does not clutter a fully-mapped scan with the raw payload', () => {
    setup({ badge: badge(FULL) });
    expect(screen.queryByText(FULL)).not.toBeInTheDocument();
  });
});

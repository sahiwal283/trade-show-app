import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LeadDetailModal } from '../LeadDetailModal';

const scan = (over = {}) => ({
  id: 'scan-1', entity: 'Haute Brands', brand: 'haute_brands',
  first_name: 'Shamsher', last_name: 'Jessani', email: 'sjessani@aol.com',
  company: 'Virginia Trade Association', crm_status: 'synced', crm_error: null,
  raw_payload: 'RAW', notes: null, scanned_at: '2026-09-16T14:00:00Z', ...over,
}) as any;

const setup = (props: any = {}) =>
  render(
    <LeadDetailModal
      scan={props.scan ?? scan()}
      onSave={props.onSave ?? vi.fn()}
      onRetry={props.onRetry ?? vi.fn()}
      onClose={props.onClose ?? vi.fn()}
    />
  );

describe('LeadDetailModal', () => {
  it('shows the CRM failure reason instead of a bare failed badge', () => {
    setup({ scan: scan({ crm_status: 'failed', crm_error: 'MANDATORY_NOT_FOUND: Last Name' }) });
    expect(screen.getByText(/MANDATORY_NOT_FOUND/)).toBeInTheDocument();
  });

  it('offers retry on a failed lead', () => {
    const onRetry = vi.fn();
    setup({ scan: scan({ crm_status: 'failed', crm_error: 'boom' }), onRetry });
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledWith('scan-1');
  });

  it('does not offer retry on a skipped lead, which has nowhere to go', () => {
    setup({ scan: scan({ crm_status: 'skipped', brand: null, crm_error: 'No Zoho CRM configured' }) });
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('saves corrected fields', () => {
    const onSave = vi.fn();
    setup({ onSave });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith('scan-1', expect.objectContaining({ email: 'new@x.com' }));
  });
});

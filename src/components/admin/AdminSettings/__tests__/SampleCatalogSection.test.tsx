// src/components/admin/AdminSettings/__tests__/SampleCatalogSection.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../../utils/api', () => ({
  api: {
    USE_SERVER: true,
    getUsers: vi.fn(async () => [{ id: 'u-1', name: 'Ana', is_active: true }, { id: 'u-2', name: 'Old', is_active: false }]),
    getSettings: vi.fn(async () => ({ sample_puller_user_id: { userId: null } })),
    updateSettings: vi.fn(async () => ({})),
  },
}));
vi.mock('../../../../utils/sampleRequestApi', async (orig) => {
  const actual = await orig<typeof import('../../../../utils/sampleRequestApi')>();
  return {
    ...actual,
    sampleRequestApi: {
      getCatalog: vi.fn(async () => ({
        lines: [{ id: 'l-1', brand: 'haute_brands', name: 'Oh! Mit', position: 1, is_active: true }],
        products: [{ id: 'p-1', product_line_id: 'l-1', name: 'Blue Razz', position: 1, is_active: true }],
        materials: [{ id: 'm-1', name: 'Banner', position: 1, is_active: true }],
      })),
      createProduct: vi.fn(async (lineId: string, name: string) => ({ id: 'p-new', product_line_id: lineId, name, position: 2, is_active: true })),
      updateProduct: vi.fn(async (id: string, patch: any) => ({ id, product_line_id: 'l-1', name: 'Blue Razz', position: 1, is_active: patch.isActive ?? true })),
      createLine: vi.fn(), updateLine: vi.fn(), createMaterial: vi.fn(), updateMaterial: vi.fn(), reorder: vi.fn(),
    },
  };
});

import { SampleCatalogSection } from '../SampleCatalogSection';
import { sampleRequestApi } from '../../../../utils/sampleRequestApi';
import { api } from '../../../../utils/api';

describe('SampleCatalogSection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers only active users as the puller and saves the choice', async () => {
    render(<SampleCatalogSection />);
    const select = await screen.findByLabelText('Sample puller');
    expect(screen.queryByText('Old')).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'u-1' } });
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ sample_puller_user_id: { userId: 'u-1' } }));
  });

  it('adds a product under a line', async () => {
    render(<SampleCatalogSection />);
    await screen.findByText('Blue Razz');
    fireEvent.change(screen.getByLabelText('New product in Oh! Mit'), { target: { value: 'Pink Rozay' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add product to Oh! Mit' }));
    await waitFor(() => expect(sampleRequestApi.createProduct).toHaveBeenCalledWith('l-1', 'Pink Rozay'));
    expect(await screen.findByText('Pink Rozay')).toBeInTheDocument();
  });

  it('retires a product instead of deleting it', async () => {
    render(<SampleCatalogSection />);
    await screen.findByText('Blue Razz');
    fireEvent.click(screen.getByRole('button', { name: 'Retire Blue Razz' }));
    await waitFor(() => expect(sampleRequestApi.updateProduct).toHaveBeenCalledWith('p-1', { isActive: false }));
    expect(screen.getByRole('button', { name: 'Restore Blue Razz' })).toBeInTheDocument();
  });

  it('keeps focus and the combined value while typing in an Add input', async () => {
    render(<SampleCatalogSection />);
    await screen.findByText('Blue Razz');
    const input = screen.getByLabelText('New product in Oh! Mit') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'P' } });
    fireEvent.change(screen.getByLabelText('New product in Oh! Mit'), { target: { value: 'Pi' } });
    const after = screen.getByLabelText('New product in Oh! Mit') as HTMLInputElement;
    expect(after).toBe(input);
    expect(after.value).toBe('Pi');
    after.focus();
    expect(document.activeElement).toBe(after);
  });

  it('reverts the puller select and shows an error when the save fails', async () => {
    vi.mocked(api.updateSettings).mockRejectedValueOnce(new Error('boom'));
    render(<SampleCatalogSection />);
    const select = (await screen.findByLabelText('Sample puller')) as HTMLSelectElement;
    expect(select.value).toBe('');
    fireEvent.change(select, { target: { value: 'u-1' } });
    expect(await screen.findByText('That change did not save. Try again.')).toBeInTheDocument();
    expect((screen.getByLabelText('Sample puller') as HTMLSelectElement).value).toBe('');
  });
});

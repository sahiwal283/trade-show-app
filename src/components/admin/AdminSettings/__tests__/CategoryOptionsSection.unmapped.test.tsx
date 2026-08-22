/**
 * The unmapped-category warning must fire only when it is actually true.
 *
 * Trade Show resolves Zoho expense accounts from app_settings only when it is
 * the one posting to Zoho. Under EXPENSE_BACKEND=midas, Midas posts and that
 * table is never read — warning about gaps in it would send an accountant off
 * to fill in IDs that change nothing.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const usePicklists = vi.fn();
vi.mock('../../../../contexts/PicklistContext', () => ({
  usePicklists: () => usePicklists(),
}));

import { CategoryOptionsSection } from '../CategoryOptionsSection';

// Only the props the notice depends on matter; the rest are inert stubs.
const noop = () => {};
const PROPS = {
  categoryOptions: [{ name: 'Meal and Entertainment', zohoExpenseAccountIds: { haute_brands: '111' } }],
  newCategoryOption: '',
  setNewCategoryOption: noop,
  newCategoryZohoHauteId: '',
  setNewCategoryZohoHauteId: noop,
  newCategoryZohoBoomId: '',
  setNewCategoryZohoBoomId: noop,
  newCategoryZohoNirvanaId: '',
  setNewCategoryZohoNirvanaId: noop,
  editingCategoryIndex: null,
  editCategoryValue: '',
  setEditCategoryValue: noop,
  editCategoryZohoHauteId: '',
  setEditCategoryZohoHauteId: noop,
  editCategoryZohoBoomId: '',
  setEditCategoryZohoBoomId: noop,
  editCategoryZohoNirvanaId: '',
  setEditCategoryZohoNirvanaId: noop,
  isSaving: false,
  onAddCategory: noop,
  onRemoveCategory: noop,
  onStartEdit: noop,
  onCancelEdit: noop,
  onSaveEdit: noop,
} as any;

const MIDAS_CATEGORIES = [
  { id: 'c1', name: 'Meal and Entertainment', description: null },
  { id: 'c2', name: 'Stationaries', description: null },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CategoryOptionsSection — unmapped category notice', () => {
  it('warns when Trade Show posts to Zoho and a category has no account id', () => {
    usePicklists.mockReturnValue({
      categories: MIDAS_CATEGORIES,
      source: 'midas',
      zohoPostingOwner: 'trade-show',
    });

    render(<CategoryOptionsSection {...PROPS} />);

    expect(screen.getByText(/no Zoho\s+account ID/i)).toBeInTheDocument();
    expect(screen.getByText('Stationaries')).toBeInTheDocument();
  });

  it('stays silent when Midas owns Zoho posting', () => {
    usePicklists.mockReturnValue({
      categories: MIDAS_CATEGORIES,
      source: 'midas',
      zohoPostingOwner: 'midas',
    });

    render(<CategoryOptionsSection {...PROPS} />);

    expect(screen.queryByText(/no Zoho\s+account ID/i)).not.toBeInTheDocument();
  });

  it('stays silent when every picklist category is mapped', () => {
    usePicklists.mockReturnValue({
      categories: [{ id: 'c1', name: 'Meal and Entertainment', description: null }],
      source: 'midas',
      zohoPostingOwner: 'trade-show',
    });

    render(<CategoryOptionsSection {...PROPS} />);

    expect(screen.queryByText(/no Zoho\s+account ID/i)).not.toBeInTheDocument();
  });

  it('stays silent when the picklists still come from app_settings', () => {
    // Pre-cutover the dropdown and the mapping table are the same rows, so
    // there is no drift to report.
    usePicklists.mockReturnValue({
      categories: MIDAS_CATEGORIES,
      source: 'settings',
      zohoPostingOwner: 'trade-show',
    });

    render(<CategoryOptionsSection {...PROPS} />);

    expect(screen.queryByText(/no Zoho\s+account ID/i)).not.toBeInTheDocument();
  });
});

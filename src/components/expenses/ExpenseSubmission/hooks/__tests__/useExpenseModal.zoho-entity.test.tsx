/**
 * useExpenseModal Hook Tests - zohoEntity Normalization & Error Handling
 * 
 * Tests for:
 * - zohoEntity normalization (empty string → null, undefined → null)
 * - zohoEntity included in update payloads
 * - Error message extraction from backend responses
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useExpenseModal } from '../useExpenseModal';
import { Expense } from '../../../../../App';

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(() => 'mock-token'),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Mock fetch
global.fetch = vi.fn();

describe('useExpenseModal - zohoEntity Normalization', () => {
  const mockOnSave = vi.fn();
  const mockReloadData = vi.fn();
  const mockAddToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue('mock-token');
  });

  const createMockExpense = (zohoEntity?: string | null): Expense => ({
    id: 'exp-123',
    userId: 'user-456',
    tradeShowId: 'event-789',
    date: '2025-11-01',
    merchant: 'Test Merchant',
    amount: 100.50,
    category: 'Food',
    description: 'Test description',
    location: 'San Francisco',
    cardUsed: 'Amex *1234',
    status: 'pending',
    receiptUrl: 'https://example.com/receipt.jpg',
    reimbursementRequired: false,
    zohoEntity: zohoEntity as string | undefined,
    zohoExpenseId: null,
    createdAt: '2025-11-01T10:00:00Z',
    updatedAt: '2025-11-01T10:00:00Z',
  });

  describe('zohoEntity normalization in startInlineEdit', () => {
    it('should normalize undefined zohoEntity to null', () => {
      const { result } = renderHook(() =>
        useExpenseModal({
          onSave: mockOnSave,
          reloadData: mockReloadData,
          addToast: mockAddToast,
        })
      );

      const expense = createMockExpense(undefined);

      act(() => {
        result.current.startInlineEdit(expense);
      });

      expect(result.current.editFormData).toBeTruthy();
      expect(result.current.editFormData?.zohoEntity).toBeNull();
    });

    it('should normalize empty string zohoEntity to null', () => {
      const { result } = renderHook(() =>
        useExpenseModal({
          onSave: mockOnSave,
          reloadData: mockReloadData,
          addToast: mockAddToast,
        })
      );

      const expense = createMockExpense('');

      act(() => {
        result.current.startInlineEdit(expense);
      });

      expect(result.current.editFormData).toBeTruthy();
      expect(result.current.editFormData?.zohoEntity).toBeNull();
    });

    it('should preserve valid zohoEntity value', () => {
      const { result } = renderHook(() =>
        useExpenseModal({
          onSave: mockOnSave,
          reloadData: mockReloadData,
          addToast: mockAddToast,
        })
      );

      const expense = createMockExpense('haute');

      act(() => {
        result.current.startInlineEdit(expense);
      });

      expect(result.current.editFormData).toBeTruthy();
      expect(result.current.editFormData?.zohoEntity).toBe('haute');
    });

    it('should normalize null zohoEntity to null', () => {
      const { result } = renderHook(() =>
        useExpenseModal({
          onSave: mockOnSave,
          reloadData: mockReloadData,
          addToast: mockAddToast,
        })
      );

      const expense = createMockExpense(null);

      act(() => {
        result.current.startInlineEdit(expense);
      });

      expect(result.current.editFormData).toBeTruthy();
      expect(result.current.editFormData?.zohoEntity).toBeNull();
    });
  });

  describe('zohoEntity in update payload', () => {
    it('should include zohoEntity as null in update payload when value is null', async () => {
      const { result } = renderHook(() =>
        useExpenseModal({
          onSave: mockOnSave,
          reloadData: mockReloadData,
          addToast: mockAddToast,
        })
      );

      const expense = createMockExpense(null);

      // Open modal and start editing
      act(() => {
        result.current.openExpenseModal(expense);
        result.current.startInlineEdit(expense);
      });

      // Mock successful response
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...expense }),
      } as Response);

      await act(async () => {
        await result.current.saveInlineEdit();
      });

      // Verify fetch was called with zoho_entity: null
      expect(global.fetch).toHaveBeenCalled();
      const fetchCall = vi.mocked(global.fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.zoho_entity).toBeNull();
    });

    it('should include zohoEntity as null in update payload when value is empty string', async () => {
      const { result } = renderHook(() =>
        useExpenseModal({
          onSave: mockOnSave,
          reloadData: mockReloadData,
          addToast: mockAddToast,
        })
      );

      const expense = createMockExpense('');

      // Open modal and start editing
      act(() => {
        result.current.openExpenseModal(expense);
        result.current.startInlineEdit(expense);
      });

      // Mock successful response
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...expense }),
      } as Response);

      await act(async () => {
        await result.current.saveInlineEdit();
      });

      // Verify fetch was called with zoho_entity: null
      expect(global.fetch).toHaveBeenCalled();
      const fetchCall = vi.mocked(global.fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.zoho_entity).toBeNull();
    });

    it('should include zohoEntity value in update payload when value is valid', async () => {
      const { result } = renderHook(() =>
        useExpenseModal({
          onSave: mockOnSave,
          reloadData: mockReloadData,
          addToast: mockAddToast,
        })
      );

      const expense = createMockExpense('haute');

      // Open modal and start editing
      act(() => {
        result.current.openExpenseModal(expense);
        result.current.startInlineEdit(expense);
      });

      // Mock successful response
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...expense }),
      } as Response);

      await act(async () => {
        await result.current.saveInlineEdit();
      });

      // Verify fetch was called with zoho_entity: 'haute'
      expect(global.fetch).toHaveBeenCalled();
      const fetchCall = vi.mocked(global.fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.zoho_entity).toBe('haute');
    });

    it('should include zohoEntity in update payload even when other fields are updated', async () => {
      const { result } = renderHook(() =>
        useExpenseModal({
          onSave: mockOnSave,
          reloadData: mockReloadData,
          addToast: mockAddToast,
        })
      );

      const expense = createMockExpense('haute');

      // Open modal and start editing
      act(() => {
        result.current.openExpenseModal(expense);
        result.current.startInlineEdit(expense);
      });

      // Update a field
      act(() => {
        result.current.updateEditFormField('merchant', 'Updated Merchant');
      });

      // Mock successful response
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...expense, merchant: 'Updated Merchant' }),
      } as Response);

      await act(async () => {
        await result.current.saveInlineEdit();
      });

      // Verify fetch was called with zoho_entity included
      expect(global.fetch).toHaveBeenCalled();
      const fetchCall = vi.mocked(global.fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.zoho_entity).toBe('haute');
      expect(body.merchant).toBe('Updated Merchant');
    });
  });

  describe('Error message extraction', () => {
    it('should extract error message from errorData.details', async () => {
      const { result } = renderHook(() =>
        useExpenseModal({
          onSave: mockOnSave,
          reloadData: mockReloadData,
          addToast: mockAddToast,
        })
      );

      const expense = createMockExpense('haute');

      // Open modal and start editing
      act(() => {
        result.current.openExpenseModal(expense);
        result.current.startInlineEdit(expense);
      });

      // Mock error response with details
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Bad Request',
          details: 'Invalid zoho_entity value',
        }),
      } as Response);

      await act(async () => {
        await result.current.saveInlineEdit();
      });

      // Verify error toast was called
      expect(mockAddToast).toHaveBeenCalledWith(
        '❌ Failed to update expense. Please try again.',
        'error'
      );
    });

    it('should extract error message from errorData.error when details not present', async () => {
      const { result } = renderHook(() =>
        useExpenseModal({
          onSave: mockOnSave,
          reloadData: mockReloadData,
          addToast: mockAddToast,
        })
      );

      const expense = createMockExpense('haute');

      // Open modal and start editing
      act(() => {
        result.current.openExpenseModal(expense);
        result.current.startInlineEdit(expense);
      });

      // Mock error response with only error field
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Validation failed',
        }),
      } as Response);

      await act(async () => {
        await result.current.saveInlineEdit();
      });

      // Verify error toast was called
      expect(mockAddToast).toHaveBeenCalledWith(
        '❌ Failed to update expense. Please try again.',
        'error'
      );
    });

    it('should use default error message when error response is invalid JSON', async () => {
      const { result } = renderHook(() =>
        useExpenseModal({
          onSave: mockOnSave,
          reloadData: mockReloadData,
          addToast: mockAddToast,
        })
      );

      const expense = createMockExpense('haute');

      // Open modal and start editing
      act(() => {
        result.current.openExpenseModal(expense);
        result.current.startInlineEdit(expense);
      });

      // Mock error response with invalid JSON
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      } as Response);

      await act(async () => {
        await result.current.saveInlineEdit();
      });

      // Verify error toast was called with default message
      expect(mockAddToast).toHaveBeenCalledWith(
        '❌ Failed to update expense. Please try again.',
        'error'
      );
    });

    it('should use default error message when no error fields present', async () => {
      const { result } = renderHook(() =>
        useExpenseModal({
          onSave: mockOnSave,
          reloadData: mockReloadData,
          addToast: mockAddToast,
        })
      );

      const expense = createMockExpense('haute');

      // Open modal and start editing
      act(() => {
        result.current.openExpenseModal(expense);
        result.current.startInlineEdit(expense);
      });

      // Mock error response with empty object
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response);

      await act(async () => {
        await result.current.saveInlineEdit();
      });

      // Verify error toast was called with default message
      expect(mockAddToast).toHaveBeenCalledWith(
        '❌ Failed to update expense. Please try again.',
        'error'
      );
    });
  });

  describe('Integration: zohoEntity normalization and update', () => {
    it('should normalize empty string to null and send null in update payload', async () => {
      const { result } = renderHook(() =>
        useExpenseModal({
          onSave: mockOnSave,
          reloadData: mockReloadData,
          addToast: mockAddToast,
        })
      );

      const expense = createMockExpense('');

      // Open modal and start editing
      act(() => {
        result.current.openExpenseModal(expense);
        result.current.startInlineEdit(expense);
      });

      // Verify normalization
      expect(result.current.editFormData?.zohoEntity).toBeNull();

      // Mock successful response
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...expense, zohoEntity: null }),
      } as Response);

      await act(async () => {
        await result.current.saveInlineEdit();
      });

      // Verify update payload contains null
      expect(global.fetch).toHaveBeenCalled();
      const fetchCall = vi.mocked(global.fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.zoho_entity).toBeNull();
    });
  });
});


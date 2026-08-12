import type { ExpenseBackend, ExpenseStore } from './ExpenseStore';
import { LocalExpenseStore } from './LocalExpenseStore';
import { MidasExpenseStore } from './MidasExpenseStore';
import { DualExpenseStore } from './DualExpenseStore';
import { getExpenseBackend, getMidasMode } from '../midas';

export function resolveExpenseBackend(): ExpenseBackend {
  return getExpenseBackend();
}

export function getExpenseStore(): ExpenseStore {
  const backend = resolveExpenseBackend();
  if (backend === 'midas') {
    if (getMidasMode() === 'disabled') {
      throw new Error('EXPENSE_BACKEND=midas requires MIDAS_MODE=mock|live');
    }
    return new MidasExpenseStore();
  }
  if (backend === 'dual') {
    if (getMidasMode() === 'disabled') {
      throw new Error('EXPENSE_BACKEND=dual requires MIDAS_MODE=mock|live');
    }
    return new DualExpenseStore();
  }
  return new LocalExpenseStore();
}

export type { ExpenseStore, TsExpenseApi, ExpenseActor, ExpenseListFilters, CreateExpenseInput, UpdateExpenseInput } from './ExpenseStore';

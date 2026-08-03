/**
 * ExpenseStore — swap local vs Midas SoT via EXPENSE_BACKEND.
 */

export interface ExpenseListFilters {
  eventId?: string;
  userId?: string;
  status?: string;
  q?: string;
}

export interface ExpenseActor {
  id: string;
  email: string;
  name: string;
  role: string;
  username: string;
}

/** Normalized API expense (camelCase) + optional midasUrl */
export interface TsExpenseApi {
  id: string;
  userId: string;
  tradeShowId: string | null;
  amount: number | null;
  category: string;
  merchant: string;
  date: string;
  description?: string | null;
  cardUsed: string | null;
  receiptUrl: string | null;
  reimbursementRequired?: boolean;
  reimbursementStatus?: string | null;
  status: string;
  zohoEntity: string | null;
  zohoExpenseId: string | null;
  location: string | null;
  ocrText: string | null;
  createdAt: string;
  updatedAt?: string;
  duplicateCheck?: unknown[] | null;
  user_name?: string;
  event_name?: string;
  midasUrl?: string;
  midasExpenseId?: string;
}

export interface CreateExpenseInput {
  sourceRefId?: string;
  eventId: string;
  eventName: string;
  merchant: string;
  amount: number;
  date: string;
  category: string;
  description?: string;
  cardUsed?: string;
  location?: string;
  reimbursementRequired?: boolean;
  zohoEntity?: string | null;
  receipt?: { buffer: Buffer; filename: string; mime: string };
  ocrText?: string;
}

export interface UpdateExpenseInput {
  eventId?: string;
  eventName?: string;
  merchant?: string;
  amount?: number;
  date?: string;
  category?: string;
  description?: string | null;
  cardUsed?: string | null;
  location?: string | null;
  reimbursementRequired?: boolean;
  zohoEntity?: string | null;
  receipt?: { buffer: Buffer; filename: string; mime: string };
}

export interface ExpenseStore {
  list(filters: ExpenseListFilters, actor: ExpenseActor): Promise<TsExpenseApi[]>;
  getById(id: string, actor: ExpenseActor): Promise<TsExpenseApi | null>;
  create(input: CreateExpenseInput, actor: ExpenseActor): Promise<TsExpenseApi>;
  update(id: string, input: UpdateExpenseInput, actor: ExpenseActor): Promise<TsExpenseApi>;
  replaceReceipt(
    id: string,
    receipt: { buffer: Buffer; filename: string; mime: string },
    actor: ExpenseActor
  ): Promise<TsExpenseApi>;
  delete(id: string, actor: ExpenseActor): Promise<void>;
}

export type ExpenseBackend = 'local' | 'dual' | 'midas';

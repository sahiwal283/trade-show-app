import type {
  CreateExpenseInput,
  ExpenseActor,
  ExpenseListFilters,
  ExpenseStore,
  TsExpenseApi,
  UpdateExpenseInput,
} from './ExpenseStore';
import { LocalExpenseStore } from './LocalExpenseStore';
import { MidasExpenseStore } from './MidasExpenseStore';

/**
 * dual: write both; read prefer Midas, fall back to local on error.
 */
export class DualExpenseStore implements ExpenseStore {
  private local = new LocalExpenseStore();
  private midas = new MidasExpenseStore();

  async list(filters: ExpenseListFilters, actor: ExpenseActor): Promise<TsExpenseApi[]> {
    try {
      return await this.midas.list(filters, actor);
    } catch (err) {
      console.warn('[DualExpenseStore] Midas list failed, using local:', err);
      return this.local.list(filters, actor);
    }
  }

  async getById(id: string, actor: ExpenseActor): Promise<TsExpenseApi | null> {
    try {
      const m = await this.midas.getById(id, actor);
      if (m) return m;
    } catch (err) {
      console.warn('[DualExpenseStore] Midas get failed:', err);
    }
    return this.local.getById(id, actor);
  }

  async create(input: CreateExpenseInput, actor: ExpenseActor): Promise<TsExpenseApi> {
    const local = await this.local.create(input, actor);
    try {
      await this.midas.create({ ...input, sourceRefId: local.id }, actor);
    } catch (err) {
      console.error('[DualExpenseStore] Midas create failed after local create:', err);
    }
    return local;
  }

  async update(id: string, input: UpdateExpenseInput, actor: ExpenseActor): Promise<TsExpenseApi> {
    const local = await this.local.update(id, input, actor);
    try {
      await this.midas.update(id, input, actor);
    } catch (err) {
      console.error('[DualExpenseStore] Midas update failed after local update:', err);
    }
    return local;
  }

  async replaceReceipt(
    id: string,
    receipt: { buffer: Buffer; filename: string; mime: string },
    actor: ExpenseActor
  ): Promise<TsExpenseApi> {
    return this.update(id, { receipt }, actor);
  }

  async delete(id: string, actor: ExpenseActor): Promise<void> {
    await this.local.delete(id, actor);
    try {
      await this.midas.delete(id, actor);
    } catch (err) {
      console.error('[DualExpenseStore] Midas delete failed after local delete:', err);
    }
  }
}

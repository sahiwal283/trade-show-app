/**
 * HTTP client for Midas Ext API (/api/v1/ext).
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import FormData from 'form-data';
import {
  MidasApiError,
  MidasActor,
  MidasClientConfig,
  MidasCreateExpenseBody,
  MidasCreateResult,
  MidasExpenseDto,
  MidasImportPayload,
  MidasImportResult,
  MidasListQuery,
  MidasListResult,
  MidasOcrResult,
  MidasPatchBody,
  MidasReceiptDto,
  MidasCategory,
} from './MidasTypes';

function actorHeaders(actor?: MidasActor): Record<string, string> {
  if (!actor) return {};
  const h: Record<string, string> = {
    'X-Actor-Email': actor.email,
    'X-Actor-External-User-Id': actor.externalUserId,
  };
  if (actor.name) h['X-Actor-Name'] = actor.name;
  if (actor.requestId) h['X-Request-Id'] = actor.requestId;
  return h;
}

function extractRequestId(headers?: Record<string, unknown> | null, data?: unknown): string | undefined {
  if (headers) {
    const raw =
      headers['x-request-id'] ??
      headers['X-Request-Id'] ??
      headers['x-requestid'];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  if (data && typeof data === 'object') {
    const body = data as { requestId?: unknown; error?: { requestId?: unknown } };
    if (typeof body.requestId === 'string' && body.requestId.trim()) return body.requestId.trim();
    if (typeof body.error?.requestId === 'string' && body.error.requestId.trim()) {
      return body.error.requestId.trim();
    }
  }
  return undefined;
}

function toMidasError(err: unknown): never {
  if (err instanceof MidasApiError) throw err;
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<{ error?: { code?: string; message?: string }; requestId?: string }>;
    const status = ax.response?.status ?? 502;
    const code = ax.response?.data?.error?.code ?? (status === 401 ? 'UNAUTHENTICATED' : 'MIDAS_ERROR');
    const message =
      ax.response?.data?.error?.message ||
      ax.message ||
      'Midas request failed';
    const requestId = extractRequestId(ax.response?.headers as Record<string, unknown> | undefined, ax.response?.data);
    throw new MidasApiError(message, status, code, ax.response?.data, requestId);
  }
  throw new MidasApiError(err instanceof Error ? err.message : 'Midas request failed', 502, 'MIDAS_ERROR');
}

export class MidasClient {
  private readonly http: AxiosInstance;
  private readonly webBaseUrl: string;

  constructor(config: MidasClientConfig) {
    const base = config.baseUrl.replace(/\/$/, '');
    this.webBaseUrl = (config.webBaseUrl || '').replace(/\/$/, '');
    this.http = axios.create({
      baseURL: `${base}/ext`,
      timeout: config.timeoutMs,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      validateStatus: () => true,
    });
  }

  private async parse<T>(
    status: number,
    data: any,
    ok: number[],
    headers?: Record<string, unknown>
  ): Promise<T> {
    if (ok.includes(status)) return data as T;
    const code = data?.error?.code || 'MIDAS_ERROR';
    const message = data?.error?.message || `Midas HTTP ${status}`;
    const details = data?.error?.details;
    const full = details ? `${message} ${JSON.stringify(details)}` : message;
    throw new MidasApiError(full, status, code, data, extractRequestId(headers, data));
  }

  async processOcr(file: Buffer, filename: string, mime: string): Promise<MidasOcrResult> {
    try {
      const form = new FormData();
      form.append('file', file, { filename, contentType: mime });
      const res = await this.http.post('/ocr/process', form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      return await this.parse(res.status, res.data, [200], res.headers as Record<string, unknown>);
    } catch (e) {
      return toMidasError(e);
    }
  }

  async createExpense(body: MidasCreateExpenseBody, actor: MidasActor): Promise<MidasCreateResult> {
    try {
      const res = await this.http.post(
        '/expenses',
        { ...body, submitterEmail: body.submitterEmail || actor.email },
        { headers: { ...actorHeaders(actor), 'Content-Type': 'application/json' } }
      );
      const data = await this.parse<{ expense: MidasExpenseDto; midasUrl?: string; created?: boolean }>(
        res.status,
        res.data,
        [200, 201]
      );
      return {
        expense: data.expense,
        midasUrl: data.midasUrl || data.expense.midasUrl || `${this.webBaseUrl}/expenses/${data.expense.id}`,
        created: res.status === 201 ? true : Boolean(data.created),
      };
    } catch (e) {
      return toMidasError(e);
    }
  }

  async listExpenses(query: MidasListQuery): Promise<MidasListResult> {
    try {
      const res = await this.http.get('/expenses', { params: query });
      return await this.parse(res.status, res.data, [200]);
    } catch (e) {
      return toMidasError(e);
    }
  }

  async getExpense(id: string): Promise<MidasExpenseDto> {
    try {
      const res = await this.http.get(`/expenses/${id}`);
      const data = await this.parse<{ expense?: MidasExpenseDto } | MidasExpenseDto>(res.status, res.data, [200]);
      return (data as any).expense ?? (data as MidasExpenseDto);
    } catch (e) {
      return toMidasError(e);
    }
  }

  async getExpenseByRef(sourceApp: string, sourceRefId: string): Promise<MidasExpenseDto> {
    try {
      const res = await this.http.get('/expenses/by-ref', { params: { sourceApp, sourceRefId } });
      const data = await this.parse<{ expense?: MidasExpenseDto } | MidasExpenseDto>(res.status, res.data, [200]);
      return (data as any).expense ?? (data as MidasExpenseDto);
    } catch (e) {
      return toMidasError(e);
    }
  }

  async updateExpense(id: string, patch: MidasPatchBody, actor: MidasActor): Promise<MidasExpenseDto> {
    try {
      const res = await this.http.patch(`/expenses/${id}`, patch, {
        headers: { ...actorHeaders(actor), 'Content-Type': 'application/json' },
      });
      const data = await this.parse<{ expense?: MidasExpenseDto } | MidasExpenseDto>(res.status, res.data, [200]);
      return (data as any).expense ?? (data as MidasExpenseDto);
    } catch (e) {
      return toMidasError(e);
    }
  }

  async deleteExpense(id: string, actor: MidasActor): Promise<void> {
    try {
      const res = await this.http.delete(`/expenses/${id}`, { headers: actorHeaders(actor) });
      await this.parse(res.status, res.data ?? {}, [200, 204]);
    } catch (e) {
      return toMidasError(e);
    }
  }

  async uploadReceipt(
    id: string,
    file: Buffer,
    filename: string,
    mime: string,
    opts?: { async?: boolean }
  ): Promise<MidasReceiptDto> {
    try {
      const form = new FormData();
      form.append('file', file, { filename, contentType: mime });
      const res = await this.http.post(`/expenses/${id}/receipts`, form, {
        headers: form.getHeaders(),
        params: opts?.async ? { async: 1 } : undefined,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      const data = await this.parse<{ receipt?: MidasReceiptDto } | MidasReceiptDto>(res.status, res.data, [200, 201]);
      return (data as any).receipt ?? (data as MidasReceiptDto);
    } catch (e) {
      return toMidasError(e);
    }
  }

  async getReceiptContent(expenseId: string, receiptId: string): Promise<Buffer> {
    try {
      const res = await this.http.get(`/expenses/${expenseId}/receipts/${receiptId}/content`, {
        responseType: 'arraybuffer',
      });
      if (res.status !== 200) {
        let data: any = res.data;
        try {
          data = JSON.parse(Buffer.from(res.data).toString('utf8'));
        } catch {
          /* ignore */
        }
        await this.parse(res.status, data, [200]);
      }
      return Buffer.from(res.data);
    } catch (e) {
      return toMidasError(e);
    }
  }

  async importExpenses(payload: MidasImportPayload): Promise<MidasImportResult> {
    try {
      const res = await this.http.post('/expenses/import', payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: Math.max(this.http.defaults.timeout || 10000, 120000),
      });
      return await this.parse(res.status, res.data, [200]);
    } catch (e) {
      return toMidasError(e);
    }
  }

  async listCategories(): Promise<MidasCategory[]> {
    try {
      const res = await this.http.get('/categories');
      const data = await this.parse<{ categories: MidasCategory[] }>(res.status, res.data, [200]);
      return data.categories;
    } catch (e) {
      return toMidasError(e);
    }
  }
}

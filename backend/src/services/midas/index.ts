/**
 * Midas client factory — MIDAS_MODE=disabled|mock|live
 */

import { MidasClient } from './MidasClient';
import { MockMidasClient } from './MockMidasClient';
import type { MidasClientConfig } from './MidasTypes';
import { clearPaymentMethodCache, setPaymentMethodLister } from './paymentMethodMap';

export type MidasMode = 'disabled' | 'mock' | 'live';

export type AnyMidasClient = MidasClient | MockMidasClient;

export function getMidasMode(): MidasMode {
  const mode = (process.env.MIDAS_MODE || 'disabled').toLowerCase();
  if (mode === 'mock' || mode === 'live' || mode === 'disabled') return mode;
  return 'disabled';
}

export function getExpenseBackend(): 'local' | 'dual' | 'midas' {
  const v = (process.env.EXPENSE_BACKEND || 'local').toLowerCase();
  if (v === 'dual' || v === 'midas' || v === 'local') return v;
  return 'local';
}

export function createMidasClient(): AnyMidasClient {
  const mode = getMidasMode();
  if (mode === 'disabled') {
    throw new Error('MIDAS_MODE=disabled — Midas client unavailable');
  }
  if (mode === 'mock') {
    return new MockMidasClient(process.env.MIDAS_WEB_BASE_URL || 'http://localhost:5174');
  }
  const baseUrl = process.env.MIDAS_BASE_URL;
  const apiKey = process.env.MIDAS_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('MIDAS_BASE_URL and MIDAS_API_KEY required when MIDAS_MODE=live');
  }
  const config: MidasClientConfig = {
    baseUrl,
    apiKey,
    webBaseUrl: process.env.MIDAS_WEB_BASE_URL || '',
    timeoutMs: parseInt(process.env.MIDAS_TIMEOUT_MS || '10000', 10),
  };
  return new MidasClient(config);
}

let singleton: AnyMidasClient | null = null;

export function getMidasClient(): AnyMidasClient {
  if (!singleton) {
    singleton = createMidasClient();
    setPaymentMethodLister(() => singleton!.listPaymentMethods());
  }
  return singleton;
}

/** Test helper */
export function resetMidasClientSingleton(): void {
  singleton = null;
  setPaymentMethodLister(null);
  clearPaymentMethodCache();
}

export * from './MidasTypes';
export * from './statusMaps';
export * from './categoryMap';
export * from './paymentMethodMap';
export { MidasClient } from './MidasClient';
export { MockMidasClient } from './MockMidasClient';

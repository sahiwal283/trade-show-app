/**
 * Business telemetry client for system monitor integration.
 * Sends API cost/usage events to IngestionAPI; failures are logged only and never break requests.
 */

import axios from 'axios';

const INGESTION_URL = process.env.SYSTEM_MONITOR_INGESTION_URL || '';
const API_KEY = process.env.SYSTEM_MONITOR_API_KEY || '';
const DEFAULT_SERVICE = process.env.SYSTEM_MONITOR_SERVICE_NAME || process.env.APP_SLUG || 'trade-show-backend';
const ENVIRONMENT = process.env.NODE_ENV || 'production';

export interface ApiEventPayload {
  service?: string;
  provider?: string;
  environment?: string;
  endpoint: string;
  method?: string;
  status?: number;
  latency_ms?: number;
  usage_units?: number;
  usage_unit_type?: string;
  request_bytes?: number;
  response_bytes?: number;
  metadata?: Record<string, unknown>;
}

function isConfigured(): boolean {
  return Boolean(INGESTION_URL && API_KEY);
}

/**
 * Send an API event to the system monitor ingestion API.
 * Non-blocking: errors are logged and never thrown.
 */
export function trackApiEvent(payload: ApiEventPayload): void {
  if (!isConfigured()) return;

  const body = {
    service: payload.service || DEFAULT_SERVICE,
    provider: payload.provider ?? undefined,
    environment: payload.environment ?? ENVIRONMENT,
    endpoint: payload.endpoint ?? '',
    method: payload.method ?? 'GET',
    status: payload.status ?? 200,
    latency_ms: payload.latency_ms ?? 0,
    usage_units: payload.usage_units ?? undefined,
    usage_unit_type: payload.usage_unit_type ?? undefined,
    request_bytes: payload.request_bytes ?? undefined,
    response_bytes: payload.response_bytes ?? undefined,
    metadata: payload.metadata ?? {},
  };

  const url = INGESTION_URL.replace(/\/$/, '') + '/v1/telemetry/api-event';

  setImmediate(() => {
    axios
      .post(url, body, {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': API_KEY,
        },
        timeout: 2000,
        validateStatus: () => true,
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[BusinessTelemetry] Failed to send api-event:', message);
      });
  });
}

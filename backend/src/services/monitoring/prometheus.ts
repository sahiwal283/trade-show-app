/**
 * Prometheus metrics for system monitor integration.
 * Exposes /metrics for scrape; labels aligned with system monitor guide.
 */

import { Request, Response, NextFunction } from 'express';
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

const SERVICE_NAME = process.env.SYSTEM_MONITOR_SERVICE_NAME || process.env.APP_SLUG || 'trade-show-backend';
const ENVIRONMENT = process.env.NODE_ENV || 'production';
const VERSION = process.env.APP_VERSION || process.env.npm_package_version || '0.0.0';

export const register = new Registry();

collectDefaultMetrics({ register });

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'status', 'service', 'environment', 'endpoint_class'],
  registers: [register],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'status', 'service', 'environment', 'endpoint_class'],
  buckets: [0.1, 0.5, 1.0, 2.5, 5.0, 10.0],
  registers: [register],
});

const appBuildInfo = new Gauge({
  name: 'app_build_info',
  help: 'Application build information',
  labelNames: ['version', 'service', 'environment'],
  registers: [register],
});

appBuildInfo.labels({ version: VERSION, service: SERVICE_NAME, environment: ENVIRONMENT }).set(1);

function getEndpointClass(path: string): string {
  const normalized = path
    .replace(/\/\d+/g, '/{id}')
    .replace(/\/[a-f0-9-]{36}/gi, '/{uuid}');
  if (normalized.includes('/upload')) return 'upload';
  if (normalized.includes('/billing')) return 'billing';
  if (normalized.includes('/auth')) return 'auth';
  if (normalized.includes('/health') || normalized.includes('/metrics')) return 'health';
  return 'api';
}

/**
 * Middleware to record HTTP request count and duration for Prometheus.
 * Skips /metrics and binary endpoints. Call before route handlers.
 */
export function prometheusRequestMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/metrics') {
    return next();
  }
  const pathToCheck = req.path || req.originalUrl || '';
  if (pathToCheck.endsWith('/pdf') || pathToCheck.endsWith('.pdf') || pathToCheck.includes('/pdf')) {
    return next();
  }

  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const endpointClass = getEndpointClass(pathToCheck.split('?')[0]);
    const labels = {
      method: req.method,
      status: String(res.statusCode),
      service: SERVICE_NAME,
      environment: ENVIRONMENT,
      endpoint_class: endpointClass,
    };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, duration);
  });
  next();
}

export async function getMetricsContent(): Promise<string> {
  return register.metrics();
}

export function getContentType(): string {
  return register.contentType;
}

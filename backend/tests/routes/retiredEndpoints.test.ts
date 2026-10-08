import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { retrainingStatusGone } from '../../src/routes/retiredEndpoints';

describe('retired endpoints', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = express();
    app.get('/api/retraining/status', retrainingStatusGone);
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('answers the removed retraining status call with 410 and says why', async () => {
    const response = await fetch(`${base}/api/retraining/status`);
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: 'Model retraining was removed in v2.34.0' });
  });

  it('is mounted behind authentication, so the request log records who is calling', () => {
    const server = fs.readFileSync(path.resolve(__dirname, '../../src/server.ts'), 'utf8');
    expect(server).toContain(
      "app.get('/api/retraining/status', authenticateToken, sessionTracker, retrainingStatusGone);"
    );
  });
});

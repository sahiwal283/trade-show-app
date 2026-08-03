/**
 * Live HTTP UAT against CT 2600 Trade Show BFF (no password resets).
 * Mints JWT from JWT_SECRET + a known user row.
 *
 * Usage (on CT 2600, from /opt/trade-show-app/backend):
 *   npx ts-node --transpile-only src/scripts/uatHttpBffProbe.ts
 * Or from laptop with BASE_URL:
 *   BASE_URL=http://192.168.1.144 JWT_SECRET=... USER_ID=... USER_ROLE=admin USERNAME=admin \
 *     npx ts-node --transpile-only src/scripts/uatHttpBffProbe.ts
 */
import fs from 'fs';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import FormData from 'form-data';
import { Pool } from 'pg';

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

type Check = { name: string; pass: boolean; detail?: unknown };

async function loadActorFromDb(): Promise<{
  id: string;
  username: string;
  role: string;
  email: string;
}> {
  if (process.env.USER_ID && process.env.USERNAME && process.env.USER_ROLE) {
    return {
      id: process.env.USER_ID,
      username: process.env.USERNAME,
      role: process.env.USER_ROLE,
      email: process.env.USER_EMAIL || `${process.env.USERNAME}@local`,
    };
  }
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'trade_show_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  });
  try {
    const r = await pool.query(
      `SELECT id, username, role, email FROM users
       WHERE role IN ('admin','accountant','developer')
       ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'developer' THEN 1 ELSE 2 END
       LIMIT 1`
    );
    if (!r.rows[0]) throw new Error('No admin/accountant/developer user found');
    return r.rows[0];
  } finally {
    await pool.end();
  }
}

async function main() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET required (do not reset passwords; mint JWT instead)');
  }

  const user = await loadActorFromDb();
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    secret,
    { expiresIn: '2h' }
  );
  const http = axios.create({
    baseURL: `${BASE}/api`,
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
    timeout: 120000,
  });

  const checks: Check[] = [];

  const health = await axios.get(`${BASE}/api/health`, { validateStatus: () => true, timeout: 15000 });
  checks.push({ name: 'health', pass: health.status === 200, detail: { status: health.status } });

  const engine = await http.get('/expenses/engine');
  checks.push({
    name: 'engine_midas',
    pass: engine.status === 200 && engine.data?.backend === 'midas',
    detail: engine.data,
  });

  const list = await http.get('/expenses');
  const listArr = Array.isArray(list.data) ? list.data : list.data?.expenses || [];
  checks.push({
    name: 'list_count_ge_375',
    pass: list.status === 200 && listArr.length >= 375,
    detail: { status: list.status, count: listArr.length },
  });

  const sample = listArr[0];
  let getDetail: any = null;
  if (sample?.id) {
    const one = await http.get(`/expenses/${sample.id}`);
    getDetail = one.data;
    checks.push({
      name: 'get_midasUrl',
      pass:
        one.status === 200 &&
        typeof one.data?.midasUrl === 'string' &&
        (String(one.data.midasUrl).includes('duckdns') || String(one.data.midasUrl).includes('midas')),
      detail: { status: one.status, midasUrl: one.data?.midasUrl, id: sample.id },
    });
  } else {
    checks.push({ name: 'get_midasUrl', pass: false, detail: 'no sample from list' });
  }

  if (sample?.receiptUrl) {
    const receiptPath = String(sample.receiptUrl).replace(/^\/api/, '');
    const receipt = await http.get(receiptPath, { responseType: 'arraybuffer' });
    const bytes = receipt.data ? Buffer.from(receipt.data).length : 0;
    checks.push({
      name: 'receipt_proxy',
      pass: receipt.status === 200 && bytes > 0,
      detail: { status: receipt.status, bytes, path: sample.receiptUrl },
    });
  } else if (getDetail?.receiptUrl) {
    const receiptPath = String(getDetail.receiptUrl).replace(/^\/api/, '');
    const receipt = await http.get(receiptPath, { responseType: 'arraybuffer' });
    const bytes = receipt.data ? Buffer.from(receipt.data).length : 0;
    checks.push({
      name: 'receipt_proxy',
      pass: receipt.status === 200 && bytes > 0,
      detail: { status: receipt.status, bytes, path: getDetail.receiptUrl },
    });
  } else {
    checks.push({ name: 'receipt_proxy', pass: false, detail: 'no receiptUrl on sample' });
  }

  // Create smoke (JSON body, no receipt)
  const eventId =
    sample?.tradeShowId || sample?.trade_show_id || process.env.UAT_EVENT_ID || 'ec627f3f-b660-4bbd-b3af-3fce452903ad';
  const create = await http.post('/expenses', {
    event_id: eventId,
    merchant: 'UAT HTTP Cafe',
    amount: 2.34,
    date: '2026-08-03',
    category: 'Meal and Entertainment',
    description: 'http uat smoke',
    card_used: 'Personal',
    reimbursement_required: false,
  });
  checks.push({
    name: 'create_smoke',
    pass: create.status === 200 || create.status === 201,
    detail: {
      status: create.status,
      id: create.data?.id,
      midasUrl: create.data?.midasUrl,
      error: create.data?.error,
    },
  });

  // Accountant-owned mutations → 409 MIDAS_OWNED
  const targetId = sample?.id || create.data?.id;
  if (targetId) {
    const statusPatch = await http.patch(`/expenses/${targetId}/status`, { status: 'approved' });
    checks.push({
      name: 'status_midas_owned_409',
      pass: statusPatch.status === 409 && statusPatch.data?.code === 'MIDAS_OWNED',
      detail: { status: statusPatch.status, code: statusPatch.data?.code, body: statusPatch.data },
    });

    const zohoPush = await http.post(`/expenses/${targetId}/push-to-zoho`);
    checks.push({
      name: 'zoho_push_midas_owned_409',
      pass: zohoPush.status === 409 && zohoPush.data?.code === 'MIDAS_OWNED',
      detail: { status: zohoPush.status, code: zohoPush.data?.code },
    });
  } else {
    checks.push({ name: 'status_midas_owned_409', pass: false, detail: 'no target id' });
    checks.push({ name: 'zoho_push_midas_owned_409', pass: false, detail: 'no target id' });
  }

  // OCR invalid-input: tiny PDF → expect 400 OCR_INVALID_FILE (client error, not 500)
  try {
    const form = new FormData();
    form.append('receipt', Buffer.from('%PDF-1.4 uat'), {
      filename: 'uat.pdf',
      contentType: 'application/pdf',
    });
    const ocr = await axios.post(`${BASE}/api/ocr/v2/process`, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` },
      validateStatus: () => true,
      timeout: 120000,
      maxBodyLength: Infinity,
    });
    const code = ocr.data?.code;
    const pass = ocr.status === 400 && code === 'OCR_INVALID_FILE';
    checks.push({
      name: 'ocr_v2_invalid_pdf',
      pass,
      detail: {
        status: ocr.status,
        code,
        requestId: ocr.data?.requestId || ocr.headers?.['x-request-id'] || null,
        error: ocr.data?.error,
      },
    });
  } catch (e: any) {
    checks.push({
      name: 'ocr_v2_invalid_pdf',
      pass: false,
      detail: { error: e.message },
    });
  }

  // Optional happy-path OCR with a real sandbox receipt if present
  try {
    const realJpeg = '/var/lib/expenseapp/uploads/receipt-1760991915243-590575896.jpeg';
    if (fs.existsSync(realJpeg)) {
      const form = new FormData();
      form.append('receipt', fs.createReadStream(realJpeg), {
        filename: 'real-receipt.jpeg',
        contentType: 'image/jpeg',
      });
      const ocr = await axios.post(`${BASE}/api/ocr/v2/process`, form, {
        headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` },
        validateStatus: () => true,
        timeout: 120000,
        maxBodyLength: Infinity,
      });
      checks.push({
        name: 'ocr_v2_real_jpeg',
        pass: ocr.status === 200 && Boolean(ocr.data?.fields),
        detail: {
          status: ocr.status,
          merchant: ocr.data?.fields?.merchant?.value ?? null,
          provider: ocr.headers?.['x-ocr-provider'] || ocr.data?.ocr?.provider,
        },
      });
    } else {
      checks.push({
        name: 'ocr_v2_real_jpeg',
        pass: true,
        detail: { skipped: true, reason: 'fixture_missing' },
      });
    }
  } catch (e: any) {
    checks.push({
      name: 'ocr_v2_real_jpeg',
      pass: false,
      detail: { error: e.message },
    });
  }

  const blocking = checks.filter((c) => !c.name.startsWith('ocr_v2'));
  const allPass = blocking.every((c) => c.pass);
  console.log(JSON.stringify({ base: BASE, user: { id: user.id, username: user.username, role: user.role }, checks }, null, 2));
  console.log(JSON.stringify({ summary: { allPass, passed: checks.filter((c) => c.pass).length, total: checks.length } }));
  if (!allPass) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

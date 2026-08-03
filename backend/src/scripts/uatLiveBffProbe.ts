/**
 * Sandbox UAT probe: Ext + ExpenseStore (no password resets).
 * Run on CT 2600 with MIDAS_MODE=live / EXPENSE_BACKEND=midas.
 */
import fs from 'fs';
import { getMidasClient, resetMidasClientSingleton, getExpenseBackend, getMidasMode } from '../services/midas';
import { getExpenseStore } from '../services/expenseStore';
import type { MidasExpenseDto } from '../services/midas/MidasTypes';

async function listAllExt(sourceApp: string): Promise<MidasExpenseDto[]> {
  const client = getMidasClient();
  const expenses: MidasExpenseDto[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const result = await client.listExpenses({ sourceApp, limit: 100, cursor });
    expenses.push(...(result.expenses || []));
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return expenses;
}

async function main() {
  resetMidasClientSingleton();
  console.log(JSON.stringify({ backend: getExpenseBackend(), mode: getMidasMode() }));

  const client = getMidasClient();
  const expenses = await listAllExt('trade_show');
  console.log(JSON.stringify({ ext_list_all: expenses.length }));

  const one = expenses[0];
  if (one) {
    console.log(
      JSON.stringify({
        ext_sample: {
          id: one.id,
          sourceRefId: one.sourceRefId,
          midasUrl: one.midasUrl,
          status: one.status,
          receipts: (one.receipts || []).length,
        },
      })
    );
  }

  const store = getExpenseStore();
  const actor = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'accounting@nirvanakulture.com',
    name: 'Acct',
    role: 'admin',
    username: 'acct',
  };
  const apiList = await store.list({}, actor);
  console.log(JSON.stringify({ store_list: apiList.length }));
  if (apiList[0]) {
    console.log(
      JSON.stringify({
        store_sample: {
          id: apiList[0].id,
          midasUrl: apiList[0].midasUrl,
          merchant: apiList[0].merchant,
          status: apiList[0].status,
          receiptUrl: apiList[0].receiptUrl,
        },
      })
    );
  }

  // Receipt bytes smoke via Ext (if sample has a receipt)
  const withReceipt = expenses.find((e) => (e.receipts || []).length > 0);
  if (withReceipt?.receipts?.[0]) {
    try {
      const buf = await client.getReceiptContent(withReceipt.id, withReceipt.receipts[0].id);
      console.log(JSON.stringify({ receipt_proxy_ok: true, bytes: buf.length, expenseId: withReceipt.id }));
    } catch (e: any) {
      console.log(
        JSON.stringify({
          receipt_proxy_ok: false,
          receipt_status: e.status,
          receipt_code: e.code,
          receipt_message: e.message,
        })
      );
    }
  } else {
    console.log(JSON.stringify({ receipt_proxy_ok: null, reason: 'no_receipt_in_sample' }));
  }

  // OCR invalid-input check (tiny PDF) — Ext maps to 400 OCR_INVALID_FILE; BFF must forward (not 500)
  try {
    const ocr = await client.processOcr(Buffer.from('%PDF-1.4 uat'), 'uat.pdf', 'application/pdf');
    console.log(
      JSON.stringify({
        ocr_invalid_ok: false,
        ocr_unexpected_200: true,
        ocr_provider: ocr.ocr?.provider,
        ocr_merchant: ocr.fields?.merchant?.value ?? null,
      })
    );
  } catch (e: any) {
    const pass = e.status === 400 && e.code === 'OCR_INVALID_FILE';
    console.log(
      JSON.stringify({
        ocr_invalid_pass: pass,
        ocr_status: e.status,
        ocr_code: e.code,
        ocr_message: e.message,
        ocr_requestId: e.requestId || null,
      })
    );
  }

  // Optional happy-path: real JPEG if present on sandbox uploads
  const realJpeg = '/var/lib/expenseapp/uploads/receipt-1760991915243-590575896.jpeg';
  try {
    if (fs.existsSync(realJpeg)) {
      const buf = fs.readFileSync(realJpeg);
      const ocr = await client.processOcr(buf, 'real-receipt.jpeg', 'image/jpeg');
      console.log(
        JSON.stringify({
          ocr_real_pass: true,
          ocr_provider: ocr.ocr?.provider,
          ocr_merchant: ocr.fields?.merchant?.value ?? null,
        })
      );
    } else {
      console.log(JSON.stringify({ ocr_real_pass: null, reason: 'fixture_missing' }));
    }
  } catch (e: any) {
    console.log(
      JSON.stringify({
        ocr_real_pass: false,
        ocr_status: e.status,
        ocr_code: e.code,
        ocr_message: e.message,
      })
    );
  }

  // Create smoke expense
  const ref = `uat-${Date.now()}`;
  const created = await store.create(
    {
      sourceRefId: ref,
      eventId: 'ec627f3f-b660-4bbd-b3af-3fce452903ad',
      eventName: 'UAT Event',
      merchant: 'UAT Cafe',
      amount: 1.23,
      date: '2026-08-03',
      category: 'Meal and Entertainment',
      description: 'post-migration uat',
      reimbursementRequired: false,
    },
    actor
  );
  console.log(
    JSON.stringify({
      create: {
        id: created.id,
        midasUrl: created.midasUrl,
        midasExpenseId: created.midasExpenseId,
        status: created.status,
      },
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

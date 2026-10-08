/**
 * Expense message thread routes, mounted under /api/expenses.
 */

import { Router } from 'express';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { userRepository } from '../database/repositories/UserRepository';
import type { ExpenseActor } from '../services/expenseStore';
import { expenseMessageService, isMessagingEnabled } from '../services/ExpenseMessageService';
import { MidasApiError } from '../services/midas/MidasTypes';

const router = Router({ mergeParams: true });

/**
 * The JWT carries only { id, username, role } — email and name come from the
 * user row. Midas resolves the actor by BOTH email and username, so sending a
 * placeholder email would misattribute or 409. Mirrors buildExpenseActor in
 * routes/expenses.ts.
 */
async function actorFrom(req: AuthRequest): Promise<ExpenseActor> {
  const u = await userRepository.findById(req.user!.id);
  return {
    id: req.user!.id,
    email: u?.email || `${req.user!.username}@local`,
    name: u?.name || req.user!.username,
    role: req.user!.role,
    username: req.user!.username,
  };
}

/** 501 rather than 404: the feature exists, this deployment has it switched off. */
function guard(res: Response): boolean {
  if (isMessagingEnabled()) return true;
  res.status(501).json({
    error: { code: 'MESSAGING_UNAVAILABLE', message: 'Expense messaging is not enabled' },
  });
  return false;
}

function fail(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : 'Request failed';
  if (/not found|not linked/i.test(message)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message } });
  }
  if (/not permitted/i.test(message)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message } });
  }
  console.error('[ExpenseMessages]', error);
  // MidasApiError carries the real upstream code (e.g. SUBMITTER_AMBIGUOUS,
  // MISSING_SCOPE, USER_NOT_FOUND) — collapsing every failure to the same
  // UPSTREAM_ERROR made those cases undebuggable for the caller. Anything
  // else (a plain Error, a network failure) still falls back to the generic
  // code.
  const code = error instanceof MidasApiError ? error.code : 'UPSTREAM_ERROR';
  return res.status(502).json({ error: { code, message } });
}

router.get('/:id/messages', async (req: AuthRequest, res: Response) => {
  if (!guard(res)) return;
  try {
    const messages = await expenseMessageService.getThread(req.params.id, await actorFrom(req));
    res.json({ messages });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/:id/messages', async (req: AuthRequest, res: Response) => {
  if (!guard(res)) return;
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'body is required' } });
  }
  if (body.length > 2000) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'body exceeds 2000 characters' } });
  }
  try {
    const message = await expenseMessageService.postMessage(
      req.params.id,
      { body, requestType: req.body?.requestType ?? null },
      await actorFrom(req)
    );
    res.status(201).json({ message });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/:id/messages/read', async (req: AuthRequest, res: Response) => {
  if (!guard(res)) return;
  try {
    const updated = await expenseMessageService.markRead(req.params.id, await actorFrom(req));
    res.json({ updated });
  } catch (error) {
    fail(res, error);
  }
});

export default router;

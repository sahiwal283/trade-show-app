/**
 * Endpoints that no longer exist but still have a caller.
 * Each answers 410 Gone and says what was removed. Mount them behind
 * authenticateToken so the api_requests row carries the caller's user.
 */
import { Request, Response } from 'express';

/** GET /api/retraining/status — the model-retraining pipeline was removed in v2.34.0. */
export const retrainingStatusGone = (_req: Request, res: Response): void => {
  res.status(410).json({ error: 'Model retraining was removed in v2.34.0' });
};

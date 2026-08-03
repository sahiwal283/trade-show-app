/**
 * Error Handler Middleware
 * Centralized error handling for all API endpoints
 * @version 1.3.0
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';
import { AppError } from '../utils/errors';
import { MidasApiError } from '../services/midas/MidasTypes';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  errors?: Record<string, string>;
}

/**
 * Centralized error handler
 * Now supports both legacy ApiError and new AppError classes
 */
export function errorHandler(
  err: ApiError | AppError | MidasApiError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Handle AppError (new error handling)
  if (err instanceof AppError) {
    logger.error(`API Error: ${err.message}`, {
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
      context: err.context,
      stack: err.stack,
    });

    return res.status(err.statusCode).json({
      error: err.message,
      ...(err.context && { details: err.context }),
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  // Midas Ext errors use `status` (not statusCode) — forward client/upstream codes as-is
  // (e.g. Ext 400 OCR_INVALID_FILE must remain 400 on BFF, never collapsed to 500).
  if (err instanceof MidasApiError) {
    logger.error(`Midas API Error: ${err.message}`, {
      statusCode: err.status,
      code: err.code,
      requestId: err.requestId,
      path: req.path,
      method: req.method,
    });
    if (err.requestId) {
      res.setHeader('X-Request-Id', err.requestId);
    }
    return res.status(err.status).json({
      error: err.message,
      code: err.code,
      ...(err.requestId ? { requestId: err.requestId } : {}),
    });
  }

  // Handle legacy ApiError (for backward compatibility)
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  logger.error(`API Error: ${message}`, {
    statusCode,
    code: err.code,
    path: req.path,
    method: req.method,
    stack: err.stack,
  });

  res.status(statusCode).json({
    error: message,
    code: err.code,
    ...(err.errors && { errors: err.errors }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

/**
 * 404 handler
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: 'Not found',
    code: 'NOT_FOUND',
    path: req.path,
  });
}


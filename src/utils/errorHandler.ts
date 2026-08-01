/**
 * Error Handling Utilities
 * Centralized error handling and reporting
 * @version 0.8.0
 */

export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
    
    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

/**
 * Log error to console and external logging service in production
 * 
 * @param error - Error object to log
 * @param context - Optional context string for categorization
 * 
 * @remarks
 * In production, errors should be sent to a logging service like:
 * - Sentry: https://sentry.io
 * - LogRocket: https://logrocket.com  
 * - Custom logging endpoint
 * 
 * Implementation example:
 * ```typescript
 * if (import.meta.env.PROD && window.Sentry) {
 *   window.Sentry.captureException(error, {
 *     tags: { context },
 *     extra: error instanceof AppError ? {
 *       code: error.code,
 *       statusCode: error.statusCode,
 *       details: error.details
 *     } : {}
 *   });
 * }
 * ```
 */
export function logError(error: Error | AppError, context?: string) {
  console.error(`[Error${context ? ` - ${context}` : ''}]:`, {
    message: error.message,
    name: error.name,
    stack: error.stack,
    ...(error instanceof AppError && {
      code: error.code,
      statusCode: error.statusCode,
      details: error.details,
    }),
  });

  // NOTE: External logging service integration ready when needed
  // Uncomment and configure when adding Sentry/LogRocket/custom solution
  /*
  if (import.meta.env.PROD) {
    sendToLoggingService(error, context);
  }
  */
}

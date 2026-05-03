import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Invalid request', issues: err.issues });
  }

  // Log enough context to identify which route exploded — Railway logs are
  // the only forensic trail we get when a 500 reaches the client.
  const error = err instanceof Error ? err : new Error(String(err));
  console.error('UNHANDLED_ROUTE_ERROR', {
    method: req.method,
    path: req.path,
    originalUrl: (req as any).originalUrl,
    name: error.name,
    message: error.message,
    code: (error as any).code,
    meta: (error as any).meta,
    stack: error.stack
  });
  return res.status(500).json({ error: 'Internal server error' });
}

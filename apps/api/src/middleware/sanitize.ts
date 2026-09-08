import type { NextFunction, Request, Response } from 'express';

const SENSITIVE_KEYS = new Set(['passwordHash']);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function stripSensitiveFields(value: unknown, seen = new WeakSet<object>()): unknown {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item) => stripSensitiveFields(item, seen));
    return value;
  }

  if (!isPlainRecord(value)) return value;

  for (const key of Object.keys(value)) {
    if (SENSITIVE_KEYS.has(key)) {
      delete value[key];
    } else {
      stripSensitiveFields(value[key], seen);
    }
  }

  return value;
}

export function sanitizeJsonResponses(_req: Request, res: Response, next: NextFunction) {
  const json = res.json.bind(res);
  res.json = ((body?: unknown) => json(stripSensitiveFields(body))) as Response['json'];
  next();
}

import type { RequestHandler } from 'express';
import { HttpError } from './errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function requireSameOrigin(appUrl: string): RequestHandler {
  const expected = new URL(appUrl).origin;
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method) || req.headers.origin === expected) {
      next();
      return;
    }
    throw new HttpError(403, 'cross_origin', 'Request origin not allowed');
  };
}

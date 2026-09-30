import type { ApiError } from '@zap-runner/shared';
import type { Request, RequestHandler, Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimits {
  signIn: RateLimitRule;
  copilotDrafts: RateLimitRule;
  writes: RateLimitRule;
  webhooks: RateLimitRule;
}

export const DEFAULT_RATE_LIMITS: RateLimits = {
  signIn: { limit: 20, windowMs: 15 * 60_000 },
  copilotDrafts: { limit: 10, windowMs: 10 * 60_000 },
  writes: { limit: 60, windowMs: 60_000 },
  webhooks: { limit: 600, windowMs: 60_000 },
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function clientKey(req: Request): string {
  if (req.auth) return `user:${req.auth.user.id}`;
  return `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
}

function retryAfterSeconds(res: Response, windowMs: number): number {
  const header = Number(res.getHeader('retry-after'));
  return Number.isFinite(header) && header > 0 ? header : Math.ceil(windowMs / 1000);
}

export function rateLimitedBody(seconds: number): ApiError {
  const unit = seconds === 1 ? 'second' : 'seconds';
  return {
    error: {
      code: 'rate_limited',
      message: `Too many requests. Try again in ${String(seconds)} ${unit}.`,
    },
  };
}

interface LimiterOptions {
  onlyWrites?: boolean;
  onLimited?: (req: Request, res: Response) => void;
}

export function limiter(rule: RateLimitRule, options: LimiterOptions = {}): RequestHandler {
  return rateLimit({
    limit: rule.limit,
    windowMs: rule.windowMs,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: clientKey,
    skip: (req) => options.onlyWrites === true && SAFE_METHODS.has(req.method),
    handler: (req, res) => {
      req.log.warn({ key: clientKey(req), path: req.originalUrl }, 'rate limited');
      if (options.onLimited) {
        options.onLimited(req, res);
        return;
      }
      res.status(429).json(rateLimitedBody(retryAfterSeconds(res, rule.windowMs)));
    },
  });
}

import { RequestError } from '@octokit/request-error';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiError } from '@zap-runner/shared';
import type { z } from 'zod';
import { githubRateLimited } from '../github/rate-limited.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export function notFoundError(what: string): HttpError {
  return new HttpError(404, 'not_found', `${what} not found`);
}

function body(code: string, message: string, fields?: Record<string, string>): ApiError {
  return fields ? { error: { code, message, fields } } : { error: { code, message } };
}

export function parseBody<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    fields[issue.path.join('.') || 'body'] ??= issue.message;
  }
  throw new HttpError(400, 'invalid_request', 'The request body is invalid', fields);
}

export function parseQuery<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new HttpError(400, 'invalid_query', 'The query string is invalid');
}

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json(body('not_found', 'Route not found'));
};

const TOKEN_INVALID_MESSAGE = 'GitHub no longer accepts your sign-in. Sign out and sign in again.';

function bodyParserError(error: unknown): HttpError | null {
  if (typeof error !== 'object' || error === null || !('type' in error)) return null;
  if (error.type === 'entity.parse.failed')
    return new HttpError(400, 'invalid_json', 'The request body is not valid JSON');
  if (error.type === 'entity.too.large')
    return new HttpError(413, 'payload_too_large', 'The request body is too large');
  return null;
}

export function githubRequestError(error: RequestError): HttpError {
  if (error.status === 401)
    return new HttpError(401, 'github_token_invalid', TOKEN_INVALID_MESSAGE);
  if (githubRateLimited(error))
    return new HttpError(
      503,
      'github_rate_limited',
      'GitHub is limiting requests right now. Try again in a few minutes.',
    );
  if (error.status >= 500)
    return new HttpError(502, 'github_unreachable', 'GitHub did not respond. Try again shortly.');
  return new HttpError(502, 'github_error', 'GitHub refused the request.');
}

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  const known =
    error instanceof HttpError
      ? error
      : error instanceof RequestError
        ? githubRequestError(error)
        : bodyParserError(error);
  if (known) {
    if (error instanceof RequestError)
      req.log.warn({ status: error.status }, 'github request failed');
    res.status(known.status).json(body(known.code, known.message, known.fields));
    return;
  }
  req.log.error({ err: error }, 'unhandled error');
  res.status(500).json(body('internal', 'Something went wrong'));
};

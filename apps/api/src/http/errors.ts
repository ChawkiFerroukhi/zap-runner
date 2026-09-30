import { RequestError } from '@octokit/request-error';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiError } from '@zap-runner/shared';
import type { z } from 'zod';

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

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json(body(error.code, error.message, error.fields));
    return;
  }
  if (error instanceof RequestError && error.status === 401) {
    req.log.warn('stored GitHub token was rejected');
    res
      .status(401)
      .json(
        body(
          'github_token_invalid',
          'GitHub no longer accepts your sign-in. Sign out and sign in again.',
        ),
      );
    return;
  }
  req.log.error({ err: error }, 'unhandled error');
  res.status(500).json(body('internal', 'Something went wrong'));
};

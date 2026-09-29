import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiError } from '@zap-runner/shared';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function body(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json(body('not_found', 'Route not found'));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json(body(error.code, error.message));
    return;
  }
  req.log.error({ err: error }, 'unhandled error');
  res.status(500).json(body('internal', 'Something went wrong'));
};

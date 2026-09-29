import { parse } from 'cookie';
import type { Request } from 'express';

export function readCookie(req: Request, name: string): string | undefined {
  return parse(req.headers.cookie ?? '')[name];
}

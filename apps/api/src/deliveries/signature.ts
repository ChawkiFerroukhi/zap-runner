import { createHmac, timingSafeEqual } from 'node:crypto';

export function sign(body: Buffer, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export function signatureMatches(body: Buffer, secret: string, header: string): boolean {
  const expected = Buffer.from(sign(body, secret));
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

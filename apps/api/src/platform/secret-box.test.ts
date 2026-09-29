import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSecretBox } from './secret-box.js';

describe('secret box', () => {
  const box = createSecretBox(randomBytes(32));

  it('round-trips a value without storing it in the clear', () => {
    const sealed = box.seal('gho_example_token');
    expect(sealed).not.toContain('gho_example_token');
    expect(box.open(sealed)).toBe('gho_example_token');
  });

  it('uses a fresh IV for every seal', () => {
    expect(box.seal('same')).not.toBe(box.seal('same'));
  });

  it('rejects a tampered ciphertext', () => {
    const [version, iv, tag, ciphertext = ''] = box.seal('secret').split('.');
    const flipped = Buffer.from(ciphertext, 'base64url');
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    const tampered = [version, iv, tag, flipped.toString('base64url')].join('.');
    expect(() => box.open(tampered)).toThrow();
  });

  it('rejects a value sealed with a different key', () => {
    const other = createSecretBox(randomBytes(32));
    expect(() => other.open(box.seal('secret'))).toThrow();
  });
});

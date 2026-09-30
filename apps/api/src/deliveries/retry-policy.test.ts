import { describe, expect, it } from 'vitest';
import { DEFAULT_RETRY_POLICY, retryDelayMs, shouldRetry } from './retry-policy.js';

describe('retry policy', () => {
  it('backs off exponentially from 2 s and caps at one minute', () => {
    const noJitter = () => 1;
    expect(
      [1, 2, 3, 4].map((attempt) => retryDelayMs(DEFAULT_RETRY_POLICY, attempt, noJitter)),
    ).toEqual([2_000, 8_000, 32_000, 60_000]);
  });

  it('spreads retries between half and the full delay so failures do not retry in lockstep', () => {
    expect(retryDelayMs(DEFAULT_RETRY_POLICY, 2, () => 0)).toBe(4_000);
    expect(retryDelayMs(DEFAULT_RETRY_POLICY, 2, () => 0.5)).toBe(6_000);
  });

  it('retries only retryable failures, and only until the attempt limit', () => {
    expect(shouldRetry(DEFAULT_RETRY_POLICY, 1, true)).toBe(true);
    expect(shouldRetry(DEFAULT_RETRY_POLICY, 3, true)).toBe(true);
    expect(shouldRetry(DEFAULT_RETRY_POLICY, 4, true)).toBe(false);
    expect(shouldRetry(DEFAULT_RETRY_POLICY, 1, false)).toBe(false);
  });
});

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 2_000,
  maxDelayMs: 60_000,
};

export function retryDelayMs(
  policy: RetryPolicy,
  failedAttempts: number,
  random: () => number = Math.random,
): number {
  const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * 4 ** (failedAttempts - 1));
  const half = exponential / 2;
  return Math.round(half + random() * half);
}

export function shouldRetry(
  policy: RetryPolicy,
  failedAttempts: number,
  retryable: boolean,
): boolean {
  return retryable && failedAttempts < policy.maxAttempts;
}

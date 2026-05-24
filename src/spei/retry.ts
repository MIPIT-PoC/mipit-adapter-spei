/**
 * @file retry.ts
 * @description Generic exponential-backoff retry helper used by the SPEI HTTP client; increments the speiRetryCount metric on each failed attempt.
 * @author Miguel
 * @project MIPIT-PoC — Cross-border Instant Payments Middleware
 */
import { logger } from '../observability/logger.js';
import { speiRetryCount } from '../observability/metrics.js';

interface RetryOptions {
  maxRetries: number;
  baseDelayMs?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const { maxRetries, baseDelayMs = 500 } = opts;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;

      speiRetryCount.inc();
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn({ attempt, maxRetries, delay, err }, 'Retry after failure');
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error('Unreachable');
}

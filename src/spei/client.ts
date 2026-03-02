import { env } from '../config/env.js';
import { withRetry } from './retry.js';
import type { SpeiPaymentRequest, SpeiPaymentResponse } from './types.js';
import { logger } from '../observability/logger.js';

export async function sendSpeiPayment(payload: SpeiPaymentRequest): Promise<SpeiPaymentResponse> {
  return withRetry(async () => {
    const url = `${env.SPEI_SANDBOX_URL}/spei/payments`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.SPEI_TIMEOUT_MS);

    try {
      logger.debug({ url, spei_tx_ref: payload.spei_tx_ref }, 'Sending SPEI payment');

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`SPEI sandbox error: ${res.status} — ${body}`);
      }

      return (await res.json()) as SpeiPaymentResponse;
    } finally {
      clearTimeout(timeout);
    }
  }, { maxRetries: env.SPEI_MAX_RETRIES });
}

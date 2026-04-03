import { env } from '../config/env.js';
import { withRetry } from './retry.js';
import type { SpeiCecobanRequest, SpeiCecobanResponse } from './types.js';
import { logger } from '../observability/logger.js';

export async function sendSpeiPayment(payload: SpeiCecobanRequest): Promise<SpeiCecobanResponse> {
  return withRetry(async () => {
    // Try real CECOBAN endpoint; mock server handles both paths
    const url = `${env.SPEI_SANDBOX_URL}/spei/v3/transferencias`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.SPEI_TIMEOUT_MS);

    try {
      logger.debug({ url, claveRastreo: payload.claveRastreo }, 'Sending SPEI payment');

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

      return (await res.json()) as SpeiCecobanResponse;
    } finally {
      clearTimeout(timeout);
    }
  }, { maxRetries: env.SPEI_MAX_RETRIES });
}

import { env } from '../config/env.js';
import { withRetry } from './retry.js';
import type { SpeiCecobanRequest, SpeiCecobanResponse } from './types.js';
import { logger } from '../observability/logger.js';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getOAuthToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const res = await fetch(`${env.SPEI_SANDBOX_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: 'mipit-core',
      client_secret: 'mipit-secret-spei-2024',
      scope: 'spei.transferencias',
    }),
  });

  if (!res.ok) {
    throw new Error(`OAuth2 token request failed: ${res.status}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  logger.info('SPEI OAuth2 token acquired');
  return cachedToken.token;
}

export async function sendSpeiPayment(payload: SpeiCecobanRequest): Promise<SpeiCecobanResponse> {
  return withRetry(async () => {
    const url = `${env.SPEI_SANDBOX_URL}/spei/v3/transferencias`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.SPEI_TIMEOUT_MS);

    try {
      const token = await getOAuthToken();
      logger.debug({ url, claveRastreo: payload.claveRastreo }, 'Sending SPEI payment');

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (res.status === 401) {
        cachedToken = null;
        const newToken = await getOAuthToken();
        const retryRes = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${newToken}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!retryRes.ok) {
          const body = await retryRes.text();
          throw new Error(`SPEI sandbox error after token refresh: ${retryRes.status} — ${body}`);
        }
        return (await retryRes.json()) as SpeiCecobanResponse;
      }

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

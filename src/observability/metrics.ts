/**
 * @file metrics.ts
 * @description Prometheus metrics registry for the SPEI adapter: per-rail counters/histograms and the unified mipit_adapter_* P07 metrics (requests, latency, retries, errors).
 * @author Carlos
 * @project MIPIT-PoC — Cross-border Instant Payments Middleware
 */
import client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

// Legacy per-rail metric names
export const speiPaymentsTotal = new client.Counter({
  name: 'mipit_adapter_spei_payments_total',
  help: 'Total SPEI payments processed by this adapter',
  labelNames: ['status'],
  registers: [registry],
});

export const speiPaymentLatency = new client.Histogram({
  name: 'mipit_adapter_spei_payment_latency_ms',
  help: 'SPEI payment processing latency in milliseconds',
  labelNames: ['status'],
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000], // W5.5
  registers: [registry],
});

export const speiRetryCount = new client.Counter({
  name: 'mipit_adapter_spei_retries_total',
  help: 'Total retry attempts for SPEI payments',
  registers: [registry],
});

// P07 — Unified adapter metrics (rail label)
const RAIL = 'SPEI';

export const adapterRequestsTotal = new client.Counter({
  name: 'mipit_adapter_requests_total',
  help: 'Total adapter requests by rail and status (P07 unified)',
  labelNames: ['rail', 'status'] as const,
  registers: [registry],
});

export const adapterLatencyMs = new client.Histogram({
  name: 'mipit_adapter_latency_ms',
  help: 'Adapter request latency in ms by rail',
  labelNames: ['rail'] as const,
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000], // W5.5
  registers: [registry],
});

export const adapterRetriesTotal = new client.Counter({
  name: 'mipit_adapter_retries_total',
  help: 'Adapter retries by rail',
  labelNames: ['rail'] as const,
  registers: [registry],
});

export const adapterErrorsTotal = new client.Counter({
  name: 'mipit_adapter_errors_total',
  help: 'Adapter errors by rail and error code',
  labelNames: ['rail', 'error'] as const,
  registers: [registry],
});

export function recordAdapterRequest(status: 'success' | 'rejected' | 'error', latencyMs?: number, errorCode?: string): void {
  speiPaymentsTotal.inc({ status });
  adapterRequestsTotal.inc({ rail: RAIL, status: status.toUpperCase() });
  if (latencyMs !== undefined) {
    speiPaymentLatency.observe({ status }, latencyMs);
    adapterLatencyMs.observe({ rail: RAIL }, latencyMs);
  }
  if (errorCode) {
    adapterErrorsTotal.inc({ rail: RAIL, error: errorCode });
  }
}

export function recordAdapterRetry(): void {
  speiRetryCount.inc();
  adapterRetriesTotal.inc({ rail: RAIL });
}

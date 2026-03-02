import client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

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
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [registry],
});

export const speiRetryCount = new client.Counter({
  name: 'mipit_adapter_spei_retries_total',
  help: 'Total retry attempts for SPEI payments',
  registers: [registry],
});

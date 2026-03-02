import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  RABBITMQ_URL: z.string(),
  QUEUE_NAME: z.string().default('payments.route.spei'),
  ACK_ROUTING_KEY: z.string().default('ack.spei'),
  EXCHANGE_NAME: z.string().default('mipit.payments'),
  SPEI_SANDBOX_URL: z.string().url().default('http://localhost:9002'),
  SPEI_MODE: z.enum(['sandbox', 'mock']).default('mock'),
  SPEI_MOCK_PORT: z.coerce.number().default(9002),
  SPEI_TIMEOUT_MS: z.coerce.number().default(10000),
  SPEI_MAX_RETRIES: z.coerce.number().default(3),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().default('mipit-adapter-spei'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  INSTANCE_ID: z.string().default(`spei-${process.pid}`),
});

export const env = envSchema.parse(process.env);

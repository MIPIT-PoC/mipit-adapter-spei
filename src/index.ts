/**
 * @file index.ts
 * @description Entry point for the SPEI adapter: bootstraps OTEL, starts the mock sandbox (if enabled), health server and RabbitMQ worker.
 * @author Nicolás
 * @project MIPIT-PoC — Cross-border Instant Payments Middleware
 */
import { initTelemetry } from './observability/otel.js';
const sdk = initTelemetry();

import { connectRabbitMQ } from './messaging/rabbitmq.js';
import { startWorker } from './worker.js';
import { startMockServer } from './spei/mock-server.js';
import { startHealthServer } from './health-server.js';
import { env } from './config/env.js';
import { logger } from './observability/logger.js';

async function main() {
  if (env.SPEI_MODE === 'mock') {
    await startMockServer();
    logger.info('SPEI mock sandbox started');
  }

  await startHealthServer(env.HEALTH_PORT);

  const { channel } = await connectRabbitMQ(env.RABBITMQ_URL);
  await startWorker(channel);
  logger.info(`mipit-adapter-spei worker started (instance: ${env.INSTANCE_ID})`);

  const shutdown = async () => {
    logger.info('Shutting down adapter-spei...');
    await channel.close();
    await sdk.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.fatal(err, 'Failed to start adapter-spei');
  process.exit(1);
});

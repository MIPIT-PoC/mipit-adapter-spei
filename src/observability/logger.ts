/**
 * @file logger.ts
 * @description Structured pino logger preconfigured with ISO timestamps, log level from env, and service name tag for the SPEI adapter.
 * @author Nicolás
 * @project MIPIT-PoC — Cross-border Instant Payments Middleware
 */
import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { service: env.OTEL_SERVICE_NAME },
});

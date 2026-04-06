import type { Channel, ConsumeMessage } from 'amqplib';
import { env } from './config/env.js';
import { ADAPTER_ID, RAIL } from './config/constants.js';
import { canonicalToSpeiPayload } from './spei/mapper.js';
import { speiResponseToAck } from './spei/response-mapper.js';
import { sendSpeiPayment } from './spei/client.js';
import { publishAck } from './messaging/publisher.js';
import { logger } from './observability/logger.js';
import { speiPaymentsTotal, speiPaymentLatency } from './observability/metrics.js';

export interface PaymentRouteMessage {
  payment_id: string;
  trace_id: string;
  canonical: Record<string, unknown>;
  destination_rail: string;
  route_rule_applied: string;
  routed_at: string;
}

export interface PaymentAckMessage {
  payment_id: string;
  trace_id: string;
  source_rail: string;
  adapter_id: string;
  instance_id: string;
  status: 'ACKED_BY_RAIL' | 'REJECTED' | 'FAILED';
  rail_ack: {
    rail_tx_id?: string;
    status: 'ACCEPTED' | 'REJECTED' | 'ERROR';
    error?: { code: string; message: string };
    raw_response?: Record<string, unknown>;
  };
  latency_ms: number;
  processed_at: string;
}

export async function startWorker(channel: Channel) {
  await channel.prefetch(1);

  logger.info({ queue: env.QUEUE_NAME }, 'Waiting for messages...');

  await channel.consume(env.QUEUE_NAME, async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    const startTime = Date.now();
    let routeMsg: PaymentRouteMessage;

    try {
      routeMsg = JSON.parse(msg.content.toString());
    } catch {
      logger.error('Invalid message format, discarding');
      channel.nack(msg, false, false);
      return;
    }

    logger.info({ payment_id: routeMsg.payment_id, trace_id: routeMsg.trace_id }, 'Processing SPEI payment');

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const speiPayload = canonicalToSpeiPayload(routeMsg.canonical as any);
      const speiResponse = await sendSpeiPayment(speiPayload);
      const railAck = speiResponseToAck(speiResponse);
      const latencyMs = Date.now() - startTime;

      const ackMessage: PaymentAckMessage = {
        payment_id: routeMsg.payment_id,
        trace_id: routeMsg.trace_id,
        source_rail: RAIL,
        adapter_id: ADAPTER_ID,
        instance_id: env.INSTANCE_ID,
        status: railAck.status === 'ACCEPTED' ? 'ACKED_BY_RAIL' : 'REJECTED',
        rail_ack: railAck,
        latency_ms: latencyMs,
        processed_at: new Date().toISOString(),
      };

      publishAck(channel, ackMessage );

      speiPaymentsTotal.inc({ status: railAck.status === 'ACCEPTED' ? 'success' : 'rejected' });
      speiPaymentLatency.observe({ status: 'success' }, latencyMs);

      logger.info({
        payment_id: routeMsg.payment_id,
        status: railAck.status,
        latency_ms: latencyMs,
      }, 'SPEI payment processed');

      channel.ack(msg);
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      logger.error({ payment_id: routeMsg.payment_id, err }, 'SPEI payment failed after retries');

      const failAck: PaymentAckMessage = {
        payment_id: routeMsg.payment_id,
        trace_id: routeMsg.trace_id,
        source_rail: RAIL,
        adapter_id: ADAPTER_ID,
        instance_id: env.INSTANCE_ID,
        status: 'FAILED',
        rail_ack: {
          status: 'ERROR',
          error: { code: 'ADAPTER_ERROR', message: String(err) },
        },
        latency_ms: latencyMs,
        processed_at: new Date().toISOString(),
      };

      publishAck(channel, failAck );

      speiPaymentsTotal.inc({ status: 'error' });
      speiPaymentLatency.observe({ status: 'error' }, latencyMs);

      channel.nack(msg, false, false);
    }
  });
}

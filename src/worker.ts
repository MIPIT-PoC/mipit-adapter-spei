/**
 * @file worker.ts
 * @description RabbitMQ consumer that processes routed payments, maps them to SPEI/CECOBAN, dispatches them to the SPEI rail and publishes a pacs.002 ack back to the MIPIT exchange.
 * @author Miguel
 * @project MIPIT-PoC — Cross-border Instant Payments Middleware
 */
import type { Channel, ConsumeMessage } from 'amqplib';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { ADAPTER_ID, RAIL } from './config/constants.js';
import { canonicalToSpeiPayload } from './spei/mapper.js';
import { speiResponseToAck } from './spei/response-mapper.js';
import { sendSpeiPayment } from './spei/client.js';
import { publishAck } from './messaging/publisher.js';
import { logger } from './observability/logger.js';
import { speiPaymentLatency, recordAdapterRequest } from './observability/metrics.js';

export interface PaymentRouteMessage {
  payment_id: string;
  trace_id: string;
  canonical: Record<string, unknown> & {
    pmtId?: { endToEndId?: string; uetr?: string };
    grpHdr?: { msgId?: string };
  };
  destination_rail: string;
  route_rule_applied: string;
  routed_at: string;
  /** W6.1 — original pacs.008 UETR for correlation in the pacs.002 ack. */
  uetr?: string;
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
  /** W6.1 — ISO 20022 pacs.002 block for cross-border correlation. */
  pacs002?: {
    msgId: string;
    orgnlMsgId?: string;
    orgnlMsgNmId: string;
    orgnlEndToEndId: string;
    orgnlUetr?: string;
    txSts: 'ACSC' | 'ACSP' | 'RJCT' | 'PDNG' | 'PART';
    stsRsnInf?: { rsn: { cd?: string; prtry?: string }; addtlInf?: string[] };
  };
  latency_ms: number;
  processed_at: string;
}

/** W6.1 — Map adapter rail-level status to ISO 20022 TxSts. */
function railStatusToTxSts(status: 'ACCEPTED' | 'REJECTED' | 'ERROR'): 'ACSC' | 'RJCT' | 'PDNG' {
  if (status === 'ACCEPTED') return 'ACSC';
  if (status === 'REJECTED') return 'RJCT';
  return 'PDNG';
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

      // W6.1 — emit pacs.002 alongside the legacy ack.
      const txSts = railStatusToTxSts(railAck.status);
      const ackMessage: PaymentAckMessage = {
        payment_id: routeMsg.payment_id,
        trace_id: routeMsg.trace_id,
        source_rail: RAIL,
        adapter_id: ADAPTER_ID,
        instance_id: env.INSTANCE_ID,
        status: railAck.status === 'ACCEPTED' ? 'ACKED_BY_RAIL' : 'REJECTED',
        rail_ack: railAck,
        pacs002: {
          msgId: `STS-${randomUUID()}`,
          orgnlMsgId: routeMsg.canonical.grpHdr?.msgId,
          orgnlMsgNmId: 'pacs.008.001.10',
          orgnlEndToEndId: routeMsg.canonical.pmtId?.endToEndId ?? routeMsg.payment_id,
          orgnlUetr: routeMsg.uetr ?? routeMsg.canonical.pmtId?.uetr,
          txSts,
          stsRsnInf: railAck.error
            ? { rsn: { prtry: railAck.error.code }, addtlInf: [railAck.error.message] }
            : undefined,
        },
        latency_ms: latencyMs,
        processed_at: new Date().toISOString(),
      };

      publishAck(channel, ackMessage );

      // P07 — unified helper also feeds mipit_adapter_requests_total{rail="SPEI"}.
      recordAdapterRequest(
        railAck.status === 'ACCEPTED' ? 'success' : 'rejected',
        latencyMs,
        railAck.status === 'ACCEPTED' ? undefined : railAck.error?.code,
      );
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
        pacs002: {
          msgId: `STS-${randomUUID()}`,
          orgnlMsgId: routeMsg.canonical.grpHdr?.msgId,
          orgnlMsgNmId: 'pacs.008.001.10',
          orgnlEndToEndId: routeMsg.canonical.pmtId?.endToEndId ?? routeMsg.payment_id,
          orgnlUetr: routeMsg.uetr ?? routeMsg.canonical.pmtId?.uetr,
          txSts: 'PDNG',
          stsRsnInf: { rsn: { prtry: 'ADAPTER_ERROR' }, addtlInf: [String(err).slice(0, 105)] },
        },
        latency_ms: latencyMs,
        processed_at: new Date().toISOString(),
      };

      publishAck(channel, failAck );

      recordAdapterRequest('error', latencyMs, 'ADAPTER_ERROR');
      speiPaymentLatency.observe({ status: 'error' }, latencyMs);

      channel.nack(msg, false, false);
    }
  });
}

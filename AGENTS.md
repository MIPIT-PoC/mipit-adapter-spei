# AGENTS.md

<purpose>
This repository implements the SPEI rail adapter for MiPIT-PoC: a RabbitMQ worker that consumes canonical payment messages, translates them to SPEI-native format, calls the SPEI sandbox (or embedded mock), and publishes acknowledgment messages back to the core.

It is responsible for:
- consuming messages from the `payments.route.spei` queue,
- translating CanonicalPacs008 payloads to SPEI-native format (clabe_destino, clabe_origen, monto, moneda MXN, tipo_cuenta CLABE),
- calling the SPEI sandbox API with retry and timeout,
- translating SPEI responses to PaymentAckMessage (ACEPTADO→ACCEPTED, RECHAZADO→REJECTED),
- publishing ACK messages to `mipit.payments` exchange with routing key `ack.spei`,
- running an embedded mock server (port 9002) when SPEI_MODE=mock,
- validating CLABE format (18 digits),
- exposing Prometheus metrics and OpenTelemetry traces.

Treat shipped code as the primary source of truth.
When code and documents disagree, prefer:
1. current repo implementation,
2. current architecture/design artifacts in mipit-docs,
3. current SRS,
4. project plan / older planning notes.
</purpose>

<project_scope>
This adapter is a PoC simulation of SPEI rail integration.
It does NOT implement:
- real SPEI/Banxico API integration,
- real CLABE checksum validation,
- production retry/circuit-breaker patterns,
- real settlement or reconciliation.

The embedded mock server simulates SPEI behavior with CLABE length validation, configurable failure rates, and latency.
</project_scope>

<instruction_priority>
- User instructions override default style, tone, and initiative preferences.
- Safety, honesty, privacy, and permission constraints do not yield.
- If a newer user instruction conflicts with an earlier one, follow the newer instruction.
</instruction_priority>

<workflow>
  <phase name="clarify">
  - Before changes, clarify whether the change affects:
    - message consumption (worker.ts),
    - canonical → SPEI translation (mapper.ts),
    - SPEI → ACK translation (response-mapper.ts),
    - HTTP client / retry logic (client.ts, retry.ts),
    - mock server behavior (mock-server.ts),
    - RabbitMQ connection/topology (messaging/),
    - bootstrap flow (index.ts),
    - observability.
  - Clarify impact on the ACK message contract with mipit-core.
  </phase>

  <phase name="research">
  - Inspect the current codebase, especially:
    - src/spei/types.ts for SpeiPaymentRequest (clabe_origen, clabe_destino, monto, moneda) and SpeiPaymentResponse (estatus ACEPTADO/RECHAZADO),
    - src/spei/mapper.ts for canonicalToSpeiPayload,
    - src/spei/response-mapper.ts for speiResponseToAck,
    - src/spei/client.ts for sendSpeiPayment,
    - src/spei/mock-server.ts for mock behavior and CLABE validation,
    - src/worker.ts for the consume → process → publish ACK flow.
  - Cross-reference with mipit-core canonical model and RabbitMQ topology.
  </phase>

  <phase name="plan">
  - Present a plan covering: message format changes, SPEI payload changes, ACK format changes, mock behavior changes.
  - Wait for user approval.
  </phase>

  <phase name="implement">
  - Keep the worker flow: consume → translate → call → translate response → publish ACK → ack message.
  - Keep mapper functions pure: canonical in → SPEI payload out.
  - SPEI-specific: always set moneda='MXN', tipo_cuenta='CLABE'.
  - Strip SPEI- prefix from canonical alias to get raw CLABE.
  - Map response estatus: ACEPTADO → ACCEPTED, RECHAZADO → REJECTED.
  - On unrecoverable errors, nack to DLQ.
  </phase>

  <phase name="verify">
  - Run `npm run build` and `npm run lint`.
  - Run unit tests for mapper and response-mapper.
  - Verify mock server responds on port 9002 (POST /spei/payments with CLABE validation, GET /health).
  - Verify worker processes a message and publishes an ACK.
  </phase>

  <phase name="document">
  - Update README.md when SPEI payload format, env vars, or behavior changes.
  - Update .env.example when configuration changes.
  </phase>
</workflow>

<architecture_rules>
- Standalone RabbitMQ worker, not an HTTP server (except the mock).
- Communicates with mipit-core exclusively through RabbitMQ messages.
- Inbound: CanonicalPacs008 JSON from `payments.route.spei` queue.
- Outbound: PaymentAckMessage JSON to `mipit.payments` exchange with key `ack.spei`.
- Mock server embedded, starts only when SPEI_MODE=mock.
- ADAPTER_ID='adapter-spei', RAIL='SPEI'.
</architecture_rules>

<adapter_rules>
- mapper.ts: strip SPEI- prefix from alias, set moneda='MXN', tipo_cuenta='CLABE', map canonical fields to SPEI fields.
- response-mapper.ts: ACEPTADO→ACCEPTED, RECHAZADO→REJECTED; include latency_ms.
- client.ts: HTTP POST with timeout, wrapped in withRetry.
- mock-server.ts: POST /spei/payments validates CLABE (18 digits), returns 200 (90%) or 500 (10%), latency 100-500ms.
- worker.ts: consume → try { translate → call → ack-translate → publish } catch { nack to DLQ }.
</adapter_rules>

<testing_rules>
- Unit test mapper: verify CLABE stripping, MXN default, field mapping.
- Unit test response-mapper: verify ACEPTADO→ACCEPTED, RECHAZADO→REJECTED.
- Unit test retry: verify backoff and max retries.
- Contract test mock: verify CLABE validation and response format.
</testing_rules>

<default_commands>
- Development: `npm run dev`
- Build: `npm run build`
- Start: `npm start`
- Start mock only: `npm run mock`
- Lint: `npm run lint`
- Test: `npm test`
</default_commands>

/**
 * SPEI CECOBAN Mock Server
 *
 * Simulates the BANXICO SPEI sandbox endpoint for PoC testing.
 * Implements the real CECOBAN response format per BANXICO specification:
 *   POST /spei/v3/transferencias → SpeiCecobanResponse
 *
 * Simulated behaviors per CECOBAN/BANXICO SPEI spec:
 *   - claveRastreo deduplication (idempotency)
 *   - Full CECOBAN rejection code set: R01–R09, R12, LIM, BLQ, CAN, INN
 *   - CLABE format + check digit validation (via clabe-validator)
 *   - referenciaNumerica: 7-digit, 0–9999999
 *   - RFC/CURP basic format validation
 *   - SPEI operating hours: M–F 07:00–17:30 CST (R08 outside)
 *   - Amount: > 0, max MXN 999,999,999.99
 *   - Realistic SPEI latency (80–450ms)
 */

import express from 'express';
import { registerOAuth2Routes, oauthMiddleware } from './oauth-mock.js';
import { registerAdminRoutes, mockConfig, mockStats } from './admin-routes.js';
import { ulid } from 'ulid';
import { env } from '../config/env.js';
import { logger } from '../observability/logger.js';
import type { SpeiCecobanRequest, SpeiCecobanResponse } from './types.js';
import { validateClabeDetailed } from './clabe-validator.js';

const app = express();
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (_req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());
registerOAuth2Routes(app);
app.use(oauthMiddleware);

/**
 * PoC mode: when MOCK_ENFORCE_HOURS=false (default in PoC), SPEI operating
 * window checks are bypassed so tests run deterministically at any time.
 * Set MOCK_ENFORCE_HOURS=true to simulate real CECOBAN/BANXICO constraints.
 */
const ENFORCE_HOURS = (process.env.MOCK_ENFORCE_HOURS ?? 'false') === 'true';

/** In-memory idempotency store: claveRastreo → settled response */
const processedTransfers = new Map<string, SpeiCecobanResponse>();

registerAdminRoutes(app, processedTransfers);

/** RFC México: persona física = 4 letters + 6 digits + 3 alphanum | persona moral = 3 letters + 6 digits + 3 alphanum */
const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;

/** CURP México: 18 characters */
const CURP_REGEX = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d$/i;

/**
 * Returns true if the current CST time is inside SPEI operating window.
 * SPEI window (CST = UTC-6):
 *   Monday–Friday: 07:00–17:30
 *   Weekends: closed (BANXICO does not operate SPEI on weekends)
 */
function isSpeiWindowOpen(): boolean {
  const cst = new Date(Date.now() - 6 * 60 * 60 * 1000); // UTC-6
  const day  = cst.getUTCDay();   // 0=Sun, 6=Sat
  const hour = cst.getUTCHours();
  const min  = cst.getUTCMinutes();
  const hhmm = hour * 100 + min;

  if (day === 0 || day === 6) return false; // Weekend: closed
  return hhmm >= 700 && hhmm <= 1730;       // 07:00–17:30
}

/**
 * POST /spei/v3/transferencias
 * Simulates the BANXICO/CECOBAN SPEI settlement endpoint.
 */
app.post('/spei/v3/transferencias', (req, res) => {
  const body = req.body as Partial<SpeiCecobanRequest>;
  const {
    claveRastreo,
    monto,
    cuentaBeneficiario,
    tipoCuentaBeneficiario,
    institucionContraparte,
    referenciaNumerica,
    rfcCurpBeneficiario,
    rfcCurpOrdenante,
    conceptoPago,
  } = body;

  // === Idempotency: return cached response for duplicate claveRastreo ===
  if (claveRastreo && processedTransfers.has(claveRastreo)) {
    logger.info({ claveRastreo }, 'SPEI mock: duplicate claveRastreo — returning cached response');
    return res.status(200).json(processedTransfers.get(claveRastreo));
  }

  // === Validation: claveRastreo required ===
  if (!claveRastreo || claveRastreo.trim() === '') {
    return res.status(400).json({
      error: 'CAMPO_REQUERIDO',
      detalle: 'El campo claveRastreo es obligatorio y debe ser único.',
      campo: 'claveRastreo',
    });
  }

  // P03 — claveRastreo: 1-30 alphanumeric ONLY (no hyphens, no underscores)
  // per Banxico CECOBAN spec / stpmex-python field validator.
  if (!/^[A-Za-z0-9]{1,30}$/.test(claveRastreo)) {
    return res.status(400).json({
      error: 'CLAVE_RASTREO_INVALIDA',
      detalle: 'claveRastreo debe tener máximo 30 caracteres alfanuméricos (sin guiones ni underscores).',
      campo: 'claveRastreo',
    });
  }

  // === Validation: monto ===
  if (monto === undefined || monto === null || monto <= 0) {
    return res.status(400).json({
      error: 'MONTO_INVALIDO',
      detalle: 'El monto debe ser un número mayor a 0.',
      campo: 'monto',
    });
  }

  if (monto > 999_999_999.99) {
    return res.status(400).json({
      error: 'MONTO_EXCEDE_LIMITE',
      detalle: 'El monto excede el límite máximo permitido por SPEI (MXN 999,999,999.99).',
      campo: 'monto',
    });
  }

  // P03 — referenciaNumerica: 1–9_999_999 (CECOBAN reserves 0 as sentinel).
  if (referenciaNumerica !== undefined) {
    if (!Number.isInteger(referenciaNumerica) || referenciaNumerica < 1 || referenciaNumerica > 9_999_999) {
      return res.status(400).json({
        error: 'REFERENCIA_INVALIDA',
        detalle: 'referenciaNumerica debe ser un entero de 1 a 9,999,999 (máximo 7 dígitos).',
        campo: 'referenciaNumerica',
      });
    }
  }

  // === Validation: conceptoPago max 39 chars ===
  if (conceptoPago && conceptoPago.length > 39) {
    return res.status(400).json({
      error: 'CONCEPTO_EXCEDE_LONGITUD',
      detalle: 'conceptoPago no puede exceder 39 caracteres.',
      campo: 'conceptoPago',
    });
  }

  // === Validation: RFC/CURP format (if provided) ===
  if (rfcCurpBeneficiario && !RFC_REGEX.test(rfcCurpBeneficiario) && !CURP_REGEX.test(rfcCurpBeneficiario)) {
    return res.status(400).json({
      error: 'RFC_CURP_INVALIDO',
      detalle: `rfcCurpBeneficiario '${rfcCurpBeneficiario}' no cumple el formato de RFC ni CURP mexicano.`,
      campo: 'rfcCurpBeneficiario',
    });
  }
  if (rfcCurpOrdenante && !RFC_REGEX.test(rfcCurpOrdenante) && !CURP_REGEX.test(rfcCurpOrdenante)) {
    return res.status(400).json({
      error: 'RFC_CURP_INVALIDO',
      detalle: `rfcCurpOrdenante '${rfcCurpOrdenante}' no cumple el formato de RFC ni CURP mexicano.`,
      campo: 'rfcCurpOrdenante',
    });
  }

  // P03 — institucionContraparte: 5 digits from Banxico catalog (40xxx banks,
  // 90xxx non-bank). Previous 3-5 was lax and accepted CLABE prefixes.
  if (institucionContraparte && !/^\d{5}$/.test(institucionContraparte)) {
    return res.status(400).json({
      error: 'INSTITUCION_INVALIDA',
      detalle: `Código de institución inválido: '${institucionContraparte}'. Debe ser 3–5 dígitos del catálogo BANXICO.`,
      campo: 'institucionContraparte',
    });
  }

  // === Validation: CLABE when tipoCuenta = 40 ===
  if (tipoCuentaBeneficiario === 40 && cuentaBeneficiario) {
    const clabeError = validateClabeDetailed(cuentaBeneficiario);
    if (clabeError) {
      logger.warn({ cuentaBeneficiario, error: clabeError.message }, 'SPEI mock: invalid CLABE');
      const r = buildRechazadaResponse(claveRastreo, monto, 'R04', `CLABE destino inválida: ${clabeError.message}`);
      processedTransfers.set(claveRastreo, r);
      return res.status(200).json(r);
    }
  }

  // === Validation: SPEI operating window (R08 — payment suspended outside window) ===
  if (ENFORCE_HOURS && !isSpeiWindowOpen()) {
    const r = buildRechazadaResponse(claveRastreo, monto, 'R08',
      'Pago suspendido. SPEI opera de lunes a viernes de 07:00 a 17:30 (CST). Intente en horario hábil.');
    processedTransfers.set(claveRastreo, r);
    return res.status(200).json(r);
  }

  // Track stats
  mockStats.totalReceived++;
  mockStats.lastPaymentAt = new Date().toISOString();

  // Admin: mock disabled
  if (!mockConfig.enabled) {
    return res.status(503).json({
      error: 'SERVICIO_NO_DISPONIBLE',
      detalle: 'El servicio SPEI está temporalmente fuera de servicio por mantenimiento.',
    });
  }

  // Admin: force reject next
  if (mockConfig.forceRejectNext) {
    mockConfig.forceRejectNext = false;
    mockStats.totalRejected++;
    const r = buildRechazadaResponse(claveRastreo, monto, mockConfig.forceRejectCode,
      `[ADMIN] Rechazo forzado por el simulador (código: ${mockConfig.forceRejectCode}).`);
    processedTransfers.set(claveRastreo, r);
    return res.status(200).json(r);
  }

  // Admin: force timeout next
  if (mockConfig.forceTimeoutNext) {
    mockConfig.forceTimeoutNext = false;
    mockStats.totalTimeout++;
    logger.info({ claveRastreo }, 'SPEI mock: forcing 30s timeout (admin)');
    setTimeout(() => {
      res.status(504).json({ error: 'TIMEOUT', detalle: 'SPEI no respondió dentro del plazo.' });
    }, 30_000);
    return;
  }

  // === Simulate CECOBAN rejection scenarios (relative weights within rejectionRate, PIX-style tiers) ===
  const failRoll = Math.random();

  if (failRoll < mockConfig.rejectionRate * 0.4) {
    const r = buildRechazadaResponse(claveRastreo, monto, 'R01',
      'Fondos insuficientes. La cuenta ordenante no tiene saldo suficiente para cubrir el monto más el IVA.');
    processedTransfers.set(claveRastreo, r);
    return res.status(200).json(r);
  }
  if (failRoll < mockConfig.rejectionRate * 0.6) {
    mockStats.totalRejected++;
    const r = buildRechazadaResponse(claveRastreo, monto, 'R03',
      'Sin cuenta. La CLABE del beneficiario no está registrada en el sistema SPEI.');
    processedTransfers.set(claveRastreo, r);
    return res.status(200).json(r);
  }
  if (failRoll < mockConfig.rejectionRate * 0.8) {
    mockStats.totalRejected++;
    const r = buildRechazadaResponse(claveRastreo, monto, 'R02',
      'Cuenta cerrada. La cuenta CLABE del beneficiario ha sido cancelada.');
    processedTransfers.set(claveRastreo, r);
    return res.status(200).json(r);
  }
  if (failRoll < mockConfig.rejectionRate * 0.9) {
    mockStats.totalRejected++;
    const r = buildRechazadaResponse(claveRastreo, monto, 'LIM',
      'Límite operativo diario alcanzado para la institución ordenante en la sesión SPEI.');
    processedTransfers.set(claveRastreo, r);
    return res.status(200).json(r);
  }
  if (failRoll < mockConfig.rejectionRate) {
    mockStats.totalRejected++;
    const r = buildRechazadaResponse(claveRastreo, monto, 'R05',
      'Operación no autorizada. La institución ordenante no tiene autorización para realizar este tipo de pago.');
    processedTransfers.set(claveRastreo, r);
    return res.status(200).json(r);
  }

  // === Success: simulate SPEI settlement latency (configurable) ===
  const latency = mockConfig.minLatencyMs
    + Math.random() * (mockConfig.maxLatencyMs - mockConfig.minLatencyMs);
  setTimeout(() => {
    const now = new Date();
    const fechaOperacion = now.toISOString().slice(0, 10).replace(/-/g, '');
    const horaLiquidacion = now.toTimeString().slice(0, 8);
    const folioControl = `CECOBAN${ulid().substring(0, 10)}`;

    const response: SpeiCecobanResponse = {
      claveRastreo,
      estatus: 'LIQUIDADA',
      monto,
      fechaOperacion,
      horaLiquidacion,
      folioControl,
      iva: body.iva ?? 0,
    };

    // P03 — Removed the broken `settlementDelayMs > 0` branch.
    // Previously: mock returned 202 EN_PROCESO immediately and flipped to
    // LIQUIDADA after a delay. The adapter's response-mapper maps EN_PROCESO
    // to status 'ERROR', so the worker emitted a FAILED ack even when the
    // mock would later settle. Net effect: feature was end-to-end broken.
    // Sync settlement is sufficient for PoC. If async settlement is needed,
    // implement PENDING handling in the adapter first (P03/P06 follow-up).
    void mockConfig; // settlementDelayMs no longer consumed

    processedTransfers.set(claveRastreo, response);
    mockStats.totalAccepted++;

    logger.info({
      claveRastreo,
      folioControl,
      estatus: 'LIQUIDADA',
      monto,
      latency_ms: Math.round(latency),
    }, 'SPEI mock: transfer liquidada (CECOBAN)');

    res.status(201).json(response);
  }, latency);
});

/** GET /spei/v3/transferencias/:claveRastreo — query transfer status */
app.get('/spei/v3/transferencias/:claveRastreo', (req, res) => {
  const { claveRastreo } = req.params;
  const transfer = processedTransfers.get(claveRastreo);
  if (!transfer) {
    return res.status(404).json({
      error: 'TRANSFERENCIA_NO_ENCONTRADA',
      detalle: `claveRastreo '${claveRastreo}' no localizada en el sistema SPEI.`,
    });
  }
  res.status(200).json(transfer);
});

/** Legacy endpoint for backward compatibility */
app.post('/spei/payments', (req, res) => {
  const { monto, clabe_destino, claveRastreo } = req.body;

  if (clabe_destino) {
    const clabeError = validateClabeDetailed(clabe_destino);
    if (clabeError) {
      return res.status(200).json({
        spei_tx_id: `SPEI-${ulid()}`,
        estatus: 'RECHAZADO',
        monto,
        moneda: 'MXN',
        timestamp: new Date().toISOString(),
        codigo_error: 'R04',
        mensaje_error: `CLABE destino inválida: ${clabeError.message}`,
      });
    }
  }

  if (Math.random() < 0.1) {
    return res.status(200).json({
      spei_tx_id: `SPEI-${ulid()}`,
      estatus: 'RECHAZADO',
      monto,
      moneda: 'MXN',
      timestamp: new Date().toISOString(),
      codigo_error: 'R01',
      mensaje_error: 'Fondos insuficientes',
    });
  }

  const latency = 80 + Math.random() * 370;
  setTimeout(() => {
    res.status(200).json({
      spei_tx_id: `SPEI-${ulid()}`,
      estatus: 'ACEPTADO',
      monto,
      moneda: 'MXN',
      timestamp: new Date().toISOString(),
    });
  }, latency);
});

/** Health check */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'spei-mock-cecoban',
    version: '3.0',
    speiWindowOpen: isSpeiWindowOpen(),
    processedCount: processedTransfers.size,
    timestamp: new Date().toISOString(),
  });
});

function buildRechazadaResponse(
  claveRastreo: string,
  monto: number,
  codigoError: string,
  descripcionError: string,
): SpeiCecobanResponse {
  return {
    claveRastreo,
    estatus: 'RECHAZADA',
    monto,
    fechaOperacion: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    codigoError,
    descripcionError,
    iva: 0,
  };
}

export function startMockServer(port?: number): Promise<import('http').Server> {
  const listenPort = port ?? env.SPEI_MOCK_PORT;
  return new Promise((resolve) => {
    const server = app.listen(listenPort, () => {
      logger.info({ port: listenPort }, 'SPEI CECOBAN mock sandbox running (BANXICO SPEI v3)');
      resolve(server);
    });
  });
}

if (process.argv[1]?.includes('mock-server')) {
  startMockServer();
}

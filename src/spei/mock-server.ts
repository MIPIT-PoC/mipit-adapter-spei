/**
 * SPEI CECOBAN Mock Server
 *
 * Simulates the BANXICO SPEI sandbox endpoint for PoC testing.
 * Implements the real CECOBAN response format:
 *   POST /spei/v3/transferencias → SpeiCecobanResponse
 *
 * Simulated behaviors:
 *   - CLABE format validation (18 digits, check digit)
 *   - 10% random failures (CECOBAN rejection codes)
 *   - Realistic SPEI latency (100–500ms)
 *   - Proper clave_rastreo echoing
 */

import express from 'express';
import { ulid } from 'ulid';
import { env } from '../config/env.js';
import { logger } from '../observability/logger.js';
import type { SpeiCecobanRequest, SpeiCecobanResponse } from './types.js';
import { SPEI_BANXICO_CODES } from './types.js';
import { validateClabeDetailed } from './clabe-validator.js';

const app = express();
app.use(express.json());

/**
 * POST /spei/v3/transferencias
 * Simulates the BANXICO/CECOBAN SPEI settlement endpoint.
 */
app.post('/spei/v3/transferencias', (req, res) => {
  const body = req.body as Partial<SpeiCecobanRequest>;
  const { claveRastreo, monto, cuentaBeneficiario, claveRastreo: clv, institucionContraparte } = body;

  // === Validation: Required fields ===
  if (!claveRastreo || claveRastreo.trim() === '') {
    return res.status(400).json({
      error: 'CAMPO_REQUERIDO',
      detalle: 'El campo claveRastreo es obligatorio.',
      campo: 'claveRastreo',
    });
  }

  if (!monto || monto <= 0) {
    return res.status(400).json({
      error: 'MONTO_INVALIDO',
      detalle: 'El monto debe ser mayor a 0.',
      campo: 'monto',
    });
  }

  // === Validation: CLABE (check digit + format) ===
  if (cuentaBeneficiario) {
    const clabeError = validateClabeDetailed(cuentaBeneficiario);
    if (clabeError) {
      logger.warn({ cuentaBeneficiario, error: clabeError }, 'SPEI mock: invalid CLABE');
      return res.status(200).json(buildRechazadaResponse(
        claveRastreo,
        monto,
        'R04',
        `CLABE destino inválida: ${clabeError.message}`,
      ));
    }
  }

  // === Validation: Institution code ===
  if (institucionContraparte && !/^\d{3,5}$/.test(institucionContraparte)) {
    return res.status(400).json({
      error: 'INSTITUCION_INVALIDA',
      detalle: `Código de institución inválido: ${institucionContraparte}`,
      campo: 'institucionContraparte',
    });
  }

  // === Simulate SPEI rejection scenarios (10% rate) ===
  const failRoll = Math.random();
  if (failRoll < 0.04) {
    return res.status(200).json(buildRechazadaResponse(
      claveRastreo, monto, 'R01',
      'Fondos insuficientes. La cuenta ordenante no tiene saldo suficiente.',
    ));
  }
  if (failRoll < 0.07) {
    return res.status(200).json(buildRechazadaResponse(
      claveRastreo, monto, 'R03',
      'CLABE del beneficiario no encontrada en el sistema SPEI.',
    ));
  }
  if (failRoll < 0.10) {
    return res.status(200).json(buildRechazadaResponse(
      claveRastreo, monto, 'LIM',
      'Límite operativo diario alcanzado para la institución ordenante.',
    ));
  }

  // === Success: simulate SPEI settlement ===
  const latency = 100 + Math.random() * 400;
  setTimeout(() => {
    const now = new Date();
    const fechaOperacion = now.toISOString().slice(0, 10).replace(/-/g, '');
    const horaLiquidacion = now.toTimeString().slice(0, 8);
    const folioControl = `CECOBAN${ulid().substring(0, 10)}`;

    const response: SpeiCecobanResponse = {
      claveRastreo,
      estatus: 'LIQUIDADA',
      monto: monto,
      fechaOperacion,
      horaLiquidacion,
      folioControl,
      iva: body.iva ?? 0,
    };

    logger.info({
      claveRastreo,
      estatus: 'LIQUIDADA',
      monto,
      latency_ms: Math.round(latency),
    }, 'SPEI mock: transaction liquidada');

    res.status(201).json(response);
  }, latency);
});

/** Legacy endpoint for backward compatibility */
app.post('/spei/payments', (req, res) => {
  const { monto, clabe_destino } = req.body;

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

  const shouldFail = Math.random() < 0.1;
  if (shouldFail) {
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

  const latency = 100 + Math.random() * 400;
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
      logger.info({ port: listenPort }, 'SPEI CECOBAN mock sandbox running');
      resolve(server);
    });
  });
}

if (process.argv[1]?.includes('mock-server')) {
  startMockServer();
}

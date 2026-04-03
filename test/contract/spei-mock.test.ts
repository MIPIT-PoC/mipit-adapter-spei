jest.mock('../../src/observability/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../src/config/env', () => ({
  env: {
    SPEI_MOCK_PORT: 0,
    LOG_LEVEL: 'silent',
    OTEL_SERVICE_NAME: 'test',
  },
}));

import type { Server } from 'http';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { startMockServer } = await import('../../src/spei/mock-server');
  server = await startMockServer(0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://localhost:${port}`;
});

afterAll((done) => {
  server?.close(done);
});

describe('SPEI Mock Server Contract', () => {
  it('GET /health returns 200 with correct structure', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok', service: 'spei-mock' });
  });

  it('POST /spei/payments with valid 18-digit CLABE returns 200', async () => {
    const res = await fetch(`${baseUrl}/spei/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spei_tx_ref: 'PMT-TEST',
        monto: 1500.00,
        moneda: 'MXN',
        clabe_origen: '012345678901234567',
        clabe_destino: '098765432109876543',
        tipo_cuenta: 'CLABE',
        origen: 'SPEI',
        destino: 'SPEI',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('spei_tx_id');
    expect(body).toHaveProperty('estatus');
    expect(body).toHaveProperty('monto');
    expect(body).toHaveProperty('moneda', 'MXN');
    expect(body).toHaveProperty('timestamp');
    expect(['ACEPTADO', 'RECHAZADO']).toContain(body.estatus);
  });

  it('rejects payment with invalid CLABE (not 18 digits)', async () => {
    const res = await fetch(`${baseUrl}/spei/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monto: 100,
        clabe_origen: '012345678901234567',
        clabe_destino: '12345',
        tipo_cuenta: 'CLABE',
        origen: 'SPEI',
        destino: 'SPEI',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.estatus).toBe('RECHAZADO');
    expect(body.codigo_error).toBe('SPEI_INVALID_CLABE');
  });

  it('returns spei_tx_id starting with SPEI-', async () => {
    const res = await fetch(`${baseUrl}/spei/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monto: 100,
        clabe_origen: '012345678901234567',
        clabe_destino: '098765432109876543',
        tipo_cuenta: 'CLABE',
        origen: 'SPEI',
        destino: 'SPEI',
      }),
    });
    const body = await res.json();
    expect(body.spei_tx_id).toMatch(/^SPEI-/);
  });

  it('simulates random failures for valid payments', async () => {
    const results: any[] = [];
    for (let i = 0; i < 30; i++) {
      const res = await fetch(`${baseUrl}/spei/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monto: 50,
          clabe_origen: '012345678901234567',
          clabe_destino: '098765432109876543',
          tipo_cuenta: 'CLABE',
          origen: 'SPEI',
          destino: 'SPEI',
        }),
      });
      results.push(await res.json());
    }

    expect(results.some((r) => r.estatus === 'ACEPTADO')).toBe(true);
    const rejected = results.filter((r) => r.estatus === 'RECHAZADO');
    if (rejected.length > 0) {
      expect(rejected[0]).toHaveProperty('codigo_error');
    }
  }, 30000);
});

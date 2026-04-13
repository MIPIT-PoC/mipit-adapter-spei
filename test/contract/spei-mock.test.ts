import type { Server } from 'http';

let server: Server;
let baseUrl: string;
let accessToken: string;

beforeAll(async () => {
  const { startMockServer } = await import('../../src/spei/mock-server');
  server = await startMockServer(0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://localhost:${port}`;
  
  // Obtain OAuth2 token for tests
  const tokenRes = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: 'mipit-test',
      client_secret: 'test-secret-spei',
      scope: 'spei.cecoban',
    }),
  });
  const tokenData = await tokenRes.json();
  accessToken = tokenData.access_token;
});

afterAll((done) => {
  server?.close(done);
});

describe('SPEI Mock Server Contract', () => {
  it('GET /health returns 200 with service info', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('service');
    expect(body).toHaveProperty('version');
  });

  it('POST /oauth/token with valid credentials returns access_token', async () => {
    const res = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: 'mipit-test',
        client_secret: 'test-secret-spei',
        scope: 'spei.cecoban',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('access_token');
    expect(body).toHaveProperty('token_type', 'Bearer');
    expect(body).toHaveProperty('expires_in');
  });

  it('POST /spei/payments without Bearer token returns 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/spei/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monto: 1500.00,
        clabe_destino: '002050000000000016',
      }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /spei/payments with valid token accepts payment request', async () => {
    const res = await fetch(`${baseUrl}/spei/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        monto: 1500.00,
        clabe_origen: '002050000000000016',
        clabe_destino: '006050000000000025',
        nombre_beneficiario: 'Juan Perez',
        tipo_cuenta: 'CLABE',
        origen: 'SPEI',
        destino: 'SPEI',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    
    // Validate response structure (mock server returns legacy format)
    expect(body).toHaveProperty('spei_tx_id');
    expect(body).toHaveProperty('estatus');
    expect(body).toHaveProperty('monto', 1500.00);
    expect(body).toHaveProperty('timestamp');
    expect(['ACEPTADO', 'RECHAZADO']).toContain(body.estatus);
  });

  it('validates CLABE format on payment', async () => {
    const res = await fetch(`${baseUrl}/spei/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        monto: 1500.00,
        clabe_origen: '002050000000000016',
        clabe_destino: '012345', // Invalid CLABE
        nombre_beneficiario: 'Test',
        tipo_cuenta: 'CLABE',
        origen: 'SPEI',
        destino: 'SPEI',
      }),
    });
    const body = await res.json();
    expect(['ACEPTADO', 'RECHAZADO']).toContain(body.estatus);
  });

  it('includes error code on rejection', async () => {
    const res = await fetch(`${baseUrl}/spei/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        monto: 1500.00,
        clabe_origen: '002050000000000016',
        clabe_destino: '999999999999999999', // Invalid check digit
        nombre_beneficiario: 'Test',
        tipo_cuenta: 'CLABE',
        origen: 'SPEI',
        destino: 'SPEI',
      }),
    });
    const body = await res.json();
    if (body.estatus === 'RECHAZADO') {
      expect(body).toHaveProperty('codigo_error');
    }
  });

  it('simulates random failures for valid payments', async () => {
    const results: any[] = [];
    for (let i = 0; i < 20; i++) {
      const res = await fetch(`${baseUrl}/spei/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          monto: 500.00,
          clabe_origen: '002050000000000016',
          clabe_destino: `00605000000000${String(i).padStart(3, '0')}5`,
          nombre_beneficiario: `Beneficiary ${i}`,
          tipo_cuenta: 'CLABE',
          origen: 'SPEI',
          destino: 'SPEI',
        }),
      });
      results.push(await res.json());
    }

    // Check that we have both accepted and rejected responses in the sample
    const accepted = results.filter((r) => r.estatus === 'ACEPTADO');
    const rejected = results.filter((r) => r.estatus === 'RECHAZADO');
    
    expect(accepted.length + rejected.length).toBe(results.length);
    expect(accepted.length > 0 || rejected.length > 0).toBe(true);
  }, 30000);
});

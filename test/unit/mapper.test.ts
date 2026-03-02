import { canonicalToSpeiPayload } from '../../src/spei/mapper';

describe('canonicalToSpeiPayload', () => {
  it('should map canonical payment to SPEI payload', () => {
    const canonical = {
      payment_id: 'PAY-001',
      amount: { value: 1000, currency: 'USD' },
      fx: { rate: 17.5 },
      debtor: { account_id: 'SPEI-012345678901234567', name: 'Juan Pérez' },
      creditor: { account_id: 'SPEI-098765432109876543', name: 'María López' },
      purpose: 'Pago de servicios',
      reference: 'REF-12345',
      origin: { rail: 'SPEI' },
      destination: { rail: 'SPEI' },
      trace_id: 'trace-001',
    };

    const result = canonicalToSpeiPayload(canonical);

    expect(result.spei_tx_ref).toBe('PAY-001');
    expect(result.monto).toBe(17500);
    expect(result.moneda).toBe('MXN');
    expect(result.clabe_origen).toBe('012345678901234567');
    expect(result.clabe_destino).toBe('098765432109876543');
    expect(result.tipo_cuenta).toBe('CLABE');
    expect(result.tipo_cambio).toBe(17.5);
  });

  it('should default fx rate to 1 when not provided', () => {
    const canonical = {
      payment_id: 'PAY-002',
      amount: { value: 500, currency: 'MXN' },
      debtor: { account_id: '012345678901234567' },
      creditor: { account_id: '098765432109876543' },
      origin: { rail: 'SPEI' },
      destination: {},
    };

    const result = canonicalToSpeiPayload(canonical);

    expect(result.monto).toBe(500);
    expect(result.destino).toBe('SPEI');
  });
});

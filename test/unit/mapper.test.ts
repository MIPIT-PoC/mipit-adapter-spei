import { canonicalToSpeiPayload } from '../../src/spei/mapper';

describe('canonicalToSpeiPayload', () => {
  it('should map canonical payment to SPEI payload', () => {
    const canonical = {
      payment_id: 'PAY-001',
      amount: { value: 1000, currency: 'USD' },
      fx: { rate: 17.5 },
      debtor: { account_id: 'SPEI-012345678901234567', name: 'Juan Pérez' },
      creditor: { account_id: 'SPEI-098765432109876543', name: 'María López' },
      alias: { type: 'CLABE', value: '098765432109876543' },
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
      alias: { type: 'CLABE', value: '098765432109876543' },
      origin: { rail: 'SPEI' },
      destination: {},
    };

    const result = canonicalToSpeiPayload(canonical);

    expect(result.monto).toBe(500);
    expect(result.destino).toBe('SPEI');
  });

  it('should strip SPEI- prefix from CLABEs', () => {
    const canonical = {
      payment_id: 'PAY-003',
      amount: { value: 1000, currency: 'MXN' },
      debtor: { account_id: 'SPEI-012345678901234567', name: 'Juan' },
      creditor: { account_id: 'SPEI-098765432109876543', name: 'Maria' },
      alias: { type: 'CLABE', value: '098765432109876543' },
      origin: { rail: 'SPEI' },
      destination: { rail: 'SPEI' },
    };

    const result = canonicalToSpeiPayload(canonical);

    expect(result.clabe_origen).toBe('012345678901234567');
    expect(result.clabe_destino).toBe('098765432109876543');
  });

  it('should throw error for invalid CLABE (not 18 digits)', () => {
    const canonical = {
      payment_id: 'PAY-004',
      amount: { value: 100, currency: 'MXN' },
      debtor: { account_id: '012345678901234567' },
      creditor: { account_id: '12345' },
      alias: { type: 'CLABE', value: '12345' },
      origin: { rail: 'SPEI' },
      destination: { rail: 'SPEI' },
    };

    expect(() => canonicalToSpeiPayload(canonical)).toThrow('Invalid CLABE format');
  });

  it('should throw error for CLABE with non-digit characters', () => {
    const canonical = {
      payment_id: 'PAY-005',
      amount: { value: 100, currency: 'MXN' },
      debtor: { account_id: '012345678901234567' },
      creditor: { account_id: 'ABCDEFGHIJKLMNOPQR' },
      alias: { type: 'CLABE', value: 'ABCDEFGHIJKLMNOPQR' },
      origin: { rail: 'SPEI' },
      destination: { rail: 'SPEI' },
    };

    expect(() => canonicalToSpeiPayload(canonical)).toThrow('Invalid CLABE format');
  });

  it('should always set moneda to MXN', () => {
    const canonical = {
      payment_id: 'PAY-006',
      amount: { value: 100, currency: 'USD' },
      debtor: { account_id: '012345678901234567' },
      creditor: { account_id: '098765432109876543' },
      alias: { type: 'CLABE', value: '098765432109876543' },
      origin: { rail: 'SPEI' },
      destination: { rail: 'SPEI' },
    };

    const result = canonicalToSpeiPayload(canonical);

    expect(result.moneda).toBe('MXN');
  });

  it('should truncate concepto to 35 and referencia to 140 chars', () => {
    const canonical = {
      payment_id: 'PAY-007',
      amount: { value: 100, currency: 'MXN' },
      debtor: { account_id: '012345678901234567' },
      creditor: { account_id: '098765432109876543' },
      alias: { type: 'CLABE', value: '098765432109876543' },
      purpose: 'X'.repeat(50),
      reference: 'Y'.repeat(200),
      origin: { rail: 'SPEI' },
      destination: { rail: 'SPEI' },
    };

    const result = canonicalToSpeiPayload(canonical);

    expect(result.concepto_pago).toHaveLength(35);
    expect(result.referencia_numerica).toHaveLength(140);
  });
});

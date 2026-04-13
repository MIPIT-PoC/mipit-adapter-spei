import { canonicalToSpeiPayload } from '../../src/spei/mapper';

describe('canonicalToSpeiPayload', () => {
  // Valid CLABEs for testing (with correct check digits)
  // 002050000000000016 = Banamex (002) + city 050 + account 00000000001 + check 6
  // 006050000000000025 = Banobras (006) + city 050 + account 00000000002 + check 5
  
  it('should map canonical payment to SPEI CECOBAN request', () => {
    const canonical = {
      payment_id: 'PMT-001',
      amount: { value: 1500.00, currency: 'MXN' },
      debtor: {
        account_id: '002050000000000016',
        name: 'José García',
        taxId: '12345678901234',
      },
      creditor: {
        account_id: '006050000000000025',
        name: 'María López',
        taxId: '98765432109876',
        email: 'maria@example.com',
      },
      alias: { type: 'CLABE', value: '006050000000000025' },
      reference: 'PAGO-SERVICIOS-001',
      purpose: 'Pago de servicios profesionales',
      origin: { rail: 'SPEI', institutionCode: '002' },
      destination: { rail: 'SPEI', institutionCode: '006' },
    };

    const result = canonicalToSpeiPayload(canonical);

    // Validate CECOBAN structure
    expect(result).toHaveProperty('claveRastreo');
    expect(result).toHaveProperty('empresa');
    expect(result).toHaveProperty('fechaOperacion');
    expect(result).toHaveProperty('monto', 1500.00);
    expect(result).toHaveProperty('institucionContraparte', '006');
    expect(result).toHaveProperty('institucionOperante', '002');
    expect(result).toHaveProperty('cuentaBeneficiario', '006050000000000025');
    expect(result).toHaveProperty('nombreBeneficiario', 'María López');
  });

  it('should handle missing optional fields', () => {
    const canonical = {
      payment_id: 'PMT-002',
      amount: { value: 500.00, currency: 'MXN' },
      debtor: { account_id: '002050000000000016' },
      creditor: { account_id: '006050000000000025', name: 'Beneficiary' },
      alias: { type: 'CLABE', value: '006050000000000025' },
      origin: { rail: 'SPEI' },
      destination: { rail: 'SPEI' },
    };

    const result = canonicalToSpeiPayload(canonical);

    expect(result).toHaveProperty('monto', 500.00);
    expect(result).toHaveProperty('nombreBeneficiario', 'Beneficiary');
    expect(result.cuentaBeneficiario).toBe('006050000000000025');
  });

  it('should truncate fields to CECOBAN maximum lengths', () => {
    const longName = 'A'.repeat(100); // Exceeds 39-char limit
    const longConcept = 'B'.repeat(100); // Exceeds 39-char limit

    const canonical = {
      payment_id: 'PMT-003',
      amount: { value: 100.00, currency: 'MXN' },
      debtor: { account_id: '002050000000000016' },
      creditor: { account_id: '006050000000000025', name: longName },
      alias: { type: 'CLABE', value: '006050000000000025' },
      purpose: longConcept,
      origin: { rail: 'SPEI' },
      destination: { rail: 'SPEI' },
    };

    const result = canonicalToSpeiPayload(canonical);

    expect(result.nombreBeneficiario.length).toBeLessThanOrEqual(39);
    expect(result.conceptoPago.length).toBeLessThanOrEqual(39);
  });

  it('should validate CLABE format (18 digits)', () => {
    const canonical = {
      payment_id: 'PMT-004',
      amount: { value: 750.00, currency: 'MXN' },
      debtor: { account_id: '002050000000000016' },
      creditor: { account_id: '006050000000000025', name: 'John Doe' },
      alias: { type: 'CLABE', value: '006050000000000025' },
      origin: { rail: 'SPEI' },
      destination: { rail: 'SPEI' },
    };

    const result = canonicalToSpeiPayload(canonical);

    expect(result.cuentaBeneficiario).toMatch(/^\d{18}$/);
  });

  it('should include email in CECOBAN request when provided', () => {
    const canonical = {
      payment_id: 'PMT-005',
      amount: { value: 200.00, currency: 'MXN' },
      debtor: { account_id: '002050000000000016' },
      creditor: {
        account_id: '006050000000000025',
        name: 'Test User',
        email: 'test@example.com',
      },
      alias: { type: 'CLABE', value: '006050000000000025' },
      origin: { rail: 'SPEI' },
      destination: { rail: 'SPEI' },
    };

    const result = canonicalToSpeiPayload(canonical);

    expect(result.emailBeneficiario).toBe('test@example.com');
  });

  it('should generate valid clave de rastreo (tracking code)', () => {
    const canonical = {
      payment_id: 'PMT-006',
      amount: { value: 300.00, currency: 'MXN' },
      debtor: { account_id: '002050000000000016' },
      creditor: { account_id: '006050000000000025', name: 'Test' },
      alias: { type: 'CLABE', value: '006050000000000025' },
      origin: { rail: 'SPEI' },
      destination: { rail: 'SPEI' },
    };

    const result = canonicalToSpeiPayload(canonical);

    // clave_rastreo should be max 30 alphanumeric chars
    expect(result.claveRastreo).toMatch(/^[A-Z0-9]{1,30}$/);
    expect(result.claveRastreo.length).toBeLessThanOrEqual(30);
  });

  it('should populate SPEI institution codes correctly', () => {
    const canonical = {
      payment_id: 'PMT-007',
      amount: { value: 400.00, currency: 'MXN' },
      debtor: { account_id: '002050000000000016' },
      creditor: { account_id: '006050000000000025', name: 'Test' },
      alias: { type: 'CLABE', value: '006050000000000025' },
      origin: { rail: 'SPEI', institutionCode: '144' }, // Banco Bancrea
      destination: { rail: 'SPEI', institutionCode: '137' }, // Bankaool
    };

    const result = canonicalToSpeiPayload(canonical);

    expect(result.institucionOperante).toBe('144');
    expect(result.institucionContraparte).toBe('137');
  });
});

import { canonicalToSpeiPayload } from '../../src/spei/mapper';
import { buildTestClabe } from '../../src/spei/clabe-validator';

// Build valid test CLABEs
const VALID_DEST_CLABE = buildTestClabe('012', '180', '00001183597');  // BBVA
const VALID_ORIG_CLABE = buildTestClabe('002', '180', '12345678901');  // Banamex

const baseCanonical = {
  payment_id: 'PMT-TEST0001234567890123',
  amount: { value: 2500.00, currency: 'MXN' },
  debtor: {
    account_id: `SPEI-${VALID_ORIG_CLABE}`,
    name: 'Empresa ACME',
    taxId: 'ACM010101AAA',
    email: 'acme@empresa.mx',
  },
  creditor: {
    account_id: `SPEI-${VALID_DEST_CLABE}`,
    name: 'Carlos López',
    taxId: 'LOPC850101BBB',
    email: 'carlos@email.mx',
  },
  alias: { type: 'CLABE', value: VALID_DEST_CLABE },
  origin: { rail: 'SPEI', institutionCode: '999' },
  destination: { rail: 'SPEI', institutionCode: '012' },
  purpose: 'Salary payment',
  reference: 'REF-2023-001',
  remittanceInfo: 'Pago nomina junio 2023',
};

describe('canonicalToSpeiPayload', () => {
  it('should produce a valid SpeiCecobanRequest', () => {
    const result = canonicalToSpeiPayload(baseCanonical);

    expect(result.monto).toBe(2500);
    expect(result.cuentaBeneficiario).toBe(VALID_DEST_CLABE);
    expect(result.empresa).toBe('MIPIT');
    expect(result.tipoCuentaBeneficiario).toBe(40);
  });

  it('should generate a valid claveRastreo', () => {
    const result = canonicalToSpeiPayload(baseCanonical);
    expect(result.claveRastreo).toBeDefined();
    expect(result.claveRastreo.length).toBeLessThanOrEqual(30);
    expect(/^[A-Z0-9-]+$/i.test(result.claveRastreo)).toBe(true);
  });

  it('should format fechaOperacion as YYYYMMDD', () => {
    const result = canonicalToSpeiPayload(baseCanonical);
    expect(/^\d{8}$/.test(result.fechaOperacion)).toBe(true);
    const year = parseInt(result.fechaOperacion.slice(0, 4));
    expect(year).toBeGreaterThanOrEqual(2023);
  });

  it('should strip SPEI- prefix from account IDs', () => {
    const result = canonicalToSpeiPayload(baseCanonical);
    expect(result.cuentaBeneficiario).not.toContain('SPEI-');
    expect(result.cuentaBeneficiario).toBe(VALID_DEST_CLABE);
  });

  it('should set nombre beneficiario (max 39 chars)', () => {
    const result = canonicalToSpeiPayload(baseCanonical);
    expect(result.nombreBeneficiario).toBe('Carlos López');
    expect(result.nombreBeneficiario.length).toBeLessThanOrEqual(39);
  });

  it('should use remittanceInfo as conceptoPago (max 39 chars)', () => {
    const result = canonicalToSpeiPayload(baseCanonical);
    expect(result.conceptoPago).toBe('Pago nomina junio 2023');
    expect(result.conceptoPago.length).toBeLessThanOrEqual(39);
  });

  it('should fall back to purpose for conceptoPago', () => {
    const canonical = { ...baseCanonical, remittanceInfo: undefined };
    const result = canonicalToSpeiPayload(canonical);
    expect(result.conceptoPago).toBe('Salary payment');
  });

  it('should set referenciaNumerica as 7-digit number', () => {
    const result = canonicalToSpeiPayload(baseCanonical);
    expect(result.referenciaNumerica).toBeGreaterThanOrEqual(1000000);
    expect(result.referenciaNumerica).toBeLessThanOrEqual(9999999);
  });

  it('should set institution codes from origin/destination', () => {
    const result = canonicalToSpeiPayload(baseCanonical);
    expect(result.institucionOperante).toBe('999');
    expect(result.institucionContraparte).toBe('012');
  });

  it('should include optional creditor email', () => {
    const result = canonicalToSpeiPayload(baseCanonical);
    expect(result.emailBeneficiario).toBe('carlos@email.mx');
  });

  it('should include optional RFC/CURP for creditor', () => {
    const result = canonicalToSpeiPayload(baseCanonical);
    expect(result.rfcCurpBeneficiario).toBe('LOPC850101BBB');
  });

  it('should include ordering party when debtor account is valid CLABE', () => {
    const result = canonicalToSpeiPayload(baseCanonical);
    expect(result.nombreOrdenante).toBe('Empresa ACME');
    expect(result.cuentaOrdenante).toBe(VALID_ORIG_CLABE);
    expect(result.tipoCuentaOrdenante).toBe(40);
  });

  it('should include RFC/CURP for ordering party', () => {
    const result = canonicalToSpeiPayload(baseCanonical);
    expect(result.rfcCurpOrdenante).toBe('ACM010101AAA');
  });

  it('should apply FX rate to amount', () => {
    const canonical = { ...baseCanonical, fx: { rate: 18.5, source_currency: 'USD' } };
    // $2500 USD × 18.5 = MXN 46250
    const result = canonicalToSpeiPayload(canonical);
    expect(result.monto).toBeCloseTo(46250, 0);
  });

  it('should set iva to 0', () => {
    const result = canonicalToSpeiPayload(baseCanonical);
    expect(result.iva).toBe(0);
  });

  it('should set tipoPago to 1', () => {
    const result = canonicalToSpeiPayload(baseCanonical);
    expect(result.tipoPago).toBe(1);
  });

  it('should derive institution code from CLABE bank prefix when not in destination', () => {
    const canonical = {
      ...baseCanonical,
      destination: { rail: 'SPEI' },  // no institutionCode
    };
    const result = canonicalToSpeiPayload(canonical);
    // VALID_DEST_CLABE starts with '012'
    expect(result.institucionContraparte).toBe('012');
  });

  it('should throw when CLABE check digit is invalid', () => {
    const badClabe = VALID_DEST_CLABE.slice(0, 17) + ((parseInt(VALID_DEST_CLABE[17]) + 1) % 10).toString();
    const canonical = {
      ...baseCanonical,
      alias: { type: 'CLABE', value: badClabe },
    };
    expect(() => canonicalToSpeiPayload(canonical)).toThrow(/INVALID_CHECK_DIGIT/);
  });

  it('should throw when CLABE is not 18 digits', () => {
    const canonical = {
      ...baseCanonical,
      alias: { type: 'CLABE', value: '123456' },
    };
    expect(() => canonicalToSpeiPayload(canonical)).toThrow(/INVALID_LENGTH/);
  });

  it('should throw when CLABE has non-digit characters', () => {
    const canonical = {
      ...baseCanonical,
      alias: { type: 'CLABE', value: '01218000011835971X' },
    };
    expect(() => canonicalToSpeiPayload(canonical)).toThrow(/INVALID_FORMAT/);
  });
});

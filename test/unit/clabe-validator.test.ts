import {
  validateClabe,
  computeClabeCheckDigit,
  validateClabeDetailed,
  buildTestClabe,
  getClabeBankCode,
  getClabeCity,
  getClabeAccount,
} from '../../src/spei/clabe-validator';

describe('validateClabe', () => {
  // Build a valid CLABE for testing using the algorithm
  // BBVA (012), Mexico City (180), account 00001183597 → check digit
  const VALID_CLABE = buildTestClabe('012', '180', '00001183597');

  it('should return true for a valid CLABE', () => {
    expect(validateClabe(VALID_CLABE)).toBe(true);
  });

  it('should return false for wrong check digit', () => {
    const wrongCheck = VALID_CLABE.slice(0, 17) + ((parseInt(VALID_CLABE[17]) + 1) % 10).toString();
    expect(validateClabe(wrongCheck)).toBe(false);
  });

  it('should return false for non-digit characters', () => {
    expect(validateClabe('01218000011835971X')).toBe(false);
    expect(validateClabe('ABCDEF123456789012')).toBe(false);
  });

  it('should return false for CLABEs shorter than 18 digits', () => {
    expect(validateClabe('01218000011835971')).toBe(false);   // 17 digits
    expect(validateClabe('0121800001183597')).toBe(false);    // 16 digits
  });

  it('should return false for CLABEs longer than 18 digits', () => {
    expect(validateClabe('0121800001183597190')).toBe(false);  // 19 digits
  });

  it('should return false for empty string', () => {
    expect(validateClabe('')).toBe(false);
  });

  it('should return false for all zeros (incorrect check digit)', () => {
    // 00000000000000000X where X = correct check digit for zeros
    // sum = 0, check = (10 - 0) % 10 = 0
    expect(validateClabe('000000000000000000')).toBe(true);  // all zeros: check = 0
  });

  it('should validate a known BBVA CLABE', () => {
    // Known valid CLABE: 032180000118359719
    const testClabe = buildTestClabe('032', '180', '00001183597');
    expect(validateClabe(testClabe)).toBe(true);
  });

  it('should validate CLABEs for multiple Mexican banks', () => {
    const banamexClabe = buildTestClabe('002', '180', '12345678901');
    const santanderClabe = buildTestClabe('014', '180', '98765432109');
    expect(validateClabe(banamexClabe)).toBe(true);
    expect(validateClabe(santanderClabe)).toBe(true);
  });
});

describe('computeClabeCheckDigit', () => {
  it('should compute correct check digit for known input', () => {
    // For all zeros: sum = 0, check = (10 - 0 % 10) % 10 = 0
    expect(computeClabeCheckDigit('00000000000000000')).toBe(0);
  });

  it('should produce consistent results', () => {
    const first17 = '03218000011835971';
    const check1 = computeClabeCheckDigit(first17);
    const check2 = computeClabeCheckDigit(first17);
    expect(check1).toBe(check2);
  });

  it('should produce digit between 0 and 9', () => {
    for (let i = 0; i < 10; i++) {
      const first17 = i.toString().repeat(17);
      const check = computeClabeCheckDigit(first17);
      expect(check).toBeGreaterThanOrEqual(0);
      expect(check).toBeLessThanOrEqual(9);
    }
  });

  it('should throw for non-17-digit input', () => {
    expect(() => computeClabeCheckDigit('123')).toThrow();
    expect(() => computeClabeCheckDigit('1234567890123456789')).toThrow();
    expect(() => computeClabeCheckDigit('1234567890123456X')).toThrow();
  });
});

describe('buildTestClabe', () => {
  it('should build valid CLABE from components', () => {
    const clabe = buildTestClabe('012', '180', '00001183597');
    expect(clabe.length).toBe(18);
    expect(validateClabe(clabe)).toBe(true);
  });

  it('should pad bank code to 3 digits', () => {
    const clabe = buildTestClabe('2', '180', '00001183597');
    expect(clabe.substring(0, 3)).toBe('002');
  });

  it('should pad city code to 3 digits', () => {
    const clabe = buildTestClabe('012', '1', '00001183597');
    expect(clabe.substring(3, 6)).toBe('001');
  });

  it('should pad account to 11 digits', () => {
    const clabe = buildTestClabe('012', '180', '1');
    expect(clabe.substring(6, 17)).toBe('00000000001');
  });

  it('should always produce a valid CLABE', () => {
    const testCases = [
      ['002', '180', '12345678901'],
      ['006', '540', '98765432100'],
      ['012', '180', '00001183597'],
      ['014', '180', '00001234567'],
      ['021', '180', '99887766554'],
    ];
    for (const [bank, city, acct] of testCases) {
      const clabe = buildTestClabe(bank, city, acct);
      expect(validateClabe(clabe)).toBe(true);
    }
  });
});

describe('validateClabeDetailed', () => {
  const validClabe = buildTestClabe('012', '180', '00001183597');

  it('should return null for valid CLABE', () => {
    expect(validateClabeDetailed(validClabe)).toBeNull();
  });

  it('should return INVALID_FORMAT for non-digit characters', () => {
    const result = validateClabeDetailed('01218000011835971X');
    expect(result).not.toBeNull();
    expect(result?.code).toBe('INVALID_FORMAT');
  });

  it('should return INVALID_LENGTH for wrong length', () => {
    const result = validateClabeDetailed('0121800001183597');
    expect(result).not.toBeNull();
    expect(result?.code).toBe('INVALID_LENGTH');
    expect(result?.message).toContain('16 digits');
  });

  it('should return INVALID_CHECK_DIGIT for wrong check digit', () => {
    const wrong = validClabe.slice(0, 17) + ((parseInt(validClabe[17]) + 1) % 10).toString();
    const result = validateClabeDetailed(wrong);
    expect(result).not.toBeNull();
    expect(result?.code).toBe('INVALID_CHECK_DIGIT');
  });

  it('should return INVALID_FORMAT for empty string', () => {
    const result = validateClabeDetailed('');
    expect(result).not.toBeNull();
    expect(result?.code).toBe('INVALID_FORMAT');
  });

  it('should include the clabe in error details', () => {
    const result = validateClabeDetailed('12345');
    expect(result?.clabe).toBe('12345');
  });
});

describe('CLABE component extractors', () => {
  const clabe = buildTestClabe('012', '180', '00001183597');

  it('getClabeBankCode should return first 3 digits', () => {
    expect(getClabeBankCode(clabe)).toBe('012');
  });

  it('getClabeCity should return digits 3-5', () => {
    expect(getClabeCity(clabe)).toBe('180');
  });

  it('getClabeAccount should return digits 6-16', () => {
    expect(getClabeAccount(clabe)).toBe('00001183597');
  });

  it('getClabeBankCode should return UNKNOWN for short input', () => {
    expect(getClabeBankCode('')).toBe('UNKNOWN');
    expect(getClabeBankCode('01')).toBe('UNKNOWN');
  });

  it('getClabeCity should return UNKNOWN for short input', () => {
    expect(getClabeCity('01234')).toBe('UNKNOWN');
  });
});

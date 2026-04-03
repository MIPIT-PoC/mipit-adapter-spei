/**
 * CLABE (Clave Bancaria Estandarizada) Validator
 * Based on: BANXICO CLABE specification
 *
 * CLABE structure (18 digits):
 *   [0-2]   Bank code (3 digits)
 *   [3-5]   City/region code (3 digits)
 *   [6-16]  Account number (11 digits)
 *   [17]    Check digit (1 digit)
 *
 * Check digit algorithm:
 *   Multiply each of the first 17 digits by alternating weights [3, 7, 1]
 *   Sum all products → mod 10 → subtract from 10 → mod 10
 */

const CLABE_WEIGHTS = [3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7] as const;

/**
 * Validates a CLABE account number.
 * @param clabe - 18-digit string (digits only, no spaces or separators)
 * @returns true if valid, false otherwise
 */
export function validateClabe(clabe: string): boolean {
  if (!clabe || !/^\d{18}$/.test(clabe)) {
    return false;
  }

  const digits = clabe.split('').map(Number);

  // Compute weighted sum of first 17 digits
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += digits[i] * CLABE_WEIGHTS[i];
  }

  // Compute expected check digit
  const expectedCheckDigit = (10 - (sum % 10)) % 10;
  return digits[17] === expectedCheckDigit;
}

/**
 * Computes the check digit for the first 17 digits of a CLABE.
 * Used to build valid CLABEs for testing.
 */
export function computeClabeCheckDigit(first17: string): number {
  if (!/^\d{17}$/.test(first17)) {
    throw new Error(`Expected 17 digits, got: ${first17}`);
  }
  const digits = first17.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += digits[i] * CLABE_WEIGHTS[i];
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Extracts the bank code from a CLABE (first 3 digits).
 * Maps to BANXICO institution codes.
 */
export function getClabeBankCode(clabe: string): string {
  if (!clabe || clabe.length < 3) return 'UNKNOWN';
  return clabe.substring(0, 3);
}

/**
 * Extracts the city/region code from a CLABE (digits 3-5).
 */
export function getClabeCity(clabe: string): string {
  if (!clabe || clabe.length < 6) return 'UNKNOWN';
  return clabe.substring(3, 6);
}

/**
 * Extracts the account number from a CLABE (digits 6-16).
 */
export function getClabeAccount(clabe: string): string {
  if (!clabe || clabe.length < 17) return '';
  return clabe.substring(6, 17);
}

/**
 * Builds a valid test CLABE from bank + city + account components.
 * Automatically computes and appends the check digit.
 */
export function buildTestClabe(bankCode: string, cityCode: string, account: string): string {
  const first17 =
    bankCode.padStart(3, '0').substring(0, 3) +
    cityCode.padStart(3, '0').substring(0, 3) +
    account.padStart(11, '0').substring(0, 11);
  const check = computeClabeCheckDigit(first17);
  return `${first17}${check}`;
}

/** Validation error details for a CLABE */
export interface ClabeValidationError {
  code: 'INVALID_FORMAT' | 'INVALID_LENGTH' | 'INVALID_CHECK_DIGIT';
  message: string;
  clabe: string;
}

/** Returns detailed validation error or null if valid */
export function validateClabeDetailed(clabe: string): ClabeValidationError | null {
  if (!clabe) {
    return { code: 'INVALID_FORMAT', message: 'CLABE is required', clabe: clabe ?? '' };
  }
  if (!/^\d+$/.test(clabe)) {
    return { code: 'INVALID_FORMAT', message: `CLABE must contain only digits, got: ${clabe}`, clabe };
  }
  if (clabe.length !== 18) {
    return {
      code: 'INVALID_LENGTH',
      message: `CLABE must be exactly 18 digits, got ${clabe.length} digits`,
      clabe,
    };
  }
  if (!validateClabe(clabe)) {
    return {
      code: 'INVALID_CHECK_DIGIT',
      message: `CLABE check digit invalid for: ${clabe}`,
      clabe,
    };
  }
  return null;
}
